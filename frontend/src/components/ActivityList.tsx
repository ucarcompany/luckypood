import { useEffect, useRef } from 'react'
import ActivityCard from './ActivityCard'
import { usePools } from '../hooks/useContracts'
import { useTranslation } from 'react-i18next'

export default function ActivityList() {
  const { t } = useTranslation()
  const { pools, load, loading, error, refreshSilent } = usePools()
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
  if (error) return <div style={{color:'tomato'}}>{t('error')}：{error}</div>
  if (loading) return <div>{t('loading')}</div>
  if (!pools.length) return <div>{t('empty')}</div>
  return (
    <div>
      <div style={{display:'flex', justifyContent:'flex-end', marginBottom:8}}>
        <button onClick={load}>{t('refresh')}</button>
      </div>
      {pools.map((p) => (
        <div key={p.address}>
          <ActivityCard info={p} onRefresh={refreshSilent} />
        </div>
      ))}
    </div>
  )
}
