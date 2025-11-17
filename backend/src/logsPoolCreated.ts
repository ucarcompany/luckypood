import fs from 'fs'
import path from 'path'
import { providers, utils } from 'ethers'

// 统一的 PoolCreated 日志聚合与缓存，避免前端大范围调用 getLogs 触发 -32005 速率限制。

export interface PoolCreatedEventLite {
  pool: string
  metadataURI: string
  sortOrder: number
  blockNumber: number
}

interface CacheShape {
  lastScannedBlock: number
  events: PoolCreatedEventLite[]
}

function isRateLimit(e: any): boolean {
  const msg = (e?.message || '') + ' ' + JSON.stringify(e || {})
  return e?.code === -32005 || /rate limit|limit exceeded|block range|query timeout|eth_getLogs/i.test(msg)
}

export function createPoolCreatedAggregator(opts: {
  factory: string
  deployBlock?: number
  rpcUrl: string
  cacheDir: string
  intervalMs?: number
}) {
  const { factory, deployBlock = 0, rpcUrl, cacheDir } = opts
  const intervalMs = opts.intervalMs || 60_000
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
  const cacheFile = path.join(cacheDir, 'cache-pool-created.json')
  const provider = new providers.JsonRpcProvider(rpcUrl)
  const iface = new utils.Interface([
    'event PoolCreated(address indexed pool, uint256 min, uint256 max, string metadataURI, uint256 sortOrder)'
  ])
  const topic0 = iface.getEventTopic('PoolCreated')
  let running = false

  function readCache(): CacheShape {
    try {
      const txt = fs.readFileSync(cacheFile, 'utf-8')
      const j = JSON.parse(txt)
      if (j && typeof j === 'object' && Array.isArray(j.events)) return j as CacheShape
    } catch {}
    return { lastScannedBlock: deployBlock > 0 ? deployBlock - 1 : 0, events: [] }
  }
  function writeCache(c: CacheShape) {
    try { fs.writeFileSync(cacheFile, JSON.stringify(c, null, 2), 'utf-8') } catch {}
  }
  let cache = readCache()

  async function scanOnce() {
    if (running) return
    running = true
    try {
      const latest = await provider.getBlockNumber()
      let from = Math.max(deployBlock || 0, cache.lastScannedBlock + 1)
      if (from > latest) return
      let step = 20_000
      const MIN_STEP = 200
      const MAX_STEP = 80_000
      let delayMs = 300
      while (from <= latest) {
        const to = Math.min(from + step, latest)
        try {
          const logs = await provider.getLogs({ address: factory, topics: [topic0], fromBlock: from, toBlock: to })
          for (const lg of logs) {
            try {
              const parsed: any = iface.parseLog(lg)
              const pool = String(parsed.args?.pool || '').toLowerCase()
              const uri = String(parsed.args?.metadataURI || '')
              const sort = Number(parsed.args?.sortOrder || 0)
              if (!pool) continue
              if (!cache.events.find(ev => ev.pool === pool)) {
                cache.events.push({ pool, metadataURI: uri, sortOrder: sort, blockNumber: (lg as any).blockNumber || 0 })
              }
            } catch {}
          }
          cache.lastScannedBlock = to
          writeCache(cache)
          from = to + 1
          delayMs = 300
          if (step < MAX_STEP) step = Math.min(MAX_STEP, Math.floor(step * 1.4))
        } catch (e: any) {
          if (isRateLimit(e)) {
            step = Math.max(MIN_STEP, Math.floor(step / 2))
            await new Promise(r => setTimeout(r, delayMs))
            delayMs = Math.min(4000, Math.floor(delayMs * 1.6))
            continue
          }
          // 非速率限制错误：记录并终止本轮
          break
        }
      }
    } finally {
      running = false
    }
  }

  // 立即启动一次 + 定时
  scanOnce().catch(()=>{})
  setInterval(scanOnce, intervalMs).unref()

  return {
    getEvents: () => cache.events.slice(),
    getLastScannedBlock: () => cache.lastScannedBlock,
    forceScan: async () => { await scanOnce() }
  }
}
