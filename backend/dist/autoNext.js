"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAutoNext = registerAutoNext;
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const ethers_1 = require("ethers");
const LuckyPoolFactory_json_1 = __importDefault(require("../../shared/abi/LuckyPoolFactory.json"));
const LuckyPool_json_1 = __importDefault(require("../../shared/abi/LuckyPool.json"));
const DEFAULT_RPC = process.env.RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const METADATA_DIR = process.env.METADATA_DIR || path_1.default.join(process.cwd(), 'metadata');
const LOG_DIR = process.env.LOG_DIR || path_1.default.join(process.cwd(), 'logs');
const FACTORY_ADDRESS = (process.env.FACTORY_ADDRESS || '').trim();
const CREATOR_PK = (process.env.CREATOR_PRIVATE_KEY || '').trim();
const AUTO_NEXT_ENABLED = (process.env.AUTO_NEXT_ENABLED || '1').trim() !== '0';
if (!fs_1.default.existsSync(LOG_DIR))
    fs_1.default.mkdirSync(LOG_DIR, { recursive: true });
if (!fs_1.default.existsSync(METADATA_DIR))
    fs_1.default.mkdirSync(METADATA_DIR, { recursive: true });
const CONFIG_FILE = path_1.default.join(METADATA_DIR, 'auto-next.json');
const INDEX_FILE = path_1.default.join(METADATA_DIR, 'index.json');
const DEBUG_FILE = path_1.default.join(LOG_DIR, 'auto-next-debug.jsonl');
function readJsonFile(p, fallback) {
    try {
        const t = fs_1.default.readFileSync(p, 'utf-8');
        return JSON.parse(t);
    }
    catch {
        return fallback;
    }
}
function writeJsonFile(p, v) { fs_1.default.writeFileSync(p, JSON.stringify(v, null, 2), 'utf-8'); }
function appendDebug(obj) { try {
    fs_1.default.appendFileSync(DEBUG_FILE, JSON.stringify({ ts: Date.now(), ...obj }) + '\n');
}
catch { } }
function readIndex() { return readJsonFile(INDEX_FILE, {}); }
function writeIndex(idx) { writeJsonFile(INDEX_FILE, idx); }
function readConfig() { return readJsonFile(CONFIG_FILE, { series: {} }); }
function writeConfig(cfg) { writeJsonFile(CONFIG_FILE, cfg); }
function normalizeTitle(s) {
    if (!s)
        return 'untitled';
    let x = String(s);
    x = x.replace(/第\s*\d+\s*期/gi, '');
    x = x.replace(/period\s*\d+/gi, '');
    x = x.replace(/\(test\)/gi, '').replace(/test use/gi, '');
    x = x.trim();
    return x || 'untitled';
}
async function fetchJson(url) {
    try {
        const r = await fetch(url);
        if (!r.ok)
            return null;
        return await r.json().catch(() => null);
    }
    catch {
        return null;
    }
}
async function createMetadataClone(base, startAt) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const filePath = path_1.default.join(METADATA_DIR, `${id}.json`);
    const payload = {
        title: base?.title || '活动',
        description: base?.description || '',
        image: base?.image || '',
        startAt
    };
    fs_1.default.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    const uri = `${BASE_URL}/meta/${id}.json`;
    return { uri, jsonPath: filePath };
}
async function getSortOrderOfPool(prov, pool) {
    try {
        const iface = new ethers_1.utils.Interface(LuckyPoolFactory_json_1.default.abi);
        const ev = iface.getEvent ? iface.getEvent('PoolCreated') : LuckyPoolFactory_json_1.default.abi.find((x) => x.type === 'event' && x.name === 'PoolCreated');
        const topic0 = ev.topicHash || iface.getEventTopic?.('PoolCreated');
        // 分批读取，带速率限制回退（BSC -32005）
        const latest = await prov.getBlockNumber();
        let start = Math.max(0, latest - 1200000); // 限制最大回溯范围
        let step = 30000;
        const MIN_STEP = 300;
        const MAX_STEP = 70000;
        let delayMs = 250;
        while (start <= latest) {
            const end = Math.min(start + step, latest);
            try {
                const part = await prov.getLogs({ address: FACTORY_ADDRESS, topics: [topic0], fromBlock: start, toBlock: end });
                for (const l of part) {
                    try {
                        const p = iface.parseLog({ topics: l.topics, data: l.data });
                        const addr = String(p.args?.[0] || '').toLowerCase();
                        if (addr === pool.toLowerCase())
                            return Number(p.args?.[4] || 0);
                    }
                    catch { }
                }
                start = end + 1;
                delayMs = 250;
                if (step < MAX_STEP)
                    step = Math.min(MAX_STEP, Math.floor(step * 1.3));
            }
            catch (e) {
                const msg = e?.message || '';
                const code = e?.code;
                if (code === -32005 || /rate limit|limit exceeded|block range|query timeout|eth_getLogs/i.test(msg)) {
                    step = Math.max(MIN_STEP, Math.floor(step / 2));
                    await new Promise(r => setTimeout(r, delayMs));
                    delayMs = Math.min(3000, Math.floor(delayMs * 1.5));
                    continue;
                }
                break;
            }
        }
    }
    catch { }
    return 0;
}
function registerAutoNext(app) {
    // 管理端接口：查看/更新配置
    const guard = (req, res, next) => {
        const key = process.env.API_KEY;
        if (!key)
            return next();
        if (req.header('x-api-key') === key)
            return next();
        return res.status(401).json({ error: 'unauthorized' });
    };
    app.get('/api/auto-next', guard, (_req, res) => res.json(readConfig()));
    app.post('/api/auto-next/upsert', guard, express_1.default.json(), (req, res) => {
        const { seriesKey, enabled, nextMin, nextMax, sortOrder } = req.body || {};
        if (!seriesKey)
            return res.status(400).json({ error: 'missing_seriesKey' });
        const cfg = readConfig();
        cfg.series[seriesKey] = {
            ...cfg.series[seriesKey],
            ...(enabled === undefined ? {} : { enabled: !!enabled }),
            ...(nextMin ? { nextMin: String(nextMin) } : {}),
            ...(nextMax ? { nextMax: String(nextMax) } : {}),
            ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) || 0 } : {})
        };
        writeConfig(cfg);
        return res.json({ ok: true });
    });
    app.post('/api/auto-next/stop', guard, express_1.default.json(), (req, res) => {
        const { seriesKey } = req.body || {};
        if (!seriesKey)
            return res.status(400).json({ error: 'missing_seriesKey' });
        const cfg = readConfig();
        if (cfg.series[seriesKey])
            cfg.series[seriesKey].enabled = false;
        writeConfig(cfg);
        return res.json({ ok: true });
    });
    // 守护器：监听开奖并自动建下一期
    if (!AUTO_NEXT_ENABLED || !CREATOR_PK || !FACTORY_ADDRESS) {
        appendDebug({ stage: 'auto-next-skip', reason: 'missing_env', AUTO_NEXT_ENABLED, hasPK: !!CREATOR_PK, FACTORY_ADDRESS });
        return;
    }
    const provider = new ethers_1.providers.JsonRpcProvider(DEFAULT_RPC);
    const wallet = new ethers_1.Wallet(CREATOR_PK, provider);
    const factory = new ethers_1.Contract(FACTORY_ADDRESS, LuckyPoolFactory_json_1.default.abi, wallet);
    const poolIface = new ethers_1.utils.Interface(LuckyPool_json_1.default.abi);
    const ev = poolIface.getEvent('DrawFulfilled');
    const topicDraw = ev.topicHash || poolIface.getEventTopic?.('DrawFulfilled');
    const watching = new Set();
    const processed = new Set(); // pool address processed
    async function ensureWatchers() {
        try {
            const pools = await factory.getPools();
            for (const addr of pools) {
                const lower = addr.toLowerCase();
                if (watching.has(lower))
                    continue;
                watching.add(lower);
                provider.on({ address: lower, topics: [topicDraw] }, async (log) => {
                    try {
                        if (processed.has(lower))
                            return;
                        processed.add(lower);
                        appendDebug({ stage: 'draw_detected', pool: lower, block: log.blockNumber });
                        await handleDraw(lower);
                    }
                    catch (e) {
                        appendDebug({ stage: 'handle_error', pool: lower, err: e?.message || String(e) });
                        processed.delete(lower);
                    }
                });
            }
        }
        catch (e) {
            appendDebug({ stage: 'ensureWatchers_error', err: e?.message || String(e) });
        }
    }
    async function handleDraw(poolAddr) {
        // 读取元数据（通过别名或索引），准备 startAt = now + 600
        const idx = readIndex();
        const aliasUri = `${BASE_URL}/meta/${poolAddr.toLowerCase()}.json`;
        const srcUri = idx[poolAddr.toLowerCase()] || aliasUri;
        const meta = await fetchJson(srcUri);
        const startAt = Math.floor(Date.now() / 1000) + 600;
        const cloned = await createMetadataClone(meta || {}, startAt);
        // 计算系列键并读取配置
        const seriesKey = normalizeTitle(meta?.title);
        const cfg = readConfig().series[seriesKey] || {};
        if (cfg.enabled === false) {
            appendDebug({ stage: 'skipped_disabled', seriesKey, pool: poolAddr });
            return;
        }
        // 读取当前池信息用于缺省 min/max
        const pool = new ethers_1.Contract(poolAddr, LuckyPool_json_1.default.abi, provider);
        const info = await pool.getInfo().catch(async () => ({
            minFill: await pool.minFill(),
            maxFill: await pool.maxFill(),
        }));
        const minFill = cfg.nextMin ? ethers_1.BigNumber.from(cfg.nextMin) : ethers_1.BigNumber.from(info.minFill);
        const maxFill = cfg.nextMax ? ethers_1.BigNumber.from(cfg.nextMax) : ethers_1.BigNumber.from(info.maxFill);
        // sortOrder：沿用上一期（若可解析），否则 0
        const sortOrder = typeof cfg.sortOrder === 'number' ? cfg.sortOrder : await getSortOrderOfPool(provider, poolAddr);
        const params = {
            minFill: minFill.toString(),
            maxFill: maxFill.toString(),
            metadataURI: cloned.uri,
            sortOrder
        };
        appendDebug({ stage: 'create_next_start', seriesKey, params });
        const tx = await factory.createPool(params);
        const receipt = await tx.wait();
        // 解析新池地址
        let newPool = '';
        try {
            const iface = new ethers_1.utils.Interface(LuckyPoolFactory_json_1.default.abi);
            const ev = iface.getEvent('PoolCreated');
            const topic0 = ev.topicHash || iface.getEventTopic?.('PoolCreated');
            const l = receipt.logs.find((x) => x.topics && x.topics[0] === topic0);
            if (l) {
                const p = iface.parseLog({ topics: l.topics, data: l.data });
                newPool = String(p.args?.[0] || '');
            }
        }
        catch { }
        if (!newPool) {
            appendDebug({ stage: 'create_next_noaddr' });
            return;
        }
        // 为新池写入别名并更新索引
        const newLower = newPool.toLowerCase();
        const aliasPath = path_1.default.join(METADATA_DIR, `${newLower}.json`);
        try {
            const srcTxt = fs_1.default.readFileSync(cloned.jsonPath, 'utf-8');
            fs_1.default.writeFileSync(aliasPath, srcTxt, 'utf-8');
        }
        catch { }
        const idx2 = readIndex();
        idx2[newLower] = `${BASE_URL}/meta/${newLower}.json`;
        writeIndex(idx2);
        appendDebug({ stage: 'create_next_done', newPool });
    }
    // 首次与定时确保监听
    ensureWatchers();
    setInterval(ensureWatchers, 60000);
}
