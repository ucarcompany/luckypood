import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import toast from 'react-hot-toast'
import { X, Package, Wallet, Check, Truck, Image } from 'lucide-react'

interface WinnerDeliveryInfo {
  type: 'crypto' | 'physical'
  // 实体物品
  recipientName?: string
  phone?: string
  shippingAddress?: string
  note?: string
  // 虚拟货币
  walletAddress?: string
  chainType?: string
  // 通用
  submittedAt?: number
  confirmed?: boolean
}

interface AdminDeliveryInfo {
  // 实体物品
  trackingNumber?: string
  shippingCompany?: string
  shippedAt?: number
  // 虚拟货币
  paymentScreenshot?: string
  txHash?: string
  paidAt?: number
}

interface Props {
  poolAddress: string
  prizeType: 'physical' | 'crypto'
  winnerAddress: string
  existingDeliveryInfo?: WinnerDeliveryInfo | null
  adminDeliveryInfo?: AdminDeliveryInfo | null
  prizeDistributed?: boolean
  onClose?: () => void
  onSuccess?: () => void
}

export default function WinnerDeliveryForm({
  poolAddress,
  prizeType,
  winnerAddress: _winnerAddress, // 用于未来扩展验证
  existingDeliveryInfo,
  adminDeliveryInfo,
  prizeDistributed,
  onClose,
  onSuccess,
}: Props) {
  const { address: userAddress } = useAccount()
  
  // 表单状态
  const [recipientName, setRecipientName] = useState('')
  const [phone, setPhone] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [note, setNote] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [chainType, setChainType] = useState('BSC Testnet')
  const [submitting, setSubmitting] = useState(false)
  
  // 是否已提交
  const hasSubmitted = existingDeliveryInfo?.confirmed
  
  // 初始化表单
  useEffect(() => {
    if (existingDeliveryInfo) {
      setRecipientName(existingDeliveryInfo.recipientName || '')
      setPhone(existingDeliveryInfo.phone || '')
      setShippingAddress(existingDeliveryInfo.shippingAddress || '')
      setNote(existingDeliveryInfo.note || '')
      setWalletAddress(existingDeliveryInfo.walletAddress || userAddress || '')
      setChainType(existingDeliveryInfo.chainType || 'BSC Testnet')
    } else {
      // 默认使用连接的钱包地址
      setWalletAddress(userAddress || '')
    }
  }, [existingDeliveryInfo, userAddress])
  
  const handleSubmit = async () => {
    if (!poolAddress) return
    
    // 验证
    if (prizeType === 'physical') {
      if (!recipientName.trim()) {
        toast.error('请填写收件人姓名')
        return
      }
      if (!phone.trim()) {
        toast.error('请填写联系电话')
        return
      }
      if (!shippingAddress.trim()) {
        toast.error('请填写收货地址')
        return
      }
    } else {
      if (!walletAddress.trim()) {
        toast.error('请填写收款地址')
        return
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        toast.error('请输入有效的BSC链钱包地址')
        return
      }
    }
    
    setSubmitting(true)
    try {
      // 注意：winner-delivery 端点在 /api/admin 下，不是 /api/v2
      const res = await fetch(`/api/admin/pool/${poolAddress}/winner-delivery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: prizeType,
          // 实体物品
          recipientName: prizeType === 'physical' ? recipientName : undefined,
          phone: prizeType === 'physical' ? phone : undefined,
          shippingAddress: prizeType === 'physical' ? shippingAddress : undefined,
          note: prizeType === 'physical' ? note : undefined,
          // 虚拟货币
          walletAddress: prizeType === 'crypto' ? walletAddress : undefined,
          chainType: prizeType === 'crypto' ? chainType : undefined,
          // 验证
          signerAddress: userAddress,
        }),
      })
      
      const data = await res.json()
      if (data.ok) {
        toast.success('信息提交成功！管理员将尽快处理')
        onSuccess?.()
      } else {
        toast.error(data.error || '提交失败')
      }
    } catch (error) {
      console.error('Submit delivery info error:', error)
      toast.error('提交失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${
                prizeType === 'physical' ? 'bg-orange-500/20' : 'bg-purple-500/20'
              }`}>
                {prizeType === 'physical' ? (
                  <Package className="w-6 h-6 text-orange-400" />
                ) : (
                  <Wallet className="w-6 h-6 text-purple-400" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {hasSubmitted ? '📮 收货信息已提交' : '🎉 恭喜您中奖！'}
                </h2>
                <p className="text-sm text-gray-400">
                  {prizeType === 'physical' 
                    ? '请填写您的收货信息' 
                    : '请确认您的收款地址'}
                </p>
              </div>
            </div>
            {onClose && (
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            )}
          </div>
        </div>
        
        {/* 内容 */}
        <div className="p-6 space-y-4">
          {/* 已发放提示 */}
          {prizeDistributed && (
            <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-green-400 font-medium">
                <Check className="w-5 h-5" />
                奖品已发放！
              </div>
              {adminDeliveryInfo && prizeType === 'physical' && adminDeliveryInfo.trackingNumber && (
                <div className="mt-2 text-sm">
                  <p className="text-gray-400">
                    快递公司: <span className="text-white">{adminDeliveryInfo.shippingCompany || '-'}</span>
                  </p>
                  <p className="text-gray-400">
                    快递单号: <span className="text-white font-mono">{adminDeliveryInfo.trackingNumber}</span>
                  </p>
                </div>
              )}
              {adminDeliveryInfo && prizeType === 'crypto' && (
                <div className="mt-2 space-y-2">
                  {adminDeliveryInfo.txHash && (
                    <p className="text-gray-400 text-sm">
                      交易哈希: <span className="text-white font-mono text-xs break-all">{adminDeliveryInfo.txHash}</span>
                    </p>
                  )}
                  {adminDeliveryInfo.paymentScreenshot && (
                    <div>
                      <p className="text-gray-400 text-sm mb-1">打款截图:</p>
                      <img 
                        src={adminDeliveryInfo.paymentScreenshot} 
                        alt="打款截图" 
                        className="max-h-40 rounded-lg"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* 实体物品表单 */}
          {prizeType === 'physical' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">收件人姓名 *</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="请输入收件人姓名"
                  disabled={hasSubmitted}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-primary-500 focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">联系电话 *</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="请输入联系电话"
                  disabled={hasSubmitted}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-primary-500 focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">收货地址 *</label>
                <textarea
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="请输入详细收货地址（省/市/区/街道/门牌号）"
                  rows={3}
                  disabled={hasSubmitted}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-primary-500 focus:outline-none resize-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">备注（可选）</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如有特殊要求请在此说明"
                  disabled={hasSubmitted}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-primary-500 focus:outline-none disabled:opacity-50"
                />
              </div>
              
              {/* 物流信息展示 */}
              {adminDeliveryInfo?.trackingNumber && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-400 font-medium mb-2">
                    <Truck className="w-5 h-5" />
                    物流信息
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="text-gray-400">
                      快递公司: <span className="text-white">{adminDeliveryInfo.shippingCompany || '-'}</span>
                    </p>
                    <p className="text-gray-400">
                      快递单号: <span className="text-white font-mono">{adminDeliveryInfo.trackingNumber}</span>
                    </p>
                    {adminDeliveryInfo.shippedAt && (
                      <p className="text-xs text-gray-500">
                        发货时间: {new Date(adminDeliveryInfo.shippedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* 虚拟货币表单 */}
          {prizeType === 'crypto' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">链类型</label>
                <select
                  value={chainType}
                  onChange={(e) => setChainType(e.target.value)}
                  disabled={hasSubmitted}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-primary-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="BSC Testnet">BSC Testnet (测试网)</option>
                  <option value="BSC">BSC (主网)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">收款地址 *</label>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="0x..."
                  disabled={hasSubmitted}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-primary-500 focus:outline-none font-mono text-sm disabled:opacity-50"
                />
                <p className="text-xs text-gray-500 mt-1">
                  默认为您连接的钱包地址，您可以修改为其他地址
                </p>
              </div>
              
              {/* 打款信息展示 */}
              {adminDeliveryInfo?.paymentScreenshot && (
                <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-purple-400 font-medium mb-2">
                    <Image className="w-5 h-5" />
                    打款凭证
                  </div>
                  <div className="space-y-2">
                    {adminDeliveryInfo.txHash && (
                      <p className="text-gray-400 text-sm">
                        交易哈希: <span className="text-white font-mono text-xs break-all">{adminDeliveryInfo.txHash}</span>
                      </p>
                    )}
                    <img 
                      src={adminDeliveryInfo.paymentScreenshot} 
                      alt="打款截图" 
                      className="max-h-60 rounded-lg"
                    />
                    {adminDeliveryInfo.paidAt && (
                      <p className="text-xs text-gray-500">
                        打款时间: {new Date(adminDeliveryInfo.paidAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* 底部按钮 */}
        {!hasSubmitted && !prizeDistributed && (
          <div className="p-6 border-t border-white/10">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-purple-500 text-white font-medium rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? '提交中...' : '确认提交'}
            </button>
            <p className="text-xs text-gray-500 text-center mt-2">
              提交后信息将发送给管理员，请确保信息准确
            </p>
          </div>
        )}
        
        {hasSubmitted && !prizeDistributed && (
          <div className="p-6 border-t border-white/10">
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
              <p className="text-yellow-400">⏳ 信息已提交，等待管理员发放奖品...</p>
              {existingDeliveryInfo?.submittedAt && (
                <p className="text-xs text-gray-500 mt-1">
                  提交时间: {new Date(existingDeliveryInfo.submittedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
