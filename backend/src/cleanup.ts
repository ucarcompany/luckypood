import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import express from 'express'
import { providers, Wallet, Contract, BigNumber, utils } from 'ethers'
import FactoryArtifact from '../../shared/abi/LuckyPoolFactory.json'
import PoolArtifact from '../../shared/abi/LuckyPool.json'

const DEFAULT_RPC = process.env.RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/'
const FACTORY_ADDRESS = (process.env.FACTORY_ADDRESS || '').trim()
const CREATOR_PK = (process.env.CREATOR_PRIVATE_KEY || '').trim()
const METADATA_DIR = process.env.METADATA_DIR || path.join(process.cwd(), 'metadata')
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000'

const THIRTY_DAYS = 30 * 24 * 3600 // seconds

function nowSec(){ return Math.floor(Date.now()/1000) }
function readIndex(): Record<string,string> { try { return JSON.parse(fs.readFileSync(path.join(METADATA_DIR,'index.json'),'utf-8')) } catch { return {} } }
function writeIndex(v: Record<string,string>) { fs.writeFileSync(path.join(METADATA_DIR,'index.json'), JSON.stringify(v,null,2),'utf-8') }

export function registerCleanup(app: express.Express){
  if (!FACTORY_ADDRESS || !CREATOR_PK) { console.warn('[cleanup] skipped: missing FACTORY_ADDRESS/CREATOR_PRIVATE_KEY'); return }
  const provider = new providers.JsonRpcProvider(DEFAULT_RPC)
  const wallet = new Wallet(CREATOR_PK, provider)
  const factory = new Contract(FACTORY_ADDRESS, (FactoryArtifact as any).abi, wallet)

  async function listPools(): Promise<string[]> { try { return await factory.getPools() } catch { return [] } }

  async function getInfo(poolAddr: string){
    const pool = new Contract(poolAddr, (PoolArtifact as any).abi, provider)
    try { return await pool.getInfo() } catch { return {
      minFill: await (pool as any).minFill?.().catch(()=>BigNumber.from(0)),
      maxFill: await (pool as any).maxFill?.().catch(()=>BigNumber.from(0)),
      createdAt: await (pool as any).createdAt?.().catch(()=>BigNumber.from(0)),
      minReached: await (pool as any).minReached?.().catch(()=>false),
      drawn: await (pool as any).drawn?.().catch(()=>false),
      cancelled: await (pool as any).cancelled?.().catch(()=>false)
    } }
  }

  async function cancelAndRefundAll(poolAddr: string): Promise<boolean> {
    const pool = new Contract(poolAddr, (PoolArtifact as any).abi, wallet)
    try {
      // 若合约支持批量退款接口
      for (let i=0;i<100;i++) {
        const finished: boolean = await (pool as any).isCancelRefundFinished?.().catch(()=>true)
        if (finished) return true
        const tx = await (pool as any).adminCancelAndRefundBatch?.(50).catch(()=>null)
        if (!tx) return false
        await tx.wait()
      }
      return false
    } catch { return false }
  }

  async function pruneLocalMeta(poolAddr: string){
    const lower = poolAddr.toLowerCase()
    const aliasPath = path.join(METADATA_DIR, `${lower}.json`)
    try { if (fs.existsSync(aliasPath)) fs.unlinkSync(aliasPath) } catch {}
    const idx = readIndex(); if (idx[lower]) { delete idx[lower]; writeIndex(idx) }
  }

  async function runCleanupOnce(): Promise<{ scanned:number; cancelled:number; pruned:number }>{
    const addrs = await listPools()
    let cancelled = 0, pruned = 0
    const n = nowSec()
    for (const a of addrs) {
      try {
        const info: any = await getInfo(a)
        const created = Number(info.createdAt||0)
        if (!created || (n - created) <= THIRTY_DAYS) continue
        // 策略：
        // - 若未开奖且未取消：尝试链上批量退款取消
        // - 无论是否成功，清理本地索引与别名（前端将不再展示历史）
        if (!info.drawn && !info.cancelled) {
          const ok = await cancelAndRefundAll(a)
          if (ok) cancelled++
        }
        await pruneLocalMeta(a)
        pruned++
      } catch {/* continue */}
    }
    return { scanned: addrs.length, cancelled, pruned }
  }

  // API：只读预览
  app.get('/api/cleanup/dry-run', async (_req, res) => {
    try {
      const addrs = await listPools()
      const n = nowSec()
      const items: Array<{pool:string; olderThan30d:boolean}> = []
      for (const a of addrs) {
        try { const info: any = await getInfo(a); items.push({ pool: a, olderThan30d: !!info.createdAt && (n-Number(info.createdAt||0))>THIRTY_DAYS }) } catch {}
      }
      return res.json({ ok:true, total: addrs.length, older: items.filter(i=>i.olderThan30d).map(i=>i.pool) })
    } catch (e:any) { return res.status(500).json({ error: e?.message||'internal_error' }) }
  })

  // API：立即执行一次清理
  app.post('/api/cleanup/run', async (_req, res) => {
    try { const r = await runCleanupOnce(); return res.json({ ok:true, ...r }) } catch (e:any) { return res.status(500).json({ error: e?.message||'internal_error' }) }
  })

  // 定时任务：每6小时执行一次
  setInterval(() => { runCleanupOnce().catch(()=>{}) }, 6 * 60 * 60 * 1000)
}
