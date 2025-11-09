import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

type Toast = { id: number; type: 'info'|'success'|'error'; text: React.ReactNode; timeout?: number }

type ToastCtx = {
  show: (text: React.ReactNode, type?: 'info'|'success'|'error', timeoutMs?: number) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('ToastProvider missing')
  return ctx
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(1)

  const show = useCallback((text: React.ReactNode, type: 'info'|'success'|'error' = 'info', timeoutMs = 3500) => {
    const id = idRef.current++
    setToasts(prev => [...prev, { id, type, text, timeout: timeoutMs }])
    if (timeoutMs > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), timeoutMs)
    }
  }, [])

  const api = useMemo(() => ({ show }), [show])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div style={{position:'fixed', right:16, top:16, display:'flex', flexDirection:'column', gap:8, zIndex:9999}}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type==='success' ? '#16a34a' : t.type==='error' ? '#dc2626' : '#334155',
            color:'#fff', padding:'10px 14px', borderRadius:8, boxShadow:'0 6px 20px rgba(0,0,0,0.15)'
          }}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
