import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BACKEND_URL } from '../config'

export default function Chat({ pool, address }: { pool: string, address?: string | null }){
  const { t } = useTranslation()
  const [token, setToken] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [items, setItems] = useState<Array<{ ts:number, address:string, message:string }>>([])
  const lastTsRef = useRef(0)

  const doLogin = async () => {
    if (!address) return alert('Connect wallet')
    try {
      setBusy(true)
      const r1 = await fetch(`${BACKEND_URL}/api/chat/nonce?address=${address}`)
      const j1 = await r1.json()
      const nonce = j1.nonce
      const msg = `Lucky-pool Chat Login\nAddress: ${address.toLowerCase()}\nNonce: ${nonce}`
      const w: any = (window as any)
      const eth: any = w.ethereum || w.okxwallet?.ethereum || w.okxwallet
      if (!eth) { alert('No wallet'); return }
      const sig = await eth.request({ method: 'personal_sign', params: [msg, address] })
      const r2 = await fetch(`${BACKEND_URL}/api/chat/auth`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ address, signature: sig }) })
      const j2 = await r2.json()
      if (!j2.ok) throw new Error(j2.error || 'auth_failed')
      setToken(j2.token)
    } catch (e:any) { alert(e?.message || String(e)) }
    finally { setBusy(false) }
  }

  const send = async () => {
    if (!address) return
    const m = text.trim()
    if (!m) return
    setBusy(true)
    try {
      const r = await fetch(`${BACKEND_URL}/api/chat/message`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pool, address, token, message: m }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'send_failed')
      setText('')
      await load()
    } catch (e:any) { alert(e?.message || String(e)) }
    finally { setBusy(false) }
  }

  const load = async () => {
    try {
      const r = await fetch(`${BACKEND_URL}/api/chat/messages?pool=${pool}&since=${lastTsRef.current}`)
      const j = await r.json()
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
        }
      }
    } catch {}
  }

  useEffect(() => {
    const id = setInterval(() => { load() }, 10000)
    load()
    return () => clearInterval(id)
  }, [pool])

  return (
    <div className="card" style={{marginTop:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3 style={{margin:0}}>{t('chat_title')}</h3>
        {!token ? <button disabled={busy || !address} onClick={doLogin}>{t('chat_connect')}</button> : <span className="badge">OK</span>}
      </div>
      <div style={{maxHeight:240, overflow:'auto', background:'#f8fafc', marginTop:8, padding:'8px 10px', borderRadius:8}}>
        {items.length===0 ? <div style={{color:'#64748b', fontSize:12}}>...</div> : items.map((it,idx)=> (
          <div key={idx} style={{margin:'6px 0'}}>
            <div style={{fontSize:12, color:'#64748b'}}>{new Date(it.ts*1000).toLocaleString()} · {it.address.slice(0,6)}...{it.address.slice(-4)}</div>
            <div style={{whiteSpace:'pre-wrap'}}>{it.message}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex', gap:8, marginTop:8}}>
        <input style={{flex:1}} placeholder={t('chat_placeholder') || 'Say something...'} value={text} onChange={e=>setText(e.target.value)} />
        <button disabled={!token || busy || !text.trim()} onClick={send}>{t('chat_send')}</button>
      </div>
    </div>
  )
}
