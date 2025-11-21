"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameServer = void 0;
const socket_io_1 = require("socket.io");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const GAME_STATE_FILE = path_1.default.join(process.cwd(), 'data', 'gamestate.json');
class GameServer {
    constructor(httpServer, metadataDir) {
        this.players = new Map();
        this.monsters = new Map();
        this.pools = new Map();
        this.mapSize = { width: 3200, height: 3200 };
        this.metadataDir = metadataDir;
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        this.loadState();
        this.watchMetadata();
        this.setupSocket();
        this.gameLoop();
    }
    watchMetadata() {
        if (!fs_1.default.existsSync(this.metadataDir))
            return;
        fs_1.default.watch(this.metadataDir, (eventType, filename) => {
            if (filename && filename.endsWith('.json') && eventType === 'rename') {
                // Check if file exists (it might be a delete event, though rename usually covers creation)
                const filePath = path_1.default.join(this.metadataDir, filename);
                if (fs_1.default.existsSync(filePath)) {
                    try {
                        const content = JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
                        // Assuming metadata format has pool address and name
                        // Adjust based on actual metadata structure
                        if (content.poolAddress) {
                            this.addPool(content.poolAddress, content.name || 'Unknown Pool');
                        }
                    }
                    catch (e) {
                        console.error('Error reading new metadata:', e);
                    }
                }
            }
        });
    }
    loadState() {
        if (fs_1.default.existsSync(GAME_STATE_FILE)) {
            try {
                const data = JSON.parse(fs_1.default.readFileSync(GAME_STATE_FILE, 'utf-8'));
                // Load pools and monsters. Players are transient for now (or could be persistent)
                if (data.pools) {
                    data.pools.forEach((p) => this.pools.set(p.address, p));
                }
                if (data.monsters) {
                    data.monsters.forEach((m) => this.monsters.set(m.poolAddress, m));
                }
            }
            catch (e) {
                console.error('Failed to load game state', e);
            }
        }
    }
    saveState() {
        const data = {
            pools: Array.from(this.pools.values()),
            monsters: Array.from(this.monsters.values())
        };
        // Ensure dir exists
        const dir = path_1.default.dirname(GAME_STATE_FILE);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(GAME_STATE_FILE, JSON.stringify(data, null, 2));
    }
    setupSocket() {
        this.io.on('connection', (socket) => {
            console.log('Player connected:', socket.id);
            socket.on('join', (wallet) => {
                // Initialize player
                // Check if we have saved data for this wallet (TODO: Persist player stats)
                const player = {
                    id: socket.id,
                    wallet,
                    x: Math.random() * 500 + 100, // Spawn area
                    y: Math.random() * 500 + 100,
                    level: 1,
                    xp: 0,
                    lastSeen: Date.now()
                };
                this.players.set(socket.id, player);
                // Send initial state
                socket.emit('init', {
                    id: socket.id,
                    players: Array.from(this.players.values()),
                    pools: Array.from(this.pools.values()),
                    monsters: Array.from(this.monsters.values()),
                    mapSize: this.mapSize
                });
                socket.broadcast.emit('player_joined', player);
            });
            socket.on('move', (data) => {
                const player = this.players.get(socket.id);
                if (player) {
                    player.x = data.x;
                    player.y = data.y;
                    player.lastSeen = Date.now();
                    socket.broadcast.emit('player_moved', { id: socket.id, x: player.x, y: player.y });
                }
            });
            socket.on('attack_monster', (poolAddress) => {
                const player = this.players.get(socket.id);
                const monster = this.monsters.get(poolAddress);
                if (player && monster && monster.deadUntil < Date.now()) {
                    // Damage calculation
                    const damage = player.level * 10; // Simple formula
                    monster.hp -= damage;
                    this.io.emit('monster_update', monster);
                    if (monster.hp <= 0) {
                        // Monster defeated
                        monster.deadUntil = Date.now() + 3600000; // 1 hour
                        monster.hp = monster.maxHp; // Reset HP for next spawn
                        // Award XP
                        player.xp += 10;
                        if (player.xp >= player.level * 100) {
                            player.level++;
                            player.xp = 0;
                            socket.emit('level_up', player.level);
                        }
                        this.io.emit('monster_defeated', { poolAddress, killerId: socket.id });
                        this.saveState();
                    }
                }
            });
            socket.on('disconnect', () => {
                this.players.delete(socket.id);
                this.io.emit('player_left', socket.id);
            });
        });
    }
    // Call this when a new pool is detected by the watcher
    addPool(address, name) {
        if (!this.pools.has(address)) {
            const x = Math.random() * (this.mapSize.width - 200) + 100;
            const y = Math.random() * (this.mapSize.height - 200) + 100;
            const pool = { address, x, y, name };
            const monster = {
                poolAddress: address,
                hp: 100, // Base HP
                maxHp: 100,
                level: 1,
                deadUntil: 0
            };
            this.pools.set(address, pool);
            this.monsters.set(address, monster);
            this.io.emit('new_pool', { pool, monster });
            this.saveState();
        }
    }
    gameLoop() {
        setInterval(() => {
            // Periodic cleanup or logic
        }, 1000);
    }
}
exports.GameServer = GameServer;
