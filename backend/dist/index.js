"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config"); // 加载 .env 环境变量，方便通过文件配置 BASE_URL / 目录等
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const morgan_1 = __importDefault(require("morgan"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const ethers_1 = require("ethers");
const logsPoolCreated_1 = require("./logsPoolCreated");
const GameServer_1 = require("./game/GameServer");
// Use ethers v5 imports
// 注意：已撤回链上聚合 /api/pools 端点，移除 ethers 相关依赖（若未来需要再恢复）。
// Basic configuration via env vars
const PORT = parseInt(process.env.PORT || '4000', 10);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`; // For building returned URLs
// 已撤回链上聚合配置：FACTORY_ADDRESS / RPC_ENDPOINTS / FACTORY_DEPLOY_BLOCK 不再使用
const HTTPS_PORT = process.env.HTTPS_PORT ? parseInt(process.env.HTTPS_PORT, 10) : undefined;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '';
const SSL_PFX_PATH = process.env.SSL_PFX_PATH || '';
const SSL_PFX_PASSPHRASE = process.env.SSL_PFX_PASSPHRASE || '';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path_1.default.join(process.cwd(), 'uploads');
const METADATA_DIR = process.env.METADATA_DIR || path_1.default.join(process.cwd(), 'metadata');
const LOG_DIR = process.env.LOG_DIR || path_1.default.join(process.cwd(), 'logs');
const FACTORY_ADDRESS = (process.env.FACTORY_ADDRESS || '').trim();
const FACTORY_DEPLOY_BLOCK = Number(process.env.FACTORY_DEPLOY_BLOCK || '0') || 0;
const RPC_URL = process.env.RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/';
// Ensure directories exist
for (const dir of [UPLOAD_DIR, METADATA_DIR, LOG_DIR]) {
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
}
// ---- Factory PoolCreated 日志缓存聚合（减少前端大范围 getLogs 速率限制） ----
let poolCreatedAgg = null;
if (FACTORY_ADDRESS) {
    try {
        poolCreatedAgg = (0, logsPoolCreated_1.createPoolCreatedAggregator)({
            factory: FACTORY_ADDRESS,
            deployBlock: FACTORY_DEPLOY_BLOCK,
            rpcUrl: RPC_URL,
            cacheDir: METADATA_DIR,
            intervalMs: 90000
        });
        console.log('[logs-cache] PoolCreated aggregator started from block', FACTORY_DEPLOY_BLOCK);
    }
    catch (e) {
        console.error('[logs-cache] init failed', e?.message || e);
    }
}
// Multer storage
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname || '').slice(0, 10);
        const safeBase = path_1.default.basename(file.originalname || 'file', ext).replace(/[^a-zA-Z0-9-_]/g, '_') || 'file';
        const stamp = Date.now();
        cb(null, `${safeBase}_${stamp}${ext || ''}`);
    }
});
// 放宽上传策略：接受常见图片与未识别类型（部分代理会丢失 mime），并提升大小上限到 10MB。
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        try {
            const mime = String(file?.mimetype || '').toLowerCase();
            if (!mime || mime === 'application/octet-stream')
                return cb(null, true); // 代理丢失 mime 时放行
            if (mime.startsWith('image/'))
                return cb(null, true);
            // 允许 json / text 以支持测试与元数据直接上传
            if (mime.includes('json') || mime.startsWith('text/'))
                return cb(null, true);
            console.warn('[upload] reject type', mime, file?.originalname);
            return cb(new Error('invalid_file_type'));
        }
        catch (e) {
            return cb(new Error('invalid_file_type'));
        }
    }
});
// Express app
const app = (0, express_1.default)();
app.disable('x-powered-by');
// 部署在 Nginx 反向代理之后，仅信任最前置的 1 层代理
// 注意：express-rate-limit v7 不允许使用宽松的 true（会抛 ERR_ERL_PERMISSIVE_TRUST_PROXY）
app.set('trust proxy', 1);
// Helmet with relaxed CORP/COEP so that images/JSON can be embedded across LAN origins
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false
}));
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.options('*', (0, cors_1.default)()); // Enable pre-flight for all routes
app.use(express_1.default.json({ limit: '1mb' }));
// 兼容表单式提交 JSON（某些客户端可能用 x-www-form-urlencoded）
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
app.use((0, morgan_1.default)('combined'));
// Basic rate limiting（仅作用于 /api 路径，避免静态元数据与图片频繁读取触发 429）
const limiter = (0, express_rate_limit_1.default)({ windowMs: 60000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter);
// Static hosting for uploaded files and metadata
app.use('/uploads', express_1.default.static(UPLOAD_DIR, { immutable: true, maxAge: '365d' }));
// Do not cache JSON metadata (especially index.json) to avoid stale localhost links in clients
app.use('/meta', express_1.default.static(METADATA_DIR, {
    index: 'index.json',
    cacheControl: true,
    immutable: false,
    maxAge: 0,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.json')) {
            res.setHeader('Cache-Control', 'no-store');
        }
    }
}));
// Health check
app.get('/healthz', (_req, res) => res.json({ ok: true }));
// Factory PoolCreated logs cache endpoints (reduce front-end chain scanning)
app.get('/api/factory/pool-created', (req, res) => {
    if (!poolCreatedAgg)
        return res.status(503).json({ error: 'aggregator_unavailable' });
    const events = poolCreatedAgg.getEvents();
    res.json({ ok: true, count: events.length, lastScannedBlock: poolCreatedAgg.getLastScannedBlock(), events });
});
app.post('/api/factory/pool-created/scan', (req, res) => {
    if (!poolCreatedAgg)
        return res.status(503).json({ error: 'aggregator_unavailable' });
    poolCreatedAgg.forceScan().then(() => {
        res.json({ ok: true, lastScannedBlock: poolCreatedAgg.getLastScannedBlock(), count: poolCreatedAgg.getEvents().length });
    }).catch(e => {
        res.status(500).json({ error: 'scan_failed', message: e?.message || String(e) });
    });
});
// Friendly landing page for root path
app.get('/', (_req, res) => {
    const html = `<!doctype html>
  <html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lucky-pool backend</title>
    <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;max-width:820px;margin:40px auto;padding:0 16px;color:#0f172a} code,pre{background:#f1f5f9;padding:2px 6px;border-radius:6px} a{color:#2563eb;text-decoration:none} a:hover{text-decoration:underline}</style>
  </head>
  <body>
    <h1>Lucky-pool backend</h1>
    <p>这是文件上传与元数据服务的后端。可用端点：</p>
    <ul>
      <li>健康检查：<a href="/healthz">/healthz</a></li>
      <li>上传接口（POST）：<code>/api/upload</code>（form-data: file=image）</li>
      <li>元数据接口（POST）：<code>/api/metadata</code>（JSON: { title, description, image }）</li>
      <li>静态文件：<a href="/uploads/">/uploads/</a>、<a href="/meta/">/meta/</a></li>
  <li>（已撤回）聚合池信息端点：<code>/api/pools</code></li>
    </ul>
  </body>
  </html>`;
    res.type('html').send(html);
});
// Simple API key middleware (optional)
const API_KEY = process.env.API_KEY;
function requireApiKey(req, res, next) {
    if (!API_KEY)
        return next(); // if not configured, skip
    const header = req.header('x-api-key');
    if (header && header === API_KEY)
        return next();
    return res.status(401).json({ error: 'unauthorized' });
}
// Upload endpoint
app.post('/api/upload', requireApiKey, (req, res, next) => {
    // 为了兼容某些代理对 multipart 的处理，提前设置 no-store
    try {
        res.setHeader('Cache-Control', 'no-store');
    }
    catch { }
    next();
}, upload.single('file'), (req, res) => {
    const mreq = req;
    if (!mreq.file)
        return res.status(400).json({ error: 'no_file' });
    const url = `${BASE_URL}/uploads/${encodeURIComponent(mreq.file.filename)}`;
    console.log('[upload] stored', mreq.file.originalname, '->', mreq.file.filename, mreq.file.mimetype, mreq.file.size);
    return res.json({ url, filename: mreq.file.filename, size: mreq.file.size, mime: mreq.file.mimetype || '' });
});
// Metadata endpoint
app.post('/api/metadata', requireApiKey, async (req, res) => {
    try {
        const body = req.body;
        if (!body || typeof body !== 'object')
            return res.status(400).json({ error: 'invalid_body' });
        // Basic shape validation
        const { title, description, image, startAt } = body;
        if (!title || !description || !image)
            return res.status(400).json({ error: 'missing_fields' });
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const filePath = path_1.default.join(METADATA_DIR, `${id}.json`);
        const payload = { title, description, image, createdAt: new Date().toISOString() };
        if (typeof startAt === 'number' && Number.isFinite(startAt) && startAt > 0)
            payload.startAt = startAt;
        await fs_1.default.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
        const uri = `${BASE_URL}/meta/${encodeURIComponent(path_1.default.basename(filePath))}`;
        return res.json({ uri, id });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// Maintain a mapping of pool=>metadataURI to help frontends fetch metadata without relying solely on chain logs
const INDEX_FILE = path_1.default.join(METADATA_DIR, 'index.json');
async function readIndex() {
    try {
        const txt = await fs_1.default.promises.readFile(INDEX_FILE, 'utf-8');
        const j = JSON.parse(txt);
        if (j && typeof j === 'object')
            return j;
        return {};
    }
    catch {
        return {};
    }
}
async function writeIndex(obj) {
    await fs_1.default.promises.writeFile(INDEX_FILE, JSON.stringify(obj, null, 2), 'utf-8');
}
// helper: determine private hosts
function isPrivateHost(h) {
    if (!h)
        return false;
    const lower = h.toLowerCase();
    if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1')
        return true;
    if (lower.startsWith('192.168.'))
        return true;
    if (lower.startsWith('10.'))
        return true;
    const m = /^172\.(\d+)\./.exec(lower);
    if (m) {
        const n = Number(m[1]);
        if (n >= 16 && n <= 31)
            return true;
    }
    return false;
}
// one-shot or on-demand migration to BASE_URL
async function migrateToBaseUrl() {
    let indexChanged = false;
    let entriesUpdated = 0;
    let filesTouched = 0;
    try {
        // ensure index exists
        if (!fs_1.default.existsSync(INDEX_FILE)) {
            await fs_1.default.promises.writeFile(INDEX_FILE, JSON.stringify({}, null, 2), 'utf-8');
        }
        const base = new URL(BASE_URL);
        // migrate index.json
        try {
            const txt = await fs_1.default.promises.readFile(INDEX_FILE, 'utf-8');
            const idx = JSON.parse(txt || '{}');
            for (const k of Object.keys(idx)) {
                try {
                    const u = new URL(idx[k]);
                    if (isPrivateHost(u.hostname) || u.hostname !== base.hostname || u.protocol !== base.protocol || (u.port && u.port !== base.port)) {
                        const pathname = u.pathname + (u.search || '');
                        idx[k] = `${base.origin}${pathname}`;
                        indexChanged = true;
                        entriesUpdated++;
                    }
                }
                catch {
                    // if value is not URL, skip
                }
            }
            if (indexChanged) {
                await fs_1.default.promises.writeFile(INDEX_FILE, JSON.stringify(idx, null, 2), 'utf-8');
                console.log('Migrated /meta/index.json entries to', base.origin);
            }
        }
        catch (e) { /* ignore */ }
        // migrate metadata image fields
        try {
            const files = await fs_1.default.promises.readdir(METADATA_DIR);
            for (const f of files) {
                if (!f.endsWith('.json') || f === 'index.json')
                    continue;
                const full = path_1.default.join(METADATA_DIR, f);
                try {
                    const txt = await fs_1.default.promises.readFile(full, 'utf-8');
                    const j = JSON.parse(txt);
                    if (j && typeof j === 'object' && typeof j.image === 'string' && j.image) {
                        try {
                            const u = new URL(j.image);
                            const pathname = u.pathname + (u.search || '');
                            const needs = isPrivateHost(u.hostname || '') || u.hostname !== (new URL(BASE_URL)).hostname || u.protocol !== (new URL(BASE_URL)).protocol || (u.port && u.port !== (new URL(BASE_URL)).port);
                            if (needs && (pathname.startsWith('/uploads') || pathname.startsWith('/meta'))) {
                                j.image = `${(new URL(BASE_URL)).origin}${pathname}`;
                                await fs_1.default.promises.writeFile(full, JSON.stringify(j, null, 2), 'utf-8');
                                filesTouched++;
                            }
                        }
                        catch { /* not absolute URL */ }
                    }
                }
                catch { /* ignore */ }
            }
            if (filesTouched > 0)
                console.log(`Migrated ${filesTouched} metadata files to BASE_URL origin for image fields`);
        }
        catch { /* ignore */ }
    }
    catch (e) {
        console.warn('migrateToBaseUrl failed:', e);
    }
    return { indexChanged, entriesUpdated, filesTouched };
}
// Ensure index file exists to avoid `Cannot GET /meta/` when static handler expects index.json
(async () => {
    try {
        const result = await migrateToBaseUrl();
        if (!result.indexChanged && result.filesTouched === 0) {
            // no-op; but at least index exists
        }
    }
    catch (e) {
        console.warn('init index.json failed:', e);
    }
})();
// Upsert mapping entry
app.post('/api/meta/index', requireApiKey, async (req, res) => {
    try {
        const { pool, uri } = req.body || {};
        if (!pool || !uri)
            return res.status(400).json({ error: 'missing_fields' });
        const lower = String(pool).toLowerCase();
        const idx = await readIndex();
        idx[lower] = String(uri);
        await writeIndex(idx);
        // 自动创建稳定别名：如果提供的 URI 指向当前 BASE_URL 域名下的 /meta/ 随机文件，则复制一份为 meta/<pool>.json
        try {
            const base = new URL(BASE_URL);
            const u = new URL(String(uri));
            const sameHost = (u.hostname === base.hostname && u.protocol === base.protocol);
            if (sameHost && u.pathname.startsWith('/meta/') && !u.pathname.endsWith(`${lower}.json`)) {
                const r = await fetch(String(uri));
                if (r.ok) {
                    const j = await r.json().catch(() => null);
                    if (j && typeof j === 'object') {
                        const aliasPath = path_1.default.join(METADATA_DIR, `${lower}.json`);
                        await fs_1.default.promises.writeFile(aliasPath, JSON.stringify(j, null, 2), 'utf-8');
                        // 将 index 指向别名，保证稳定
                        const aliasUri = `${base.origin}/meta/${lower}.json`;
                        const idx2 = await readIndex();
                        idx2[lower] = aliasUri;
                        await writeIndex(idx2);
                        return res.json({ ok: true, aliased: true, alias: aliasUri });
                    }
                }
            }
        }
        catch (e) { /* ignore alias errors */ }
        return res.json({ ok: true, aliased: false });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// Delete mapping (set to empty or remove)
app.delete('/api/meta/index', requireApiKey, async (req, res) => {
    try {
        const pool = req.query.pool || req.body?.pool;
        if (!pool)
            return res.status(400).json({ error: 'missing_pool' });
        const lower = String(pool).toLowerCase();
        const idx = await readIndex();
        delete idx[lower];
        await writeIndex(idx);
        return res.json({ ok: true });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// Inspect current mapping
app.get('/api/meta/index', async (_req, res) => {
    const idx = await readIndex();
    return res.json(idx);
});
// Manual migration endpoint (guarded by API_KEY if set)
app.post('/api/meta/migrate', requireApiKey, async (_req, res) => {
    try {
        const force = (_req.query.force === '1' || _req.query.force === 'true');
        // 若 force 则强制重写 index.json 里所有 http(s) 且主机!=BASE_URL.host / 私网条目
        let migrated = await migrateToBaseUrl();
        if (force) {
            try {
                const base = new URL(BASE_URL);
                const idx = await readIndex();
                let changed = false;
                for (const k of Object.keys(idx)) {
                    const v = idx[k];
                    try {
                        const u = new URL(v);
                        const need = u.hostname !== base.hostname || u.protocol !== base.protocol || (u.port && u.port !== base.port) || isPrivateHost(u.hostname);
                        if (need) {
                            const pathname = u.pathname + (u.search || '');
                            idx[k] = `${base.origin}${pathname}`;
                            changed = true;
                        }
                    }
                    catch { /* skip non-url */ }
                }
                if (changed) {
                    await writeIndex(idx);
                    migrated.indexChanged = true;
                }
            }
            catch (e) {
                console.warn('force migrate index failed', e);
            }
        }
        return res.json({ ok: true, force, ...migrated, baseUrl: BASE_URL });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// 创建或刷新某池的稳定别名 meta/<pool>.json，便于前端稳定加载（即使原随机文件名丢失）。
// POST /api/meta/alias  { pool, uri? }  （若未提供 uri 则从 index.json 获取）
app.post('/api/meta/alias', requireApiKey, async (req, res) => {
    try {
        const { pool, uri } = req.body || {};
        if (!pool)
            return res.status(400).json({ error: 'missing_pool' });
        const lower = String(pool).toLowerCase();
        let target = uri;
        if (!target) {
            const idx = await readIndex();
            target = idx[lower];
        }
        if (!target)
            return res.status(400).json({ error: 'missing_uri' });
        let json = null;
        try {
            const r = await fetchWithTimeout(String(target), 3000);
            if (!r.ok)
                return res.status(400).json({ error: 'fetch_failed', status: r.status });
            json = await r.json().catch(() => null);
        }
        catch (e) {
            return res.status(400).json({ error: 'fetch_error' });
        }
        if (!json || typeof json !== 'object')
            return res.status(400).json({ error: 'invalid_metadata' });
        // 写入别名文件
        const aliasPath = path_1.default.join(METADATA_DIR, `${lower}.json`);
        await fs_1.default.promises.writeFile(aliasPath, JSON.stringify(json, null, 2), 'utf-8');
        // 更新 index 中该池地址指向别名（更稳定）
        const idx2 = await readIndex();
        const aliasUri = `${BASE_URL}/meta/${lower}.json`;
        idx2[lower] = aliasUri;
        await writeIndex(idx2);
        return res.json({ ok: true, pool: lower, alias: aliasUri });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// 批量为 index.json 中所有池生成/刷新别名文件，并将映射指向稳定别名
// POST /api/meta/alias-all  { force?: 1 }  force=1 时即使已存在别名文件也重新写入
app.post('/api/meta/alias-all', requireApiKey, async (req, res) => {
    try {
        const force = String((req.body || {}).force || '0') === '1';
        const base = new URL(BASE_URL);
        const idx = await readIndex();
        const updated = [];
        for (const [pool, uri] of Object.entries(idx)) {
            const lower = pool.toLowerCase();
            if (!uri)
                continue;
            const aliasPath = path_1.default.join(METADATA_DIR, `${lower}.json`);
            let need = force || !fs_1.default.existsSync(aliasPath);
            let json = null;
            if (need) {
                try {
                    const r = await fetch(uri);
                    if (r.ok)
                        json = await r.json().catch(() => null);
                }
                catch { }
                if (json && typeof json === 'object') {
                    await fs_1.default.promises.writeFile(aliasPath, JSON.stringify(json, null, 2), 'utf-8');
                    const aliasUri = `${base.origin}/meta/${lower}.json`;
                    idx[lower] = aliasUri;
                    updated.push({ pool: lower, alias: aliasUri, refreshed: true });
                }
            }
            else {
                const aliasUri = `${base.origin}/meta/${lower}.json`;
                idx[lower] = aliasUri;
                updated.push({ pool: lower, alias: aliasUri, refreshed: false });
            }
        }
        await writeIndex(idx);
        return res.json({ ok: true, count: updated.length, items: updated, force });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// ---- Recover single pool mapping from chain logs and create alias ----
// POST /api/meta/recover-one { pool, factory?, rpcUrl?, fromBlock? }
// Defaults: factory=0xCEc46Ff4217feb58937212ca0F71F3Ee6c18FC75 (BSC Testnet), fromBlock=71704665, rpcUrl=prebsc seed
app.post('/api/meta/recover-one', requireApiKey, async (req, res) => {
    try {
        const body = req.body || {};
        const poolRaw = String(body.pool || '').toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(poolRaw))
            return res.status(400).json({ error: 'invalid_pool' });
        const factory = String(body.factory || '0xCEc46Ff4217feb58937212ca0F71F3Ee6c18FC75');
        const fromBlock = Number(body.fromBlock || 71704665);
        const rpcUrl = String(body.rpcUrl || 'https://data-seed-prebsc-1-s1.binance.org:8545/');
        const provider = new ethers_1.providers.JsonRpcProvider(rpcUrl);
        const iface = new ethers_1.utils.Interface([
            'event PoolCreated(address indexed pool, uint256 min, uint256 max, string metadataURI, uint256 sortOrder)'
        ]);
        const topic0 = iface.getEventTopic('PoolCreated');
        const topic1 = ethers_1.utils.hexZeroPad(poolRaw, 32);
        const latest = await provider.getBlockNumber();
        const step = 5000;
        let foundUri = null;
        for (let start = fromBlock; start <= latest; start += step) {
            const end = Math.min(start + step - 1, latest);
            const logs = await provider.getLogs({
                address: factory,
                fromBlock: start,
                toBlock: end,
                topics: [topic0, topic1]
            }).catch(() => []);
            for (const lg of logs) {
                try {
                    const parsed = iface.parseLog(lg);
                    const uri = String(parsed?.args?.metadataURI || '');
                    if (uri) {
                        foundUri = uri;
                        break;
                    }
                }
                catch { /* ignore */ }
            }
            if (foundUri)
                break;
        }
        if (!foundUri)
            return res.status(404).json({ error: 'metadata_uri_not_found' });
        // upsert index
        const lower = poolRaw;
        const idx = await readIndex();
        idx[lower] = foundUri;
        await writeIndex(idx);
        // create alias file and repoint index to alias (same as alias endpoint)
        let json = null;
        try {
            const r = await fetchWithTimeout(foundUri, 3000);
            if (r.ok)
                json = await r.json().catch(() => null);
        }
        catch { }
        if (json && typeof json === 'object') {
            const base = new URL(BASE_URL);
            const aliasPath = path_1.default.join(METADATA_DIR, `${lower}.json`);
            await fs_1.default.promises.writeFile(aliasPath, JSON.stringify(json, null, 2), 'utf-8');
            const aliasUri = `${base.origin}/meta/${lower}.json`;
            const idx2 = await readIndex();
            idx2[lower] = aliasUri;
            await writeIndex(idx2);
            return res.json({ ok: true, pool: lower, uri: foundUri, alias: aliasUri, recovered: true });
        }
        return res.json({ ok: true, pool: lower, uri: foundUri, recovered: true, alias: null });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
async function tryReadJsonFile(p) {
    try {
        const txt = await fs_1.default.promises.readFile(p, 'utf-8');
        const j = JSON.parse(txt);
        if (j && typeof j === 'object')
            return j;
        return null;
    }
    catch {
        return null;
    }
}
// Helper: fetch with timeout to avoid hanging on unreachable hosts
async function fetchWithTimeout(url, timeoutMs = 3000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        // @ts-ignore Node 18+ has global fetch and AbortController
        return await fetch(url, { signal: ctrl.signal });
    }
    finally {
        clearTimeout(id);
    }
}
async function writeScanLog(lines) {
    try {
        const d = new Date();
        const file = path_1.default.join(LOG_DIR, `scan-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`);
        for (const l of lines) {
            await fs_1.default.promises.appendFile(file, JSON.stringify({ ts: Math.floor(Date.now() / 1000), ...l }) + '\n', 'utf-8');
        }
    }
    catch { /* ignore */ }
}
// 扫描 index.json，检测损坏条目；可选自动回退到别名文件
async function scanAndMaybeRepairIndex(opts) {
    const base = new URL(BASE_URL);
    const idx = await readIndex();
    const entries = Object.entries(idx);
    const issues = [];
    const repairs = [];
    let broken = 0;
    let repaired = 0;
    for (const [pool, uri] of entries) {
        const lower = String(pool).toLowerCase();
        if (!uri) {
            issues.push({ pool: lower, reason: 'missing_uri' });
            broken++;
            // 尝试回退别名
            if (opts.repair) {
                const aliasPath = path_1.default.join(METADATA_DIR, `${lower}.json`);
                const j = await tryReadJsonFile(aliasPath);
                if (j) {
                    const aliasUri = `${base.origin}/meta/${lower}.json`;
                    const idx2 = await readIndex();
                    idx2[lower] = aliasUri;
                    await writeIndex(idx2);
                    repairs.push({ pool: lower, alias: aliasUri });
                    repaired++;
                }
            }
            continue;
        }
        try {
            const r = await fetchWithTimeout(String(uri), 3000);
            if (!r.ok) {
                issues.push({ pool: lower, uri: String(uri), reason: 'fetch_failed', status: r.status });
                broken++;
                if (opts.repair) {
                    const aliasPath = path_1.default.join(METADATA_DIR, `${lower}.json`);
                    const j = await tryReadJsonFile(aliasPath);
                    if (j) {
                        const aliasUri = `${base.origin}/meta/${lower}.json`;
                        const idx2 = await readIndex();
                        idx2[lower] = aliasUri;
                        await writeIndex(idx2);
                        repairs.push({ pool: lower, alias: aliasUri });
                        repaired++;
                    }
                }
                continue;
            }
            const j = await r.json().catch(() => null);
            if (!j || typeof j !== 'object') {
                issues.push({ pool: lower, uri: String(uri), reason: 'invalid_json' });
                broken++;
                if (opts.repair) {
                    const aliasPath = path_1.default.join(METADATA_DIR, `${lower}.json`);
                    const j2 = await tryReadJsonFile(aliasPath);
                    if (j2) {
                        const aliasUri = `${base.origin}/meta/${lower}.json`;
                        const idx2 = await readIndex();
                        idx2[lower] = aliasUri;
                        await writeIndex(idx2);
                        repairs.push({ pool: lower, alias: aliasUri });
                        repaired++;
                    }
                }
            }
            // ok 情况无需处理
        }
        catch (e) {
            issues.push({ pool: lower, uri: String(uri), reason: 'exception' });
            broken++;
            if (opts.repair) {
                const aliasPath = path_1.default.join(METADATA_DIR, `${lower}.json`);
                const j = await tryReadJsonFile(aliasPath);
                if (j) {
                    const aliasUri = `${base.origin}/meta/${lower}.json`;
                    const idx2 = await readIndex();
                    idx2[lower] = aliasUri;
                    await writeIndex(idx2);
                    repairs.push({ pool: lower, alias: aliasUri });
                    repaired++;
                }
            }
        }
    }
    if (issues.length > 0 || repairs.length > 0) {
        await writeScanLog([{ summary: { checked: entries.length, broken, repaired } }, ...issues.map(i => ({ issue: i })), ...repairs.map(r => ({ repair: r }))]);
    }
    return { checked: entries.length, broken, repaired, issues, repairs };
}
// 管理端扫描接口：GET /api/meta/scan?repair=1  可触发自动回退修复
const scanMetaHandler = async (req, res) => {
    try {
        const repair = (String(req.query.repair || '0') === '1' || String(req.query.repair || '').toLowerCase() === 'true');
        const result = await scanAndMaybeRepairIndex({ repair });
        return res.json({ ok: true, repair, ...result });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
};
app.get('/api/meta/scan', scanMetaHandler);
// 启动时与每小时定期扫描一次（自动修复）
;
(async () => {
    try {
        const first = await scanAndMaybeRepairIndex({ repair: true });
        if (first.broken > 0)
            console.log(`Index scan at start: broken=${first.broken}, repaired=${first.repaired}`);
    }
    catch (e) {
        console.warn('initial scan failed:', e);
    }
    setInterval(async () => {
        try {
            const r = await scanAndMaybeRepairIndex({ repair: true });
            if (r.broken > 0 || r.repaired > 0)
                console.log(`Index hourly scan: broken=${r.broken}, repaired=${r.repaired}`);
        }
        catch (e) {
            console.warn('hourly scan failed:', e);
        }
    }, 60 * 60 * 1000);
})();
// 按照已有池的元数据克隆，生成新池的别名文件并更新 index
// POST /api/meta/clone { fromPool, toPool, replacements? }
app.post('/api/meta/clone', requireApiKey, async (req, res) => {
    try {
        const { fromPool, toPool, replacements } = req.body || {};
        const src = String(fromPool || '').toLowerCase();
        const dst = String(toPool || '').toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(src) || !/^0x[0-9a-f]{40}$/.test(dst))
            return res.status(400).json({ error: 'invalid_pool' });
        const base = new URL(BASE_URL);
        // 优先使用别名文件
        const aliasSrc = path_1.default.join(METADATA_DIR, `${src}.json`);
        let json = await tryReadJsonFile(aliasSrc);
        if (!json) {
            // 回退到 index 映射
            const idx = await readIndex();
            const uri = idx[src];
            if (!uri)
                return res.status(400).json({ error: 'missing_src_uri' });
            const r = await fetchWithTimeout(String(uri), 3000).catch(() => null);
            if (!r || !r.ok)
                return res.status(400).json({ error: 'fetch_failed' });
            json = await r.json().catch(() => null);
            if (!json || typeof json !== 'object')
                return res.status(400).json({ error: 'invalid_metadata' });
        }
        // 应用替换
        if (replacements && typeof replacements === 'object') {
            for (const k of ['title', 'description', 'image']) {
                if (typeof replacements[k] === 'string' && replacements[k])
                    json[k] = replacements[k];
            }
            if (typeof replacements.startAt === 'number' && replacements.startAt > 0) {
                json.startAt = Math.floor(Number(replacements.startAt));
            }
        }
        // 写入目标别名
        const aliasDstPath = path_1.default.join(METADATA_DIR, `${dst}.json`);
        await fs_1.default.promises.writeFile(aliasDstPath, JSON.stringify(json, null, 2), 'utf-8');
        // 更新 index 指向新别名
        const idx2 = await readIndex();
        idx2[dst] = `${base.origin}/meta/${dst}.json`;
        await writeIndex(idx2);
        return res.json({ ok: true, alias: idx2[dst] });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// ===== 自动下一期守护（可选） =====
const autoNext_1 = require("./autoNext");
try {
    (0, autoNext_1.registerAutoNext)(app);
}
catch (e) {
    console.warn('auto-next init failed:', e);
}
// ===== 历史清理（30天策略） =====
const cleanup_1 = require("./cleanup");
try {
    (0, cleanup_1.registerCleanup)(app);
}
catch (e) {
    console.warn('cleanup init failed:', e);
}
// ---- Simple Chat System (short polling, per-pool) ----
// In-memory auth state (reset on process restart)
const CHAT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const CHAT_MIN_INTERVAL_MS = 3000;
const chatNonces = new Map(); // addressLower -> {nonce, ts}
const chatSessions = new Map(); // addressLower -> {token, issuedAt}
const chatLastSent = new Map(); // addressLower -> lastSentTs
function randomToken(len = 32) {
    return Array.from(crypto.getRandomValues(new Uint8Array(len))).map(b => b.toString(16).padStart(2, '0')).join('');
}
function sanitizeMessage(s) {
    let t = String(s || '');
    t = t.replace(/[\r\n\t]+/g, ' ');
    t = t.replace(/[\u0000-\u001f\u007f]/g, '');
    t = t.trim();
    if (t.length > 280)
        t = t.slice(0, 280);
    return t;
}
// GET /api/chat/nonce?address=0x...
app.get('/api/chat/nonce', async (req, res) => {
    try {
        const address = String(req.query.address || '').toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(address))
            return res.status(400).json({ error: 'invalid_address' });
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
        chatNonces.set(address, { nonce, ts: Date.now() });
        return res.json({ nonce, expireInSec: 300 });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// POST /api/chat/auth { address, signature }
// Client signs the message: `Lucky-pool Chat Login\nAddress: <address_lower>\nNonce: <nonce>`
app.post('/api/chat/auth', async (req, res) => {
    try {
        const { address, signature } = req.body || {};
        const adr = String(address || '').toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(adr))
            return res.status(400).json({ error: 'invalid_address' });
        const found = chatNonces.get(adr);
        if (!found)
            return res.status(400).json({ error: 'nonce_missing' });
        if (Date.now() - found.ts > 5 * 60 * 1000) {
            chatNonces.delete(adr);
            return res.status(400).json({ error: 'nonce_expired' });
        }
        const message = `Lucky-pool Chat Login\nAddress: ${adr}\nNonce: ${found.nonce}`;
        let recovered = '';
        try {
            recovered = ethers_1.utils.verifyMessage(message, String(signature || ''));
        }
        catch {
            return res.status(400).json({ error: 'invalid_signature' });
        }
        if (recovered.toLowerCase() !== adr)
            return res.status(400).json({ error: 'address_mismatch' });
        chatNonces.delete(adr);
        const token = randomToken(32);
        chatSessions.set(adr, { token, ts: Date.now() });
        return res.json({ ok: true, token, ttlSec: CHAT_TOKEN_TTL_MS / 1000 });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// POST /api/chat/message { pool, address, token, message }
app.post('/api/chat/message', async (req, res) => {
    try {
        const { pool, address, token } = req.body || {};
        let { message } = req.body || {};
        const adr = String(address || '').toLowerCase();
        const poolAddr = String(pool || '').toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(adr))
            return res.status(400).json({ error: 'invalid_address' });
        if (!/^0x[0-9a-f]{40}$/.test(poolAddr))
            return res.status(400).json({ error: 'invalid_pool' });
        message = sanitizeMessage(String(message || ''));
        if (!message)
            return res.status(400).json({ error: 'empty_message' });
        const session = chatSessions.get(adr);
        if (!session || session.token !== String(token || ''))
            return res.status(401).json({ error: 'unauthorized' });
        if (Date.now() - session.ts > CHAT_TOKEN_TTL_MS) {
            chatSessions.delete(adr);
            return res.status(401).json({ error: 'session_expired' });
        }
        const last = chatLastSent.get(adr) || 0;
        if (Date.now() - last < CHAT_MIN_INTERVAL_MS)
            return res.status(429).json({ error: 'too_many_requests' });
        chatLastSent.set(adr, Date.now());
        const ts = Math.floor(Date.now() / 1000);
        const d = new Date();
        const file = path_1.default.join(LOG_DIR, `chat-${poolAddr}-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`);
        const line = JSON.stringify({ ts, pool: poolAddr, address: adr, message });
        await fs_1.default.promises.appendFile(file, line + '\n', 'utf-8');
        return res.json({ ok: true, ts });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// GET /api/chat/messages?pool=0x..&since=unix_ts&limit=200
app.get('/api/chat/messages', async (req, res) => {
    try {
        const poolAddr = String(req.query.pool || '').toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(poolAddr))
            return res.status(400).json({ error: 'invalid_pool' });
        const since = Number(req.query.since || 0) || 0;
        const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);
        const now = new Date();
        const months = [0, -1].map(delta => {
            const d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
            return path_1.default.join(LOG_DIR, `chat-${poolAddr}-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`);
        });
        const lines = [];
        for (const f of months) {
            if (fs_1.default.existsSync(f)) {
                const content = await fs_1.default.promises.readFile(f, 'utf-8');
                lines.push(...content.split(/\r?\n/).filter(Boolean));
            }
        }
        const items = lines.map(l => { try {
            return JSON.parse(l);
        }
        catch {
            return null;
        } }).filter(Boolean)
            .filter((it) => !since || (Number(it.ts) || 0) > since)
            .slice(-limit);
        return res.json({ items });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// Append-only log endpoint (JSONL per month)
app.post('/api/log', requireApiKey, async (req, res) => {
    try {
        const body = req.body;
        if (!body || typeof body !== 'object')
            return res.status(400).json({ error: 'invalid_body' });
        const { type, pool, txHash, address, count, timestamp, extra } = body;
        if (!type || !pool)
            return res.status(400).json({ error: 'missing_fields' });
        const ts = Number(timestamp) || Math.floor(Date.now() / 1000);
        const line = JSON.stringify({ type, pool, txHash, address, count, timestamp: ts, extra });
        const d = new Date(ts * 1000);
        const file = path_1.default.join(LOG_DIR, `activity-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`);
        await fs_1.default.promises.appendFile(file, line + '\n', 'utf-8');
        return res.json({ ok: true });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// ---- Global Support Chat (by user address, not per pool) ----
// Separate nonces to avoid message mismatch with pool chat
const supportNonces = new Map();
// GET /api/support/nonce?address=0x...
app.get('/api/support/nonce', async (req, res) => {
    try {
        const address = String(req.query.address || '').toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(address))
            return res.status(400).json({ error: 'invalid_address' });
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
        supportNonces.set(address, { nonce, ts: Date.now() });
        // 禁止缓存，避免 304 导致前端拿不到新 nonce
        try {
            res.setHeader('Cache-Control', 'no-store');
        }
        catch { }
        return res.json({ nonce, expireInSec: 300 });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// POST /api/support/auth { address, signature }
// Message: `Lucky-pool Support Chat Login\nAddress: <address_lower>\nNonce: <nonce>`
app.post('/api/support/auth', async (req, res) => {
    try {
        const { address, signature } = req.body || {};
        const adr = String(address || '').toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(adr))
            return res.status(400).json({ error: 'invalid_address' });
        const found = supportNonces.get(adr);
        if (!found) {
            try {
                await fs_1.default.promises.appendFile(path_1.default.join(LOG_DIR, 'support-auth-debug.jsonl'), JSON.stringify({ stage: 'verify', adr, error: 'nonce_missing', ts: Date.now() }) + '\n', 'utf-8');
            }
            catch { }
            return res.status(400).json({ error: 'nonce_missing' });
        }
        if (Date.now() - found.ts > 5 * 60 * 1000) {
            supportNonces.delete(adr);
            try {
                await fs_1.default.promises.appendFile(path_1.default.join(LOG_DIR, 'support-auth-debug.jsonl'), JSON.stringify({ stage: 'verify', adr, error: 'nonce_expired', ts: Date.now() }) + '\n', 'utf-8');
            }
            catch { }
            return res.status(400).json({ error: 'nonce_expired' });
        }
        const message = `Lucky-pool Support Chat Login\nAddress: ${adr}\nNonce: ${found.nonce}`;
        const sig = String(signature || '');
        const authDebug = { stage: 'verify', adr, sigLen: sig.length, ts: Date.now() };
        const tryRecover = (msg) => {
            try {
                return ethers_1.utils.verifyMessage(msg, sig);
            }
            catch {
                return null;
            }
        };
        const tryRecoverEthSign = (msg) => {
            try {
                const digest = ethers_1.utils.keccak256(ethers_1.utils.toUtf8Bytes(msg));
                return ethers_1.utils.recoverAddress(digest, sig);
            }
            catch {
                return null;
            }
        };
        let recovered = tryRecover(message);
        if (!recovered) {
            // 兼容 CRLF 换行
            const alt = message.replace(/\n/g, '\r\n');
            recovered = tryRecover(alt);
            if (!recovered)
                recovered = tryRecoverEthSign(message) || tryRecoverEthSign(alt);
        }
        if (!recovered) {
            try {
                await fs_1.default.promises.appendFile(path_1.default.join(LOG_DIR, 'support-auth-debug.jsonl'), JSON.stringify({ ...authDebug, error: 'invalid_signature' }) + '\n', 'utf-8');
            }
            catch { }
            return res.status(400).json({ error: 'invalid_signature' });
        }
        if (recovered.toLowerCase() !== adr) {
            try {
                await fs_1.default.promises.appendFile(path_1.default.join(LOG_DIR, 'support-auth-debug.jsonl'), JSON.stringify({ ...authDebug, error: 'address_mismatch', recovered }) + '\n', 'utf-8');
            }
            catch { }
            return res.status(400).json({ error: 'address_mismatch' });
        }
        supportNonces.delete(adr);
        const token = randomToken(32);
        chatSessions.set(adr, { token, ts: Date.now() });
        try {
            await fs_1.default.promises.appendFile(path_1.default.join(LOG_DIR, 'support-auth-debug.jsonl'), JSON.stringify({ ...authDebug, ok: true, recovered }) + '\n', 'utf-8');
        }
        catch { }
        return res.json({ ok: true, token, ttlSec: CHAT_TOKEN_TTL_MS / 1000 });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
function supportLogFile(ts) {
    const d = new Date(ts);
    return path_1.default.join(LOG_DIR, `support-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`);
}
// POST /api/support/message { address, token, message }
app.post('/api/support/message', async (req, res) => {
    try {
        const { address, token } = req.body || {};
        let { message } = req.body || {};
        const adr = String(address || '').toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(adr))
            return res.status(400).json({ error: 'invalid_address' });
        message = sanitizeMessage(String(message || ''));
        if (!message)
            return res.status(400).json({ error: 'empty_message' });
        const session = chatSessions.get(adr);
        if (!session || session.token !== String(token || ''))
            return res.status(401).json({ error: 'unauthorized' });
        if (Date.now() - session.ts > CHAT_TOKEN_TTL_MS) {
            chatSessions.delete(adr);
            return res.status(401).json({ error: 'session_expired' });
        }
        const last = chatLastSent.get(adr) || 0;
        if (Date.now() - last < CHAT_MIN_INTERVAL_MS)
            return res.status(429).json({ error: 'too_many_requests' });
        chatLastSent.set(adr, Date.now());
        const ts = Math.floor(Date.now() / 1000);
        const file = supportLogFile(ts * 1000);
        const line = JSON.stringify({ ts, channel: 'support', from: 'user', address: adr, message });
        await fs_1.default.promises.appendFile(file, line + '\n', 'utf-8');
        return res.json({ ok: true, ts });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// Admin send to a specific user
// POST /api/support/admin-message { to, message }
app.post('/api/support/admin-message', requireApiKey, async (req, res) => {
    try {
        const { to } = req.body || {};
        let { message } = req.body || {};
        const adr = String(to || '').toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(adr))
            return res.status(400).json({ error: 'invalid_address' });
        message = sanitizeMessage(String(message || ''));
        if (!message)
            return res.status(400).json({ error: 'empty_message' });
        const ts = Math.floor(Date.now() / 1000);
        const file = supportLogFile(ts * 1000);
        const line = JSON.stringify({ ts, channel: 'support', from: 'admin', address: adr, message });
        await fs_1.default.promises.appendFile(file, line + '\n', 'utf-8');
        return res.json({ ok: true, ts });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// GET /api/support/messages?address=0x..&since=unix_ts&limit=200
// If address provided -> return conversation for that user; if omitted and API key present -> return all recent
app.get('/api/support/messages', async (req, res) => {
    try {
        const adrRaw = String(req.query.address || '').toLowerCase();
        const since = Number(req.query.since || 0) || 0;
        const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 1000);
        const now = new Date();
        const months = [0, -1].map(delta => {
            const d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
            return path_1.default.join(LOG_DIR, `support-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`);
        });
        const lines = [];
        for (const f of months) {
            if (fs_1.default.existsSync(f)) {
                const content = await fs_1.default.promises.readFile(f, 'utf-8');
                lines.push(...content.split(/\r?\n/).filter(Boolean));
            }
        }
        let items = lines.map(l => { try {
            return JSON.parse(l);
        }
        catch {
            return null;
        } }).filter(Boolean);
        if (adrRaw && /^0x[0-9a-f]{40}$/.test(adrRaw)) {
            items = items.filter((it) => it.address === adrRaw);
        }
        items = items.filter((it) => !since || (Number(it.ts) || 0) > since).slice(-limit);
        return res.json({ items });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// GET /api/support/conversations  -> aggregate by address with lastTs (admin only)
app.get('/api/support/conversations', requireApiKey, async (_req, res) => {
    try {
        const now = new Date();
        const months = [0, -1].map(delta => {
            const d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
            return path_1.default.join(LOG_DIR, `support-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`);
        });
        const lines = [];
        for (const f of months) {
            if (fs_1.default.existsSync(f)) {
                const content = await fs_1.default.promises.readFile(f, 'utf-8');
                lines.push(...content.split(/\r?\n/).filter(Boolean));
            }
        }
        const map = new Map();
        for (const l of lines) {
            try {
                const j = JSON.parse(l);
                if (j?.address) {
                    const t = Number(j.ts) || 0;
                    if (t)
                        map.set(j.address, Math.max(map.get(j.address) || 0, t));
                }
            }
            catch { }
        }
        const items = Array.from(map.entries()).map(([address, lastTs]) => ({ address, lastTs })).sort((a, b) => a.lastTs - b.lastTs).slice(-200).reverse();
        return res.json({ items });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// /api/pools 端点已删除：若前端仍调用将收到 404。
// Tail recent logs
app.get('/api/logs', requireApiKey, async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit || 200), 2000);
        // Read latest two monthly files to cover boundary
        const now = new Date();
        const months = [0, -1].map(delta => {
            const d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
            return path_1.default.join(LOG_DIR, `activity-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`);
        });
        const lines = [];
        for (const f of months) {
            if (fs_1.default.existsSync(f)) {
                const content = await fs_1.default.promises.readFile(f, 'utf-8');
                lines.push(...content.split(/\r?\n/).filter(Boolean));
            }
        }
        const recent = lines.slice(-limit).map(l => { try {
            return JSON.parse(l);
        }
        catch {
            return null;
        } }).filter(Boolean);
        return res.json({ items: recent });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// Public stats endpoint for Transparency page
app.get('/api/stats', async (_req, res) => {
    try {
        const now = new Date();
        const months = [0, -1].map(delta => {
            const d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
            return path_1.default.join(LOG_DIR, `activity-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`);
        });
        const lines = [];
        for (const f of months) {
            if (fs_1.default.existsSync(f)) {
                const content = await fs_1.default.promises.readFile(f, 'utf-8');
                lines.push(...content.split(/\r?\n/).filter(Boolean));
            }
        }
        let totalParticipations = 0;
        let totalRewardPaid = 0;
        for (const l of lines) {
            try {
                const j = JSON.parse(l);
                if (j?.type === 'participate') {
                    const c = Number(j.count || 0);
                    if (Number.isFinite(c))
                        totalParticipations += c;
                }
                if (j?.type === 'draw' || j?.type === 'DrawFulfilled') {
                    const r = Number(j?.extra?.reward || 0);
                    if (Number.isFinite(r))
                        totalRewardPaid += r;
                }
            }
            catch { /* ignore bad line */ }
        }
        return res.json({ totalParticipations, totalRewardPaid, logWindowMonths: 2, lastSync: Math.floor(Date.now() / 1000) });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'internal_error' });
    }
});
// Start HTTP server (bind on IPv4 to ensure 127.0.0.1 works behind Nginx)
const httpServer = http_1.default.createServer(app);
const gameServer = new GameServer_1.GameServer(httpServer, METADATA_DIR);
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Lucky-pool backend listening on ${BASE_URL}`);
    console.log(`Game Server initialized`);
});
// Optionally start HTTPS server when certs are provided
if (HTTPS_PORT) {
    try {
        let httpsOptions = null;
        if (SSL_PFX_PATH && fs_1.default.existsSync(SSL_PFX_PATH)) {
            httpsOptions = { pfx: fs_1.default.readFileSync(SSL_PFX_PATH), passphrase: SSL_PFX_PASSPHRASE || undefined };
        }
        else if (SSL_KEY_PATH && SSL_CERT_PATH && fs_1.default.existsSync(SSL_KEY_PATH) && fs_1.default.existsSync(SSL_CERT_PATH)) {
            httpsOptions = { key: fs_1.default.readFileSync(SSL_KEY_PATH), cert: fs_1.default.readFileSync(SSL_CERT_PATH) };
        }
        if (httpsOptions) {
            const httpsServer = https_1.default.createServer(httpsOptions, app);
            httpsServer.listen(HTTPS_PORT, () => {
                console.log(`Lucky-pool backend (HTTPS) listening on https://localhost:${HTTPS_PORT}`);
            });
        }
        else {
            console.warn('HTTPS_PORT set but no SSL materials found (provide SSL_PFX_PATH or SSL_KEY_PATH/SSL_CERT_PATH).');
        }
    }
    catch (e) {
        console.warn('Failed to start HTTPS server:', e);
    }
}
