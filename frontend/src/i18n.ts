import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  en: {
    translation: {
      title: 'Lucky Pool',
      connect: 'Connect Wallet',
      switchToBscTestnet: 'Switch to BSC Testnet',
      currentNetwork: 'Current network',
      activities: 'Activities',
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
  not_started: 'Not started',
  start_in: 'Starts in',
  countdown_left: 'Time left',
  count: 'Count',
  draw_msg_fundraising: 'Fundraising is in progress. The countdown will start after reaching the minimum.',
  draw_msg_countdown: 'The countdown is still running. Please wait until it ends and try again.',
  draw_msg_drawn: 'This pool has already been drawn.',
  draw_msg_pending: 'Randomness request is in progress. Please try again later.',
  draw_msg_generic: 'Not ready to draw yet. Please try again later.'
    }
  },
  zh: {
    translation: {
      title: '幸运池',
      connect: '连接钱包',
      switchToBscTestnet: '切换到 BSC Testnet',
      currentNetwork: '当前网络',
      activities: '活动列表',
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
  not_started: '未开始',
  start_in: '距离开始',
  countdown_left: '倒计时剩余',
  count: '次数',
  draw_msg_fundraising: '许愿中，达到最低金额后将开始倒计时。',
  draw_msg_countdown: '倒计时尚未结束，请等待倒计时结束后再试。',
  draw_msg_drawn: '本活动已开奖。',
  draw_msg_pending: '随机数请求处理中，请稍后重试。',
  draw_msg_generic: '当前还不能开奖，请稍后再试。'
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
