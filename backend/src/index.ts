import 'dotenv/config'; // 加载 .env 环境变量，方便通过文件配置 BASE_URL / 目录等
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { utils as ethersUtils } from 'ethers';
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
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const METADATA_DIR = process.env.METADATA_DIR || path.join(process.cwd(), 'metadata');
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

// Ensure directories exist
for (const dir of [UPLOAD_DIR, METADATA_DIR, LOG_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, UPLOAD_DIR),
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    const stamp = Date.now();
    cb(null, `${base}_${stamp}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req: any, file: any, cb: any) => {
    if (file?.mimetype && String(file.mimetype).startsWith('image/')) return cb(null, true);
    return cb(new Error('invalid_file_type'));
  }
});

// Express app
const app = express();
app.disable('x-powered-by');
// 部署在 Nginx 反向代理之后，仅信任最前置的 1 层代理
// 注意：express-rate-limit v7 不允许使用宽松的 true（会抛 ERR_ERL_PERMISSIVE_TRUST_PROXY）
app.set('trust proxy', 1);
// Helmet with relaxed CORP/COEP so that images/JSON can be embedded across LAN origins
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));
// Basic rate limiting（仅作用于 /api 路径，避免静态元数据与图片频繁读取触发 429）
const limiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter);

// Static hosting for uploaded files and metadata
app.use('/uploads', express.static(UPLOAD_DIR, { immutable: true, maxAge: '365d' }));
// Do not cache JSON metadata (especially index.json) to avoid stale localhost links in clients
app.use('/meta', express.static(METADATA_DIR, {
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
function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!API_KEY) return next(); // if not configured, skip
  const header = req.header('x-api-key');
  if (header && header === API_KEY) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// Upload endpoint
app.post('/api/upload', requireApiKey, upload.single('file'), (req, res) => {
  const mreq = req as any;
  if (!mreq.file) return res.status(400).json({ error: 'no_file' });
  const url = `${BASE_URL}/uploads/${encodeURIComponent(mreq.file.filename)}`;
  return res.json({ url, filename: mreq.file.filename, size: mreq.file.size, mime: mreq.file.mimetype });
});

// Metadata endpoint
app.post('/api/metadata', requireApiKey, async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid_body' });

    // Basic shape validation
    const { title, description, image, startAt } = body as { title?: string; description?: string; image?: string; startAt?: number };
    if (!title || !description || !image) return res.status(400).json({ error: 'missing_fields' });

    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const filePath = path.join(METADATA_DIR, `${id}.json`);
    const payload: any = { title, description, image, createdAt: new Date().toISOString() };
    if (typeof startAt === 'number' && Number.isFinite(startAt) && startAt > 0) payload.startAt = startAt;
    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');

    const uri = `${BASE_URL}/meta/${encodeURIComponent(path.basename(filePath))}`;
    return res.json({ uri, id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Maintain a mapping of pool=>metadataURI to help frontends fetch metadata without relying solely on chain logs
const INDEX_FILE = path.join(METADATA_DIR, 'index.json');
async function readIndex(): Promise<Record<string,string>> {
  try {
    const txt = await fs.promises.readFile(INDEX_FILE, 'utf-8')
    const j = JSON.parse(txt)
    if (j && typeof j === 'object') return j
    return {}
  } catch { return {} }
}
async function writeIndex(obj: Record<string,string>) {
  await fs.promises.writeFile(INDEX_FILE, JSON.stringify(obj, null, 2), 'utf-8')
}

// helper: determine private hosts
function isPrivateHost(h: string) {
  if (!h) return false
  const lower = h.toLowerCase()
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1') return true
  if (lower.startsWith('192.168.')) return true
  if (lower.startsWith('10.')) return true
  const m = /^172\.(\d+)\./.exec(lower); if (m) { const n = Number(m[1]); if (n>=16 && n<=31) return true }
  return false
}

// one-shot or on-demand migration to BASE_URL
async function migrateToBaseUrl(): Promise<{ indexChanged: boolean; entriesUpdated: number; filesTouched: number }>{
  let indexChanged = false
  let entriesUpdated = 0
  let filesTouched = 0
  try {
    // ensure index exists
    if (!fs.existsSync(INDEX_FILE)) {
      await fs.promises.writeFile(INDEX_FILE, JSON.stringify({}, null, 2), 'utf-8')
    }
    const base = new URL(BASE_URL)
    // migrate index.json
    try {
      const txt = await fs.promises.readFile(INDEX_FILE, 'utf-8')
      const idx = JSON.parse(txt || '{}') as Record<string,string>
      for (const k of Object.keys(idx)) {
        try {
          const u = new URL(idx[k])
          if (isPrivateHost(u.hostname) || u.hostname !== base.hostname || u.protocol !== base.protocol || (u.port && u.port !== base.port)) {
            const pathname = u.pathname + (u.search || '')
            idx[k] = `${base.origin}${pathname}`
            indexChanged = true
            entriesUpdated++
          }
        } catch {
          // if value is not URL, skip
        }
      }
      if (indexChanged) {
        await fs.promises.writeFile(INDEX_FILE, JSON.stringify(idx, null, 2), 'utf-8')
        console.log('Migrated /meta/index.json entries to', base.origin)
      }
    } catch (e) { /* ignore */ }

    // migrate metadata image fields
    try {
      const files = await fs.promises.readdir(METADATA_DIR)
      for (const f of files) {
        if (!f.endsWith('.json') || f === 'index.json') continue
        const full = path.join(METADATA_DIR, f)
        try {
          const txt = await fs.promises.readFile(full, 'utf-8')
          const j = JSON.parse(txt)
          if (j && typeof j === 'object' && typeof j.image === 'string' && j.image) {
            try {
              const u = new URL(j.image)
              const pathname = u.pathname + (u.search || '')
              const needs = isPrivateHost(u.hostname || '') || u.hostname !== (new URL(BASE_URL)).hostname || u.protocol !== (new URL(BASE_URL)).protocol || (u.port && u.port !== (new URL(BASE_URL)).port)
              if (needs && (pathname.startsWith('/uploads') || pathname.startsWith('/meta'))) {
                j.image = `${(new URL(BASE_URL)).origin}${pathname}`
                await fs.promises.writeFile(full, JSON.stringify(j, null, 2), 'utf-8')
                filesTouched++
              }
            } catch { /* not absolute URL */ }
          }
        } catch { /* ignore */ }
      }
      if (filesTouched>0) console.log(`Migrated ${filesTouched} metadata files to BASE_URL origin for image fields`)
    } catch { /* ignore */ }
  } catch (e) {
    console.warn('migrateToBaseUrl failed:', e)
  }
  return { indexChanged, entriesUpdated, filesTouched }
}

// Ensure index file exists to avoid `Cannot GET /meta/` when static handler expects index.json
(async () => {
  try {
    const result = await migrateToBaseUrl()
    if (!result.indexChanged && result.filesTouched === 0) {
      // no-op; but at least index exists
    }
  } catch (e) { console.warn('init index.json failed:', e) }
})();

// Upsert mapping entry
app.post('/api/meta/index', requireApiKey, async (req, res) => {
  try {
    const { pool, uri } = req.body || {}
    if (!pool || !uri) return res.status(400).json({ error: 'missing_fields' })
    const lower = String(pool).toLowerCase()
    const idx = await readIndex()
    idx[lower] = String(uri)
    await writeIndex(idx)
    // 自动创建稳定别名：如果提供的 URI 指向当前 BASE_URL 域名下的 /meta/ 随机文件，则复制一份为 meta/<pool>.json
    try {
      const base = new URL(BASE_URL)
      const u = new URL(String(uri))
      const sameHost = (u.hostname === base.hostname && u.protocol === base.protocol)
      if (sameHost && u.pathname.startsWith('/meta/') && !u.pathname.endsWith(`${lower}.json`)) {
        const r = await fetch(String(uri))
        if (r.ok) {
          const j = await r.json().catch(()=>null)
          if (j && typeof j === 'object') {
            const aliasPath = path.join(METADATA_DIR, `${lower}.json`)
            await fs.promises.writeFile(aliasPath, JSON.stringify(j, null, 2), 'utf-8')
            // 将 index 指向别名，保证稳定
            const aliasUri = `${base.origin}/meta/${lower}.json`
            const idx2 = await readIndex(); idx2[lower] = aliasUri; await writeIndex(idx2)
            return res.json({ ok: true, aliased: true, alias: aliasUri })
          }
        }
      }
    } catch (e) { /* ignore alias errors */ }
    return res.json({ ok: true, aliased: false })
  } catch (err) { console.error(err); return res.status(500).json({ error: 'internal_error' }) }
})

// Delete mapping (set to empty or remove)
app.delete('/api/meta/index', requireApiKey, async (req, res) => {
  try {
    const pool = (req.query.pool as string) || (req.body as any)?.pool
    if (!pool) return res.status(400).json({ error: 'missing_pool' })
    const lower = String(pool).toLowerCase()
    const idx = await readIndex()
    delete idx[lower]
    await writeIndex(idx)
    return res.json({ ok: true })
  } catch (err) { console.error(err); return res.status(500).json({ error: 'internal_error' }) }
})

// Inspect current mapping
app.get('/api/meta/index', async (_req, res) => {
  const idx = await readIndex()
  return res.json(idx)
})

// Manual migration endpoint (guarded by API_KEY if set)
app.post('/api/meta/migrate', requireApiKey, async (_req, res) => {
  try {
    const force = ((_req.query.force as any) === '1' || _req.query.force === 'true')
    // 若 force 则强制重写 index.json 里所有 http(s) 且主机!=BASE_URL.host / 私网条目
    let migrated = await migrateToBaseUrl()
    if (force) {
      try {
        const base = new URL(BASE_URL)
        const idx = await readIndex()
        let changed = false
        for (const k of Object.keys(idx)) {
          const v = idx[k]
          try {
            const u = new URL(v)
            const need = u.hostname !== base.hostname || u.protocol !== base.protocol || (u.port && u.port !== base.port) || isPrivateHost(u.hostname)
            if (need) {
              const pathname = u.pathname + (u.search || '')
              idx[k] = `${base.origin}${pathname}`
              changed = true
            }
          } catch {/* skip non-url */}
        }
        if (changed) {
          await writeIndex(idx)
          migrated.indexChanged = true
        }
      } catch (e) { console.warn('force migrate index failed', e) }
    }
    return res.json({ ok: true, force, ...migrated, baseUrl: BASE_URL })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'internal_error' })
  }
})

// 创建或刷新某池的稳定别名 meta/<pool>.json，便于前端稳定加载（即使原随机文件名丢失）。
// POST /api/meta/alias  { pool, uri? }  （若未提供 uri 则从 index.json 获取）
app.post('/api/meta/alias', requireApiKey, async (req, res) => {
  try {
    const { pool, uri } = req.body || {}
    if (!pool) return res.status(400).json({ error: 'missing_pool' })
    const lower = String(pool).toLowerCase()
    let target = uri as string | undefined
    if (!target) {
      const idx = await readIndex()
      target = idx[lower]
    }
    if (!target) return res.status(400).json({ error: 'missing_uri' })
    let json: any = null
    try {
      const r = await fetchWithTimeout(String(target), 3000)
      if (!r.ok) return res.status(400).json({ error: 'fetch_failed', status: r.status })
      json = await r.json().catch(()=>null)
    } catch (e) {
      return res.status(400).json({ error: 'fetch_error' })
    }
    if (!json || typeof json !== 'object') return res.status(400).json({ error: 'invalid_metadata' })
    // 写入别名文件
    const aliasPath = path.join(METADATA_DIR, `${lower}.json`)
    await fs.promises.writeFile(aliasPath, JSON.stringify(json, null, 2), 'utf-8')
    // 更新 index 中该池地址指向别名（更稳定）
    const idx2 = await readIndex()
    const aliasUri = `${BASE_URL}/meta/${lower}.json`
    idx2[lower] = aliasUri
    await writeIndex(idx2)
    return res.json({ ok: true, pool: lower, alias: aliasUri })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'internal_error' })
  }
})

// 批量为 index.json 中所有池生成/刷新别名文件，并将映射指向稳定别名
// POST /api/meta/alias-all  { force?: 1 }  force=1 时即使已存在别名文件也重新写入
app.post('/api/meta/alias-all', requireApiKey, async (req, res) => {
  try {
    const force = String((req.body||{}).force||'0') === '1'
    const base = new URL(BASE_URL)
    const idx = await readIndex()
    const updated: { pool:string; alias:string; refreshed:boolean }[] = []
    for (const [pool, uri] of Object.entries(idx)) {
      const lower = pool.toLowerCase()
      if (!uri) continue
      const aliasPath = path.join(METADATA_DIR, `${lower}.json`)
      let need = force || !fs.existsSync(aliasPath)
      let json: any = null
      if (need) {
        try {
          const r = await fetch(uri)
          if (r.ok) json = await r.json().catch(()=>null)
        } catch {}
        if (json && typeof json === 'object') {
          await fs.promises.writeFile(aliasPath, JSON.stringify(json, null, 2), 'utf-8')
          const aliasUri = `${base.origin}/meta/${lower}.json`
          idx[lower] = aliasUri
          updated.push({ pool: lower, alias: aliasUri, refreshed: true })
        }
      } else {
        const aliasUri = `${base.origin}/meta/${lower}.json`
        idx[lower] = aliasUri
        updated.push({ pool: lower, alias: aliasUri, refreshed: false })
      }
    }
    await writeIndex(idx)
    return res.json({ ok: true, count: updated.length, items: updated, force })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'internal_error' })
  }
})

// ---- Index scanning and auto-repair for alias stability ----
type ScanIssue = {
  pool: string
  uri?: string
  reason: 'missing_uri' | 'fetch_failed' | 'invalid_json' | 'exception'
  status?: number
}

async function tryReadJsonFile(p: string): Promise<any|null> {
  try {
    const txt = await fs.promises.readFile(p, 'utf-8')
    const j = JSON.parse(txt)
    if (j && typeof j === 'object') return j
    return null
  } catch { return null }
}

// Helper: fetch with timeout to avoid hanging on unreachable hosts
async function fetchWithTimeout(url: string, timeoutMs = 3000): Promise<Response> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    // @ts-ignore Node 18+ has global fetch and AbortController
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(id)
  }
}

async function writeScanLog(lines: any[]) {
  try {
    const d = new Date()
    const file = path.join(LOG_DIR, `scan-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}.jsonl`)
    for (const l of lines) {
      await fs.promises.appendFile(file, JSON.stringify({ ts: Math.floor(Date.now()/1000), ...l }) + '\n', 'utf-8')
    }
  } catch {/* ignore */}
}

// 扫描 index.json，检测损坏条目；可选自动回退到别名文件
async function scanAndMaybeRepairIndex(opts: { repair: boolean }): Promise<{
  checked: number
  broken: number
  repaired: number
  issues: ScanIssue[]
  repairs: { pool: string; alias: string }[]
}> {
  const base = new URL(BASE_URL)
  const idx = await readIndex()
  const entries = Object.entries(idx)
  const issues: ScanIssue[] = []
  const repairs: { pool: string; alias: string }[] = []
  let broken = 0
  let repaired = 0
  for (const [pool, uri] of entries) {
    const lower = String(pool).toLowerCase()
    if (!uri) {
      issues.push({ pool: lower, reason: 'missing_uri' })
      broken++
      // 尝试回退别名
      if (opts.repair) {
        const aliasPath = path.join(METADATA_DIR, `${lower}.json`)
        const j = await tryReadJsonFile(aliasPath)
        if (j) {
          const aliasUri = `${base.origin}/meta/${lower}.json`
          const idx2 = await readIndex(); idx2[lower] = aliasUri; await writeIndex(idx2)
          repairs.push({ pool: lower, alias: aliasUri })
          repaired++
        }
      }
      continue
    }
    try {
      const r = await fetchWithTimeout(String(uri), 3000)
      if (!r.ok) {
        issues.push({ pool: lower, uri: String(uri), reason: 'fetch_failed', status: r.status })
        broken++
        if (opts.repair) {
          const aliasPath = path.join(METADATA_DIR, `${lower}.json`)
          const j = await tryReadJsonFile(aliasPath)
          if (j) {
            const aliasUri = `${base.origin}/meta/${lower}.json`
            const idx2 = await readIndex(); idx2[lower] = aliasUri; await writeIndex(idx2)
            repairs.push({ pool: lower, alias: aliasUri })
            repaired++
          }
        }
        continue
      }
      const j = await r.json().catch(()=>null)
      if (!j || typeof j !== 'object') {
        issues.push({ pool: lower, uri: String(uri), reason: 'invalid_json' })
        broken++
        if (opts.repair) {
          const aliasPath = path.join(METADATA_DIR, `${lower}.json`)
          const j2 = await tryReadJsonFile(aliasPath)
          if (j2) {
            const aliasUri = `${base.origin}/meta/${lower}.json`
            const idx2 = await readIndex(); idx2[lower] = aliasUri; await writeIndex(idx2)
            repairs.push({ pool: lower, alias: aliasUri })
            repaired++
          }
        }
      }
      // ok 情况无需处理
    } catch (e) {
      issues.push({ pool: lower, uri: String(uri), reason: 'exception' })
      broken++
      if (opts.repair) {
        const aliasPath = path.join(METADATA_DIR, `${lower}.json`)
        const j = await tryReadJsonFile(aliasPath)
        if (j) {
          const aliasUri = `${base.origin}/meta/${lower}.json`
          const idx2 = await readIndex(); idx2[lower] = aliasUri; await writeIndex(idx2)
          repairs.push({ pool: lower, alias: aliasUri })
          repaired++
        }
      }
    }
  }
  if (issues.length>0 || repairs.length>0) {
    await writeScanLog([{ summary: { checked: entries.length, broken, repaired } }, ...issues.map(i=>({ issue: i })), ...repairs.map(r=>({ repair: r }))])
  }
  return { checked: entries.length, broken, repaired, issues, repairs }
}

// 管理端扫描接口：GET /api/meta/scan?repair=1  可触发自动回退修复
const scanMetaHandler: express.RequestHandler = async (req, res) => {
  try {
    const repair = (String((req.query as any).repair||'0') === '1' || String((req.query as any).repair||'').toLowerCase() === 'true')
    const result = await scanAndMaybeRepairIndex({ repair })
    return res.json({ ok: true, repair, ...result }) as any
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'internal_error' }) as any
  }
}
;(app.get as any)('/api/meta/scan', scanMetaHandler as any)

// 启动时与每小时定期扫描一次（自动修复）
; (async () => {
  try {
    const first = await scanAndMaybeRepairIndex({ repair: true })
    if (first.broken>0) console.log(`Index scan at start: broken=${first.broken}, repaired=${first.repaired}`)
  } catch (e) { console.warn('initial scan failed:', e) }
  setInterval(async () => {
    try {
      const r = await scanAndMaybeRepairIndex({ repair: true })
      if (r.broken>0 || r.repaired>0) console.log(`Index hourly scan: broken=${r.broken}, repaired=${r.repaired}`)
    } catch (e) { console.warn('hourly scan failed:', e) }
  }, 60 * 60 * 1000)
})()

// 按照已有池的元数据克隆，生成新池的别名文件并更新 index
// POST /api/meta/clone { fromPool, toPool, replacements? }
app.post('/api/meta/clone', requireApiKey, async (req, res) => {
  try {
    const { fromPool, toPool, replacements } = req.body || {}
    const src = String(fromPool||'').toLowerCase()
    const dst = String(toPool||'').toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(src) || !/^0x[0-9a-f]{40}$/.test(dst)) return res.status(400).json({ error: 'invalid_pool' })
    const base = new URL(BASE_URL)
    // 优先使用别名文件
    const aliasSrc = path.join(METADATA_DIR, `${src}.json`)
    let json: any = await tryReadJsonFile(aliasSrc)
    if (!json) {
      // 回退到 index 映射
      const idx = await readIndex(); const uri = idx[src]
      if (!uri) return res.status(400).json({ error: 'missing_src_uri' })
      const r = await fetchWithTimeout(String(uri), 3000).catch(()=>null as any)
      if (!r || !r.ok) return res.status(400).json({ error: 'fetch_failed' })
      json = await r.json().catch(()=>null)
      if (!json || typeof json !== 'object') return res.status(400).json({ error: 'invalid_metadata' })
    }
    // 应用替换
    if (replacements && typeof replacements === 'object') {
      for (const k of ['title','description','image'] as const) {
        if (typeof (replacements as any)[k] === 'string' && (replacements as any)[k]) (json as any)[k] = (replacements as any)[k]
      }
    }
    // 写入目标别名
    const aliasDstPath = path.join(METADATA_DIR, `${dst}.json`)
    await fs.promises.writeFile(aliasDstPath, JSON.stringify(json, null, 2), 'utf-8')
    // 更新 index 指向新别名
    const idx2 = await readIndex();
    idx2[dst] = `${base.origin}/meta/${dst}.json`
    await writeIndex(idx2)
    return res.json({ ok: true, alias: idx2[dst] })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'internal_error' }) }
})

// ---- Simple Chat System (short polling, per-pool) ----
// In-memory auth state (reset on process restart)
const CHAT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const CHAT_MIN_INTERVAL_MS = 3000
const chatNonces = new Map<string, { nonce: string; ts: number }>() // addressLower -> {nonce, ts}
const chatSessions = new Map<string, { token: string; ts: number }>() // addressLower -> {token, issuedAt}
const chatLastSent = new Map<string, number>() // addressLower -> lastSentTs

function randomToken(len = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(len))).map(b=>b.toString(16).padStart(2,'0')).join('')
}

function sanitizeMessage(s: string): string {
  let t = String(s || '')
  t = t.replace(/[\r\n\t]+/g, ' ')
  t = t.replace(/[\u0000-\u001f\u007f]/g, '')
  t = t.trim()
  if (t.length > 280) t = t.slice(0, 280)
  return t
}

// GET /api/chat/nonce?address=0x...
app.get('/api/chat/nonce', async (req, res) => {
  try {
    const address = String(req.query.address || '').toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(address)) return res.status(400).json({ error: 'invalid_address' })
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36)
    chatNonces.set(address, { nonce, ts: Date.now() })
    return res.json({ nonce, expireInSec: 300 })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'internal_error' }) }
})

// POST /api/chat/auth { address, signature }
// Client signs the message: `Lucky-pool Chat Login\nAddress: <address_lower>\nNonce: <nonce>`
app.post('/api/chat/auth', async (req, res) => {
  try {
    const { address, signature } = req.body || {}
    const adr = String(address || '').toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(adr)) return res.status(400).json({ error: 'invalid_address' })
    const found = chatNonces.get(adr)
    if (!found) return res.status(400).json({ error: 'nonce_missing' })
    if (Date.now() - found.ts > 5*60*1000) { chatNonces.delete(adr); return res.status(400).json({ error: 'nonce_expired' }) }
    const message = `Lucky-pool Chat Login\nAddress: ${adr}\nNonce: ${found.nonce}`
    let recovered = ''
    try {
      recovered = ethersUtils.verifyMessage(message, String(signature||''))
    } catch { return res.status(400).json({ error: 'invalid_signature' }) }
    if (recovered.toLowerCase() !== adr) return res.status(400).json({ error: 'address_mismatch' })
    chatNonces.delete(adr)
    const token = randomToken(32)
    chatSessions.set(adr, { token, ts: Date.now() })
    return res.json({ ok: true, token, ttlSec: CHAT_TOKEN_TTL_MS/1000 })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'internal_error' }) }
})

// POST /api/chat/message { pool, address, token, message }
app.post('/api/chat/message', async (req, res) => {
  try {
    const { pool, address, token } = req.body || {}
    let { message } = req.body || {}
    const adr = String(address || '').toLowerCase()
    const poolAddr = String(pool || '').toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(adr)) return res.status(400).json({ error: 'invalid_address' })
    if (!/^0x[0-9a-f]{40}$/.test(poolAddr)) return res.status(400).json({ error: 'invalid_pool' })
    message = sanitizeMessage(String(message||''))
    if (!message) return res.status(400).json({ error: 'empty_message' })
    const session = chatSessions.get(adr)
    if (!session || session.token !== String(token||'')) return res.status(401).json({ error: 'unauthorized' })
    if (Date.now() - session.ts > CHAT_TOKEN_TTL_MS) { chatSessions.delete(adr); return res.status(401).json({ error: 'session_expired' }) }
    const last = chatLastSent.get(adr) || 0
    if (Date.now() - last < CHAT_MIN_INTERVAL_MS) return res.status(429).json({ error: 'too_many_requests' })
    chatLastSent.set(adr, Date.now())
    const ts = Math.floor(Date.now()/1000)
    const d = new Date()
    const file = path.join(LOG_DIR, `chat-${poolAddr}-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}.jsonl`)
    const line = JSON.stringify({ ts, pool: poolAddr, address: adr, message })
    await fs.promises.appendFile(file, line + '\n', 'utf-8')
    return res.json({ ok: true, ts })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'internal_error' }) }
})

// GET /api/chat/messages?pool=0x..&since=unix_ts&limit=200
app.get('/api/chat/messages', async (req, res) => {
  try {
    const poolAddr = String(req.query.pool || '').toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(poolAddr)) return res.status(400).json({ error: 'invalid_pool' })
    const since = Number(req.query.since || 0) || 0
    const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 500)
    const now = new Date()
    const months = [0, -1].map(delta => {
      const d = new Date(now.getFullYear(), now.getMonth()+delta, 1)
      return path.join(LOG_DIR, `chat-${poolAddr}-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}.jsonl`)
    })
    const lines: string[] = []
    for (const f of months) {
      if (fs.existsSync(f)) {
        const content = await fs.promises.readFile(f, 'utf-8')
        lines.push(...content.split(/\r?\n/).filter(Boolean))
      }
    }
    const items = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
      .filter((it: any) => !since || (Number(it.ts)||0) > since)
      .slice(-limit)
    return res.json({ items })
  } catch (e) { console.error(e); return res.status(500).json({ error: 'internal_error' }) }
})

// Append-only log endpoint (JSONL per month)
app.post('/api/log', requireApiKey, async (req, res) => {
  try {
    const body = req.body as any
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid_body' })
    const { type, pool, txHash, address, count, timestamp, extra } = body
    if (!type || !pool) return res.status(400).json({ error: 'missing_fields' })
    const ts = Number(timestamp) || Math.floor(Date.now()/1000)
    const line = JSON.stringify({ type, pool, txHash, address, count, timestamp: ts, extra })
    const d = new Date(ts*1000)
    const file = path.join(LOG_DIR, `activity-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}.jsonl`)
    await fs.promises.appendFile(file, line + '\n', 'utf-8')
    return res.json({ ok: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

// /api/pools 端点已删除：若前端仍调用将收到 404。

// Tail recent logs
app.get('/api/logs', requireApiKey, async (req, res) => {
  try {
    const limit = Math.min( Number(req.query.limit || 200), 2000 )
    // Read latest two monthly files to cover boundary
    const now = new Date()
    const months = [0, -1].map(delta => {
      const d = new Date(now.getFullYear(), now.getMonth()+delta, 1)
      return path.join(LOG_DIR, `activity-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}.jsonl`)
    })
    const lines: string[] = []
    for (const f of months) {
      if (fs.existsSync(f)) {
        const content = await fs.promises.readFile(f, 'utf-8')
        lines.push(...content.split(/\r?\n/).filter(Boolean))
      }
    }
    const recent = lines.slice(-limit).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    return res.json({ items: recent })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

// Public stats endpoint for Transparency page
app.get('/api/stats', async (_req, res) => {
  try {
    const now = new Date()
    const months = [0, -1].map(delta => {
      const d = new Date(now.getFullYear(), now.getMonth()+delta, 1)
      return path.join(LOG_DIR, `activity-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}.jsonl`)
    })
    const lines: string[] = []
    for (const f of months) {
      if (fs.existsSync(f)) {
        const content = await fs.promises.readFile(f, 'utf-8')
        lines.push(...content.split(/\r?\n/).filter(Boolean))
      }
    }
    let totalParticipations = 0
    let totalRewardPaid = 0
    for (const l of lines) {
      try {
        const j = JSON.parse(l)
        if (j?.type === 'participate') {
          const c = Number(j.count||0); if (Number.isFinite(c)) totalParticipations += c
        }
        if (j?.type === 'draw' || j?.type === 'DrawFulfilled') {
          const r = Number(j?.extra?.reward || 0)
          if (Number.isFinite(r)) totalRewardPaid += r
        }
      } catch { /* ignore bad line */ }
    }
    return res.json({ totalParticipations, totalRewardPaid, logWindowMonths: 2, lastSync: Math.floor(Date.now()/1000) })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'internal_error' })
  }
})

// Start HTTP server (bind on IPv4 to ensure 127.0.0.1 works behind Nginx)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lucky-pool backend listening on ${BASE_URL}`);
});

// Optionally start HTTPS server when certs are provided
if (HTTPS_PORT) {
  try {
    let httpsOptions: any = null
    if (SSL_PFX_PATH && fs.existsSync(SSL_PFX_PATH)) {
      httpsOptions = { pfx: fs.readFileSync(SSL_PFX_PATH), passphrase: SSL_PFX_PASSPHRASE || undefined }
    } else if (SSL_KEY_PATH && SSL_CERT_PATH && fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
      httpsOptions = { key: fs.readFileSync(SSL_KEY_PATH), cert: fs.readFileSync(SSL_CERT_PATH) }
    }
    if (httpsOptions) {
      const httpsServer = https.createServer(httpsOptions, app)
      httpsServer.listen(HTTPS_PORT, () => {
        console.log(`Lucky-pool backend (HTTPS) listening on https://localhost:${HTTPS_PORT}`)
      })
    } else {
      console.warn('HTTPS_PORT set but no SSL materials found (provide SSL_PFX_PATH or SSL_KEY_PATH/SSL_CERT_PATH).')
    }
  } catch (e) {
    console.warn('Failed to start HTTPS server:', e)
  }
}
