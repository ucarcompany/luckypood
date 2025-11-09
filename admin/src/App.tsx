import { useEffect, useMemo, useState } from 'react'
import { Contract, BrowserProvider, JsonRpcProvider, Interface } from 'ethers'
function toUnits(input: string, decimals: number): bigint {
  const [ints, fracRaw = ''] = String(input).trim().split('.')
  const frac = (fracRaw + '0'.repeat(decimals)).slice(0, decimals)
  const num = (ints || '0') + frac
  return BigInt(num.replace(/^0+(?=\d)/, ''))
}
import FactoryArtifact from '@abi/LuckyPoolFactory.json'
import PoolArtifact from '@abi/LuckyPool.json'

const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS || '').trim()
const DEFAULT_RPC = (import.meta.env.VITE_DEFAULT_RPC || '').trim()
// 可选：指定工厂合约的部署起始区块，避免从 0 区块遍历导致 BSC -32005 limit exceeded
const FACTORY_DEPLOY_BLOCK = Number((import.meta.env as any).VITE_FACTORY_DEPLOY_BLOCK || '0') || 0
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000').trim()
const PASS_HASH_ENV = (import.meta.env as any).VITE_ADMIN_PASS_HASH ? String((import.meta.env as any).VITE_ADMIN_PASS_HASH).trim() : ''
const API_KEY_ENV = (import.meta.env.VITE_BACKEND_API_KEY || '').trim()

async function sha256Hex(input: string) {
  const enc = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')
}

function getApiKey(): string {
  return localStorage.getItem('admin_key') || API_KEY_ENV || ''
}

