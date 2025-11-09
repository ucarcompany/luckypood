import { useEffect, useRef } from 'react'
import ActivityCard from './ActivityCard'
import { usePools } from '../hooks/useContracts'
import { useTranslation } from 'react-i18next'

export default function ActivityList() {
  const { t } = useTranslation()
  const { pools, load, loading, error, refreshSilent, refreshing } = usePools()
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
  // 保持旧列表：不在 loading 时直接清空；只在首次没有数据且非加载中时显示 empty
  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
        <div style={{fontSize:12, color:'#64748b'}}>
          {loading ? t('loading') : refreshing ? t('refreshing') : ''}
        </div>
        <button disabled={loading || refreshing} onClick={load}>
          {loading || refreshing ? t('refreshing') : t('refresh')}
        </button>
      </div>
      {(!loading && pools.length===0) && <div>{t('empty')}</div>}
      {pools.map((p) => (
        <div key={p.address}>
          <ActivityCard info={p} onRefresh={refreshSilent} />
        </div>
      ))}
    </div>
  )
}
