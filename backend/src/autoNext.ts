import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import express from 'express'
import { providers, Wallet, Contract, utils, BigNumber } from 'ethers'
import FactoryArtifact from '../../shared/abi/LuckyPoolFactory.json'
import PoolArtifact from '../../shared/abi/LuckyPool.json'

type CreateParams = { minFill: string; maxFill: string; metadataURI: string; sortOrder: number }

const DEFAULT_RPC = process.env.RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/'
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000'
const METADATA_DIR = process.env.METADATA_DIR || path.join(process.cwd(), 'metadata')
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs')
const FACTORY_ADDRESS = (process.env.FACTORY_ADDRESS || '').trim()
const CREATOR_PK = (process.env.CREATOR_PRIVATE_KEY || '').trim()
const AUTO_NEXT_ENABLED = (process.env.AUTO_NEXT_ENABLED || '1').trim() !== '0'

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
if (!fs.existsSync(METADATA_DIR)) fs.mkdirSync(METADATA_DIR, { recursive: true })

const CONFIG_FILE = path.join(METADATA_DIR, 'auto-next.json')
const INDEX_FILE = path.join(METADATA_DIR, 'index.json')
const DEBUG_FILE = path.join(LOG_DIR, 'auto-next-debug.jsonl')

type SeriesCfg = { enabled?: boolean; nextMin?: string; nextMax?: string; sortOrder?: number }
type AutoNextConfig = { series: Record<string, SeriesCfg> }

function readJsonFile<T>(p: string, fallback: T): T {
  try { const t = fs.readFileSync(p, 'utf-8'); return JSON.parse(t) } catch { return fallback }
}
function writeJsonFile(p: string, v: any) { fs.writeFileSync(p, JSON.stringify(v, null, 2), 'utf-8') }
function appendDebug(obj: any) { try { fs.appendFileSync(DEBUG_FILE, JSON.stringify({ ts: Date.now(), ...obj })+'\n') } catch {} }

function readIndex(): Record<string,string> { return readJsonFile<Record<string,string>>(INDEX_FILE, {}) }
function writeIndex(idx: Record<string,string>) { writeJsonFile(INDEX_FILE, idx) }
function readConfig(): AutoNextConfig { return readJsonFile<AutoNextConfig>(CONFIG_FILE, { series: {} }) }
function writeConfig(cfg: AutoNextConfig) { writeJsonFile(CONFIG_FILE, cfg) }

function normalizeTitle(s?: string) {
  if (!s) return 'untitled'
  let x = String(s)
  x = x.replace(/第\s*\d+\s*期/gi, '')
  x = x.replace(/period\s*\d+/gi, '')
  x = x.replace(/\(test\)/gi, '').replace(/test use/gi, '')
  x = x.trim()
  return x || 'untitled'
}

async function fetchJson(url: string): Promise<any|null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return await r.json().catch(()=>null)
  } catch { return null }
}

async function createMetadataClone(base: any, startAt: number): Promise<{ uri: string; jsonPath: string }> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const filePath = path.join(METADATA_DIR, `${id}.json`)
  const payload: any = {
    title: base?.title || '活动',
    description: base?.description || '',
    image: base?.image || '',
    startAt
  }
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8')
  const uri = `${BASE_URL}/meta/${id}.json`
  return { uri, jsonPath: filePath }
}

async function getSortOrderOfPool(prov: providers.Provider, pool: string): Promise<number> {
  try {
    const iface = new utils.Interface(FactoryArtifact.abi as any)
    const ev = (iface as any).getEvent ? (iface as any).getEvent('PoolCreated') : (FactoryArtifact as any).abi.find((x:any)=>x.type==='event'&&x.name==='PoolCreated')
    const topic0 = (ev as any).topicHash || (iface as any).getEventTopic?.('PoolCreated')
    // 查询该地址对应的日志（从最近块向前限制范围，节省开销）
    const latest = await prov.getBlockNumber()
    const from = Math.max(0, latest - 2_000_000)
    const logs = await prov.getLogs({ address: FACTORY_ADDRESS, topics: [topic0], fromBlock: from })
    for (const l of logs) {
      try {
        const p = iface.parseLog({ topics: l.topics, data: l.data }) as any
        const addr = String(p.args?.[0]||'').toLowerCase()
        if (addr === pool.toLowerCase()) return Number(p.args?.[4] || 0)
      } catch {}
    }
  } catch {}
  return 0
}