export default function App(){
  // Simple entry password gate (optional). If VITE_ADMIN_PASS_HASH is set, require login
  const [authed, setAuthed] = useState(!PASS_HASH_ENV)
  const [pwd, setPwd] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  useEffect(()=>{
    if (!PASS_HASH_ENV) return
    const k = localStorage.getItem('admin_key')
    if (!k) return
    (async ()=>{
      const h = await sha256Hex(k)
      if (h === PASS_HASH_ENV) setAuthed(true)
      else localStorage.removeItem('admin_key')
    })()
  }, [])
  const doLogin = async () => {
    if (!PASS_HASH_ENV) { setAuthed(true); return }
    setAuthBusy(true)
    try {
      const h = await sha256Hex(pwd)
      if (h === PASS_HASH_ENV) {
        localStorage.setItem('admin_key', pwd)
        setAuthed(true)
        setPwd('')
      } else {
        alert('密码错误')
      }
    } finally { setAuthBusy(false) }
  }
  const logout = () => { localStorage.removeItem('admin_key'); setAuthed(false) }

  const [account, setAccount] = useState<string | null>(null)
  const [provider, setProvider] = useState<any>(null)
  const [readProvider, setReadProvider] = useState<any>(null)

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [decimals, setDecimals] = useState(18)
  const [minFill, setMinFill] = useState('7100')
  const [maxFill, setMaxFill] = useState('7700')
  const [sortOrder, setSortOrder] = useState(0)
  const [startTime, setStartTime] = useState('') // yyyy-MM-ddTHH:mm
  const [busy, setBusy] = useState(false)

  const connect = async () => {
    try {
      const eth = (window as any).ethereum
      if (!eth) return alert('未检测到钱包扩展（OKX/MetaMask）')
      // 使用 ethers v6 的 BrowserProvider
      const p: any = new BrowserProvider(eth)
  setProvider(p)
  setReadProvider(p)
      const accs = await eth.request({ method: 'eth_requestAccounts' })
      setAccount(accs[0] ?? null)
      // 可选：自动切到 BSC Testnet（0x61）
      try {
        const cid = await eth.request({ method: 'eth_chainId' })
        if (cid !== '0x61') {
          try {
            await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x61' }] })
          } catch {
            await eth.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x61',
                chainName: 'BNB Smart Chain Testnet',
                rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
                nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
                blockExplorerUrls: ['https://testnet.bscscan.com']
              }]
            })
          }
        }
      } catch {}
    } catch (e: any) {
      console.error(e)
      alert(e?.message || String(e))
    }
  }

  // 初始只读Provider（无需连接也能看到列表）
  useEffect(()=>{
    if (DEFAULT_RPC) setReadProvider(new JsonRpcProvider(DEFAULT_RPC))
  }, [])

  // 加载所有活动
  const [pools, setPools] = useState<{address:string, info:any, owner?:string, meta?:{title?:string,description?:string,image?:string}, canDelete?: boolean}[]>([])
  const [loading, setLoading] = useState(false)

  const loadPools = async () => {
    if (!readProvider || !FACTORY_ADDRESS) return
    setLoading(true)
    try {
      const factory = new Contract(FACTORY_ADDRESS, FactoryArtifact.abi, readProvider)
      const addrs: string[] = await factory.getPools()
      const res: any[] = []
      for (const addr of addrs) {
        const pool = new Contract(addr, PoolArtifact.abi, readProvider)
        let info: any
        try { info = await pool.getInfo() } catch { // 兼容老版本
          info = {
            minFill: await pool.minFill?.().catch(()=>0n),
            maxFill: await pool.maxFill?.().catch(()=>0n),
            totalRaised: await pool.totalRaised?.().catch(()=>0n),
            totalTickets: await pool.totalTickets?.().catch(()=>0),
            minReached: await pool.minReached?.().catch(()=>false),
            drawn: await pool.drawn?.().catch(()=>false),
            cancelled: await pool.cancelled?.().catch(()=>false)
          }
        }
        // 探测是否支持删除接口
        let canDelete = false
        try {
          await pool.isCancelRefundFinished()
          canDelete = true
        } catch { canDelete = false }
        // 读取 owner 以帮助判断是否有权限删除
        let owner: string | undefined = undefined
        try { owner = await (pool as any).owner?.() } catch {}
        res.push({ address: addr, info, owner, canDelete })
      }
      setPools(res)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(()=>{ loadPools() }, [readProvider])

  // 管理员删除并退款（分批）
  const [canceling, setCanceling] = useState<string | null>(null)
  const [logPool, setLogPool] = useState<string | null>(null)
  const [logs, setLogs] = useState<any[]>([])
  
  // ====== 工具：区块范围分段拉取日志，规避 BSC eth_getLogs -32005 ======
  async function getLogsBatched(
    prov: any,
    filter: { address: string, topics: string[] | (string|null)[] },
    options?: { fromBlock?: number, toBlock?: number, batchSize?: number }
  ){
    const latest = options?.toBlock ?? await prov.getBlockNumber()
    let start = Math.max(0, options?.fromBlock ?? 0)
    const logs: any[] = []
    let step = options?.batchSize ?? 50_000 // 初始 5 万区块一批
    while (start <= latest) {
      const end = Math.min(start + step, latest)
      try {
        const part = await prov.getLogs({ ...filter, fromBlock: start, toBlock: end })
        logs.push(...part)
        start = end + 1
        // 成功后尝试放大步长（最多 10 万）
        if (step < 100_000) step = Math.min(100_000, Math.floor(step * 1.5))
      } catch (e: any) {
        const msg = e?.message || ''
        const code = e?.code
        // BSC 常见错误：-32005 limit exceeded / block range too wide
        if (code === -32005 || /limit exceeded|block range|query timeout/i.test(msg)) {
          if (step > 50) { step = Math.max(50, Math.floor(step / 2)); continue }
        }
        // 其他错误或步长已无法再降，直接抛出
        throw e
      }
    }
    return logs
  }
  const loadLogs = async (addr: string) => {
    if (!readProvider) return
  const iface = new Interface(PoolArtifact.abi as any)
    const events = ['MinReached','CountdownStarted','DrawRequested','DrawFulfilled','Cancelled','Withdrawn']
    const topics = events.map(ev=> (iface.getEvent(ev) as any).topicHash || (iface as any).getEventTopic?.(ev)).filter(Boolean)
    const fromBlock = 0
    const all: any[] = []
    for (const ev of events) {
      try {
        const topic0 = (iface.getEvent(ev) as any).topicHash || (iface as any).getEventTopic?.(ev)
        const ls = await getLogsBatched(readProvider, { address: addr, topics: [topic0] }, { fromBlock })
        for (const l of ls) {
          const parsed: any = iface.parseLog({ topics: l.topics, data: l.data })
          all.push({ name: ev, blockNumber: l.blockNumber, args: parsed?.args })
        }
      } catch {}
    }
    all.sort((a,b)=> a.blockNumber - b.blockNumber)
    setLogs(all)
    setLogPool(addr)
  }
  const adminCancel = async (addr: string) => {
    if (!provider) return alert('Connect wallet')
    if (!confirm('确定删除该活动并原路退款所有参与者吗？此操作不可逆。')) return
    setCanceling(addr)
    try {
      const signer = await provider.getSigner()
      const pool = new Contract(addr, PoolArtifact.abi, signer)
      // 循环分批退款，最多执行若干批（避免卡死）
      for (let i=0;i<50;i++) {
        const finished: boolean = await pool.isCancelRefundFinished().catch(()=>false)
        if (finished) break
        const tx = await pool.adminCancelAndRefundBatch(50)
        await tx.wait()
        // 小延迟/下一轮继续
      }
      alert('删除并退款流程已触发（可能仍在后台继续，请稍后刷新查看）。')
      await loadPools()
    } catch (e:any) {
      console.error(e)
      alert(e?.message || String(e))
    } finally { setCanceling(null) }
  }

  const uploadImage = async (): Promise<string> => {
    if (!image) return ''
    const fd = new FormData()
    fd.append('file', image)
    const headers: Record<string,string> = {}
    const API_KEY = getApiKey(); if (API_KEY) headers['x-api-key'] = API_KEY
    const res = await fetch(`${BACKEND_URL}/api/upload`, { method: 'POST', body: fd, headers })
    if (!res.ok) throw new Error('Upload failed')
    const data = await res.json()
    return data.url as string
  }

  const createMetadata = async (imageUrl: string): Promise<string> => {
    const startAt = startTime ? Math.floor(new Date(startTime).getTime()/1000) : undefined
    const body: any = { title: name, description: desc, image: imageUrl }
    if (startAt) body.startAt = startAt
    const headers: Record<string,string> = { 'Content-Type': 'application/json' }
    const API_KEY = getApiKey(); if (API_KEY) headers['x-api-key'] = API_KEY
    const res = await fetch(`${BACKEND_URL}/api/metadata`, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!res.ok) throw new Error('Create metadata failed')
    const data = await res.json()
    return data.uri as string
  }

  const onSubmit = async () => {
    if (!provider || !account) return alert('Connect wallet')
    if (!FACTORY_ADDRESS) return alert('Missing FACTORY address')
    setBusy(true)
    try {
      const imageUrl = await uploadImage()
      const metadataURI = await createMetadata(imageUrl)
  const signer = await provider.getSigner()
      const factory = new Contract(FACTORY_ADDRESS, FactoryArtifact.abi, signer)
      // Convert fills to token units
  const min = toUnits(minFill, decimals)
  const max = toUnits(maxFill, decimals)
  // 前端预校验，避免链上直接报 "bad fill" 不知原因
  if (min <= 0n) { setBusy(false); alert(`最小池子金额无效（解析后为 ${min} ）`); return }
  if (max <= min) { setBusy(false); alert(`最大池子金额必须大于最小金额。当前最小 ${min} 最大 ${max}`); return }
      const tx = await factory.createPool({ minFill: min, maxFill: max, metadataURI, sortOrder })
      const receipt = await tx.wait()
      // 解析日志拿到新池地址
      try {
        const iface = new Interface(FactoryArtifact.abi as any)
        const ev = iface.getEvent('PoolCreated')
        const topic0 = (ev as any).topicHash || (iface as any).getEventTopic?.('PoolCreated')
        const log = receipt?.logs?.find((l:any)=> l.topics && l.topics[0] === topic0)
        if (log) {
          const parsed: any = iface.parseLog({ topics: log.topics, data: log.data })
          const poolAddr = String(parsed?.args?.[0] || '')
          if (poolAddr) {
            // 回写后端索引（带重试与指数退避），便于前端读取 metadata
            const headers: Record<string,string> = { 'Content-Type': 'application/json' }
            { const dynKey = getApiKey(); if (dynKey) headers['x-api-key'] = dynKey }
            const attemptWrite = async () => {
              let delay = 500
              for (let i=0;i<3;i++) {
                try {
                  const r = await fetch(`${BACKEND_URL}/api/meta/index`, { method:'POST', headers, body: JSON.stringify({ pool: poolAddr, uri: metadataURI }) })
                  if (r.ok) return true
                } catch {}
                await new Promise(res=>setTimeout(res, delay))
                delay *= 2 // 指数退避
              }
              return false
            }
            const ok = await attemptWrite()
            if (ok) {
              alert('活动已创建并自动写入索引（无需手动同步）')
            } else {
              alert('活动已创建，但索引自动写入失败，请稍后点击一键修复索引。')
            }
          }
        }
      } catch {}
      alert('活动创建成功')
      await loadPools()
    } catch (e:any) {
      console.error(e)
      alert(e?.message || String(e))
    } finally { setBusy(false) }
  }

  const [syncing, setSyncing] = useState(false)
  const syncIndex = async () => {
    if (!readProvider || !FACTORY_ADDRESS) return alert('缺少只读Provider或FACTORY地址')
    setSyncing(true)
    try {
      const iface = new Interface(FactoryArtifact.abi as any)
      const ev = iface.getEvent('PoolCreated')
      const topic0 = (ev as any).topicHash || (iface as any).getEventTopic?.('PoolCreated')
      // 分段拉取，fromBlock 优先使用配置的部署区块，避免从 0 开始过宽
      const logs = await getLogsBatched(readProvider, { address: FACTORY_ADDRESS, topics: [topic0] }, { fromBlock: FACTORY_DEPLOY_BLOCK })
      let ok = 0, fail = 0
      for (const l of logs) {
        try {
          const parsed: any = iface.parseLog({ topics: l.topics, data: l.data })
          const poolAddr = String(parsed?.args?.[0] || '')
          const uri = String(parsed?.args?.[3] || '')
          if (poolAddr && uri) {
            const headers: Record<string,string> = { 'Content-Type':'application/json' }
            { const dynKey = getApiKey(); if (dynKey) headers['x-api-key'] = dynKey }
            const r = await fetch(`${BACKEND_URL}/api/meta/index`, { method:'POST', headers, body: JSON.stringify({ pool: poolAddr, uri }) })
            if (r.ok) ok++; else fail++
          }
        } catch { fail++ }
      }
      alert(`索引同步完成：成功 ${ok} 条，失败 ${fail} 条`)
    } catch (e:any) { console.error(e); alert(e?.message || String(e)) }
    finally { setSyncing(false) }
  }

  return (
    <div className="container">
      {PASS_HASH_ENV && !authed ? (
        <div className="card" style={{maxWidth:420, margin:'80px auto'}}>
          <h3>管理员登录</h3>
          <div style={{fontSize:12,color:'#666',marginBottom:8}}>请输入入口密码（仅本页校验；通过后会保存在本机 LocalStorage）。</div>
          <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="入口密码" />
          <div style={{marginTop:12}}>
            <button disabled={authBusy} onClick={doLogin}>{authBusy ? '验证中...' : '登录'}</button>
          </div>
        </div>
      ) : null}
      {(!PASS_HASH_ENV || authed) && (
      <>
      <header>
        <h1>Lucky Pool Admin</h1>
        <div>
          {account ? <span className="badge">{account.slice(0,6)}...{account.slice(-4)}</span> : (
            <button onClick={connect}>连接钱包</button>
          )}
          <button style={{marginLeft:8}} onClick={loadPools}>刷新列表</button>
          <button style={{marginLeft:8}} disabled={syncing} onClick={syncIndex}>{syncing ? '同步中...' : '一键修复索引'}</button>
          {PASS_HASH_ENV && <button style={{marginLeft:8}} onClick={logout}>退出登录</button>}
        </div>
      </header>

      <div className="card">
        <div className="row">
          <div style={{flex:1}}>
            <label>奖品名称</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="如：iPhone 15 Pro" />
          </div>
          <div style={{width:160}}>
            <label>稳定币小数位</label>
            <input type="number" value={decimals} onChange={e=>setDecimals(Number(e.target.value)||18)} />
          </div>
        </div>
        <label>奖品说明</label>
        <textarea rows={4} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="发放方式与说明" />

        <div className="row">
          <div style={{flex:1}}>
            <label>最小池子金额（如 7100）</label>
            <input value={minFill} onChange={e=>setMinFill(e.target.value)} />
          </div>
          <div style={{flex:1}}>
            <label>最大池子金额（如 7700）</label>
            <input value={maxFill} onChange={e=>setMaxFill(e.target.value)} />
          </div>
          <div style={{width:160}}>
            <label>排序（0 最前）</label>
            <input type="number" value={sortOrder} onChange={e=>setSortOrder(Number(e.target.value)||0)} />
          </div>
        </div>

        <div className="row">
          <div style={{flex:1}}>
            <label>开始时间（可选，未到时不可参与）</label>
            <input type="datetime-local" value={startTime} onChange={e=>setStartTime(e.target.value)} />
          </div>
        </div>

        <label>奖品图片</label>
        <input type="file" accept="image/*" onChange={e=>setImage(e.target.files?.[0]||null)} />

        <div style={{marginTop:12}}>
          <button disabled={busy} onClick={onSubmit}>发布新活动</button>
        </div>
      </div>

      <div className="card" style={{marginTop:16}}>
        <h3>活动管理</h3>
        <div style={{fontSize:12,color:'#666',marginBottom:8}}>可删除未开奖的活动，并按参与份额原路退款。大额活动可能需要多次批处理。</div>
        {loading ? <div>加载中...</div> : (
          <div>
            {pools.length === 0 && <div>暂无活动</div>}
            {pools.map(p => (
              <div key={p.address} className="row" style={{alignItems:'center', padding:'8px 0', borderTop:'1px solid #eee'}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600}}>{p.address}</div>
                  <div style={{fontSize:12,color:'#555'}}>
                    已筹：{String(p.info.totalRaised)} | 票数：{Number(p.info.totalTickets)} | 最小：{String(p.info.minFill)} | 最大：{String(p.info.maxFill)}
                  </div>
                  <div style={{fontSize:12,color:'#777'}}>状态：{p.info.drawn ? '已开奖' : (p.info.cancelled ? '已取消' : (p.info.minReached ? '倒计时' : '许愿中'))}</div>
                  <div style={{fontSize:12,color:'#777'}}>删除支持：{p.canDelete ? '支持（新版本）' : '不支持（旧版本）'}</div>
                  {p.owner && <div style={{fontSize:12,color:'#777'}}>拥有者：{p.owner}</div>}
                </div>
                <div>
                  <button style={{marginRight:8}} onClick={()=>loadLogs(p.address)}>查看日志</button>
                  <button disabled={canceling===p.address || p.info.drawn || !p.canDelete} onClick={()=>adminCancel(p.address)}>{canceling===p.address ? '处理中...' : (p.canDelete ? '删除并退款' : '不支持删除')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {logPool && (
        <div className="card" style={{marginTop:16}}>
          <div className="row" style={{alignItems:'center'}}>
            <h3 style={{flex:1}}>活动日志</h3>
            <button onClick={()=>{setLogPool(null); setLogs([])}}>关闭</button>
          </div>
          <div style={{fontSize:12,color:'#666',marginBottom:8}}>展示关键链上事件：MinReached、CountdownStarted、DrawRequested、DrawFulfilled（中奖）、Cancelled（删除/超时取消）、Withdrawn（提现）。</div>
          {logs.length===0 ? <div>暂无日志</div> : (
            <div>
              {logs.map((l,idx)=> (
                <div key={idx} style={{borderTop:'1px solid #eee', padding:'6px 0'}}>
                  <div><b>{l.name}</b> @ block {l.blockNumber}</div>
                  <div style={{fontSize:12,color:'#555'}}>{JSON.stringify(l.args)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <IndexManager />
      </>
      )}
    </div>
  )
}

// ====== 索引管理页面组件 ======
function IndexManager() {
  const [data, setData] = useState<Record<string,string>>({})
  const [loading, setLoading] = useState(false)
  const [pool, setPool] = useState('')
  const [uri, setUri] = useState('')
  const [busy, setBusy] = useState(false)
  const backend = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000').trim()
  const apiKeyEnv = (import.meta.env.VITE_BACKEND_API_KEY || '').trim()
  const getApiKey = () => localStorage.getItem('admin_key') || apiKeyEnv

  const loadIndex = async () => {
    setLoading(true)
    try {
      let j: any = null
      // 优先静态 index.json
      const r = await fetch(`${backend}/meta/index.json`)
      if (r.ok) j = await r.json().catch(()=>null)
      if (!j) {
        const r2 = await fetch(`${backend}/api/meta/index`)
        if (r2.ok) j = await r2.json().catch(()=>null)
      }
      if (j && typeof j === 'object') setData(j)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }
  useEffect(()=>{ loadIndex() }, [])

  const upsert = async () => {
    if (!pool || !uri) return alert('请输入 pool 与 URI')
    setBusy(true)
    try {
  const headers: Record<string,string> = { 'Content-Type':'application/json' }
  { const dyn = getApiKey(); if (dyn) headers['x-api-key'] = dyn }
      const r = await fetch(`${backend}/api/meta/index`, { method:'POST', headers, body: JSON.stringify({ pool, uri }) })
      if (!r.ok) throw new Error('写入失败')
      await loadIndex()
      alert('已写入索引')
    } catch (e:any) { alert(e?.message || String(e)) }
    finally { setBusy(false) }
  }

  const remove = async (addr: string) => {
    if (!confirm('确认删除该映射？')) return
    const copy = { ...data }
    delete copy[addr]
    // 直接覆盖静态文件：需要后端支持写删除；目前后端只有写/追加接口 => 用空 URI 覆盖
    try {
  const headers: Record<string,string> = { 'Content-Type':'application/json' }
  { const dyn = getApiKey(); if (dyn) headers['x-api-key'] = dyn }
      const r = await fetch(`${backend}/api/meta/index`, { method:'POST', headers, body: JSON.stringify({ pool: addr, uri: '' }) })
      if (!r.ok) throw new Error('删除写入失败')
      await loadIndex()
    } catch (e:any) { alert(e?.message || String(e)) }
  }

  return (
    <div className="card" style={{marginTop:16}}>
      <h3>索引管理</h3>
      <div style={{fontSize:12,color:'#666',marginBottom:8}}>前端兜底读取 pool→metadataURI 映射；这里可视化增删改。删除目前通过写入空 URI 实现。</div>
      <div className="row" style={{marginBottom:8}}>
        <input style={{flex:1}} placeholder="Pool 地址" value={pool} onChange={e=>setPool(e.target.value.trim())} />
        <input style={{flex:1}} placeholder="Metadata URI" value={uri} onChange={e=>setUri(e.target.value.trim())} />
        <button disabled={busy} onClick={upsert}>{busy ? '写入中...' : '写入/更新'}</button>
        <button onClick={loadIndex} disabled={loading}>{loading ? '加载中...' : '刷新'}</button>
      </div>
      <div style={{maxHeight:300, overflow:'auto', fontSize:12}}>
        {Object.keys(data).length === 0 && <div>暂无条目</div>}
        {Object.entries(data).map(([k,v]) => (
          <div key={k} style={{display:'flex',alignItems:'center',borderTop:'1px solid #eee',padding:'4px 0'}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:600}}>{k}</div>
              <div style={{color:'#555',wordBreak:'break-all'}}>{v || <em style={{color:'#aaa'}}>（空）</em>}</div>
            </div>
            <button style={{marginLeft:8}} onClick={()=>{setPool(k); setUri(v)}}>编辑</button>
            <button style={{marginLeft:8}} onClick={()=>remove(k)}>删除</button>
          </div>
        ))}
      </div>
    </div>
  )
}
