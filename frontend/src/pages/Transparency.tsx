import { useEffect, useState } from 'react'
import { DEFAULT_RPC, FACTORY_ADDRESS, BACKEND_URL, FACTORY_DEPLOY_BLOCK } from '../config'
import FactoryArtifact from '@abi/LuckyPoolFactory.json'
import { Interface, JsonRpcProvider } from 'ethers'
import { useTranslation } from 'react-i18next'

export default function Transparency() {
  const { t } = useTranslation()
  const [items, setItems] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<{ totalParticipations: number; totalRewardPaid: number; lastSync: number } | null>(null)

  useEffect(() => {
    (async () => {
      try {
        setError(null)
        if (!FACTORY_ADDRESS) return
        const provider = DEFAULT_RPC ? new JsonRpcProvider(DEFAULT_RPC) : new JsonRpcProvider()
        const iface = new Interface(FactoryArtifact.abi as any)
        const ev = iface.getEvent('PoolCreated')
        const topic0 = (ev as any).topicHash || (iface as any).getEventTopic?.('PoolCreated')
        const fromBlock = (Number(FACTORY_DEPLOY_BLOCK||0) > 0) ? Number(FACTORY_DEPLOY_BLOCK) : 0
        // 分段拉取，规避 BSC -32005 limit exceeded
        const getLogsBatched = async (
          prov: any,
          filter: { address: string, topics: (string|null)[] },
          opts?: { fromBlock?: number, toBlock?: number, batchSize?: number }
        ) => {
          const latest = opts?.toBlock ?? await prov.getBlockNumber()
          let start = Math.max(0, opts?.fromBlock ?? 0)
          const out: any[] = []
          let step = opts?.batchSize ?? 50_000
          while (start <= latest) {
            const end = Math.min(start + step, latest)
            try {
              const part = await prov.getLogs({ ...filter, fromBlock: start, toBlock: end })
              out.push(...part)
              start = end + 1
              if (step < 100_000) step = Math.min(100_000, Math.floor(step*1.5))
            } catch (e: any) {
              const msg = e?.message || ''
              const code = e?.code
              if (code === -32005 || /limit exceeded|block range|query timeout/i.test(msg)) {
                if (step > 50) { step = Math.max(50, Math.floor(step/2)); continue }
              }
              throw e
            }
          }
          return out
        }
        const logs = await getLogsBatched(provider, { address: FACTORY_ADDRESS, topics: [topic0] }, { fromBlock })
        const res: any[] = []
        for (const log of logs) {
          try {
            const p = iface.parseLog({ topics: log.topics, data: log.data }) as any
            const pool = String(p.args[0])
            const min = p.args[1]
            const max = p.args[2]
            const metadataURI = p.args[3]
            const sortOrder = Number(p.args[4])
            res.push({ pool, min: String(min), max: String(max), metadataURI, sortOrder })
          } catch {}
        }
        res.sort((a,b)=> a.sortOrder - b.sortOrder)
        setItems(res)

        // Load aggregated stats from backend (public)
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
      <div style={{marginTop:12}}>
        <strong>{t('transparency_current_pools')}</strong>
        {!items.length && <div style={{color:'#666', marginTop:6}}>暂无</div>}
        {items.map((it, idx) => (
          <div key={idx} style={{marginTop:8, padding:'8px 10px', border:'1px solid #eee', borderRadius:8}}>
            <div>Pool：<a href={`https://testnet.bscscan.com/address/${it.pool}`} target="_blank" rel="noreferrer">{it.pool}</a></div>
            <div>Min：{it.min}</div>
            <div>Max：{it.max}</div>
            <div>MetadataURI：<a href={it.metadataURI} target="_blank" rel="noreferrer">{it.metadataURI}</a></div>
            <div>SortOrder：{it.sortOrder}</div>
          </div>
        ))}
      </div>
      {error && <div style={{color:'tomato', marginTop:8}}>错误：{error}</div>}
    </div>
  )
}
