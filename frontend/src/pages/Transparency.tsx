import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_RPC, FACTORY_ADDRESS, VRF_SUB_ID, VRF_COORDINATOR } from '../config'
import FactoryArtifact from '@abi/LuckyPoolFactory.json'
import { Contract, Interface, JsonRpcProvider, formatUnits } from 'ethers'

export default function Transparency() {
  const [items, setItems] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [consumers, setConsumers] = useState<string[]>([])
  const [balance, setBalance] = useState<string>('')

  useEffect(() => {
    (async () => {
      try {
        setError(null)
        if (!FACTORY_ADDRESS) return
        const provider = DEFAULT_RPC ? new JsonRpcProvider(DEFAULT_RPC) : new JsonRpcProvider()
        const iface = new Interface(FactoryArtifact.abi as any)
        const ev = iface.getEvent('PoolCreated')
        const topic0 = (ev as any).topicHash || (iface as any).getEventTopic?.('PoolCreated')
        const logs = await (provider as any).getLogs({ address: FACTORY_ADDRESS, topics: [topic0], fromBlock: 0 })
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

        // read VRF subscription consumers and balance
        if (VRF_COORDINATOR && VRF_SUB_ID) {
          const coordAbi = ['function getSubscription(uint64 subId) view returns (uint96 balance, uint64 reqCount, address owner, address[] consumers)']
          const coord = new Contract(VRF_COORDINATOR, coordAbi, provider)
          const sub = await coord.getSubscription(BigInt(VRF_SUB_ID))
          setConsumers(sub.consumers.map((a:string)=>a.toLowerCase()))
          try { setBalance(formatUnits(sub.balance, 18)) } catch { setBalance(String(sub.balance)) }
        }
      } catch (e:any) {
        setError(e.message || String(e))
      }
    })()
  }, [])

  return (
    <div>
      <h2>透明度面板</h2>
      <div style={{marginTop:8}}>
        Factory 合约：<a href={`https://testnet.bscscan.com/address/${FACTORY_ADDRESS}`} target="_blank" rel="noreferrer">{FACTORY_ADDRESS || '(未配置)'}</a>
      </div>
      <div style={{marginTop:4}}>
        VRF 订阅 ID：{VRF_SUB_ID || '(可在前端 .env 配置 VITE_VRF_SUB_ID)'}
      </div>
      {VRF_COORDINATOR && balance !== '' && (
        <div style={{marginTop:4}}>订阅余额（LINK）：{balance}</div>
      )}
      <div style={{marginTop:12}}>
        <strong>历史创建的活动</strong>
        {!items.length && <div style={{color:'#666', marginTop:6}}>暂无</div>}
        {items.map((it, idx) => (
          <div key={idx} style={{marginTop:8, padding:'8px 10px', border:'1px solid #eee', borderRadius:8}}>
            <div>Pool：<a href={`https://testnet.bscscan.com/address/${it.pool}`} target="_blank" rel="noreferrer">{it.pool}</a></div>
            <div>Min：{it.min}</div>
            <div>Max：{it.max}</div>
            <div>MetadataURI：<a href={it.metadataURI} target="_blank" rel="noreferrer">{it.metadataURI}</a></div>
            <div>SortOrder：{it.sortOrder}</div>
            {consumers.length > 0 && (
              <div>VRF 消费者：{ consumers.includes(String(it.pool).toLowerCase()) ? '已加入 ✅' : '未加入 ❌' }</div>
            )}
          </div>
        ))}
      </div>
      <div style={{marginTop:16, padding:'10px 12px', background:'#f8fafc', borderRadius:8}}>
        <strong>移动端访问指引</strong>
        <div style={{marginTop:6, color:'#334155', fontSize:14}}>
          1) 如果你在手机上，推荐使用 MetaMask 或 OKX App 打开本 dApp；
          <br/>2) 本地开发地址（http://localhost:5173）无法在手机上直接访问，建议先部署到公开 URL（例如 Vercel/Netlify/Cloudflare Pages），然后使用下方深链按钮跳转；
          <br/>3) 部署后可在前端 .env 配置 VITE_PUBLIC_URL 供深链使用。
        </div>
      </div>
      {error && <div style={{color:'tomato', marginTop:8}}>错误：{error}</div>}
    </div>
  )
}
