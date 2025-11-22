import { useEffect, useRef, useState } from 'react'
import ActivityCard from './ActivityCard'
import { usePools } from '../hooks/useContracts'
import { useTranslation } from 'react-i18next'
import { useWeb3 } from '../web3'

export default function ActivityList({ onRipple }: { onRipple?: (count: number) => void }) {
  const { t } = useTranslation()
  const { pools, load, loading, error, errorKind, refreshSilent, refreshing, totalPools, cancelledCount, hiddenCount } = usePools()
  const { account } = useWeb3()
  
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; load() }
  }, [load])

  useEffect(()=>{
    const id = setInterval(()=>{ refreshSilent() }, 60000)
    return ()=> clearInterval(id)
  }, [refreshSilent])

  const isInit = errorKind === 'init'
  const errorBanner = error ? (
    <div className="glass-error" style={{ padding: 20, background: 'rgba(255, 59, 48, 0.2)', borderRadius: 12, marginBottom: 20, color: 'white', backdropFilter: 'blur(10px)' }}> 
      <span>{t(error as any)}</span>
      <button
        style={{ marginLeft: 10, background: 'rgba(255,255,255,0.2)', border: 'none', padding: '5px 10px', borderRadius: 4, color: 'white', cursor: 'pointer' }}
        onClick={()=>{ isInit ? load() : location.reload() }}
      >{t('refresh')}</button>
    </div>
  ) : null

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ color: 'white', margin: 0, textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>{t('activities')}</h2>
        <button 
          onClick={() => { refreshSilent(); }} 
          disabled={refreshing}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '20px',
            padding: '8px 16px',
            color: 'white',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
          {refreshing ? t('refreshing') : t('refresh')}
        </button>
      </div>

      {errorBanner}
      
      {(!loading && pools.length===0) && (
        <div style={{ textAlign: 'center', color: 'white', marginTop: 50, fontSize: 18 }}>
          {t('empty')}
        </div>
      )}

      {(loading && pools.length===0) && (
        <div style={{ textAlign: 'center', color: 'white', marginTop: 50 }}>
          {t('loading')}...
        </div>
      )}

      {pools.map((p) => (
        <div key={p.address}>
          <ActivityCard info={p} onRefresh={refreshSilent} onParticipateSuccess={onRipple} />
        </div>
      ))}
      
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