export function registerAutoNext(app: express.Express) {
  // 管理端接口：查看/更新配置
  const guard = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = process.env.API_KEY
    if (!key) return next()
    if (req.header('x-api-key') === key) return next()
    return res.status(401).json({ error: 'unauthorized' })
  }

  app.get('/api/auto-next', guard, (_req, res) => res.json(readConfig()))
  app.post('/api/auto-next/upsert', guard, express.json(), (req, res) => {
    const { seriesKey, enabled, nextMin, nextMax, sortOrder } = req.body || {}
    if (!seriesKey) return res.status(400).json({ error: 'missing_seriesKey' })
    const cfg = readConfig()
    cfg.series[seriesKey] = {
      ...cfg.series[seriesKey],
      ...(enabled===undefined? {} : { enabled: !!enabled }),
      ...(nextMin? { nextMin: String(nextMin) } : {}),
      ...(nextMax? { nextMax: String(nextMax) } : {}),
      ...(sortOrder!==undefined? { sortOrder: Number(sortOrder)||0 } : {})
    }
    writeConfig(cfg)
    return res.json({ ok: true })
  })
  app.post('/api/auto-next/stop', guard, express.json(), (req, res) => {
    const { seriesKey } = req.body || {}
    if (!seriesKey) return res.status(400).json({ error: 'missing_seriesKey' })
    const cfg = readConfig(); if (cfg.series[seriesKey]) cfg.series[seriesKey].enabled = false; writeConfig(cfg)
    return res.json({ ok: true })
  })

  // 守护器：监听开奖并自动建下一期
  if (!AUTO_NEXT_ENABLED || !CREATOR_PK || !FACTORY_ADDRESS) {
    appendDebug({ stage: 'auto-next-skip', reason: 'missing_env', AUTO_NEXT_ENABLED, hasPK: !!CREATOR_PK, FACTORY_ADDRESS })
    return
  }
  const provider = new providers.JsonRpcProvider(DEFAULT_RPC)
  const wallet = new Wallet(CREATOR_PK, provider)
  const factory = new Contract(FACTORY_ADDRESS, (FactoryArtifact as any).abi, wallet)
  const poolIface = new utils.Interface((PoolArtifact as any).abi)
  const ev = poolIface.getEvent('DrawFulfilled') as any
  const topicDraw = ev.topicHash || (poolIface as any).getEventTopic?.('DrawFulfilled')
  const watching = new Set<string>()
  const processed = new Set<string>() // pool address processed

  async function ensureWatchers() {
    try {
      const pools: string[] = await factory.getPools()
      for (const addr of pools) {
        const lower = addr.toLowerCase()
        if (watching.has(lower)) continue
        watching.add(lower)
        provider.on({ address: lower, topics: [topicDraw] }, async (log) => {
          try {
            if (processed.has(lower)) return
            processed.add(lower)
            appendDebug({ stage: 'draw_detected', pool: lower, block: (log as any).blockNumber })
            await handleDraw(lower)
          } catch (e:any) { appendDebug({ stage:'handle_error', pool: lower, err: e?.message||String(e) }); processed.delete(lower) }
        })
      }
    } catch (e:any) {
      appendDebug({ stage:'ensureWatchers_error', err: e?.message||String(e) })
    }
  }

  async function handleDraw(poolAddr: string) {
    // 读取元数据（通过别名或索引），准备 startAt = now + 600
    const idx = readIndex()
    const aliasUri = `${BASE_URL}/meta/${poolAddr.toLowerCase()}.json`
    const srcUri = idx[poolAddr.toLowerCase()] || aliasUri
    const meta = await fetchJson(srcUri)
    const startAt = Math.floor(Date.now()/1000) + 600
    const cloned = await createMetadataClone(meta||{}, startAt)
    // 计算系列键并读取配置
    const seriesKey = normalizeTitle(meta?.title)
    const cfg = readConfig().series[seriesKey] || {}
    if (cfg.enabled === false) { appendDebug({ stage:'skipped_disabled', seriesKey, pool: poolAddr }); return }

    // 读取当前池信息用于缺省 min/max
    const pool = new Contract(poolAddr, (PoolArtifact as any).abi, provider)
    const info = await pool.getInfo().catch(async ()=> ({
      minFill: await pool.minFill(),
      maxFill: await pool.maxFill(),
    }))
    const minFill = cfg.nextMin ? BigNumber.from(cfg.nextMin) : BigNumber.from(info.minFill)
    const maxFill = cfg.nextMax ? BigNumber.from(cfg.nextMax) : BigNumber.from(info.maxFill)
    // sortOrder：沿用上一期（若可解析），否则 0
    const sortOrder = typeof cfg.sortOrder === 'number' ? cfg.sortOrder : await getSortOrderOfPool(provider, poolAddr)
    const params: CreateParams = {
      minFill: minFill.toString(),
      maxFill: maxFill.toString(),
      metadataURI: cloned.uri,
      sortOrder
    }
    appendDebug({ stage:'create_next_start', seriesKey, params })
    const tx = await (factory as any).createPool(params)
    const receipt = await tx.wait()
    // 解析新池地址
    let newPool = ''
    try {
      const iface = new utils.Interface((FactoryArtifact as any).abi)
      const ev = iface.getEvent('PoolCreated') as any
      const topic0 = ev.topicHash || (iface as any).getEventTopic?.('PoolCreated')
      const l = receipt.logs.find((x:any)=> x.topics && x.topics[0] === topic0)
      if (l) { const p:any = iface.parseLog({ topics: l.topics, data: l.data }); newPool = String(p.args?.[0]||'') }
    } catch {}
    if (!newPool) { appendDebug({ stage:'create_next_noaddr' }); return }
    // 为新池写入别名并更新索引
    const newLower = newPool.toLowerCase()
    const aliasPath = path.join(METADATA_DIR, `${newLower}.json`)
    try {
      const srcTxt = fs.readFileSync(cloned.jsonPath, 'utf-8')
      fs.writeFileSync(aliasPath, srcTxt, 'utf-8')
    } catch {}
    const idx2 = readIndex(); idx2[newLower] = `${BASE_URL}/meta/${newLower}.json`; writeIndex(idx2)
    appendDebug({ stage:'create_next_done', newPool })
  }

  // 首次与定时确保监听
  ensureWatchers()
  setInterval(ensureWatchers, 60_000)
}
