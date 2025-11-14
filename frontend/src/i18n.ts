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
  refreshing: 'Refreshing...',
  refresh_failed: 'Refresh failed',
    provider_initializing: 'Provider initializing, please wait...',
  provider_final_hint: 'The little drops are trying hard to merge into a river, please wait patiently. If it takes too long they might have gotten lost — try refreshing or check your network. Thank you ~',
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
  open_binance: 'Open with Binance',
      footer_note: 'Transparent contracts and funds: every transaction is on-chain',
  hero_note: 'Dear little lucky one, we currently support only BNB Chain Testnet (BSC). Please use Binance Wallet / OKX Wallet / MetaMask. You will need a small amount of BNB for gas, so fund BNB in advance.\nFlow:\n1. Connect your wallet.\n2. Join one activity (each user may put at most 10 water drops per activity).\n3. When the pool reaches the minimum water the countdown starts; after 3 days it draws (no refunds after countdown starts). If the pool reaches the max earlier it draws immediately.\n4. Draw (randomly select a lucky one in the pool).\n5. Claim the reward (after support team review the prize is manually sent to the winner).\nWish you fulfill your wish ~',
  not_started: 'Not started',
  start_in: 'Starts in',
  countdown_left: 'Time left',
  count: 'Count',
  show_more: 'Show more',
  show_less: 'Show less',
  draw_msg_fundraising: 'Fundraising is in progress. The countdown will start after reaching the minimum.',
  draw_msg_countdown: 'The countdown is still running. Please wait until it ends and try again.',
  draw_msg_drawn: 'This pool has already been drawn.',
  draw_msg_pending: 'Randomness request is in progress. Please try again later.',
  draw_msg_generic: 'Not ready to draw yet. Please try again later.'
      ,draw_request_submitted: 'Draw request submitted, view on BscScan'
      ,winner_banner_title_en: 'Congratulations!'
      ,winner_banner_sub_en: 'Period {{n}} winner'
      ,period_label_en: 'Period {{n}}'
      ,chat_title: 'Customer Support Chat'
      ,chat_connect: 'Sign to start chat'
      ,chat_placeholder: 'Say something...'
      ,chat_send: 'Send'
      ,transparency_title: 'Transparency'
      ,transparency_total_participations: 'Total participations'
      ,transparency_total_rewards: 'Total rewards distributed'
      ,transparency_current_pools: 'Ongoing activities'
      ,transparency_treasury: 'Treasury address'
      ,transparency_last_sync: 'Last sync'
      ,transparency_randomness_brief: 'Randomness provided by Chainlink VRF v2 on BNB Chain Testnet'
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
  refreshing: '刷新中...',
  refresh_failed: '刷新失败',
    provider_initializing: 'Provider 初始化中，请稍候...',
  provider_final_hint: '小水滴正在尽力汇聚成河，请您耐心等待。若长时间未加载成功，可能是小水滴走丢了呢，请尝试刷新或检查网络，谢谢~',
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
  open_binance: '用 Binance 打开',
      footer_note: '合约与资金透明：所有交易均在链上可查',
  hero_note: '亲爱的小幸运，我们目前仅支持 BNB Chain Testnet（BSC）链。请使用 Binance 钱包 / OKX 钱包 / MetaMask，操作过程中需要少量 BNB 作为 gas 费，请提前充值 BNB。\n流程：\n1、连接您的钱包。\n2、参与其中一个活动（每个用户每个活动最多投入 10 滴水滴）。\n3、当池子蓄满最低水量时开始倒计时，3 天后开奖（开始倒计时后不允许退款）。若池子提前达到最大水量则立刻开奖。\n4、开奖（在水池中随机抽取小幸运）。\n5、按规则领奖（客服审核通过后会手动发放奖励给获奖的小幸运）。\n祝亲爱的小幸运成功获得自己的心愿呀~',
  not_started: '未开始',
  start_in: '距离开始',
  countdown_left: '倒计时剩余',
  count: '次数',
  show_more: '展开',
  show_less: '收起',
  draw_msg_fundraising: '许愿中，达到最低金额后将开始倒计时。',
  draw_msg_countdown: '倒计时尚未结束，请等待倒计时结束后再试。',
  draw_msg_drawn: '本活动已开奖。',
  draw_msg_pending: '随机数请求处理中，请稍后重试。',
  draw_msg_generic: '当前还不能开奖，请稍后再试。'
      ,draw_request_submitted: '已提交开奖请求，点击查看 BscScan'
      ,winner_banner_title_zh: '恭喜中奖！'
      ,winner_banner_sub_zh: '第 {{n}} 期 中奖者'
      ,period_label_zh: '第 {{n}} 期'
      ,chat_title: '客服聊天'
      ,chat_connect: '签名登录以开始聊天'
      ,chat_placeholder: '说点什么...'
      ,chat_send: '发送'
      ,transparency_title: '透明度'
      ,transparency_total_participations: '总参与次数'
      ,transparency_total_rewards: '总奖励已发放'
      ,transparency_current_pools: '当前进行中活动'
      ,transparency_treasury: '资金合约地址'
      ,transparency_last_sync: '最后同步时间'
      ,transparency_randomness_brief: '随机性由 BNB Chain Testnet 上的 Chainlink VRF v2 提供'
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
