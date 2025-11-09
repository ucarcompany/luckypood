import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserProvider, JsonRpcProvider, Contract, Interface } from 'ethers'
import { FACTORY_ADDRESS, DEFAULT_RPC, HIDDEN_POOLS, BACKEND_URL, FACTORY_DEPLOY_BLOCK } from '../config'
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
}

export function useEthersProvider() {
  const [provider, setProvider] = useState<BrowserProvider | JsonRpcProvider | null>(null)
  useEffect(() => {
    // 优先使用 DEFAULT_RPC 作为只读 provider，避免钱包连错链导致读取失败
    if (DEFAULT_RPC) {
      setProvider(new JsonRpcProvider(DEFAULT_RPC))
      return
    }
    if ((window as any).ethereum) {
      setProvider(new BrowserProvider((window as any).ethereum))
    }
  }, [])
  return provider
}

export function useFactory(provider: BrowserProvider | JsonRpcProvider | null) {
  return useMemo(() => {
    if (!provider || !FACTORY_ADDRESS) return null
    return new Contract(FACTORY_ADDRESS, FactoryArtifact.abi, provider)
  }, [provider])
}

export function usePools() {
  const provider = useEthersProvider()
  const factory = useFactory(provider)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pools, setPools] = useState<PoolInfo[]>([])
  const loadingRef = useRef(false) // 防止并发加载

  const rewriteToBackendOrigin = (uri?: string | null) => {
    try {
      if (!uri) return undefined
      const base = BACKEND_URL ? new URL(BACKEND_URL) : null
      const u = new URL(uri)
      // 仅针对 http/https 的本机/局域网资源进行规范化
      const isHttp = u.protocol === 'http:' || u.protocol === 'https:'
      const isLocalHost = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
      const sameHost = base && u.hostname === base.hostname
      if (isHttp && base && (isLocalHost || sameHost)) {
        return `${base.origin}${u.pathname}${u.search || ''}`
      }
      return uri
    } catch { return uri || undefined }
  }

  const loadImpl = useCallback(async (opts?: { silent?: boolean }) => {
    if (!FACTORY_ADDRESS) {
      if (!opts?.silent) {
        setPools([])
        setError('缺少 VITE_FACTORY_ADDRESS（用户前端未配置工厂地址）')
      }
      return
    }
    if (!provider || !factory) {
      if (!opts?.silent) {
        setPools([])
        setError('Provider 未就绪或工厂实例创建失败（请检查 DEFAULT_RPC 与工厂地址）')
      }
      return
    }
    if (loadingRef.current) return
    loadingRef.current = true
    if (!opts?.silent) { setLoading(true); setError(null) }
    try {
      const poolAddrs: string[] = await factory.getPools()
      // ===== 工具：分段批量读取日志，规避 BSC -32005 limit exceeded =====
      const getLogsBatched = async (
        prov: any,
        filter: { address: string, topics: (string|null)[] },
        opts?: { fromBlock?: number, toBlock?: number, batchSize?: number }
      ) => {
        const latest = opts?.toBlock ?? await prov.getBlockNumber()
        let start = Math.max(0, opts?.fromBlock ?? 0)
        const logs: any[] = []
        let step = opts?.batchSize ?? 50_000
        while (start <= latest) {
          const end = Math.min(start + step, latest)
          try {
            const part = await prov.getLogs({ ...filter, fromBlock: start, toBlock: end })
            logs.push(...part)
            start = end + 1
            if (step < 100_000) step = Math.min(100_000, Math.floor(step * 1.5)) // 成功后放大
          } catch (e: any) {
            const msg = e?.message || ''
            const code = e?.code
            if (code === -32005 || /limit exceeded|block range|query timeout/i.test(msg)) {
              if (step > 50) { step = Math.max(50, Math.floor(step / 2)); continue }
            }
            throw e
          }
        }
        return logs
      }

      // 1) read PoolCreated logs from Factory to get metadataURI & sortOrder（采用分段批量）
  let metaByPool: Record<string,{metadataURI?:string, sortOrder?:number, indexURI?: string}> = {}
      try {
        const iface = new Interface(FactoryArtifact.abi)
        const eventFrag = iface.getEvent('PoolCreated')
        const topic0 = (eventFrag as any).topicHash || (eventFrag as any).topic || (iface as any).getEventTopic?.('PoolCreated')
        const startBlock = FACTORY_DEPLOY_BLOCK || 0
        const logs = await getLogsBatched(provider, { address: FACTORY_ADDRESS, topics: [topic0] }, { fromBlock: startBlock })
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

      const res: PoolInfo[] = []
      for (const addr of poolAddrs) {
        const pool = new Contract(addr, PoolArtifact.abi, provider)
        let info: any
        try {
          info = await pool.getInfo()
        } catch (e) {
          // 兼容旧版合约：逐字段读取，避免 getInfo ABI 不匹配
          info = {
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
          }
        }
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
          // 优先使用后端索引中的 URI（覆盖事件里的 metadataURI）
          metadataURI: extra.indexURI || extra.metadataURI,
          sortOrder: extra.sortOrder
        }
        // 2) fetch metadata if available, with multiple fallbacks for tests
        // 元数据缓存，避免同一次加载过程中对同一 URI 多次重复请求造成 429
        const metaFetchCache: Record<string, Promise<any>> = {}
        const tryLoadMeta = async (uri: string | undefined, attempt = 1): Promise<any> => {
          if (!uri) return null
          if (!metaFetchCache[uri]) {
            metaFetchCache[uri] = (async () => {
              try {
                const r = await fetch(uri, { cache: 'no-store' as RequestCache })
                if (!r.ok) {
                  if (attempt === 1) console.warn('[meta] fetch not ok', uri, r.status)
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
        let meta: any = null;
        let metaSrc = 'placeholder';
        const eventURI = extra?.metadataURI
        const indexURI = extra?.indexURI
        // 1. 先试后端索引中的 URI（indexURI）
        if (indexURI) {
          const tryUri = rewriteToBackendOrigin(indexURI)
          meta = await tryLoadMeta(tryUri)
          if (!meta) {
            await new Promise(r=>setTimeout(r, 600))
            meta = await tryLoadMeta(tryUri, 2)
          }
          if (meta) metaSrc = 'backend_index'
        }
        // 2. 再试合约事件中的 metadataURI（eventURI）
        if (!meta && eventURI) {
          const tryUri = rewriteToBackendOrigin(eventURI)
          meta = await tryLoadMeta(tryUri)
          if (!meta) {
            await new Promise(r=>setTimeout(r, 800))
            meta = await tryLoadMeta(tryUri, 2)
          }
          if (meta) metaSrc = 'factory_event'
        }
        // 3. 后端索引 /meta/<addr>.json 兜底（注意：如果后端未生成按地址命名的 JSON，此步可能 404）
        if (!meta && BACKEND_URL) {
          const lowerAddr = addr.toLowerCase()
          const uri = `${BACKEND_URL}/meta/${lowerAddr}.json`
          meta = await tryLoadMeta(uri)
          if (!meta) {
            // 第二次重试加入随机抖动，减少并发导致的限流冲突
            await new Promise(r=>setTimeout(r, 600 + Math.floor(Math.random()*400)))
            meta = await tryLoadMeta(uri, 2)
          }
          if (meta) metaSrc = 'backend_lookup'
        }
        // 4. ipfs:// 兜底
        if (!meta && item.metadataURI && item.metadataURI.startsWith('ipfs://')) {
          const cid = item.metadataURI.slice('ipfs://'.length)
          meta = await tryLoadMeta(`https://ipfs.io/ipfs/${cid}`)
          if (!meta) {
            await new Promise(r=>setTimeout(r, 1000))
            meta = await tryLoadMeta(`https://ipfs.io/ipfs/${cid}`, 2)
          }
          if (meta) metaSrc = 'ipfs_gateway'
        }
        // 4. 成功 or fallback
        if (meta && (meta.title || meta.image || meta.description || meta.startAt)) {
          // 处理图片在 metadata 中写成 http://localhost:4000/... 导致在其他设备访问不到的问题：
          // 若检测到 localhost/127.0.0.1 且配置了 BACKEND_URL，则重写为 BACKEND_URL 的同路径
          let image: string | undefined = meta.image
          try {
            if (typeof image === 'string' && image.length > 0) {
              const base = BACKEND_URL ? new URL(BACKEND_URL) : null
              const rewriteNeeded = () => {
                try {
                  const u = new URL(image!)
                  // 条件：
                  // 1) 相对路径 /uploads/
                  // 2) localhost/127.0.0.1 主机
                  // 3) 与 BACKEND_URL 主机相同但端口不同（例如图片是 4443，BACKEND_URL 是 4002）
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
                } catch { /* ignore */ }
              }
            }
          } catch {}
          item.meta = { title: meta.title, image, description: meta.description, startAt: meta.startAt ? Number(meta.startAt) : undefined, __src: metaSrc };
        } else {
          // 在开发模式下附加 metadataURI 便于调试
          if (import.meta.env.DEV) console.warn('[meta] fallback placeholder for pool', addr, 'metadataURI=', item.metadataURI)
          item.meta = { title: '测试活动', description: '占位元数据（未提供或解析失败）。', image: undefined, startAt: undefined, __src: 'placeholder' };
        }
        res.push(item)
      }
  // 过滤掉已取消的活动
  const active = res.filter(p => !p.cancelled && !HIDDEN_POOLS.includes(p.address.toLowerCase()))
  // sort by sortOrder asc if present
  active.sort((a,b)=> (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9))
  // 仅当成功拉取时再替换 UI，避免闪烁
  setPools(active)
    } catch (e:any) {
      if (!opts?.silent) setError(e.message || String(e))
      else console.warn('[pools] silent refresh failed:', e?.message || e)
    } finally {
      if (!opts?.silent) setLoading(false)
      loadingRef.current = false
    }
  }, [provider, factory])

  const load = useCallback(async () => loadImpl({ silent: false }), [loadImpl])
  const refreshSilent = useCallback(async () => loadImpl({ silent: true }), [loadImpl])

  return { provider, factory, pools, loading, error, load, refreshSilent }
}
