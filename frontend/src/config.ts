export const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS || '').trim()
export const DEFAULT_RPC = (import.meta.env.VITE_DEFAULT_RPC || '').trim()
// 默认后端地址在本地开发为 http://localhost:4000，避免未配置时无法读取元数据
export const BACKEND_URL = ((import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000') as string).trim()
export const BACKEND_API_KEY = (import.meta.env.VITE_BACKEND_API_KEY || '').trim()
export const VRF_SUB_ID = (import.meta.env.VITE_VRF_SUB_ID || '').trim()
export const VRF_COORDINATOR = (import.meta.env.VITE_VRF_COORDINATOR || '').trim()
export const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL || '').trim()
export const HIDDEN_POOLS = (import.meta.env.VITE_HIDDEN_POOLS || '').split(',').map((s: string)=>s.trim().toLowerCase()).filter(Boolean)
// 新增：工厂合约部署区块，前端批量读取日志时用作起始，避免从 0 区块导致 RPC 过宽范围 (-32005)
export const FACTORY_DEPLOY_BLOCK = Number((import.meta.env as any).VITE_FACTORY_DEPLOY_BLOCK || '0') || 0
