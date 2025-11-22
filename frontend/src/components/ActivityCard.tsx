import { useEffect, useMemo, useState } from 'react'
import { Contract, formatUnits } from 'ethers'
import { useTranslation } from 'react-i18next'
import { useWeb3 } from '../web3'
import PoolArtifact from '@abi/LuckyPool.json'
import type { PoolInfo } from '../hooks/useContracts'
import { useToast } from './ToastProvider'
import { postLog } from '../lib/log'
import { GlassCard, GlassButton, ProgressBar, CardTitle, CardImage } from './GlassCard'
import styled from 'styled-components'

const ERC20_ABI = [
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' }
]

const Input = styled.input`
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 8px 12px;
  color: #333;
  width: 60px;
  font-size: 14px;
  outline: none;
  text-align: center;
  
  &:focus {
    border-color: #5856d6;
    background: white;
  }
`;

const StatusBadge = styled.span<{ status: 'fundraising' | 'countdown' | 'ended' | 'pending' }>`
  background: ${({ status }) => {
    switch (status) {
      case 'fundraising': return 'rgba(0,122,255,0.12)';
      case 'countdown': return 'rgba(255,149,0,0.18)';
      case 'ended': return 'rgba(142,142,147,0.15)';
      case 'pending': return 'rgba(255,204,0,0.18)';
      default: return 'rgba(255,255,255,0.15)';
    }
  }};
  color: ${({ status }) => {
    switch (status) {
      case 'fundraising': return '#007aff';
      case 'countdown': return '#ff9500';
      case 'ended': return '#8e8e93';
      case 'pending': return '#cc8600';
      default: return '#fff';
    }
  }};
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .5px;
  backdrop-filter: blur(6px);
`;

