import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserProvider, JsonRpcProvider, Contract, Interface } from 'ethers'
import { FACTORY_ADDRESS, DEFAULT_RPC, HIDDEN_POOLS, BACKEND_URL, FACTORY_DEPLOY_BLOCK, BACKEND_API_KEY } from '../config'
import FactoryArtifact from '@abi/LuckyPoolFactory.json'
import PoolArtifact from '@abi/LuckyPool.json'

export type PoolInfo = {
  address: string
  stablecoin: string
  ticketPrice: bigint
  minFill: bigint
  maxFill: bigint
  createdAt: number
  countdownSeconds: number
  refundDeadlineSeconds: number
  minReached: boolean
  drawn: boolean
  cancelled: boolean
  totalTickets: number
  totalRaised: bigint
  countdownStartAt: number
  winner: string
  // augmented
  metadataURI?: string
  meta?: { title?: string; description?: string; image?: string; startAt?: number; __src?: string }
  sortOrder?: number
  // derived
  seriesPeriod?: number
  baseTitle?: string
  drawAt?: number
}

export function useEthersProvider() {
  // 钱包签名用 provider（只在用户有钱包时用于交易）；读取使用独立 readProvider 优选 RPC
  const [walletProvider, setWalletProvider] = useState<BrowserProvider | null>(null)
  useEffect(() => {
    if ((window as any).ethereum) {
      try { setWalletProvider(new BrowserProvider((window as any).ethereum)) } catch {}
    }
  }, [])
  return walletProvider
}

export function useFactory(provider: BrowserProvider | JsonRpcProvider | null) {
  return useMemo(() => {
    if (!provider || !FACTORY_ADDRESS) return null
    return new Contract(FACTORY_ADDRESS, FactoryArtifact.abi, provider)
  }, [provider])
}

// 只读 RPC 候选（可扩展）
const RPC_CANDIDATES: string[] = [
  ...(DEFAULT_RPC ? [DEFAULT_RPC] : []),
  'https://data-seed-prebsc-2-s1.binance.org:8545',
  'https://data-seed-prebsc-1-s2.binance.org:8545'
]

