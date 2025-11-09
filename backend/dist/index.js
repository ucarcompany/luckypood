"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
// Basic configuration via env vars
const PORT = parseInt(process.env.PORT || '4000', 10);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`; // For building returned URLs
const HTTPS_PORT = process.env.HTTPS_PORT ? parseInt(process.env.HTTPS_PORT, 10) : undefined;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '';
const SSL_PFX_PATH = process.env.SSL_PFX_PATH || '';
const SSL_PFX_PASSPHRASE = process.env.SSL_PFX_PASSPHRASE || '';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path_1.default.join(process.cwd(), 'uploads');
const METADATA_DIR = process.env.METADATA_DIR || path_1.default.join(process.cwd(), 'metadata');
const LOG_DIR = process.env.LOG_DIR || path_1.default.join(process.cwd(), 'logs');
// Ensure directories exist
for (const dir of [UPLOAD_DIR, METADATA_DIR, LOG_DIR]) {
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
}
// Multer storage
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const base = path_1.default.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
        const stamp = Date.now();
        cb(null, `${base}_${stamp}${ext}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (_req, file, cb) => {
        if (file?.mimetype && String(file.mimetype).startsWith('image/'))
            return cb(null, true);
        return cb(new Error('invalid_file_type'));
    }
});
// Express app
const app = (0, express_1.default)();
app.disable('x-powered-by');
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json({ limit: '1mb' }));
app.use((0, morgan_1.default)('combined'));
// Basic rate limiting
const limiter = (0, express_rate_limit_1.default)({ windowMs: 60000, max: 60, standardHeaders: true, legacyHeaders: false });
app.use(limiter);
// Static hosting for uploaded files and metadata
app.use('/uploads', express_1.default.static(UPLOAD_DIR, { immutable: true, maxAge: '365d' }));
app.use('/meta', express_1.default.static(METADATA_DIR, { immutable: true, maxAge: '365d', index: 'index.json' }));
// Health check
app.get('/healthz', (_req, res) => res.json({ ok: true }));
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
app.post('/api/upload', requireApiKey, upload.single('file'), (req, res) => {
    const mreq = req;
    if (!mreq.file)
        return res.status(400).json({ error: 'no_file' });
    const url = `${BASE_URL}/uploads/${encodeURIComponent(mreq.file.filename)}`;
    return res.json({ url, filename: mreq.file.filename, size: mreq.file.size, mime: mreq.file.mimetype });
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
// Ensure index file exists to avoid `Cannot GET /meta/` when static handler expects index.json
(async () => {
    try {
        if (!fs_1.default.existsSync(INDEX_FILE)) {
            await fs_1.default.promises.writeFile(INDEX_FILE, JSON.stringify({}, null, 2), 'utf-8');
        }
        // Migrate legacy localhost origins in index.json to BASE_URL origin
        try {
            const txt = await fs_1.default.promises.readFile(INDEX_FILE, 'utf-8');
            const idx = JSON.parse(txt || '{}');
            const base = new URL(BASE_URL);
            let changed = false;
            for (const k of Object.keys(idx)) {
                try {
                    const u = new URL(idx[k]);
                    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && (u.port !== base.port || u.hostname !== base.hostname)) {
                        idx[k] = `${base.origin}${u.pathname}`;
                        changed = true;
                    }
                }
                catch { }
            }
            if (changed) {
                await fs_1.default.promises.writeFile(INDEX_FILE, JSON.stringify(idx, null, 2), 'utf-8');
                console.log('Migrated /meta/index.json localhost entries to', base.origin);
            }
        }
        catch (e) { /* noop */ }
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
        return res.json({ ok: true });
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
// Start HTTP server
const httpServer = http_1.default.createServer(app);
httpServer.listen(PORT, () => {
    console.log(`Lucky-pool backend listening on ${BASE_URL}`);
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
