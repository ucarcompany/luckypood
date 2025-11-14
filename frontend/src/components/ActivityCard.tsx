import { useEffect, useMemo, useState } from 'react'
import { Contract, BrowserProvider, formatUnits } from 'ethers'
import { useTranslation } from 'react-i18next'
import { useWeb3 } from '../web3'
import PoolArtifact from '@abi/LuckyPool.json'
import type { PoolInfo } from '../hooks/useContracts'
import Chat from './Chat'
import { useToast } from './ToastProvider'
import { postLog } from '../lib/log'
import { DEFAULT_RPC, BACKEND_URL } from '../config'
import { Interface, JsonRpcProvider } from 'ethers'

const ERC20_ABI = [
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' }
]

// uses PoolInfo type from hooks/useContracts

export default function ActivityCard({ info, onRefresh }: { info: PoolInfo, onRefresh?: () => void }) {
  const { t } = useTranslation()
  const { provider, account } = useWeb3()
  const toast = useToast()
  // 购买次数输入：使用字符串以允许用户在移动端删除为""，避免受最小值强制为 1 的控制
  const [countStr, setCountStr] = useState('1')
  const [decimals, setDecimals] = useState(18)
  const [userTickets, setUserTickets] = useState<number>(0)
  const [txBusy, setTxBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // 图片显示与容错：尝试主 URL -> 失败后自动回退到 HTTP/HTTPS 另一端口
  const [imgVisible, setImgVisible] = useState(true)
  const [imgSrc, setImgSrc] = useState<string | undefined>(info.meta?.image)
  const [imgTriedFallback, setImgTriedFallback] = useState(false)
  useEffect(() => {
    setImgVisible(true)
    setImgTriedFallback(false)
    setImgSrc(info.meta?.image)
  }, [info.meta?.image])

  const computeFallbackImage = (url?: string) => {
    if (!url) return undefined
    try {
      const u = new URL(url)
      const backend = BACKEND_URL ? new URL(BACKEND_URL) : undefined
      const host = backend?.hostname || u.hostname
      const path = u.pathname + (u.search || '')
      const attempts: string[] = []
      const add = (v: string) => { if (v !== url && !attempts.includes(v)) attempts.push(v) }
      if (u.protocol === 'https:') {
        // 主端口回退（backend port 优先）
        if (backend?.port && backend.port !== u.port) add(`http://${host}:${backend.port}${path}`)
        add(`http://${host}:4002${path}`)
        add(`http://${host}:4001${path}`)
      } else if (u.protocol === 'http:') {
        // 升级到 https 常用端口
        add(`https://${host}:4443${path}`)
        if (backend?.port && backend.port !== u.port) add(`${backend.protocol}//${host}:${backend.port}${path}`)
      }
      return attempts[0]
    } catch { return undefined }
  }
  // 进度：使用 decimals 换算成人类单位后再计算，避免因为整数 BigInt 截断导致 <1% 显示为 0%
  const progressRaw = useMemo(() => {
    if (info.maxFill === 0n) return 0
    try {
      // 将 BigInt 转成同一数量级：ratio = totalRaised / maxFill
      // 为防止精度损失，把它们放大到 1e6 再除（只做显示，不影响链上逻辑）
      const scale = 1_000_000n
      const ratioScaled = (info.totalRaised * scale) / info.maxFill
      const pct = Number(ratioScaled) / 10_000 // ratioScaled/1e6 *100 == /1e4
      return pct
    } catch { return 0 }
  }, [info.totalRaised, info.maxFill])
  const progress = isFinite(progressRaw) ? progressRaw : 0

  const remainingByUser = useMemo(() => Math.max(0, 10 - userTickets), [userTickets])
  const remainingByCap = useMemo(() => {
    if (info.maxFill === 0n || info.ticketPrice === 0n) return 0
    const left = info.maxFill > info.totalRaised ? (info.maxFill - info.totalRaised) : 0n
    return Number(left / info.ticketPrice)
  }, [info.maxFill, info.totalRaised, info.ticketPrice])
  const remaining = Math.min(remainingByUser, remainingByCap)
  const canRefund = useMemo(() => !info.minReached && !info.drawn && userTickets > 0, [info, userTickets])
  const startAt = info.meta?.startAt ? Number(info.meta.startAt) : info.createdAt
  const notStarted = startAt > 0 && Math.floor(Date.now()/1000) < startAt
  const deadlineTs = info.minReached ? (info.countdownStartAt + info.countdownSeconds) : 0
  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000))
  useEffect(() => { const id = setInterval(() => setNow(Math.floor(Date.now()/1000)), 1000); return () => clearInterval(id) }, [])
  const remainSec = Math.max(0, deadlineTs - now)
  const totalCountdown = info.minReached ? info.countdownSeconds : 0
  const elapsed = info.minReached ? Math.max(0, Math.min(totalCountdown, now - info.countdownStartAt)) : 0
  const pctCountdown = totalCountdown > 0 ? Math.round((elapsed / totalCountdown) * 100) : 0

  useEffect(() => {
    (async () => {
      try {
        if (!provider) return
        const erc20 = new Contract(info.stablecoin, ERC20_ABI, provider)
        const d = await erc20.decimals()
        setDecimals(Number(d))
      } catch {}
    })()
  }, [provider, info.stablecoin])

  useEffect(() => {
    (async () => {
      try {
        if (!provider || !account) return
        const pool = new Contract(info.address, PoolArtifact.abi, provider)
        const tickets: bigint = await pool.ticketsByUser(account)
        setUserTickets(Number(tickets))
      } catch {}
    })()
  }, [provider, account, info.address])

  const [status, setStatus] = useState<string>('')
  const [ticketRange, setTicketRange] = useState<{start:number,end:number} | null>(null)

  const count = useMemo(() => {
    const n = Number(countStr)
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.floor(n))
  }, [countStr])

  const participate = async () => {
  if (!provider || !account) return alert(t('please_connect'))
    if (count < 1 || count > 10) return
  if (count > remaining) { alert(t('exceed_limit')); return }
    setTxBusy(true)
    try {
      const signer = await (provider as BrowserProvider).getSigner()
      const pool = new Contract(info.address, PoolArtifact.abi, signer)
      const erc20 = new Contract(info.stablecoin, ERC20_ABI, signer)
      const amount = BigInt(count) * info.ticketPrice
  setStatus(t('status_approving'))
      const allowance: bigint = await erc20.allowance(account, info.address)
      if (allowance < amount) {
        const tx1 = await erc20.approve(info.address, amount)
        await tx1.wait()
      }
  setStatus(t('status_participating'))
      const tx2 = await pool.participate(count)
      const receipt = await tx2.wait()
      // refresh user tickets
      const tickets: bigint = await pool.ticketsByUser(account)
      setUserTickets(Number(tickets))
  setStatus(t('status_success'))
  toast.show(<span>{t('participate_success')}，<a href={`https://testnet.bscscan.com/tx/${tx2.hash}`} target="_blank" rel="noreferrer">{t('view_on_bscscan')}</a></span>, 'success')
      postLog({ type:'participate', pool: info.address, txHash: tx2.hash, address: account, count })
      onRefresh?.()
    } catch (e: any) {
      console.error(e)
      const raw = e?.shortMessage || e?.reason || e?.message || String(e)
      let friendly = raw
      if (/user denied|rejected|denied/i.test(raw)) {
        friendly = '您已取消交易\nYou cancelled the transaction.'
      } else if (/Transaction failed|could not coalesce/i.test(raw) || e?.code === 'UNKNOWN_ERROR') {
        friendly = '实在抱歉，小水滴正在努力搬运区块与区块链对接信息中，请您耐心等待，预计1~2分钟完成信息对接哦~\nSorry, the droplets are syncing with blockchain. Please wait about 1-2 minutes and retry.'
      } else if (/bal|insufficient|exceeds balance|transfer amount exceeds balance/i.test(raw)) {
        friendly = '余额不足，请先准备足够的稳定币再试~\nInsufficient token balance. Please top up the stablecoin and retry.'
      }
      setStatus(friendly)
      toast.show(friendly, 'error')
    } finally {
      setTxBusy(false)
    }
  }

  const refund = async () => {
    if (!provider || !account) return
    setTxBusy(true)
    try {
      const signer = await (provider as BrowserProvider).getSigner()
      const pool = new Contract(info.address, PoolArtifact.abi, signer)
      const tx = await pool.claimRefund()
      await tx.wait()
  toast.show(<span>{t('refund_success')}，<a href={`https://testnet.bscscan.com/tx/${tx.hash}`} target="_blank" rel="noreferrer">{t('view_on_bscscan')}</a></span>, 'success')
      postLog({ type:'refund', pool: info.address, txHash: tx.hash, address: account })
      onRefresh?.()
    } catch (e:any) {
      console.error(e); const raw = e?.shortMessage || e?.reason || e?.message || String(e)
      let friendly = raw
      if (/user denied|rejected|denied/i.test(raw)) {
        friendly = '您已取消交易\nYou cancelled the transaction.'
      } else if (/Transaction failed|could not coalesce/i.test(raw) || e?.code === 'UNKNOWN_ERROR') {
        friendly = '实在抱歉，小水滴正在努力搬运区块与区块链对接信息中，请您耐心等待，预计1~2分钟完成信息对接哦~\nSorry, the droplets are syncing with blockchain. Please wait about 1-2 minutes and retry.'
      } else if (/bal|insufficient|exceeds balance|transfer amount exceeds balance/i.test(raw)) {
        friendly = '余额不足，请先准备足够的稳定币再试~\nInsufficient token balance. Please top up the stablecoin and retry.'
      }
      toast.show(friendly, 'error')
    } finally { setTxBusy(false) }
  }

  const isReadyToDraw = useMemo(() => {
    if (info.drawn) return false
    if (!info.minReached) return false
    const deadline = info.countdownStartAt > 0 ? (info.countdownStartAt + info.countdownSeconds) : 0
    const reachedCap = info.maxFill > 0n && info.totalRaised >= info.maxFill
    const countdownEnded = deadline > 0 && now >= deadline
    return reachedCap || countdownEnded
  }, [info, now])

  const drawStatusMessage = () => {
    if (info.drawn) return t('draw_msg_drawn')
    if (!info.minReached) return t('draw_msg_fundraising')
    const deadline = info.countdownStartAt > 0 ? (info.countdownStartAt + info.countdownSeconds) : 0
    if (deadline > 0 && now < deadline && info.totalRaised < info.maxFill) return t('draw_msg_countdown')
    // 兜底：请求中或其他合约限制
    return t('draw_msg_generic')
  }

  const extractPeriod = (title?: string): number | null => {
    if (!title) return null
    const zh = /第\s*(\d+)\s*期/.exec(title)
    if (zh) return Number(zh[1])
    const en = /Period\s*(\d+)/i.exec(title)
    if (en) return Number(en[1])
    return null
  }
  const period = extractPeriod(info.meta?.title)

  const tryDraw = async () => {
    if (!provider) return
    if (!isReadyToDraw) { alert(drawStatusMessage()); return }
    setTxBusy(true)
    try {
      const signer = await (provider as BrowserProvider).getSigner()
      const pool = new Contract(info.address, PoolArtifact.abi, signer)
      const tx = await pool.tryDrawIfReady()
      await tx.wait()
  toast.show(<span>{t('draw_request_submitted')}：<a href={`https://testnet.bscscan.com/tx/${tx.hash}`} target="_blank" rel="noreferrer">{t('view_on_bscscan')}</a></span>, 'success')
      postLog({ type:'tryDraw', pool: info.address, txHash: tx.hash, address: account || undefined })
      onRefresh?.()
    } catch (e:any) {
      console.error(e); const raw = e?.shortMessage || e?.reason || e?.message || String(e)
      let friendly = drawStatusMessage()
      if (/user denied|rejected|denied/i.test(raw)) {
        friendly = '您已取消交易\nYou cancelled the transaction.'
      } else if (/Transaction failed|could not coalesce/i.test(raw) || e?.code === 'UNKNOWN_ERROR') {
        friendly = '实在抱歉，小水滴正在努力搬运区块与区块链对接信息中，请您耐心等待，预计1~2分钟完成信息对接哦~\nSorry, the droplets are syncing with blockchain. Please wait about 1-2 minutes and retry.'
      } else if (/bal|insufficient|exceeds balance|transfer amount exceeds balance/i.test(raw)) {
        friendly = '余额不足，请先准备足够的稳定币再试~\nInsufficient token balance. Please top up the stablecoin and retry.'
      }
      toast.show(friendly, 'error')
    } finally { setTxBusy(false) }
  }

  // 计算当前账号的“票号范围”（基于事件首次出现顺序 + 当前 ticketsByUser 计数）
  useEffect(() => {
    (async () => {
      try {
        if (!account) { setTicketRange(null); return }
        const readProvider = DEFAULT_RPC ? new JsonRpcProvider(DEFAULT_RPC) : provider
        if (!readProvider) return
        const iface = new Interface(PoolArtifact.abi as any)
        const ev = iface.getEvent('Participated')
        const topic0 = (ev as any).topicHash || (iface as any).getEventTopic?.('Participated')
        // batched getLogs to avoid -32005 on BSC RPC
        const getLogsBatched = async (prov: any, filter: any, fromBlock = 0) => {
          const latest = await prov.getBlockNumber()
          let start = Math.max(0, fromBlock)
          let step = 50_000
          const out: any[] = []
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
        const logs = await getLogsBatched(readProvider, { address: info.address, topics: [topic0] }, 0)
        const firstSeen: string[] = []
        const seen = new Set<string>()
        for (const log of logs) {
          try {
            const parsed = iface.parseLog({ topics: log.topics, data: log.data }) as any
            const user = parsed && parsed.args ? String(parsed.args[0]).toLowerCase() : ''
            if (!user) continue
            if (!seen.has(user)) { seen.add(user); firstSeen.push(user) }
          } catch {}
        }
        // 获取每个地址当前票数
        const pool = new Contract(info.address, PoolArtifact.abi, readProvider)
        const counts: number[] = []
        for (const addr of firstSeen) {
          const c: bigint = await (pool as any).ticketsByUser(addr)
          counts.push(Number(c))
        }
        let cursor = 0
        let start = 0
        let end = 0
        for (let i=0;i<firstSeen.length;i++){
          const addr = firstSeen[i]
          const cnt = counts[i]
          if (cnt <= 0) continue
          const s = cursor + 1
          const e = cursor + cnt
          if (addr.toLowerCase() === account.toLowerCase()) { start = s; end = e; break }
          cursor = e
        }
        if (start>0 && end>=start) setTicketRange({ start, end })
        else setTicketRange(null)
      } catch {
        setTicketRange(null)
      }
    })()
  }, [account, provider, info.address])
  return (
    <div className={`card ${expanded ? 'expanded' : ''}`} style={{padding:16, marginBottom:16}}>
      <div className="head-row clickable" onClick={()=> setExpanded(v=>!v)}>
        {imgSrc && imgVisible ? (
          <img
            className="thumb"
            src={imgSrc}
            alt="banner"
            onLoad={() => setImgVisible(true)}
            onError={() => {
              if (!imgTriedFallback) {
                const alt = computeFallbackImage(imgSrc)
                if (alt && alt !== imgSrc) { setImgTriedFallback(true); setImgSrc(alt); setImgVisible(true); return }
              }
              setImgVisible(false)
            }}
          />
        ) : (
          <div className="thumb placeholder">{t('noImage')}</div>
        )}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
            <div style={{flex:1,minWidth:0}}>
              <div className="card-title" style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <span>{info.meta?.title || t('activities')}</span>
                {info.sortOrder!=null && <span className="pill">#{info.sortOrder}</span>}
              </div>
              {info.meta?.description && <div className="card-desc" style={{marginTop:4}} title={info.meta.description}>{info.meta.description}</div>}
            </div>
            {info.drawn ? <span className="badge">{t('drawn')}</span> : (notStarted ? <span className="badge">{t('not_started')}</span> : (info.minReached ? <span className="badge">{t('countdown')}</span> : <span className="badge">{t('fundraising')}</span>))}
          </div>
          <div style={{marginTop:6, fontSize:12, color:'#64748b'}}>
            <span style={{userSelect:'none'}}>{expanded ? t('show_less') : t('show_more')}</span>
            <span style={{marginLeft:6, display:'inline-block', transition:'transform .2s', transform:`rotate(${expanded?180:0}deg)`}}>▾</span>
          </div>
        </div>
      </div>
  <div style={{marginTop:10,color:'#334155',fontSize:14}}>{t('progress')}: {progress.toFixed(2)}%</div>
      <div className="progress" style={{marginTop:6}}>
        <div style={{width:`${Math.min(progress,100)}%`, ['--w' as any]:`${Math.min(progress,100)}%`}} />
      </div>
      <div style={{display:'flex', gap:16, marginTop:14, color:'#64748b', fontSize:14, flexWrap:'wrap'}}>
        <span>{t('raised')}：{formatUnits(info.totalRaised, decimals)}</span>
        <span>{t('min')}：{formatUnits(info.minFill, decimals)}</span>
        <span>{t('max')}：{formatUnits(info.maxFill, decimals)}</span>
        <span>{t('tickets')}：{info.totalTickets}</span>
        {import.meta.env.DEV && !imgVisible && (<span style={{color:'#ef4444'}}>imgHidden(failed)</span>)}
      </div>
      {notStarted && (()=>{
        const totalPre = Math.max(1, startAt - info.createdAt) // 避免除0
        const elapsedPre = Math.min(totalPre, Math.max(0, now - info.createdAt))
        const pctPre = Math.round(elapsedPre / totalPre * 100)
        const remainPre = Math.max(0, startAt - now)
        return (
          <div style={{display:'flex', alignItems:'center', gap:12, marginTop:10}}>
            <svg width="46" height="46" viewBox="0 0 36 36" aria-label="pre-start-countdown">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${2*Math.PI*15.5}`} strokeDashoffset={`${2*Math.PI*15.5*(1-pctPre/100)}`}
                style={{transform:'rotate(-90deg)', transformOrigin:'50% 50%', transition:'stroke-dashoffset .6s ease'}} />
              <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="8" fill="#334155">{pctPre}%</text>
            </svg>
            <div style={{color:'#334155'}}>{t('start_in')}：{`${Math.floor(remainPre/3600)}h ${Math.floor((remainPre%3600)/60)}m ${remainPre%60}s`}</div>
          </div>
        )
      })()}
      {info.minReached && !info.drawn && !notStarted && (
        <div style={{display:'flex', alignItems:'center', gap:12, marginTop:10}}>
          <svg width="46" height="46" viewBox="0 0 36 36" aria-label="countdown">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${2*Math.PI*15.5}`} strokeDashoffset={`${2*Math.PI*15.5*(1-pctCountdown/100)}`}
              style={{transform:'rotate(-90deg)', transformOrigin:'50% 50%', transition:'stroke-dashoffset .6s ease'}} />
            <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="8" fill="#334155">{pctCountdown}%</text>
          </svg>
          <div style={{color:'#334155'}}>{t('countdown_left')}：{`${Math.floor(remainSec/3600)}h ${Math.floor((remainSec%3600)/60)}m ${remainSec%60}s`}</div>
        </div>
      )}
  <div className="actions" style={{marginTop:12}} onClick={(e)=> e.stopPropagation()}>
  <label>{t('count')}：</label>
    <input
      className="amount-input"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder="1"
      value={countStr}
      onChange={e => {
        const v = e.target.value
        // 仅允许数字与空串（便于删除重输）
        if (/^\d*$/.test(v)) setCountStr(v)
      }}
      onBlur={() => {
        // 失焦时进行范围归一：空串 -> 1；并限制在 [1, remaining]
        let v = count
        if (v < 1) v = 1
        if (v > Math.max(1, remaining)) v = Math.max(1, remaining)
        setCountStr(String(v))
      }}
    />
  <button className="btn-primary" disabled={!account || txBusy || remaining===0 || notStarted || count<1 || count>remaining} onClick={participate}>{t('participate')}</button>
        <button disabled={!canRefund || txBusy} onClick={refund}>{t('refund')}</button>
        <button disabled={txBusy || !isReadyToDraw} title={!isReadyToDraw ? drawStatusMessage() : undefined} onClick={tryDraw}>{t('tryDraw')}</button>
      </div>
      {status && <div style={{marginTop:8, fontSize:12, color:'#444'}}>{status}</div>}
      {ticketRange && (
  <div style={{marginTop:6, fontSize:12, color:'#555'}}>{t('your_ticket_range')}：{ticketRange.start} - {ticketRange.end}</div>
      )}
      {info.winner && info.winner !== '0x0000000000000000000000000000000000000000' && (
        <div style={{marginTop:12, borderRadius:12, padding:'16px 18px', color:'#fff', background:'linear-gradient(135deg,#7c3aed,#4338ca,#2563eb,#06b6d4)', boxShadow:'0 8px 24px rgba(2,6,23,.25)'}}>
          <div style={{fontSize:22, fontWeight:800}}>
            {(t('winner_banner_title_zh') || '恭喜中奖！')} / {(t('winner_banner_title_en') || 'Congratulations!')}
          </div>
          <div style={{marginTop:6, fontSize:14}}>
            {period!=null && <span>{t('period_label_zh', { n: period })} / {t('period_label_en', { n: period })}</span>}
            <span style={{marginLeft:period!=null?12:0}}>{t('winner')}：{info.winner.slice(0,6)}...{info.winner.slice(-4)}</span>
          </div>
        </div>
      )}
      {/* 简易聊天模块 */}
      <Chat pool={info.address} address={account || undefined} />
    </div>
  )
}