export function usePools() {
  const walletProvider = useEthersProvider()
  // 独立只读 provider，用于批量读取；允许在静默刷新期间重新评估与切换
  const [readProvider, setReadProvider] = useState<JsonRpcProvider | null>(null)
  const [currentRpcUrl, setCurrentRpcUrl] = useState<string | null>(null)
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null)
  const [lastHealthCheckAt, setLastHealthCheckAt] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<'init'|'final'|'other'|null>(null)
  const [pools, setPools] = useState<PoolInfo[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const loadingRef = useRef(false) // 防止并发加载
  const repairAttemptedRef = useRef(false) // 避免循环触发后端修复
  // 调试统计：原始池数量 / 过滤原因
  const [totalPools, setTotalPools] = useState(0)
  const [cancelledCount, setCancelledCount] = useState(0)
  const [hiddenCount, setHiddenCount] = useState(0)
  // 记录：是否在 provider 尚未就绪时已经尝试过一次首屏加载（用于 provider 就绪后自动再发起一次真正的加载）
  const autoRetryPendingRef = useRef(false)

  const rewriteToBackendOrigin = (uri?: string | null) => {
    // 仅在 URI 属于私网/localhost 或为站点内相对路径时，才重写到 BACKEND_URL；
    // 避免将已是公网且不同主机的 URL 误改。
    const isPrivateHost = (h: string) => {
      const lower = (h || '').toLowerCase()
      if (!lower) return false
      if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1') return true
      if (lower.startsWith('192.168.')) return true
      if (lower.startsWith('10.')) return true
      const m = /^172\.(\d+)\./.exec(lower); if (m) { const n = Number(m[1]); if (n>=16 && n<=31) return true }
      return false
    }
    try {
      if (!uri) return undefined
      const base = BACKEND_URL ? new URL(BACKEND_URL) : null
      if (!base) return uri
      // 绝对 URL
      try {
        const u = new URL(uri)
        const isHttp = u.protocol === 'http:' || u.protocol === 'https:'
        if (!isHttp) return uri
        // 仅私网/localhost 才重写到 BACKEND_URL
        if (isPrivateHost(u.hostname)) {
          return `${base.origin}${u.pathname}${u.search || ''}`
        }
        return uri
      } catch {
        // 非绝对（相对）路径，如 /uploads/... /meta/... 也重写
        if (uri.startsWith('/uploads/') || uri.startsWith('/meta/')) {
          return `${(new URL(BACKEND_URL!)).origin}${uri}`
        }
        return uri
      }
    } catch {
      return uri || undefined
    }
  }

  const ensureReadProvider = useCallback(async (forceFullScan = false) => {
    // 首次或当前 provider 已失效时：扫描所有候选，选择最快且区块高度不落后
    const now = Date.now()
    const needFull = forceFullScan || !readProvider || !currentRpcUrl || (now - lastHealthCheckAt > 180000) // 每 3 分钟做一次全扫描
    // 轻量健康检测：测当前 provider 延迟与区块是否滞后
    const fastScan = async () => {
      if (!readProvider) return false
      try {
        const t0 = performance.now()
        const block = await readProvider.getBlockNumber()
        const dt = performance.now() - t0
        setLastLatencyMs(Math.round(dt))
        // 若延迟过高或 block -1（异常），触发全扫描
        return dt < 2500 && block > 0
      } catch {
        return false
      }
    }
    if (!needFull) {
      const healthy = await fastScan()
      if (healthy) return
    }
    // 全扫描：并发测候选 RPC
    const results: Array<{ url:string; latency:number; block:number }> = []
    await Promise.all(RPC_CANDIDATES.map(async url => {
      try {
        const prov = new JsonRpcProvider(url)
        const t0 = performance.now()
        const block = await prov.getBlockNumber()
        const latency = performance.now() - t0
        results.push({ url, latency, block })
      } catch {
        /* ignore failed endpoint */
      }
    }))
    if (results.length === 0) {
      // 兜底：保留现有 readProvider 或尝试从第一个候选构建
      if (!readProvider && RPC_CANDIDATES.length>0) {
        try {
          const p = new JsonRpcProvider(RPC_CANDIDATES[0])
          setReadProvider(p)
          setCurrentRpcUrl(RPC_CANDIDATES[0])
        } catch {}
      }
      return
    }
    // 找最大区块高度（排除明显落后节点）
    const maxBlock = results.reduce((m,r)=> r.block>m? r.block : m, 0)
    const filtered = results.filter(r => (maxBlock - r.block) <= 2) // 允许最多落后 2 个块
    const candidateSet = filtered.length>0 ? filtered : results
    candidateSet.sort((a,b)=> a.latency - b.latency)
    const best = candidateSet[0]
    // 若当前 provider URL 与 best 不同且优势明显（延迟改善 30% 以上）则切换
    if (!currentRpcUrl || best.url !== currentRpcUrl || (lastLatencyMs!=null && best.latency < lastLatencyMs * 0.7)) {
      try {
        const newProv = new JsonRpcProvider(best.url)
        // 再做一次轻确认
        await newProv.getBlockNumber()
        setReadProvider(newProv)
        setCurrentRpcUrl(best.url)
        setLastLatencyMs(Math.round(best.latency))
      } catch {}
    }
    setLastHealthCheckAt(Date.now())
  }, [readProvider, currentRpcUrl, lastLatencyMs, lastHealthCheckAt])

  // 初次挂载：建立只读 provider
  useEffect(()=> { ensureReadProvider(true) }, [])

  const loadImpl = useCallback(async (opts?: { silent?: boolean; _attempt?: number }) => {
    const attempt = (opts?._attempt ?? 0)
    // 在静默刷新阶段执行健康优选（第二层回退逻辑）
    if (opts?.silent) {
      await ensureReadProvider(false)
    } else {
      // 首次/主动刷新时也进行一次健康检测，避免等待 effect 中的扫描完成导致初次列表迟迟不出现
      if (attempt === 0) {
        await ensureReadProvider(true)
      } else {
        await ensureReadProvider(false)
      }
    }
    if (!FACTORY_ADDRESS) {
      if (!opts?.silent) {
        setPools([])
        setError('缺少 VITE_FACTORY_ADDRESS（用户前端未配置工厂地址）')
      }
      return
    }
    const readProv: JsonRpcProvider | BrowserProvider | null = readProvider || walletProvider
  const factory = (readProv && FACTORY_ADDRESS) ? new Contract(FACTORY_ADDRESS, FactoryArtifact.abi, readProv) : null
    if (!readProv || !factory) {
      // 不再直接抛出“Provider 未就绪”错误，避免首次渲染时闪现；改为轻量重试。
      if (!opts?.silent) {
        // 保持现有列表与错误；若已经有数据则不覆盖错误
        if (pools.length === 0) {
          if (attempt >= 5) { setError('provider_final_hint'); setErrorKind('final') }
          else { setError('provider_initializing'); setErrorKind('init') }
        }
        // 标记：我们已经进行过一次主动首屏加载，但当时 provider 不可用；待 provider 建好后自动再触发一次
        if (attempt === 0) autoRetryPendingRef.current = true
      }
      // 300ms 后重试；限制最大尝试次数，避免潜在无限循环
      if (attempt < 5) setTimeout(()=>{ loadImpl({ silent: opts?.silent, _attempt: attempt+1 }) }, 300)
      return
    }
    if (loadingRef.current) return
    loadingRef.current = true
    if (!opts?.silent) { setLoading(true); setError(null); setErrorKind(null) } else { setRefreshing(true) }
    try {
      // 已撤回后端聚合端点 /api/pools；直接读取链上并并行获取元数据

      const poolAddrs: string[] = await factory.getPools()
      setTotalPools(poolAddrs.length)
      // ===== 工具：分段批量读取日志，规避 BSC -32005 limit exceeded =====
      const getLogsBatched = async (
        prov: any,
        filter: { address: string, topics: (string|null)[] },
        opts?: { fromBlock?: number, toBlock?: number, batchSize?: number, maxSpanBlocks?: number }
      ) => {
        const latest = opts?.toBlock ?? await prov.getBlockNumber()
        // 若未提供部署块，避免一次扫到创世：限制最大回溯跨度（默认 1,500,000 块，大约几天）
        const fromInit = Math.max(0, opts?.fromBlock ?? Math.max(0, latest - (opts?.maxSpanBlocks ?? 1_500_000)))
        let start = fromInit
        const logs: any[] = []
        let step = Math.min(opts?.batchSize ?? 25_000, 50_000) // 初始较保守
        const MAX_STEP = 80_000
        const MIN_STEP = 200
        let attemptsForChunk = 0
        let delayMs = 300
        while (start <= latest) {
          const end = Math.min(start + step, latest)
          try {
            const part = await prov.getLogs({ ...filter, fromBlock: start, toBlock: end })
            logs.push(...part)
            start = end + 1
            attemptsForChunk = 0
            delayMs = 300
            if (step < MAX_STEP) step = Math.min(MAX_STEP, Math.floor(step * 1.4)) // 成功后缓慢增大
          } catch (e: any) {
            const raw = (e && typeof e === 'object') ? JSON.stringify(e) : ''
            const msg = e?.message || raw || ''
            const code = e?.code
            const isRate = code === -32005 || /rate limit|limit exceeded|block range|query timeout|eth_getLogs/i.test(msg)
            if (isRate) {
              // 缩小 step + 回退等待；达到最小后仍失败则抛出
              attemptsForChunk++
              if (attemptsForChunk > 8) throw e
              step = Math.max(MIN_STEP, Math.floor(step / 2))
              await new Promise(r => setTimeout(r, delayMs))
              delayMs = Math.min(4000, Math.floor(delayMs * 1.6))
              continue
            }
            throw e
          }
        }
        return logs
      }

      // 1) 读取 Factory 的 PoolCreated 日志以获得 metadataURI 与 sortOrder。
      //    为了加速首屏，非静默加载时跳过该重操作，改由后续的静默刷新补齐。
      let metaByPool: Record<string,{metadataURI?:string, sortOrder?:number, indexURI?: string}> = {}
      if (opts?.silent) {
        // 优先尝试后端聚合缓存，失败再回退链上扫描
        let fetchedFromBackend = false
        if (BACKEND_URL) {
          try {
            const r = await fetch(`${BACKEND_URL}/api/factory/pool-created?ts=${Date.now()}`)
            if (r.ok) {
              const j = await r.json().catch(()=>null)
              if (j && j.ok && Array.isArray(j.events)) {
                for (const ev of j.events) {
                  const pool = String(ev.pool||'').toLowerCase()
                  const metadataURI = rewriteToBackendOrigin(String(ev.metadataURI||''))
                  const sortOrder = Number(ev.sortOrder||0)
                  if (pool) metaByPool[pool] = { metadataURI, sortOrder }
                }
                fetchedFromBackend = true
              }
            }
          } catch {}
        }
        if (!fetchedFromBackend) {
          try {
            const iface = new Interface(FactoryArtifact.abi)
            const eventFrag = iface.getEvent('PoolCreated')
            const topic0 = (eventFrag as any).topicHash || (eventFrag as any).topic || (iface as any).getEventTopic?.('PoolCreated')
            const startBlock = FACTORY_DEPLOY_BLOCK || 0
            const logs = await getLogsBatched(readProv, { address: FACTORY_ADDRESS, topics: [topic0] }, { fromBlock: startBlock })
            for (const log of logs) {
              const parsed = iface.parseLog({ topics: log.topics, data: log.data })
              if (parsed && parsed.args) {
                const pool = String(parsed.args[0]).toLowerCase()
                const metadataURI0 = String(parsed.args[3] || '')
                const metadataURI = rewriteToBackendOrigin(metadataURI0)
                const sortOrder = Number(parsed.args[4])
                metaByPool[pool] = { metadataURI, sortOrder }
              }
            }
          } catch (e) {
            console.warn('read PoolCreated logs failed', e)
          }
        }
      }

  // 1.5) 后端索引兜底：尝试读取 BACKEND_URL/meta/index.json；若不存在则读 BACKEND_URL/api/meta/index
      if (BACKEND_URL) {
        try {
          const r = await fetch(`${BACKEND_URL}/meta/index.json?ts=${Date.now()}`)
          if (r.ok) {
            const j = await r.json().catch(()=>null) as Record<string,string> | null
            if (j) {
              for (const k of Object.keys(j)) {
                const lower = k.toLowerCase()
                const uri = rewriteToBackendOrigin(j[k])
                if (!metaByPool[lower]) metaByPool[lower] = { metadataURI: undefined, sortOrder: undefined, indexURI: uri }
                else metaByPool[lower].indexURI = uri
              }
            }
          } else {
            // fallback to API endpoint
            const r2 = await fetch(`${BACKEND_URL}/api/meta/index`)
            if (r2.ok) {
              const j2 = await r2.json().catch(()=>null) as Record<string,string> | null
              if (j2) {
                for (const k of Object.keys(j2)) {
                  const lower = k.toLowerCase()
                  const uri = rewriteToBackendOrigin((j2 as any)[k])
                  if (!metaByPool[lower]) metaByPool[lower] = { metadataURI: undefined, sortOrder: undefined, indexURI: uri }
                  else metaByPool[lower].indexURI = uri
                }
              }
            }
          }
        } catch {}
      }

      // 如果后端没有任何映射，且之前未尝试修复，则触发一次自动修复：
      // 1) 迁移 index.json 中的私网/异域链接到 BASE_URL
      // 2) 为所有池生成/刷新别名 meta/<pool>.json 并把 index 指向别名
      const tryAutoRepairBackend = async () => {
        if (!BACKEND_URL) return false
        try {
          const headers: any = { 'Content-Type': 'application/json' }
          if (BACKEND_API_KEY) headers['x-api-key'] = BACKEND_API_KEY
          // migrate（容错，不要求一定成功）
          await fetch(`${BACKEND_URL}/api/meta/migrate?force=1`, { method:'POST', headers })
          // alias-all（确保别名存在）
          const r = await fetch(`${BACKEND_URL}/api/meta/alias-all`, { method:'POST', headers, body: JSON.stringify({ force: false }) })
          return r.ok
        } catch { return false }
      }

      // --- 优化：并行获取所有池基本信息 ---
      const poolInfos = await Promise.all(poolAddrs.map(async addr => {
        const pool = new Contract(addr, PoolArtifact.abi, readProv)
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
          }))
          return { addr, info }
        } catch (e) {
          console.warn('[pool] getInfo failed for', addr, e)
          return { addr, info: null }
        }
      }))

      // 元数据请求并行 + 速率限制（简单并发池）
      const metaFetchCache: Record<string, Promise<any>> = {}
      const tryLoadMeta = async (uri: string | undefined, attempt = 1): Promise<any> => {
        if (!uri) return null
        if (!metaFetchCache[uri]) {
          metaFetchCache[uri] = (async () => {
            try {
              const r = await fetch(uri, { cache: 'no-store' as RequestCache })
              if (!r.ok) {
                if (attempt === 1) console.warn('[meta] not ok', uri, r.status)
                return null
              }
              const j = await r.json().catch(()=>null)
              if (!j && attempt === 1) console.warn('[meta] json parse failed', uri)
              return j
            } catch (e:any) {
              if (attempt === 1) console.warn('[meta] fetch error', uri, e?.message || e)
              return null
            }
          })()
        }
        return metaFetchCache[uri]
      }

      const concurrency = 5
      const queue: Array<() => Promise<void>> = []
      const out: PoolInfo[] = []
      let missingMetaCount = 0
      // 缓存各池 DrawFulfilled 时间，避免重复链上查询
      const drawTimeCache: Record<string, number> = {}
      const getDrawAt = async (prov:any, poolAddr:string): Promise<number|undefined> => {
        try {
          const iface = new Interface(PoolArtifact.abi as any)
          const ev = iface.getEvent('DrawFulfilled')
          const topic0 = (ev as any).topicHash || (iface as any).getEventTopic?.('DrawFulfilled')
          const logs = await getLogsBatched(prov, { address: poolAddr, topics: [topic0] }, { fromBlock: 0 })
          if (logs.length === 0) return undefined
          const last = logs[logs.length-1]
          const blk = await prov.getBlock(last.blockNumber)
          return Number(blk.timestamp)
        } catch { return undefined }
      }

      for (const { addr, info } of poolInfos) {
        if (!info) continue
        const lower = addr.toLowerCase()
        const extra = metaByPool[lower] || {}
        const item: PoolInfo = {
          address: addr,
          stablecoin: info.stablecoin,
          ticketPrice: info.ticketPrice,
          minFill: info.minFill,
          maxFill: info.maxFill,
          createdAt: Number(info.createdAt),
          countdownSeconds: Number(info.countdownSeconds),
          refundDeadlineSeconds: Number(info.refundDeadlineSeconds),
          minReached: info.minReached,
          drawn: info.drawn,
          cancelled: Boolean(info.cancelled || false),
          totalTickets: Number(info.totalTickets),
          totalRaised: info.totalRaised,
          countdownStartAt: Number(info.countdownStartAt),
          winner: info.winner,
          metadataURI: extra.indexURI || extra.metadataURI,
          sortOrder: extra.sortOrder
        }
        queue.push(async () => {
          let meta: any = null
          let metaSrc = 'placeholder'
          const eventURI = extra?.metadataURI
          const indexURI = extra?.indexURI
          if (indexURI) {
            const tryUri = rewriteToBackendOrigin(indexURI)
            meta = await tryLoadMeta(tryUri)
            if (!meta) { meta = await tryLoadMeta(tryUri, 2) }
            if (meta) metaSrc = 'backend_index'
          }
          if (!meta && eventURI) {
            const tryUri = rewriteToBackendOrigin(eventURI)
            meta = await tryLoadMeta(tryUri)
            if (!meta) { meta = await tryLoadMeta(tryUri, 2) }
            if (meta) metaSrc = 'factory_event'
          }
          if (!meta && BACKEND_URL) {
            const uri = `${BACKEND_URL}/meta/${lower}.json`
            meta = await tryLoadMeta(uri)
            if (!meta) { meta = await tryLoadMeta(uri, 2) }
            if (meta) metaSrc = 'backend_lookup'
          }
            if (!meta && item.metadataURI && item.metadataURI.startsWith('ipfs://')) {
            const cid = item.metadataURI.slice('ipfs://'.length)
            meta = await tryLoadMeta(`https://ipfs.io/ipfs/${cid}`)
            if (!meta) { meta = await tryLoadMeta(`https://ipfs.io/ipfs/${cid}`, 2) }
            if (meta) metaSrc = 'ipfs_gateway'
          }
          if (meta && (meta.title || meta.image || meta.description || meta.startAt)) {
            let image: string | undefined = meta.image
            try {
              if (typeof image === 'string' && image.length > 0) {
                const base = BACKEND_URL ? new URL(BACKEND_URL) : null
                const rewriteNeeded = () => {
                  try {
                    const u = new URL(image!)
                    if (image!.startsWith('/uploads/')) return true
                    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true
                    if (base && u.hostname === base.hostname && u.port && base.port && u.port !== base.port) return true
                    return false
                  } catch { return false }
                }
                if (rewriteNeeded() && base) {
                  try {
                    const u = image!.startsWith('/uploads/') ? null : new URL(image!)
                    const p = u ? (u.pathname + (u.search || '')) : image!
                    image = `${base.origin}${p}`
                  } catch {}
                }
              }
            } catch {}
            item.meta = { title: meta.title, image, description: meta.description, startAt: meta.startAt ? Number(meta.startAt) : undefined, __src: metaSrc }
          } else {
            missingMetaCount++
            item.meta = { title: '测试活动', description: '占位元数据（未提供或解析失败）。', image: undefined, startAt: undefined, __src: 'placeholder' }
          }

          // 若已开奖，补充 drawAt 时间，用于“炫丽显示3天后隐藏”
          if (info.drawn) {
            try {
              const t = drawTimeCache[lower] ?? await getDrawAt(readProv, addr)
              if (t) { drawTimeCache[lower] = t; item.drawAt = t }
            } catch {}
          }
          out.push(item)
          // 增量渲染：每处理完一个池就刷新 UI（减少首屏等待）
          setPools(prev => {
            const merged = [...prev.filter(p=>p.address!==item.address), item]
            // 过滤取消/隐藏
            const active = merged.filter(p => !p.cancelled && !HIDDEN_POOLS.includes(p.address.toLowerCase()))
            active.sort((a,b)=> (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9))
            return active
          })
        })
      }
      // 并发执行队列
      const runners: Promise<void>[] = []
      for (const task of queue) {
        const p = task()
        runners.push(p)
        if (runners.length >= concurrency) {
          await Promise.race(runners.map(async (rp,i)=> rp.then(()=>i)))
          // 清理已完成的
          for (let i=runners.length-1;i>=0;i--) {
            if ((runners as any)[i].isFulfilled) continue
          }
        }
      }
      await Promise.all(runners)
      // 若大多数元数据缺失，且尚未尝试过修复，则尝试调用后端修复并做一次静默重载
      if (!opts?.silent && !repairAttemptedRef.current && missingMetaCount >= Math.ceil(Math.max(1, out.length) * 0.6)) {
        const ok = await tryAutoRepairBackend()
        repairAttemptedRef.current = true
        if (ok) {
          // 小延迟后进行一次静默刷新，让别名/索引生效
          setTimeout(()=> { loadImpl({ silent: true }) }, 300)
        }
      }
  const res = out
  // 计算系列期数：按标题去掉“第N期/Period N”等标记后的基名分组，按 sortOrder/createdAt 升序编号
  const normalizeTitle = (s?: string) => {
    if (!s) return 'untitled'
    let x = s.replace(/第\s*\d+\s*期/gi, '').replace(/period\s*\d+/gi, '')
    x = x.replace(/\(test\)/gi, '').replace(/test use/gi, '').trim()
    return x || 'untitled'
  }
  const groups: Record<string, PoolInfo[]> = {}
  for (const it of res) {
    const key = normalizeTitle(it.meta?.title)
    it.baseTitle = key
    if (!groups[key]) groups[key] = []
    groups[key].push(it)
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a,b)=> (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt))
    groups[key].forEach((it,idx)=> { it.seriesPeriod = idx+1 })
  }

  // 过滤掉已取消的活动；若已开奖且超过3天则隐藏
  const nowSec = Math.floor(Date.now()/1000)
  const active = res.filter(p => {
    if (p.cancelled) return false
    if (HIDDEN_POOLS.includes(p.address.toLowerCase())) return false
    if (p.drawn && p.drawAt && nowSec > p.drawAt + 3*24*3600) return false
    return true
  })
  setCancelledCount(res.filter(p=>p.cancelled).length)
  setHiddenCount(res.filter(p=>HIDDEN_POOLS.includes(p.address.toLowerCase())).length)
  // sort by sortOrder asc if present
  active.sort((a,b)=> (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9))
  // 仅当成功拉取时再替换 UI，避免闪烁
  setPools(active)
  // 成功获取列表时清除旧错误（包括之前的 Provider 未就绪提示），即使过滤后为空也应该清除
  if (error) { setError(null); setErrorKind(null) }
    } catch (e:any) {
      const msg = e?.message || String(e)
      if (!opts?.silent) { setError(msg); setErrorKind('other') }
      else {
        console.warn('[pools] silent refresh failed:', msg)
        ;(window as any).__toast?.show?.(msg, 'error')
      }
    } finally {
      if (!opts?.silent) setLoading(false)
      else setRefreshing(false)
      loadingRef.current = false
      // 这里不再立即触发二次静默刷新，避免用户感知到的“首屏长时间等待”；如需补齐排序，可在用户主动点击刷新或 60 秒定时器中完成。
    }
  }, [readProvider, walletProvider, ensureReadProvider, error, pools])

  // provider 一旦就绪且之前记录了“首屏在 provider 未就绪时失败”，并且仍没有任何池数据，则自动再执行一次正常加载（等同用户点右下角刷新）
  useEffect(() => {
    if (readProvider && autoRetryPendingRef.current && pools.length === 0 && !loadingRef.current) {
      autoRetryPendingRef.current = false
      loadImpl({ silent: false })
    }
  }, [readProvider, pools.length, loadImpl])

  const load = useCallback(async () => loadImpl({ silent: false }), [loadImpl])
  const refreshSilent = useCallback(async () => loadImpl({ silent: true }), [loadImpl])

  // 去掉立即二次“非静默”刷新，避免过度频繁；改为：当 provider 就绪且当前列表里仍存在占位元数据时，触发一次静默刷新补齐。
  const placeholderFixTriggered = useRef(false)
  useEffect(() => {
    if (!readProvider) return
    if (placeholderFixTriggered.current) return
    // 若当前已加载的池全部都有非 placeholder 元数据则无需补齐
    const hasPlaceholder = pools.some(p => !p.meta || p.meta.__src === 'placeholder')
    if (hasPlaceholder) {
      placeholderFixTriggered.current = true
      setTimeout(() => { loadImpl({ silent: true }) }, 150) // 小延迟避免与首次加载并发抢占
    }
  }, [readProvider, pools, loadImpl])

  // 对外暴露：walletProvider 用于需要签名的交互；只读当前 RPC URL 供 UI 显示与调试
  return { provider: walletProvider, readProvider, currentRpcUrl, pools, loading, error, errorKind, load, refreshSilent, refreshing, totalPools, cancelledCount, hiddenCount }
}
