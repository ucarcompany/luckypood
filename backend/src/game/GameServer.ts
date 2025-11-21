import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import fs from 'fs';
import path from 'path';

interface Player {
  id: string;
  wallet?: string;
  x: number;
  y: number;
  level: number;
  xp: number;
  lastSeen: number;
}

interface Monster {
  poolAddress: string;
  hp: number;
  maxHp: number;
  level: number;
  deadUntil: number; // Timestamp
}

interface GamePool {
  address: string;
  x: number;
  y: number;
  name: string;
}

const GAME_STATE_FILE = path.join(process.cwd(), 'data', 'gamestate.json');

export class GameServer {
  private io: SocketIOServer;
  private players: Map<string, Player> = new Map();
  private monsters: Map<string, Monster> = new Map();
  private pools: Map<string, GamePool> = new Map();
  private mapSize = { width: 3200, height: 3200 };
  private metadataDir: string;

  constructor(httpServer: HttpServer, metadataDir: string) {
    this.metadataDir = metadataDir;
    this.io = new SocketIOServer(httpServer, {
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

  private watchMetadata() {
    if (!fs.existsSync(this.metadataDir)) return;
    
    fs.watch(this.metadataDir, (eventType, filename) => {
      if (filename && filename.endsWith('.json') && eventType === 'rename') {
        // Check if file exists (it might be a delete event, though rename usually covers creation)
        const filePath = path.join(this.metadataDir, filename);
        if (fs.existsSync(filePath)) {
           try {
             const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
             // Assuming metadata format has pool address and name
             // Adjust based on actual metadata structure
             if (content.poolAddress) {
               this.addPool(content.poolAddress, content.name || 'Unknown Pool');
             }
           } catch (e) {
             console.error('Error reading new metadata:', e);
           }
        }
      }
    });
  }

  private loadState() {
    if (fs.existsSync(GAME_STATE_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(GAME_STATE_FILE, 'utf-8'));
        // Load pools and monsters. Players are transient for now (or could be persistent)
        if (data.pools) {
          data.pools.forEach((p: GamePool) => this.pools.set(p.address, p));
        }
        if (data.monsters) {
          data.monsters.forEach((m: Monster) => this.monsters.set(m.poolAddress, m));
        }
      } catch (e) {
        console.error('Failed to load game state', e);
      }
    }
  }

  private saveState() {
    const data = {
      pools: Array.from(this.pools.values()),
      monsters: Array.from(this.monsters.values())
    };
    // Ensure dir exists
    const dir = path.dirname(GAME_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(GAME_STATE_FILE, JSON.stringify(data, null, 2));
  }

  private setupSocket() {
    this.io.on('connection', (socket: Socket) => {
      console.log('Player connected:', socket.id);

      socket.on('join', (wallet: string) => {
        // Initialize player
        // Check if we have saved data for this wallet (TODO: Persist player stats)
        const player: Player = {
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

      socket.on('move', (data: { x: number, y: number }) => {
        const player = this.players.get(socket.id);
        if (player) {
          player.x = data.x;
          player.y = data.y;
          player.lastSeen = Date.now();
          socket.broadcast.emit('player_moved', { id: socket.id, x: player.x, y: player.y });
        }
      });

      socket.on('attack_monster', (poolAddress: string) => {
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
  public addPool(address: string, name: string) {
    if (!this.pools.has(address)) {
      const x = Math.random() * (this.mapSize.width - 200) + 100;
      const y = Math.random() * (this.mapSize.height - 200) + 100;
      
      const pool: GamePool = { address, x, y, name };
      const monster: Monster = {
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

  private gameLoop() {
    setInterval(() => {
      // Periodic cleanup or logic
    }, 1000);
  }
}
