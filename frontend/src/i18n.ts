import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  en: {
    translation: {
      title: 'Lucky Pool',
      subtitle_tagline: 'Where wishes gather and luck arrives fairly',
      connect: 'Connect Wallet',
      switchToBscTestnet: 'Switch to BSC Testnet',
      currentNetwork: 'Current network',
      activities: 'Activities',
      tab_list: 'Activities',
      tab_transparency: 'Transparency',
      loading: 'Loading...',
      empty: 'No activities',
      error: 'Error',
      fundraising: 'Fundraising',
      countdown: 'Countdown',
      drawn: 'Drawn',
      raised: 'Raised',
      min: 'Min',
      max: 'Max',
      tickets: 'Tickets',
      winner: 'Winner',
      participate: 'Participate',
      refund: 'Refund',
    tryDraw: 'Try Draw',
    refresh: 'Refresh',
    please_connect: 'Please connect wallet first',
    exceed_limit: 'Exceeds available quota or cap',
    status_approving: 'Approving...',
    status_participating: 'Participating...',
    status_success: 'Succeeded',
    status_refunding: 'Refunding...',
    noImage: 'No image',
    progress: 'Progress',
    participate_success: 'Participated successfully',
    refund_success: 'Refunded successfully',
    view_on_bscscan: 'View on BscScan',
    your_ticket_range: 'Your ticket range',
    wish_pool: 'Wish Pool',
      open_metamask: 'Open with MetaMask',
      open_okx: 'Open with OKX',
      footer_note: 'Transparent contracts and funds: every transaction is on-chain',
    hero_note: 'Supported network: BNB Chain Testnet (0x61). Use MetaMask/OKX wallet. You need tBNB for gas and test USDT. Steps: Connect → Participate → Countdown after reaching the minimum → Draw → Claim prize or refund as rules.' ,
  not_started: 'Not started',
  start_in: 'Starts in',
  countdown_left: 'Time left',
  count: 'Count',
  draw_msg_fundraising: 'Fundraising is in progress. The countdown will start after reaching the minimum.',
  draw_msg_countdown: 'The countdown is still running. Please wait until it ends and try again.',
  draw_msg_drawn: 'This pool has already been drawn.',
  draw_msg_pending: 'Randomness request is in progress. Please try again later.',
  draw_msg_generic: 'Not ready to draw yet. Please try again later.'
      ,draw_request_submitted: 'Draw request submitted, view on BscScan'
    }
  },
  zh: {
    translation: {
      title: '幸运池',
      subtitle_tagline: '愿望在此汇聚，幸运自此发生',
      connect: '连接钱包',
      switchToBscTestnet: '切换到 BSC Testnet',
      currentNetwork: '当前网络',
      activities: '活动列表',
      tab_list: '活动列表',
      tab_transparency: '透明度',
      loading: '加载中...',
      empty: '暂无活动',
      error: '错误',
  fundraising: '许愿中',
      countdown: '倒计时中',
      drawn: '已开奖',
      raised: '已筹',
      min: '最小',
      max: '最大',
      tickets: '票数',
      winner: '赢家',
      participate: '参与',
      refund: '退款',
    tryDraw: '尝试开奖',
    refresh: '刷新',
    please_connect: '请先连接钱包',
    exceed_limit: '超过可参与份额或已达上限',
    status_approving: '正在授权...',
    status_participating: '正在参与...',
    status_success: '成功',
    status_refunding: '正在退款...',
    noImage: '无图片',
    progress: '池子进度',
    participate_success: '参与成功',
    refund_success: '退款成功',
    view_on_bscscan: '在 BscScan 查看',
    your_ticket_range: '你的当前票号范围',
    wish_pool: '许愿池',
      open_metamask: '用 MetaMask 打开',
      open_okx: '用 OKX 打开',
      footer_note: '合约与资金透明：所有交易均在链上可查',
    hero_note: '仅支持 BNB Chain Testnet (0x61)。请使用 MetaMask/OKX 钱包，需少量 tBNB 作为 Gas 与测试 USDT。流程：连接 → 参与 → 达到最小后倒计时 → 开奖 → 按规则领奖或退款。',
  not_started: '未开始',
  start_in: '距离开始',
  countdown_left: '倒计时剩余',
  count: '次数',
  draw_msg_fundraising: '许愿中，达到最低金额后将开始倒计时。',
  draw_msg_countdown: '倒计时尚未结束，请等待倒计时结束后再试。',
  draw_msg_drawn: '本活动已开奖。',
  draw_msg_pending: '随机数请求处理中，请稍后重试。',
  draw_msg_generic: '当前还不能开奖，请稍后再试。'
      ,draw_request_submitted: '已提交开奖请求，点击查看 BscScan'
    }
  }
}

const savedLng = typeof window !== 'undefined' ? (localStorage.getItem('lang') || '') : ''
const initLng = savedLng || (navigator?.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en')

i18n.use(initReactI18next).init({
  resources,
  lng: initLng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
