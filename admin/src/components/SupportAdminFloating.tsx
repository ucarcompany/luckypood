import { useEffect, useRef, useState } from 'react'

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || (import.meta.env.PROD ? 'https://api.luckypood.com' : 'http://localhost:4000')).trim()
const API_KEY_ENV = (import.meta.env.VITE_BACKEND_API_KEY || '').trim()

function getApiKey(){
  const k = (localStorage.getItem('admin_api_key') || API_KEY_ENV || '').trim()
  return /^[\x20-\x7E]*$/.test(k) ? k : ''
}

export default function SupportAdminFloating(){
  const [open, setOpen] = useState(false)
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [list, setList] = useState<Array<{address:string,lastTs:number, unread?:number}>>([])
  const [addr, setAddr] = useState('')
  const [items, setItems] = useState<any[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const lastRef = useRef(0)
  const audioCtxRef = useRef<AudioContext|null>(null)

  const beep = () => {
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtxRef.current = ctx as any
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = 750
      o.connect(g); g.connect(ctx.destination)
      g.gain.setValueAtTime(0.001, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime+0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.25)
      o.start(); o.stop(ctx.currentTime+0.26)
    } catch {}
  }

  const parseJsonSafe = async (r: Response) => {
    const ct = r.headers.get('content-type') || ''
    if (!ct.includes('application/json')) throw new Error('server_not_json')
    return r.json()
  }

  const loadConvs = async () => {
    try {
      const headers: Record<string,string> = {}
      { const k = getApiKey(); if (k) headers['x-api-key'] = k }
      const r = await fetch(`${BACKEND_URL}/api/support/conversations`, { headers })
      if (!r.ok) throw new Error('conv_failed')
      const j = await parseJsonSafe(r)
      if (Array.isArray(j?.items)) {
        setList(prev => {
          const mapPrev = new Map(prev.map(x=>[x.address,x]))
          const next = j.items.map((it: any)=> ({...it, unread: 0}))
          // 保留未读计数
          for (const it of next) { const p = mapPrev.get(it.address); if (p) it.unread = p.unread || 0 }
          return next
        })
      }
    } catch {}
  }

  const loadMsgs = async () => {
    if (!addr) return
    try {
      const r = await fetch(`${BACKEND_URL}/api/support/messages?address=${addr}&since=${lastRef.current}`)
      if (!r.ok) throw new Error('load_failed')
      const j = await parseJsonSafe(r)
      if (Array.isArray(j?.items) && j.items.length>0) {
        const merged = [...items, ...j.items].sort((a:any,b:any)=> a.ts - b.ts)
        const seen = new Set<string>(); const uniq:any[] = []
        for (const it of merged) { const k = `${it.ts}:${it.address}:${it.message}`; if (!seen.has(k)) { seen.add(k); uniq.push(it) } }
        setItems(uniq)
        lastRef.current = Math.max(lastRef.current, ...uniq.map((x:any)=>x.ts))
        const incoming = j.items.filter((x:any)=> x.from==='user' || !x.from)
        if (!open || document.hidden) {
          if (incoming.length>0) { beep() }
        }
      }
    } catch {}
  }

  useEffect(()=>{ loadConvs(); const i=setInterval(loadConvs, 5000); return ()=>clearInterval(i) }, [])
  useEffect(()=>{ lastRef.current=0; setItems([]); if (addr) { loadMsgs(); const id=setInterval(loadMsgs, 4000); return ()=>clearInterval(id) } }, [addr])

  // 计算未读：当面板关闭时，来自用户的新消息计入对应会话
  useEffect(()=>{
    if (!open) return
    // 打开面板时清空总未读并清空当前会话未读
    setUnreadTotal(0)
    setList(prev => prev.map(x => x.address===addr ? ({...x, unread:0}) : x))
  }, [open, addr])

  // 轮询合并：提高未读统计准确性
  useEffect(()=>{
    const id = setInterval(async ()=>{
      try {
        const headers: Record<string,string> = {}
        { const k = getApiKey(); if (k) headers['x-api-key'] = k }
        const r = await fetch(`${BACKEND_URL}/api/support/conversations`, { headers })
        if (!r.ok) return
        const j = await r.json().catch(()=>null)
        if (!Array.isArray(j?.items)) return
        setList(prev => {
          const next = j.items.map((it:any)=> ({...it, unread: (prev.find(p=>p.address===it.address)?.unread) || 0}))
          const total = next.reduce((s,x)=> s + (x.unread||0), 0)
          setUnreadTotal(total)
          return next
        })
      } catch {}
    }, 6000)
    return ()=>clearInterval(id)
  }, [])

  const send = async () => {
    if (!addr || !text.trim()) return
    setBusy(true)
    try {
      const headers: Record<string,string> = { 'Content-Type':'application/json' }
      { const k = getApiKey(); if (k) headers['x-api-key'] = k }
      const r = await fetch(`${BACKEND_URL}/api/support/admin-message`, { method:'POST', headers, body: JSON.stringify({ to: addr, message: text.trim() }) })
      const j = await r.json().catch(()=>null)
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'send_failed')
      setText('')
      await loadMsgs()
      await loadConvs()
    } catch (e:any) { alert(e?.message || String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div style={{position:'fixed', right:16, bottom:90, zIndex:1000, display:'flex', flexDirection:'column', alignItems:'flex-end'}}>
      <button
        onClick={()=> setOpen(v=>!v)}
        aria-label="admin-chat-toggle"
        style={{ padding:'10px 14px', borderRadius:20, background: open ? '#0d9488' : '#1d4ed8', color:'#fff', border:'none', boxShadow:'0 6px 20px rgba(0,0,0,0.25)', cursor:'pointer', marginBottom: open?8:0 }}
      >
        客服聊天 { !open && unreadTotal>0 && (<span style={{marginLeft:8, background:'#ef4444', color:'#fff', borderRadius:999, padding:'2px 6px', fontSize:12}}>{unreadTotal}</span>) }
      </button>
      {open && (
        <div style={{ width:780, maxHeight:560, background:'#fff', borderRadius:16, boxShadow:'0 12px 32px rgba(2,6,23,0.4)', overflow:'hidden', border:'1px solid #e2e8f0' }}>
          <div style={{padding:'10px 14px', background:'linear-gradient(135deg,#6366f1,#2563eb,#0ea5e9)', color:'#fff'}}>
            <strong style={{fontSize:16}}>客服聊天（管理员）</strong>
          </div>
          <div style={{display:'flex'}}>
            <div style={{width:260, borderRight:'1px solid #e5e7eb', padding:10}}>
              <div style={{fontWeight:600, marginBottom:6}}>会话</div>
              <div style={{maxHeight:480, overflow:'auto'}}>
                {list.length===0 ? <div style={{padding:8, color:'#666'}}>暂无</div> : list.map((it)=> (
                  <div key={it.address} onClick={()=>{ setAddr(it.address); setList(prev=>prev.map(x=> x.address===it.address?({...x, unread:0}):x)); }} style={{padding:'8px 10px', cursor:'pointer', background: addr===it.address?'#eef2ff':'#fff', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div>
                      <div style={{fontWeight:600}}>{it.address.slice(0,6)}...{it.address.slice(-4)}</div>
                      <div style={{fontSize:12, color:'#64748b'}}>{new Date(it.lastTs*1000).toLocaleString()}</div>
                    </div>
                    {(it.unread||0)>0 && <span style={{background:'#ef4444', color:'#fff', borderRadius:999, padding:'2px 6px', fontSize:12}}>{it.unread}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div style={{flex:1, padding:10}}>
              <div style={{fontWeight:600, marginBottom:6}}>{addr ? `会话：${addr}` : '选择一个会话'}</div>
              <div className="chat-body" style={{maxHeight:480}}>
                {items.length===0 ? <div className="chat-empty">暂无消息</div> : items.map((it,idx)=> (
                  <div key={idx} className={`bubble ${it.from==='admin'?'me':'other'}`}>
                    <div className="bubble-time">{new Date(it.ts*1000).toLocaleString()}</div>
                    <div className="bubble-text">{it.message}</div>
                  </div>
                ))}
              </div>
              <div className="chat-input" style={{marginTop:10}}>
                <input placeholder="输入消息" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter' && text.trim() && !busy && addr) send() }} />
                <button className="btn-primary" disabled={!addr || busy || !text.trim()} onClick={send}>{busy?'发送中...':'发送'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
