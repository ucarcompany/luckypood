import { useEffect, useMemo, useState } from 'react'
import { FACTORY_ADDRESS, DEFAULT_RPC, BACKEND_URL } from '../config'
import { JsonRpcProvider, Contract, BrowserProvider } from 'ethers'
import FactoryArtifact from '@abi/LuckyPoolFactory.json'
import { useWeb3 } from '../web3'

export default function DebugPanel(){
  const { chainIdHex } = useWeb3()
  const [rpcOk, setRpcOk] = useState<string>('pending')
  const [factoryOk, setFactoryOk] = useState<string>('pending')
  const [poolsCount, setPoolsCount] = useState<number | null>(null)

  useEffect(()=>{
    (async ()=>{
      if (DEFAULT_RPC) {
        try {
          const r = await fetch(DEFAULT_RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({jsonrpc:'2.0', id:1, method:'eth_blockNumber', params:[]}) })
          const j = await r.json().catch(()=>null)
          if (j && j.result) setRpcOk('ok')
          else setRpcOk('bad_response')
        } catch (e:any) {
          setRpcOk('failed: '+(e?.message||String(e)))
        }
      } else {
        setRpcOk('no_DEFAULT_RPC')
      }
    })()
  }, [])

  useEffect(()=>{
    (async ()=>{
      try {
        const provider = DEFAULT_RPC ? new JsonRpcProvider(DEFAULT_RPC) : (window as any).ethereum ? new BrowserProvider((window as any).ethereum) : null
        if (!provider) { setFactoryOk('no_provider'); return }
        if (!/^0x[0-9a-fA-F]{40}$/.test(FACTORY_ADDRESS||'')) { setFactoryOk('bad_address'); return }
        const factory = new Contract(FACTORY_ADDRESS, FactoryArtifact.abi, provider)
        const arr: string[] = await factory.getPools()
        setPoolsCount(arr.length)
        setFactoryOk('ok')
      } catch (e:any) {
        setFactoryOk('failed: '+(e?.message||String(e)))
      }
    })()
  }, [])

  return (
    <div className="card" style={{marginTop:12}}>
      <h3>诊断面板</h3>
      <div style={{fontSize:13, color:'#334155', lineHeight:1.7}}>
        <div>FACTORY_ADDRESS: <code>{FACTORY_ADDRESS || '(empty)'}</code></div>
        <div>DEFAULT_RPC: <code>{DEFAULT_RPC || '(empty)'}</code></div>
        <div>BACKEND_URL: <code>{BACKEND_URL || '(empty)'}</code></div>
        <div>Detected chainId: <code>{chainIdHex || '(unknown)'}</code></div>
        <div>RPC check: <code>{rpcOk}</code></div>
        <div>Factory getPools: <code>{factoryOk}</code>{poolsCount!=null && <span>，pools={poolsCount}</span>}</div>
        <div style={{marginTop:6}}>
          <button onClick={()=>{ localStorage.setItem('debug','0'); location.replace(location.pathname) }}>隐藏</button>
          <button style={{marginLeft:8}} onClick={()=>{ localStorage.setItem('debug','1'); location.reload() }}>刷新诊断</button>
        </div>
      </div>
    </div>
  )
}
