import { useEffect } from 'react'
import ActivityCard from './ActivityCard'
import { usePools } from '../hooks/useContracts'
import { useTranslation } from 'react-i18next'

export default function ActivityList() {
  const { t } = useTranslation()
  const { pools, load, loading, error } = usePools()
  useEffect(() => { load() }, [load])
  if (error) return <div style={{color:'tomato'}}>{t('error')}：{error}</div>
  if (loading) return <div>{t('loading')}</div>
  if (!pools.length) return <div>{t('empty')}</div>
  return (
    <div>
      {pools.map((p) => (
        <div key={p.address}>
          <ActivityCard info={p} onRefresh={load} />
        </div>
      ))}
    </div>
  )
}