export default function ActivityCard({ info, onRefresh, onParticipateSuccess }: { info: PoolInfo, onRefresh?: () => void, onParticipateSuccess?: (count: number) => void }) {
  const { t } = useTranslation()
  const { provider, account } = useWeb3()
  const toast = useToast()
  const [countStr, setCountStr] = useState('1')
  const [decimals, setDecimals] = useState(18)
  const [userTickets, setUserTickets] = useState<number>(0)
  const [txBusy, setTxBusy] = useState(false)
  
  // Image logic
  const [imgSrc, setImgSrc] = useState<string | undefined>(info.meta?.image)
  useEffect(() => {
    setImgSrc(info.meta?.image || 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?q=80&w=2070&auto=format&fit=crop')
  }, [info.meta?.image])

  // Progress logic
  const progressRaw = useMemo(() => {
    if (info.maxFill === 0n) return 0
    try {
      const scale = 1_000_000n
      const ratioScaled = (info.totalRaised * scale) / info.maxFill
      const pct = Number(ratioScaled) / 10_000 
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
  const nowSec = Math.floor(Date.now()/1000)
  const notStarted = startAt > 0 && nowSec < startAt
  const countdownStarted = info.minReached && info.countdownStartAt > 0 && nowSec >= info.countdownStartAt && !info.drawn
  const countdownEndAt = countdownStarted ? (info.countdownStartAt + info.countdownSeconds) : undefined
  const fundraising = !notStarted && !countdownStarted && !info.drawn
  const countdownActive = countdownStarted && countdownEndAt && nowSec < countdownEndAt
  const countdownLeftSec = countdownActive ? (countdownEndAt! - nowSec) : 0
  const formatLeft = (secs: number) => {
    const h = Math.floor(secs/3600)
    const m = Math.floor((secs%3600)/60)
    const s = Math.floor(secs%60)
    return `${h}h ${m}m ${s}s`
  }

  useEffect(() => {
    (async () => {
      try {
        if (!provider) return
        const erc20 = new Contract(info.stablecoin, ERC20_ABI, provider)
        const d = await erc20.decimals()
        setDecimals(Number(d))
        if (account) {
          const pool = new Contract(info.address, PoolArtifact.abi, provider)
          const u = await pool.userInfo(account)
          setUserTickets(Number(u.ticketsPurchased))
        }
      } catch (e) { console.error(e) }
    })()
  }, [provider, account, info.address, info.stablecoin, txBusy])

  const handleParticipate = async () => {
    if (!provider || !account) return toast.show(t('connect_wallet'), 'error')
    const count = parseInt(countStr)
    if (isNaN(count) || count <= 0) return toast.show(t('invalid_amount'), 'error')
    
    setTxBusy(true)
    try {
      const signer = await provider.getSigner()
      const pool = new Contract(info.address, PoolArtifact.abi, signer)
      const cost = info.ticketPrice * BigInt(count)
      
      const erc20 = new Contract(info.stablecoin, ERC20_ABI, signer)
      const allowance = await erc20.allowance(account, info.address)
      if (allowance < cost) {
        const txApprove = await erc20.approve(info.address, cost)
        await txApprove.wait()
      }
      
      const tx = await pool.buyTickets(count)
      await tx.wait()
      
      toast.show(t('success'), 'success')
      postLog({ type: 'participate', pool: info.address, count, txHash: tx.hash })
      
      if (onRefresh) onRefresh()
      if (onParticipateSuccess) onParticipateSuccess(count)
    } catch (err: any) {
      console.error(err)
      toast.show(err.reason || err.message || 'Error', 'error')
    } finally {
      setTxBusy(false)
    }
  }

  const handleRefund = async () => {
    if (!provider || !account) return
    setTxBusy(true)
    try {
      const signer = await provider.getSigner()
      const pool = new Contract(info.address, PoolArtifact.abi, signer)
      const tx = await pool.refund()
      await tx.wait()
      toast.show(t('refund_success'), 'success')
      postLog({ type: 'refund', pool: info.address, txHash: tx.hash })
      if (onRefresh) onRefresh()
    } catch (err: any) {
      toast.show(err.reason || err.message, 'error')
    } finally {
      setTxBusy(false)
    }
  }

  const handleDraw = async () => {
    if (!provider || !account) return
    setTxBusy(true)
    try {
      const signer = await provider.getSigner()
      const pool = new Contract(info.address, PoolArtifact.abi, signer)
      const tx = await pool.drawWinner()
      await tx.wait()
      toast.show(t('draw_success'), 'success')
      postLog({ type: 'tryDraw', pool: info.address, txHash: tx.hash })
      if (onRefresh) onRefresh()
    } catch (err: any) {
      toast.show(err.reason || err.message, 'error')
    } finally {
      setTxBusy(false)
    }
  }

  return (
    <GlassCard>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <CardImage src={imgSrc} alt="pool" />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <CardTitle>{info.meta?.title || t('noImage')}</CardTitle>
            <StatusBadge status={info.drawn ? 'ended' : (notStarted ? 'pending' : (countdownActive ? 'countdown' : 'fundraising'))}>
              {info.drawn ? t('drawn') : notStarted ? t('not_started') : countdownActive ? t('countdown') : t('fundraising')}
            </StatusBadge>
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {info.meta?.desc || 'test use'}
            <span style={{ color: '#5856d6', cursor: 'pointer', marginLeft: 4 }}>{t('show_more')}</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 14, color: '#333', marginBottom: 8 }}>
        {t('progress')}: {(progress * 100).toFixed(2)}%
      </div>
      <ProgressBar percent={progress * 100} />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 16 }}>
        <span>{t('raised')}: {formatUnits(info.totalRaised, decimals)}</span>
        <span>{t('min')}: {formatUnits(info.minFill, decimals)}</span>
        <span>{t('max')}: {formatUnits(info.maxFill, decimals)}</span>
        <span>{t('tickets')}: {info.currentTicketId}</span>
      </div>

      {notStarted ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.15)', padding: '12px 16px', borderRadius: 14, backdropFilter: 'blur(12px)' }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold', color: '#fff', background:'rgba(255,255,255,0.1)' }}>
            ⏳
          </div>
          <span style={{ color: '#fff', fontWeight: 500 }}>
            {t('start_in')}: {formatLeft(startAt - nowSec)}
          </span>
        </div>
      ) : info.drawn ? (
        <div style={{ textAlign: 'center', padding: 20, color: '#8e8e93' }}>
          {t('draw_msg_drawn')}
        </div>
      ) : countdownActive ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,149,0,0.12)', padding: '12px 16px', borderRadius: 14, backdropFilter: 'blur(12px)', marginBottom: 16 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', border: '3px solid rgba(255,149,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold', color: '#ff9500', background:'rgba(255,255,255,0.15)' }}>
            {Math.max(0, Math.floor((countdownLeftSec / info.countdownSeconds) * 100))}%
          </div>
          <span style={{ color: '#ff9500', fontWeight: 600 }}>
            {t('countdown_left')}: {formatLeft(countdownLeftSec)}
          </span>
        </div>
      ) : (
        <>
          {fundraising && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, background:'rgba(0,122,255,0.12)', padding:'10px 14px', borderRadius:14, backdropFilter:'blur(10px)' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', border: '3px solid rgba(0,122,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold', color: '#007aff', background:'rgba(255,255,255,0.15)' }}>
                {(progress*100).toFixed(0)}%
              </div>
              <span style={{ color: '#007aff', fontWeight: 600 }}>
                {t('fundraising')}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <span style={{ whiteSpace: 'nowrap', color: '#333' }}>{t('count')}:</span>
              <Input 
                type="number" 
                min="1" 
                max={remaining} 
                value={countStr} 
                onChange={e => setCountStr(e.target.value)} 
                disabled={remaining <= 0}
              />
            </div>
            <GlassButton 
              variant="primary" 
              onClick={handleParticipate} 
              disabled={remaining <= 0 || txBusy}
              title={remaining <= 0 ? t('exceed_limit') : txBusy ? t('status_participating') : ''}
            >
              {txBusy ? t('status_participating') : t('participate')}
            </GlassButton>
            <GlassButton 
              variant="danger" 
              onClick={handleRefund} 
              disabled={!canRefund || txBusy}
              title={!canRefund ? (!info.minReached ? t('fundraising') : t('drawn')) : txBusy ? t('status_refunding') : ''}
            >
              {txBusy ? t('status_refunding') : t('refund')}
            </GlassButton>
            <GlassButton 
              variant="secondary" 
              onClick={handleDraw} 
              disabled={!info.minReached || info.drawn || txBusy}
              title={!info.minReached ? t('draw_msg_fundraising') : info.drawn ? t('draw_msg_drawn') : txBusy ? t('status_participating') : ''}
            >
              {t('tryDraw')}
            </GlassButton>
          </div>
        </>
      )}
    </GlassCard>
  )
}
