"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPoolCreatedAggregator = createPoolCreatedAggregator;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ethers_1 = require("ethers");
function isRateLimit(e) {
    const msg = (e?.message || '') + ' ' + JSON.stringify(e || {});
    return e?.code === -32005 || /rate limit|limit exceeded|block range|query timeout|eth_getLogs/i.test(msg);
}
function createPoolCreatedAggregator(opts) {
    const { factory, deployBlock = 0, rpcUrl, cacheDir } = opts;
    const intervalMs = opts.intervalMs || 60000;
    if (!fs_1.default.existsSync(cacheDir))
        fs_1.default.mkdirSync(cacheDir, { recursive: true });
    const cacheFile = path_1.default.join(cacheDir, 'cache-pool-created.json');
    const provider = new ethers_1.providers.JsonRpcProvider(rpcUrl);
    const iface = new ethers_1.utils.Interface([
        'event PoolCreated(address indexed pool, uint256 min, uint256 max, string metadataURI, uint256 sortOrder)'
    ]);
    const topic0 = iface.getEventTopic('PoolCreated');
    let running = false;
    function readCache() {
        try {
            const txt = fs_1.default.readFileSync(cacheFile, 'utf-8');
            const j = JSON.parse(txt);
            if (j && typeof j === 'object' && Array.isArray(j.events))
                return j;
        }
        catch { }
        return { lastScannedBlock: deployBlock > 0 ? deployBlock - 1 : 0, events: [] };
    }
    function writeCache(c) {
        try {
            fs_1.default.writeFileSync(cacheFile, JSON.stringify(c, null, 2), 'utf-8');
        }
        catch { }
    }
    let cache = readCache();
    async function scanOnce() {
        if (running)
            return;
        running = true;
        try {
            const latest = await provider.getBlockNumber();
            let from = Math.max(deployBlock || 0, cache.lastScannedBlock + 1);
            if (from > latest)
                return;
            let step = 20000;
            const MIN_STEP = 200;
            const MAX_STEP = 80000;
            let delayMs = 300;
            while (from <= latest) {
                const to = Math.min(from + step, latest);
                try {
                    const logs = await provider.getLogs({ address: factory, topics: [topic0], fromBlock: from, toBlock: to });
                    for (const lg of logs) {
                        try {
                            const parsed = iface.parseLog(lg);
                            const pool = String(parsed.args?.pool || '').toLowerCase();
                            const uri = String(parsed.args?.metadataURI || '');
                            const sort = Number(parsed.args?.sortOrder || 0);
                            if (!pool)
                                continue;
                            if (!cache.events.find(ev => ev.pool === pool)) {
                                cache.events.push({ pool, metadataURI: uri, sortOrder: sort, blockNumber: lg.blockNumber || 0 });
                            }
                        }
                        catch { }
                    }
                    cache.lastScannedBlock = to;
                    writeCache(cache);
                    from = to + 1;
                    delayMs = 300;
                    if (step < MAX_STEP)
                        step = Math.min(MAX_STEP, Math.floor(step * 1.4));
                }
                catch (e) {
                    if (isRateLimit(e)) {
                        step = Math.max(MIN_STEP, Math.floor(step / 2));
                        await new Promise(r => setTimeout(r, delayMs));
                        delayMs = Math.min(4000, Math.floor(delayMs * 1.6));
                        continue;
                    }
                    // 非速率限制错误：记录并终止本轮
                    break;
                }
            }
        }
        finally {
            running = false;
        }
    }
    // 立即启动一次 + 定时
    scanOnce().catch(() => { });
    setInterval(scanOnce, intervalMs).unref();
    return {
        getEvents: () => cache.events.slice(),
        getLastScannedBlock: () => cache.lastScannedBlock,
        forceScan: async () => { await scanOnce(); }
    };
}
