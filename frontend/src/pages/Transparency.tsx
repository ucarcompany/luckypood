import { useEffect, useState } from 'react'
import { BACKEND_URL, DEFAULT_RPC, FACTORY_ADDRESS } from '../config'
import { Contract, JsonRpcProvider } from 'ethers'
import PoolArtifact from '@abi/LuckyPool.json'
import FactoryArtifact from '@abi/LuckyPoolFactory.json'
import { useTranslation } from 'react-i18next'

export default function Transparency() {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<{ totalParticipations: number; totalRewardPaid: number; lastSync: number } | null>(null)
  const [ongoing, setOngoing] = useState<string[]>([])

  useEffect(() => {
    (async () => {
      try {
        setError(null)
        // 仅从后端读取聚合统计，移除链上日志扫描
        if (BACKEND_URL) {
          try {
            const r = await fetch(`${BACKEND_URL}/api/stats`)
            if (r.ok) {
              const j = await r.json()
              setStats({ totalParticipations: Number(j.totalParticipations||0), totalRewardPaid: Number(j.totalRewardPaid||0), lastSync: Number(j.lastSync||0) })
            }
          } catch {}
        }

        // 读取“当前进行中”活动地址（仅地址列表，不扫日志）
        if (DEFAULT_RPC && FACTORY_ADDRESS) {
          try {
            const provider = new JsonRpcProvider(DEFAULT_RPC)
            const factory = new Contract(FACTORY_ADDRESS, FactoryArtifact.abi as any, provider)
            const pools: string[] = await (factory as any).getPools().catch(()=>[])
            const out: string[] = []
            // 控制并发，避免触发速率限制
            const limit = 5
            let i = 0
            const runNext = async (): Promise<void> => {
              if (i >= pools.length) return
              const idx = i++
              const addr = pools[idx]
              try {
                const pool = new Contract(addr, PoolArtifact.abi as any, provider)
                const drawn = await (pool as any).drawn().catch(()=>false)
                const cancelled = await (pool as any).cancelled().catch(()=>false)
                if (!drawn && !cancelled) out.push(addr)
              } catch {}
              await runNext()
            }
            const workers = Array.from({ length: Math.min(limit, pools.length) }, () => runNext())
            await Promise.all(workers)
            setOngoing(out)
          } catch {}
        }
      } catch (e:any) {
        // 统一为温和提示，不显示底层 RPC 细节
        setError('节点繁忙，正在同步区块数据，请稍后再试。')
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
      <div style={{marginTop:12}}>
        <strong>当前进行中活动</strong>
        {ongoing.length === 0 ? (
          <div style={{color:'#666', marginTop:6}}>暂无</div>
        ) : (
          <div style={{marginTop:6, whiteSpace:'pre-line', fontFamily:'monospace'}}>
            {ongoing.map((a,i)=> (<div key={i}>{a}</div>))}
          </div>
        )}
      </div>
      {error && <div style={{color:'#64748b', marginTop:8}}>提示：{error}</div>}
    </div>
  )
}
