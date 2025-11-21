// 工厂地址：如未配置，使用 BSC Testnet 的已知部署地址作为保底
export const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS || '0xCEc46Ff4217feb58937212ca0F71F3Ee6c18FC75').trim()
// 默认 RPC：未配置时回落到 BSC Testnet 公共节点
export const DEFAULT_RPC = (import.meta.env.VITE_DEFAULT_RPC || 'https://data-seed-prebsc-1-s1.binance.org:8545/').trim()
// 后端地址：生产环境回落到相对路径（同源），开发环境回落到本机
export const BACKEND_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000');
export const BACKEND_API_KEY = (import.meta.env.VITE_BACKEND_API_KEY || '').trim()
export const VRF_SUB_ID = (import.meta.env.VITE_VRF_SUB_ID || '').trim()
export const VRF_COORDINATOR = (import.meta.env.VITE_VRF_COORDINATOR || '').trim()
export const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL || '').trim()
export const HIDDEN_POOLS = (import.meta.env.VITE_HIDDEN_POOLS || '').split(',').map((s: string)=>s.trim().toLowerCase()).filter(Boolean)
// 新增：工厂合约部署区块，前端批量读取日志时用作起始，避免从 0 区块导致 RPC 过宽范围 (-32005)
export const FACTORY_DEPLOY_BLOCK = Number((import.meta.env as any).VITE_FACTORY_DEPLOY_BLOCK || '71704665') || 71704665
