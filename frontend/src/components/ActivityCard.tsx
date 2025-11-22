import { useEffect, useMemo, useState } from 'react'
import { Contract, BrowserProvider, formatUnits } from 'ethers'
import { useTranslation } from 'react-i18next'
import { useWeb3 } from '../web3'
import PoolArtifact from '@abi/LuckyPool.json'
import type { PoolInfo } from '../hooks/useContracts'
import { useToast } from './ToastProvider'
import { postLog } from '../lib/log'
import { DEFAULT_RPC, BACKEND_URL } from '../config'
import { GlassCard, GlassButton, ProgressBar, CardTitle, CardContent, CardImage } from './GlassCard'
import styled from 'styled-components'

const ERC20_ABI = [
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' }
]

const InputGroup = styled.div
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
;

const Input = styled.input
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 8px 12px;
  color: white;
  width: 100%;
  font-size: 16px;
  outline: none;
  
  &:focus {
    border-color: rgba(255, 255, 255, 0.5);
  }
;

const StatusBadge = styled.span<{ status: 'active' | 'ended' | 'pending' }>
  background: ${props => {
    if (props.status === 'active') return 'rgba(52, 199, 89, 0.4)';
    if (props.status === 'ended') return 'rgba(142, 142, 147, 0.4)';
    return 'rgba(255, 149, 0, 0.4)';
  }};
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: bold;
  margin-left: auto;
;

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
  const notStarted = startAt > 0 && Math.floor(Date.now()/1000) < startAt

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

  const handleBuy = async () => {
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
      postLog('buy_tickets', { pool: info.address, count, tx: tx.hash })
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
      if (onRefresh) onRefresh()
    } catch (err: any) {
      toast.show(err.reason || err.message, 'error')
    } finally {
      setTxBusy(false)
    }
  }

  return (
    <GlassCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <CardTitle>{info.meta?.title || t('unknown_pool')}</CardTitle>
        <StatusBadge status={info.drawn ? 'ended' : notStarted ? 'pending' : 'active'}>
          {info.drawn ? t('ended') : notStarted ? t('pending') : t('active')}
        </StatusBadge>
      </div>
      
      <CardImage src={imgSrc} alt="Activity" onError={() => setImgSrc('https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?q=80&w=2070&auto=format&fit=crop')} />
      
      <CardContent>
        {info.meta?.description || t('no_desc')}
      </CardContent>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 5 }}>
        <span>{t('progress')}</span>
        <span>{progress.toFixed(1)}%</span>
      </div>
      <ProgressBar percent={progress} />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 15 }}>
        <span>{t('price')}: {formatUnits(info.ticketPrice, decimals)}</span>
        <span>{t('my_tickets')}: {userTickets}</span>
      </div>

      {!info.drawn && !notStarted && (
        <>
          <InputGroup>
            <Input 
              type="number" 
              value={countStr} 
              onChange={e => setCountStr(e.target.value)}
              min="1"
              max={remaining}
              placeholder={t('amount')}
            />
            <span style={{ whiteSpace: 'nowrap', fontSize: 14 }}>Max: {remaining}</span>
          </InputGroup>
          
          <GlassButton onClick={handleBuy} disabled={txBusy || remaining <= 0}>
            {txBusy ? t('processing') : t('participate')}
          </GlassButton>
        </>
      )}

      {canRefund && (
        <GlassButton variant="danger" onClick={handleRefund} disabled={txBusy}>
          {t('refund')}
        </GlassButton>
      )}
    </GlassCard>
  )
}
