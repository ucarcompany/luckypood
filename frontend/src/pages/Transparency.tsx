import { useEffect, useState } from 'react'
import { BACKEND_URL } from '../config'
import { useTranslation } from 'react-i18next'

export default function Transparency() {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<{ totalParticipations: number; totalRewardPaid: number; lastSync: number } | null>(null)

  useEffect(() => {
    (async () => {
      try {
        setError(null)
        // 仅从后端读取聚合统计，移除链上扫描以避免限流
        if (BACKEND_URL) {
          try {
            const r = await fetch(`${BACKEND_URL}/api/stats`)
            if (r.ok) {
              const j = await r.json()
              setStats({ totalParticipations: Number(j.totalParticipations||0), totalRewardPaid: Number(j.totalRewardPaid||0), lastSync: Number(j.lastSync||0) })
            }
          } catch {}
        }
      } catch (e:any) {
        const raw = e?.message || String(e)
        // 统一转成更友好的提示
        if (/could not coalesce|limit exceeded|block range|query timeout/i.test(raw)) {
          setError('节点繁忙，正在同步区块数据，请1-2分钟后再试。')
        } else {
          setError(raw)
        }
      }
    })()
  }, [])

  return (
    <div>
      <h2>{t('transparency_title')}</h2>
      <div style={{marginTop:8}}>
        <div>{t('transparency_total_participations')}: {stats ? stats.totalParticipations : '...'}</div>
        <div style={{marginTop:4}}>{t('transparency_total_rewards')}: {stats ? stats.totalRewardPaid : '...'}</div>
        <div style={{marginTop:4}}>{t('transparency_last_sync')}: {stats?.lastSync ? new Date(stats.lastSync*1000).toLocaleString() : '...'}</div>
        <div style={{marginTop:4}}>{t('transparency_randomness_brief')}</div>
      </div>
      {error && <div style={{color:'tomato', marginTop:8}}>错误：{error}</div>}
    </div>
  )
}
