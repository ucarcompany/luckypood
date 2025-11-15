import { useEffect, useRef, useState, useMemo } from 'react'
import ActivityCard from './ActivityCard'
import { usePools } from '../hooks/useContracts'
import { useTranslation } from 'react-i18next'
import SupportChat from './SupportChat'
import { useWeb3 } from '../web3'

export default function ActivityList() {
  const { t } = useTranslation()
  const { pools, load, loading, error, errorKind, refreshSilent, refreshing, totalPools, cancelledCount, hiddenCount } = usePools()
  const { account } = useWeb3()
  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const audioCtxRef = useRef<AudioContext|null>(null)
  const beep = () => {
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtxRef.current = ctx as any
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = 880
      o.connect(g); g.connect(ctx.destination)
      g.gain.setValueAtTime(0.001, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime+0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.25)
      o.start(); o.stop(ctx.currentTime+0.26)
    } catch {}
  }
  const showDebug = (() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('debug') === '1' || localStorage.getItem('debug') === '1'
  })()
  const first = useRef(true)
  // 初始加载
  useEffect(() => {
    if (first.current) { first.current = false; load() }
  }, [load])
  // 定时后台静默刷新：60 秒一次，只在成功时更新 UI（逻辑在 hook 内实现）
  useEffect(()=>{
    const id = setInterval(()=>{ refreshSilent() }, 60000)
    return ()=> clearInterval(id)
  }, [refreshSilent])
  // 错误信息改为非阻塞显示，让已有池仍可展示 & 用户能点击刷新
  const isInit = errorKind === 'init'
  const errorBanner = error ? (
    <div className={`provider-error ${isInit ? 'fade-in' : ''}`}> 
      <div className="water-pulse" />
      <span>{t(error as any)}</span>
      {isInit && (
        <button
          style={{marginLeft:'auto'}}
          onClick={()=>{
            // 强制重新尝试：调用 load() 并清空本地 debug 切换缓存可选
            load()
          }}
        >{t('refresh')}</button>
      )}
      {!isInit && (
        <button
          style={{marginLeft:'auto'}}
          onClick={()=>{ location.reload() }}
        >{t('refresh')}</button>
      )}
    </div>
  ) : null
  // 保持旧列表：不在 loading 时直接清空；只在首次没有数据且非加载中时显示 empty
  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
        <div style={{fontSize:12, color:'#64748b'}}>
          {loading ? t('loading') : refreshing ? t('refreshing') : ''}
        </div>
      </div>
      {errorBanner}
      {(!loading && pools.length===0) && (
        <div style={{fontSize:13, color:'#475569'}} className="fade-in">
          {t('empty')}
          {showDebug && (
            <div style={{marginTop:4, lineHeight:1.4}}>
              <div>totalPools={totalPools}</div>
              <div>cancelled={cancelledCount}</div>
              <div>hidden={hiddenCount}</div>
              <div>filteredActive={pools.length}</div>
            </div>
          )}
        </div>
      )}
      {/* Skeleton 占位：首次加载或 provider 初始化阶段且无池时显示 */}
      {(loading && pools.length===0) && (
        <div className="provider-skeleton">
          {Array.from({ length: 4 }).map((_,i)=>(<div key={i} className="sk-card" />))}
        </div>
      )}
      {pools.map((p) => (
        <div key={p.address}>
          <ActivityCard info={p} onRefresh={refreshSilent} />
        </div>
      ))}
      {/* 固定浮动刷新按钮（右下角） */}
      <button
        onClick={load}
        disabled={loading || refreshing}
        aria-label="refresh"
        style={{
          position:'fixed', right:16, bottom:16, zIndex:1000,
          padding:'10px 14px', borderRadius:20,
          background:'#2563eb', color:'#fff', border:'none',
          boxShadow:'0 6px 20px rgba(37,99,235,0.35)',
          opacity:(loading||refreshing)?0.7:1,
          cursor:(loading||refreshing)?'not-allowed':'pointer'
        }}
      >
        🔄 {loading || refreshing ? t('refreshing') : t('refresh')}
      </button>
      {/* 悬浮客服入口（与刷新按钮并列，略向上避免遮挡） */}
      {(
        <div
          style={{
            position:'fixed', right:16, bottom:90, zIndex:1000,
            display:'flex', flexDirection:'column', alignItems:'flex-end'
          }}
        >
          <button
            onClick={()=> setChatOpen(v=>!v)}
            aria-label="chat-toggle"
            style={{
              padding:'10px 14px', borderRadius:20,
              background: chatOpen ? '#0d9488' : '#1d4ed8',
              color:'#fff', border:'none',
              boxShadow:'0 6px 20px rgba(0,0,0,0.25)',
              cursor:'pointer', marginBottom: chatOpen?8:0
            }}
          >
            💬 {chatOpen ? t('chat_close') : t('chat_open')}
            {!chatOpen && unread>0 && (
              <span style={{marginLeft:8, background:'#ef4444', color:'#fff', borderRadius:999, padding:'2px 6px', fontSize:12}}>{unread}</span>
            )}
          </button>
          {chatOpen && (
            <div
              style={{
                width:380, maxHeight:560,
                background:'#fff', borderRadius:16,
                boxShadow:'0 12px 32px rgba(2,6,23,0.4)',
                overflow:'hidden', border:'1px solid #e2e8f0'
              }}
            >
              <div style={{padding:'10px 14px', background:'linear-gradient(135deg,#6366f1,#2563eb,#0ea5e9)', color:'#fff'}}>
                <strong style={{fontSize:16}}>{t('chat_title')}</strong>
              </div>
              <div style={{padding:12}}>
                <SupportChat
                  address={account || undefined}
                  open={chatOpen}
                  onUnreadChange={(n)=>{ if (n>unread) beep(); setUnread(n) }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
