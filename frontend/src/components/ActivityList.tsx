import { useEffect, useRef } from 'react'
import ActivityCard from './ActivityCard'
import { usePools } from '../hooks/useContracts'
import { useTranslation } from 'react-i18next'

export default function ActivityList() {
  const { t } = useTranslation()
  const { pools, load, loading, error, errorKind, refreshSilent, refreshing, totalPools, cancelledCount, hiddenCount } = usePools()
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
    </div>
  )
}
