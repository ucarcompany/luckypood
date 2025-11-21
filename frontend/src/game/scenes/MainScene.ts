import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';

export class MainScene extends Phaser.Scene {
  private socket!: Socket;
  private players: Map<string, Phaser.GameObjects.Container> = new Map();
  private pools: Map<string, Phaser.GameObjects.Container> = new Map();
  private monsters: Map<string, Phaser.GameObjects.Container> = new Map();
  private myPlayerId: string | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private walletAddress: string;
  private onEnterPool: (poolAddress: string) => void;

  constructor(walletAddress: string, onEnterPool: (poolAddress: string) => void) {
    super('MainScene');
    this.walletAddress = walletAddress;
    this.onEnterPool = onEnterPool;
  }

  preload() {
    // Load assets here if needed
    // this.load.image('player', 'assets/player.png');
  }

  create() {
    // Create Map (Green background)
    this.add.rectangle(1000, 1000, 2000, 2000, 0x2e8b57);
    this.cameras.main.setBounds(0, 0, 2000, 2000);

    // Setup Socket
    this.socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000');

    this.socket.on('connect', () => {
      console.log('Connected to Game Server');
      this.socket.emit('join', this.walletAddress);
    });

    this.socket.on('init', (data: any) => {
      this.myPlayerId = data.id;
      
      // Render existing players
      data.players.forEach((p: any) => this.addPlayer(p));
      
      // Render pools
      data.pools.forEach((p: any) => this.addPool(p));

      // Render monsters
      data.monsters.forEach((m: any) => this.addMonster(m));

      // Camera follow me
      if (this.players.has(this.myPlayerId!)) {
        this.cameras.main.startFollow(this.players.get(this.myPlayerId!)!);
      }
    });

    this.socket.on('player_joined', (p: any) => this.addPlayer(p));
    
    this.socket.on('player_moved', (p: any) => {
      const player = this.players.get(p.id);
      if (player) {
        player.setPosition(p.x, p.y);
      }
    });

    this.socket.on('player_left', (id: string) => {
      if (this.players.has(id)) {
        this.players.get(id)?.destroy();
        this.players.delete(id);
      }
    });

    this.socket.on('new_pool', (data: any) => {
      this.addPool(data.pool);
      this.addMonster(data.monster);
      // Broadcast notification (UI handled by React, but we can show text)
      this.add.text(this.cameras.main.scrollX + 400, this.cameras.main.scrollY + 50, 'New Pool Appeared!', { fontSize: '32px', color: '#ff0000' }).setOrigin(0.5);
    });

    this.socket.on('monster_update', (m: any) => {
      this.updateMonster(m);
    });

    this.socket.on('monster_defeated', (data: any) => {
      const monster = this.monsters.get(data.poolAddress);
      if (monster) {
        monster.setVisible(false); // Hide monster
      }
    });

    // Input
    if (this.input.keyboard) {
        this.cursors = this.input.keyboard.createCursorKeys();
    }
    
    // Attack Key (Space)
    this.input.keyboard?.on('keydown-SPACE', () => {
      this.tryAttack();
    });
  }

  update() {
    if (!this.myPlayerId || !this.players.has(this.myPlayerId)) return;

    const player = this.players.get(this.myPlayerId)!;
    const speed = 5;
    let moved = false;

    if (this.cursors.left.isDown) {
      player.x -= speed;
      moved = true;
    } else if (this.cursors.right.isDown) {
      player.x += speed;
      moved = true;
    }

    if (this.cursors.up.isDown) {
      player.y -= speed;
      moved = true;
    } else if (this.cursors.down.isDown) {
      player.y += speed;
      moved = true;
    }

    if (moved) {
      this.socket.emit('move', { x: player.x, y: player.y });
    }
  }

  private addPlayer(p: any) {
    if (this.players.has(p.id)) return;

    const container = this.add.container(p.x, p.y);
    const circle = this.add.circle(0, 0, 15, p.id === this.myPlayerId ? 0xffff00 : 0xffffff);
    const text = this.add.text(0, -25, `Lv.${p.level}`, { fontSize: '12px', color: '#fff' }).setOrigin(0.5);
    
    container.add([circle, text]);
    this.players.set(p.id, container);
  }

  private addPool(p: any) {
    if (this.pools.has(p.address)) return;

    const container = this.add.container(p.x, p.y);
    const circle = this.add.circle(0, 0, 40, 0x0000ff); // Blue pool
    const text = this.add.text(0, -50, p.name || 'Pool', { fontSize: '14px', color: '#fff' }).setOrigin(0.5);
    
    container.add([circle, text]);
    this.pools.set(p.address, container);
  }

  private addMonster(m: any) {
    if (this.monsters.has(m.poolAddress)) return;
    
    // Monster is near the pool
    const pool = this.pools.get(m.poolAddress);
    if (!pool) return;

    const container = this.add.container(pool.x + 50, pool.y + 50);
    const circle = this.add.circle(0, 0, 20, 0xff0000); // Red monster
    const hpBar = this.add.rectangle(0, -30, 40, 5, 0x00ff00);
    
    container.add([circle, hpBar]);
    this.monsters.set(m.poolAddress, container);
    
    if (m.deadUntil > Date.now()) {
      container.setVisible(false);
    }
  }

  private updateMonster(m: any) {
    const container = this.monsters.get(m.poolAddress);
    if (container) {
      const hpBar = container.list[1] as Phaser.GameObjects.Rectangle;
      const hpPercent = Math.max(0, m.hp / m.maxHp);
      hpBar.width = 40 * hpPercent;
      hpBar.fillColor = hpPercent > 0.5 ? 0x00ff00 : 0xff0000;
      
      if (m.hp <= 0) {
        container.setVisible(false);
      } else {
        container.setVisible(true);
      }
    }
  }

  private tryAttack() {
    if (!this.myPlayerId) return;
    const player = this.players.get(this.myPlayerId)!;

    // Check distance to monsters
    let nearestMonster: string | null = null;
    let minDist = 100;

    this.monsters.forEach((container, poolAddress) => {
      if (!container.visible) return;
      const dist = Phaser.Math.Distance.Between(player.x, player.y, container.x, container.y);
      if (dist < minDist) {
        minDist = dist;
        nearestMonster = poolAddress;
      }
    });

    if (nearestMonster) {
      this.socket.emit('attack_monster', nearestMonster);
    } else {
      // Check distance to Pools (if monster dead)
      this.pools.forEach((container, poolAddress) => {
        const dist = Phaser.Math.Distance.Between(player.x, player.y, container.x, container.y);
        if (dist < 80) {
           // Check if monster is dead
           const monster = this.monsters.get(poolAddress);
           if (!monster || !monster.visible) {
             this.onEnterPool(poolAddress);
           }
        }
      });
    }
  }
}
