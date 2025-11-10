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
// Use ethers v5 imports
import { Contract, utils } from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
import FactoryArtifactFull from '../../shared/abi/LuckyPoolFactory.json';
import PoolArtifactFull from '../../shared/abi/LuckyPool.json';

// Basic configuration via env vars
const PORT = parseInt(process.env.PORT || '4000', 10);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`; // For building returned URLs
// Optional on-chain aggregation config
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || '';
// Comma separated RPC endpoints (first valid fastest will be used)
const RPC_ENDPOINTS = (process.env.RPC_ENDPOINTS || '').split(',').map(s => s.trim()).filter(Boolean);
// Factory deploy block to limit log scan
const FACTORY_DEPLOY_BLOCK = parseInt(process.env.FACTORY_DEPLOY_BLOCK || '0', 10) || 0;
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
      <li>聚合池信息：<code>/api/pools</code>（可选：使用环境变量 FACTORY_ADDRESS + RPC_ENDPOINTS）</li>
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
    return res.json({ ok: true })
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
    const r = await migrateToBaseUrl()
    return res.json({ ok: true, ...r, baseUrl: BASE_URL })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'internal_error' })
  }
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

// Utility: pick a healthy RPC (latency + block height) once per request to avoid stale provider
async function pickRpc(): Promise<JsonRpcProvider | null> {
  const endpoints = RPC_ENDPOINTS.length > 0 ? RPC_ENDPOINTS : [
    'https://data-seed-prebsc-2-s1.binance.org:8545',
    'https://data-seed-prebsc-1-s2.binance.org:8545'
  ];
  const results: Array<{ url:string; latency:number; block:number; provider: JsonRpcProvider }> = [];
  await Promise.all(endpoints.map(async url => {
    try {
      const prov = new JsonRpcProvider(url);
      const t0 = Date.now();
      const block = await prov.getBlockNumber();
      const latency = Date.now() - t0;
      results.push({ url, latency, block, provider: prov });
    } catch {/* ignore */}
  }));
  if (!results.length) return null;
  const maxBlock = results.reduce((m,r)=> r.block>m? r.block : m, 0);
  const filtered = results.filter(r => (maxBlock - r.block) <= 2);
  filtered.sort((a,b)=> a.latency - b.latency);
  return (filtered[0] || results[0]).provider;
}

// GET /api/pools => aggregate on-chain pool info + metadata (index + per-pool metadata)
// This reduces front-end RPC round trips dramatically for mobile usage.
app.get('/api/pools', async (req, res) => {
  if (!FACTORY_ADDRESS) return res.status(400).json({ error: 'factory_not_configured' });
  try {
    const provider = await pickRpc();
    if (!provider) return res.status(502).json({ error: 'rpc_unavailable' });
  const factory = new Contract(FACTORY_ADDRESS, (FactoryArtifactFull as any).abi || [], provider as any);
    // PoolCreated event scanning (limited by FACTORY_DEPLOY_BLOCK to reduce block range)
  const iface = new utils.Interface(((FactoryArtifactFull as any).abi || []));
    const eventFrag = iface.getEvent('PoolCreated');
    const topic0 = (eventFrag as any).topicHash || (eventFrag as any).topic || (iface as any).getEventTopic?.('PoolCreated');
    // batched log fetch
    const latest = await provider.getBlockNumber();
    let start = FACTORY_DEPLOY_BLOCK > 0 ? FACTORY_DEPLOY_BLOCK : 0;
    const stepInit = 50_000;
    let step = stepInit;
    const logs: any[] = [];
    while (start <= latest) {
      const end = Math.min(start + step, latest);
      try {
        const part = await provider.getLogs({ address: FACTORY_ADDRESS, topics:[topic0], fromBlock: start, toBlock: end });
        logs.push(...part);
        start = end + 1;
        if (step < 100_000) step = Math.min(100_000, Math.floor(step * 1.5));
      } catch (e: any) {
        const msg = e?.message || '';
        const code = e?.code;
        if (code === -32005 || /limit exceeded|block range|query timeout/i.test(msg)) {
          if (step > 50) { step = Math.max(50, Math.floor(step/2)); continue; }
        }
        throw e;
      }
    }
    const metaIndex = await readIndex();
    const metaByPool: Record<string,{ metadataURI?: string; sortOrder?: number; indexURI?: string }> = {};
    for (const log of logs) {
      try {
  const parsed = iface.parseLog(log);
        const pool = String(parsed.args[0]).toLowerCase();
        const metadataURI0 = String(parsed.args[3] || '');
        const metadataURI = metadataURI0 || undefined;
        const sortOrder = Number(parsed.args[4]);
        metaByPool[pool] = { metadataURI, sortOrder };
      } catch {/* ignore */}
    }
    // Merge index overrides
    for (const k of Object.keys(metaIndex)) {
      const lower = k.toLowerCase();
      const uri = metaIndex[k];
      if (!metaByPool[lower]) metaByPool[lower] = { metadataURI: undefined, sortOrder: undefined, indexURI: uri };
      else metaByPool[lower].indexURI = uri;
    }
    // Get pool list from factory
    const poolAddrs: string[] = await factory.getPools();
    // Parallel basic info fetch
    const infos = await Promise.all(poolAddrs.map(async addr => {
  const pool = new Contract(addr, (PoolArtifactFull as any).abi || [], provider as any);
      try {
        const info = await pool.getInfo().catch(async () => ({
          stablecoin: await pool.stablecoin(),
          ticketPrice: await pool.ticketPrice(),
          minFill: await pool.minFill(),
          maxFill: await pool.maxFill(),
          createdAt: await pool.createdAt(),
          countdownSeconds: await pool.countdownSeconds(),
          refundDeadlineSeconds: await pool.refundDeadlineSeconds(),
          minReached: await pool.minReached(),
          drawn: await pool.drawn(),
          cancelled: (await pool.cancelled?.().catch(()=>false)) || false,
          totalTickets: await pool.totalTickets(),
          totalRaised: await pool.totalRaised(),
          countdownStartAt: await pool.countdownStartAt(),
          winner: await pool.winner(),
        }));
        return { addr, info };
      } catch { return { addr, info: null }; }
    }));
    // Metadata concurrent fetch (lightweight; limit 5)
    const concurrency = 5;
    let active = 0;
    const queue = infos.filter(x => x.info).map(x => async () => {
      const lower = x.addr.toLowerCase();
      const extra = metaByPool[lower] || {};
      const base: any = {
        address: x.addr,
        stablecoin: x.info.stablecoin,
        ticketPrice: String(x.info.ticketPrice),
        minFill: String(x.info.minFill),
        maxFill: String(x.info.maxFill),
        createdAt: Number(x.info.createdAt),
        countdownSeconds: Number(x.info.countdownSeconds),
        refundDeadlineSeconds: Number(x.info.refundDeadlineSeconds),
        minReached: x.info.minReached,
        drawn: x.info.drawn,
        cancelled: Boolean(x.info.cancelled || false),
        totalTickets: Number(x.info.totalTickets),
        totalRaised: String(x.info.totalRaised),
        countdownStartAt: Number(x.info.countdownStartAt),
        winner: x.info.winner,
        metadataURI: extra.indexURI || extra.metadataURI,
        sortOrder: extra.sortOrder,
        meta: null as any
      };
      const candidateUris: string[] = [];
      if (extra.indexURI) candidateUris.push(extra.indexURI);
      if (extra.metadataURI) candidateUris.push(extra.metadataURI);
      if (!candidateUris.length && base.metadataURI && base.metadataURI.startsWith('ipfs://')) {
        candidateUris.push(`https://ipfs.io/ipfs/${base.metadataURI.slice('ipfs://'.length)}`);
      }
      for (const u of candidateUris) {
        try {
          const r = await fetch(u, { cache: 'no-store' });
          if (!r.ok) continue;
          const j = await r.json().catch(()=>null);
          if (j && (j.title || j.image || j.description)) { base.meta = j; break; }
        } catch {/* ignore */}
      }
      return base;
    });
    const out: any[] = [];
    async function runNext(): Promise<void> {
      if (!queue.length) return;
      while (active < concurrency && queue.length) {
        const fn = queue.shift()!;
        active++;
        fn().then(r => { out.push(r); }).catch(()=>{}).finally(()=>{ active--; runNext(); });
      }
    }
    await runNext();
    // wait until completion
    while (active > 0) { await new Promise(r=>setTimeout(r,50)); }
    // sort
    out.sort((a,b)=> ( (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) ));
    return res.json({ items: out, count: out.length, factory: FACTORY_ADDRESS });
  } catch (e:any) {
    console.error('/api/pools error', e);
    return res.status(500).json({ error: 'internal_error', message: e?.message || String(e) });
  }
});

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

// Start HTTP server
const httpServer = http.createServer(app);
httpServer.listen(PORT, () => {
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
