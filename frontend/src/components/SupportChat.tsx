import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BACKEND_URL } from '../config'

type Props = {
  address?: string | null
  open?: boolean
  onUnreadChange?: (n: number) => void
}

export default function SupportChat({ address, open = true, onUnreadChange }: Props){
  const { t } = useTranslation()
  const [token, setToken] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [items, setItems] = useState<Array<{ ts:number, from?:string, address:string, message:string }>>([])
  const lastTsRef = useRef(0)
  const [err, setErr] = useState<string>('')
  const unreadRef = useRef(0)

  const parseJsonSafe = async (r: Response) => {
    const ct = r.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      const txt = await r.text().catch(()=> '')
      throw new Error('server_not_json: ' + (txt?.slice(0,120) || ''))
    }
    return r.json()
  }

  const doLogin = async () => {
    if (!address) { setErr('请先连接钱包'); return }
    try {
      setBusy(true)
      const r1 = await fetch(`${BACKEND_URL}/api/support/nonce?address=${address}`)
      let j1: any = null
      try { j1 = await parseJsonSafe(r1) } catch { /* ignore */ }
      if (!r1.ok || !j1?.nonce) throw new Error('nonce_failed')
      const nonce = j1.nonce
      const msg = `Lucky-pool Support Chat Login\nAddress: ${address.toLowerCase()}\nNonce: ${nonce}`
      const w: any = (window as any)
      const eth: any = w.ethereum || w.okxwallet?.ethereum || w.okxwallet
      if (!eth) { setErr('未检测到钱包插件'); return }
      // 兼容不同钱包的 personal_sign 参数顺序/编码差异
      const toHex = (s: string) => '0x' + Array.from(new TextEncoder().encode(s)).map(b=>b.toString(16).padStart(2,'0')).join('')
      let sig: string | null = null
      const attempts: Array<() => Promise<string>> = [
        // personal_sign 常见参数顺序与编码差异
        () => eth.request({ method: 'personal_sign', params: [msg, address] }),
        () => eth.request({ method: 'personal_sign', params: [address, msg] }),
        () => eth.request({ method: 'personal_sign', params: [toHex(msg), address] }),
        () => eth.request({ method: 'personal_sign', params: [address, toHex(msg)] }),
        // eth_sign 作为兜底：大多数钱包已禁用，但尝试以兼容部分实现
        () => eth.request({ method: 'eth_sign', params: [address, toHex(msg)] }),
        () => eth.request({ method: 'eth_sign', params: [address, msg] })
      ]
      for (const fn of attempts) {
        try { sig = await fn(); if (sig) break } catch { /* try next */ }
      }
      if (!sig) throw new Error('wallet_sign_failed')
      const r2 = await fetch(`${BACKEND_URL}/api/support/auth`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ address, signature: sig }) })
      let j2: any = null
      try { j2 = await parseJsonSafe(r2) } catch { /* ignore */ }
      if (!r2.ok || !j2?.ok) throw new Error(j2?.error || 'auth_failed')
      if (!j2.ok) throw new Error(j2.error || 'auth_failed')
      setToken(j2.token)
      setErr('')
    } catch (e:any) { setErr(e?.message || String(e)) }
    finally { setBusy(false) }
  }

  const send = async () => {
    if (!address) return
    const m = text.trim()
    if (!m) return
    setBusy(true)
    try {
      const r = await fetch(`${BACKEND_URL}/api/support/message`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ address, token, message: m }) })
      if (!r.ok) throw new Error('send_failed')
      const j = await parseJsonSafe(r)
      if (!j.ok) throw new Error(j.error || 'send_failed')
      setText('')
      await load()
    } catch (e:any) { setErr(e?.message || String(e)) }
    finally { setBusy(false) }
  }

  const load = async () => {
    try {
      const r = await fetch(`${BACKEND_URL}/api/support/messages?address=${address||''}&since=${lastTsRef.current}`)
      if (!r.ok) throw new Error('load_failed')
      const j = await parseJsonSafe(r)
      if (Array.isArray(j.items)) {
        if (j.items.length > 0) {
          const merged = [...items, ...j.items]
          merged.sort((a,b)=> a.ts - b.ts)
          const uniq: any[] = []
          const seen = new Set<string>()
          for (const it of merged) {
            const k = `${it.ts}:${it.address}:${it.message}`
            if (!seen.has(k)) { seen.add(k); uniq.push(it as any) }
          }
          setItems(uniq as any)
          lastTsRef.current = Math.max(lastTsRef.current, ...uniq.map((x:any)=>x.ts))
          // 统计未读：仅当窗口关闭或未打开时统计来自 admin 的新消息
          const newly = j.items.filter((x:any)=> x.from === 'admin')
          if (newly.length > 0) {
            if (!open) { unreadRef.current += newly.length; onUnreadChange?.(unreadRef.current) }
          }
        }
      }
      setErr('')
    } catch (e:any) {
      // 服务不可用/HTML 回来时不弹窗，转为组件内提示
      setErr(e?.message || 'service_unavailable')
    }
  }

  useEffect(() => {
    if (!address) return
    const id = setInterval(() => { load() }, 5000)
    load()
    return () => clearInterval(id)
  }, [address, open])

  // 打开时清空未读
  useEffect(()=>{
    if (open) { unreadRef.current = 0; onUnreadChange?.(0) }
  }, [open, onUnreadChange])

  return (
    <div>
      <div className="chat-header">
        <div className="chat-title">{t('chat_title')}</div>
        {!token ? <button className="btn-primary" disabled={busy || !address} onClick={doLogin}>{t('chat_connect')}</button> : <span className="badge">OK</span>}
      </div>
      {err && (
        <div className="chat-error">{err.includes('server_not_json') ? '服务暂不可用（返回了 HTML），请稍后重试' : err}</div>
      )}
      <div className="chat-body">
        {items.length===0 ? <div className="chat-empty">暂无消息</div> : items.map((it,idx)=> (
          <div key={idx} className={`bubble ${it.from==='admin'?'other':'me'}`}>
            <div className="bubble-time">{new Date(it.ts*1000).toLocaleString()}</div>
            <div className="bubble-text">{it.message}</div>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input placeholder={t('chat_placeholder') || 'Say something...'} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter' && text.trim() && !busy && token) send() }} />
        <button className="btn-primary" disabled={!token || busy || !text.trim()} onClick={send}>{t('chat_send')}</button>
      </div>
    </div>
  )
}
