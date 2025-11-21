"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCleanup = registerCleanup;
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ethers_1 = require("ethers");
const LuckyPoolFactory_json_1 = __importDefault(require("../../shared/abi/LuckyPoolFactory.json"));
const LuckyPool_json_1 = __importDefault(require("../../shared/abi/LuckyPool.json"));
const DEFAULT_RPC = process.env.RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const FACTORY_ADDRESS = (process.env.FACTORY_ADDRESS || '').trim();
const CREATOR_PK = (process.env.CREATOR_PRIVATE_KEY || '').trim();
const METADATA_DIR = process.env.METADATA_DIR || path_1.default.join(process.cwd(), 'metadata');
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const THIRTY_DAYS = 30 * 24 * 3600; // seconds
function nowSec() { return Math.floor(Date.now() / 1000); }
function readIndex() { try {
    return JSON.parse(fs_1.default.readFileSync(path_1.default.join(METADATA_DIR, 'index.json'), 'utf-8'));
}
catch {
    return {};
} }
function writeIndex(v) { fs_1.default.writeFileSync(path_1.default.join(METADATA_DIR, 'index.json'), JSON.stringify(v, null, 2), 'utf-8'); }
function registerCleanup(app) {
    if (!FACTORY_ADDRESS || !CREATOR_PK) {
        console.warn('[cleanup] skipped: missing FACTORY_ADDRESS/CREATOR_PRIVATE_KEY');
        return;
    }
    const provider = new ethers_1.providers.JsonRpcProvider(DEFAULT_RPC);
    const wallet = new ethers_1.Wallet(CREATOR_PK, provider);
    const factory = new ethers_1.Contract(FACTORY_ADDRESS, LuckyPoolFactory_json_1.default.abi, wallet);
    async function listPools() { try {
        return await factory.getPools();
    }
    catch {
        return [];
    } }
    async function getInfo(poolAddr) {
        const pool = new ethers_1.Contract(poolAddr, LuckyPool_json_1.default.abi, provider);
        try {
            return await pool.getInfo();
        }
        catch {
            return {
                minFill: await pool.minFill?.().catch(() => ethers_1.BigNumber.from(0)),
                maxFill: await pool.maxFill?.().catch(() => ethers_1.BigNumber.from(0)),
                createdAt: await pool.createdAt?.().catch(() => ethers_1.BigNumber.from(0)),
                minReached: await pool.minReached?.().catch(() => false),
                drawn: await pool.drawn?.().catch(() => false),
                cancelled: await pool.cancelled?.().catch(() => false)
            };
        }
    }
    async function cancelAndRefundAll(poolAddr) {
        const pool = new ethers_1.Contract(poolAddr, LuckyPool_json_1.default.abi, wallet);
        try {
            // 若合约支持批量退款接口
            for (let i = 0; i < 100; i++) {
                const finished = await pool.isCancelRefundFinished?.().catch(() => true);
                if (finished)
                    return true;
                const tx = await pool.adminCancelAndRefundBatch?.(50).catch(() => null);
                if (!tx)
                    return false;
                await tx.wait();
            }
            return false;
        }
        catch {
            return false;
        }
    }
    async function pruneLocalMeta(poolAddr) {
        const lower = poolAddr.toLowerCase();
        const aliasPath = path_1.default.join(METADATA_DIR, `${lower}.json`);
        try {
            if (fs_1.default.existsSync(aliasPath))
                fs_1.default.unlinkSync(aliasPath);
        }
        catch { }
        const idx = readIndex();
        if (idx[lower]) {
            delete idx[lower];
            writeIndex(idx);
        }
    }
    async function runCleanupOnce(all = false) {
        const addrs = await listPools();
        let cancelled = 0, pruned = 0;
        const n = nowSec();
        for (const a of addrs) {
            try {
                const info = await getInfo(a);
                const created = Number(info.createdAt || 0);
                if (!all && (!created || (n - created) <= THIRTY_DAYS))
                    continue;
                // 策略：
                // - 若未开奖且未取消：尝试链上批量退款取消
                // - 无论是否成功，清理本地索引与别名（前端将不再展示历史）
                if (!info.drawn && !info.cancelled) {
                    const ok = await cancelAndRefundAll(a);
                    if (ok)
                        cancelled++;
                }
                await pruneLocalMeta(a);
                pruned++;
            }
            catch { /* continue */ }
        }
        return { scanned: addrs.length, cancelled, pruned };
    }
    // API：只读预览
    app.get('/api/cleanup/dry-run', async (_req, res) => {
        try {
            const addrs = await listPools();
            const n = nowSec();
            const items = [];
            for (const a of addrs) {
                try {
                    const info = await getInfo(a);
                    items.push({ pool: a, olderThan30d: !!info.createdAt && (n - Number(info.createdAt || 0)) > THIRTY_DAYS });
                }
                catch { }
            }
            return res.json({ ok: true, total: addrs.length, older: items.filter(i => i.olderThan30d).map(i => i.pool) });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || 'internal_error' });
        }
    });
    // API：立即执行一次清理
    app.post('/api/cleanup/run', async (req, res) => {
        try {
            const all = String(req.query.all || '0') === '1';
            const r = await runCleanupOnce(all);
            return res.json({ ok: true, all, ...r });
        }
        catch (e) {
            return res.status(500).json({ error: e?.message || 'internal_error' });
        }
    });
    // 定时任务：每6小时执行一次
    setInterval(() => { runCleanupOnce(false).catch(() => { }); }, 6 * 60 * 60 * 1000);
}
