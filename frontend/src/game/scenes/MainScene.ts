import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '../../config';

export class MainScene extends Phaser.Scene {
  private socket!: Socket;
  private players: Map<string, Phaser.GameObjects.Container> = new Map();
  private pools: Map<string, Phaser.GameObjects.Container> = new Map();
  private monsters: Map<string, Phaser.GameObjects.Container> = new Map();
  private myPlayerId: string | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private walletAddress: string;
  private onEnterPool: (poolAddress: string) => void;
  private joystickInput = { x: 0, y: 0 };
  private isAttacking = false;

  constructor(walletAddress: string, onEnterPool: (poolAddress: string) => void) {
    super('MainScene');
    this.walletAddress = walletAddress;
    this.onEnterPool = onEnterPool;
  }

  preload() {
    // Pixel art textures will be generated programmatically
  }

  create() {
    // Set background color to match the grass
    this.cameras.main.setBackgroundColor('#568f56');
    
    // Create Map with pixel art style
    const mapSize = 3200;
    this.cameras.main.setBounds(0, 0, mapSize, mapSize);
    this.physics.world.setBounds(0, 0, mapSize, mapSize);

    // Draw grass tiles
    this.createPixelGrass(mapSize);
    
    // Add trees and rocks for decoration
    this.createDecorations(mapSize);

    // Setup Socket
    // Use BACKEND_URL from config which handles env vars and defaults correctly
    console.log('Connecting to Game Server at:', BACKEND_URL || 'Current Origin');
    this.socket = io(BACKEND_URL || undefined, {
      transports: ['websocket', 'polling']
    });

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
        this.cameras.main.startFollow(this.players.get(this.myPlayerId!)!, true, 0.1, 0.1);
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
      // Show notification
      const text = this.add.text(
        this.cameras.main.scrollX + this.cameras.main.width / 2, 
        this.cameras.main.scrollY + 50, 
        '✨ New Pool Appeared! ✨', 
        { fontSize: '24px', color: '#FFD700', fontStyle: 'bold' }
      ).setOrigin(0.5);
      
      this.tweens.add({
        targets: text,
        alpha: 0,
        y: text.y - 50,
        duration: 2000,
        onComplete: () => text.destroy()
      });
    });

    this.socket.on('monster_update', (m: any) => {
      this.updateMonster(m);
    });

    this.socket.on('monster_defeated', (data: any) => {
      const monster = this.monsters.get(data.poolAddress);
      if (monster) {
        monster.setVisible(false);
      }
    });

    // Input - Keyboard
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }
    
    // Attack Key (Space)
    this.input.keyboard?.on('keydown-SPACE', () => {
      this.tryAttack();
    });

    // Mobile joystick input
    this.game.events.on('joystick_move', (data: { x: number; y: number }) => {
      this.joystickInput = data;
    });

    this.game.events.on('attack_button', () => {
      this.tryAttack();
    });
  }

  update() {
    if (!this.myPlayerId || !this.players.has(this.myPlayerId)) return;

    const player = this.players.get(this.myPlayerId)!;
    const speed = 3;
    let moved = false;
    let vx = 0;
    let vy = 0;

    // Keyboard input
    if (this.cursors.left.isDown) {
      vx = -speed;
      moved = true;
    } else if (this.cursors.right.isDown) {
      vx = speed;
      moved = true;
    }

    if (this.cursors.up.isDown) {
      vy = -speed;
      moved = true;
    } else if (this.cursors.down.isDown) {
      vy = speed;
      moved = true;
    }

    // Joystick input (override keyboard if active)
    if (Math.abs(this.joystickInput.x) > 0.1 || Math.abs(this.joystickInput.y) > 0.1) {
      vx = this.joystickInput.x * speed;
      vy = this.joystickInput.y * speed;
      moved = true;
    }

    if (moved) {
      // Clamp to map bounds
      const newX = Phaser.Math.Clamp(player.x + vx, 20, 3180);
      const newY = Phaser.Math.Clamp(player.y + vy, 20, 3180);
      player.setPosition(newX, newY);
      this.socket.emit('move', { x: newX, y: newY });
    }
  }

  private createPixelGrass(mapSize: number) {
    // Create grass pattern
    const tileSize = 64;
    const graphics = this.add.graphics();
    
    for (let x = 0; x < mapSize; x += tileSize) {
      for (let y = 0; y < mapSize; y += tileSize) {
        // Base grass
        const shade = Phaser.Math.Between(0, 2);
        const colors = [0x568f56, 0x4a7c47, 0x3d6a3d];
        graphics.fillStyle(colors[shade], 1);
        graphics.fillRect(x, y, tileSize, tileSize);
        
        // Add some grass detail
        if (Math.random() > 0.7) {
          graphics.fillStyle(0x62a15a, 1);
          const gx = x + Phaser.Math.Between(4, tileSize - 8);
          const gy = y + Phaser.Math.Between(4, tileSize - 8);
          graphics.fillRect(gx, gy, 4, 4);
        }
      }
    }
  }

  private createDecorations(mapSize: number) {
    // Add trees
    for (let i = 0; i < 40; i++) {
      const x = Phaser.Math.Between(100, mapSize - 100);
      const y = Phaser.Math.Between(100, mapSize - 100);
      this.createPixelTree(x, y);
    }

    // Add rocks
    for (let i = 0; i < 30; i++) {
      const x = Phaser.Math.Between(100, mapSize - 100);
      const y = Phaser.Math.Between(100, mapSize - 100);
      this.createPixelRock(x, y);
    }

    // Add flowers
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(50, mapSize - 50);
      const y = Phaser.Math.Between(50, mapSize - 50);
      this.createPixelFlower(x, y);
    }
  }

  private createPixelTree(x: number, y: number) {
    const container = this.add.container(x, y);
    container.setDepth(y); // Depth sorting
    
    // Tree trunk (brown)
    const trunk = this.add.rectangle(0, 8, 12, 20, 0x8B4513);
    
    // Tree foliage (dark green circles in pixel style)
    const foliage1 = this.add.circle(-8, -8, 12, 0x2d5016);
    const foliage2 = this.add.circle(8, -8, 12, 0x2d5016);
    const foliage3 = this.add.circle(0, -16, 14, 0x1e3a0f);
    
    container.add([trunk, foliage1, foliage2, foliage3]);
  }

  private createPixelRock(x: number, y: number) {
    const container = this.add.container(x, y);
    container.setDepth(y);
    
    // Rock (gray)
    const rock = this.add.ellipse(0, 0, 24, 18, 0x808080);
    const highlight = this.add.ellipse(-4, -4, 8, 6, 0xa0a0a0);
    
    container.add([rock, highlight]);
  }

  private createPixelFlower(x: number, y: number) {
    const colors = [0xff69b4, 0xffd700, 0xff6347, 0x9370db];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    // Small flower
    const flower = this.add.circle(x, y, 4, color);
    flower.setDepth(y - 1);
  }

  private addPlayer(p: any) {
    if (this.players.has(p.id)) return;

    const container = this.add.container(p.x, p.y);
    container.setDepth(10000 + p.y); // Always on top, but depth sorted
    
    // Pixel character - simple but cute
    const isMe = p.id === this.myPlayerId;
    
    // Body (overalls)
    const body = this.add.rectangle(0, 2, 16, 18, 0xff0000);
    
    // Head (skin tone)
    const head = this.add.circle(0, -8, 10, 0xffc0a0);
    
    // Hair (yellow)
    const hair = this.add.ellipse(0, -14, 14, 8, 0xffd700);
    
    // Eyes
    const eye1 = this.add.circle(-3, -9, 2, 0x000000);
    const eye2 = this.add.circle(3, -9, 2, 0x000000);
    
    // Hat (blue)
    const hat = this.add.ellipse(0, -18, 16, 6, isMe ? 0x0066ff : 0x6666ff);
    
    // Level text
    const text = this.add.text(0, -30, `Lv.${p.level}`, { 
      fontSize: '10px', 
      color: '#fff',
      fontFamily: 'Arial',
      stroke: '#000',
      strokeThickness: 2
    }).setOrigin(0.5);
    
    container.add([body, head, hair, hat, eye1, eye2, text]);
    
    // Add glow for current player
    if (isMe) {
      const glow = this.add.circle(0, 0, 20, 0xffff00, 0.2);
      container.add(glow);
    }
    
    this.players.set(p.id, container);
  }

  private addPool(p: any) {
    if (this.pools.has(p.address)) return;

    const container = this.add.container(p.x, p.y);
    container.setDepth(p.y - 10);
    
    // Wishing well/pool (pixel style)
    // Stone base
    const base = this.add.rectangle(0, 10, 60, 20, 0x808080);
    
    // Water surface (blue)
    const water = this.add.ellipse(0, 0, 56, 40, 0x4a9eff);
    
    // Water shimmer
    const shimmer1 = this.add.ellipse(-10, -5, 12, 8, 0x87ceeb, 0.6);
    const shimmer2 = this.add.ellipse(8, 3, 10, 6, 0x87ceeb, 0.6);
    
    // Stone edge
    const edge = this.add.ellipse(0, -20, 64, 12, 0x696969);
    
    // Name text
    const text = this.add.text(0, -40, p.name || '💧 Wishing Well', { 
      fontSize: '12px', 
      color: '#fff',
      fontFamily: 'Arial',
      stroke: '#000',
      strokeThickness: 3
    }).setOrigin(0.5);
    
    container.add([base, water, shimmer1, shimmer2, edge, text]);
    
    // Sparkle animation
    this.tweens.add({
      targets: [shimmer1, shimmer2],
      alpha: 0.3,
      duration: 1500,
      yoyo: true,
      repeat: -1
    });
    
    this.pools.set(p.address, container);
  }

  private addMonster(m: any) {
    if (this.monsters.has(m.poolAddress)) return;
    
    // Monster is near the pool
    const pool = this.pools.get(m.poolAddress);
    if (!pool) return;

    const container = this.add.container(pool.x + 60, pool.y + 30);
    container.setDepth(pool.y + 40);
    
    // Pixel slime/blob monster
    // Body (red/pink blob)
    const body = this.add.ellipse(0, 0, 32, 28, 0xff4444);
    const bodyShade = this.add.ellipse(0, 8, 28, 12, 0xcc0000);
    
    // Eyes
    const eye1 = this.add.circle(-6, -4, 4, 0xffffff);
    const eye2 = this.add.circle(6, -4, 4, 0xffffff);
    const pupil1 = this.add.circle(-6, -3, 2, 0x000000);
    const pupil2 = this.add.circle(6, -3, 2, 0x000000);
    
    // HP Bar background
    const hpBg = this.add.rectangle(0, -24, 40, 6, 0x333333);
    const hpBar = this.add.rectangle(-20, -24, 40, 6, 0x00ff00);
    hpBar.setOrigin(0, 0.5);
    
    container.add([body, bodyShade, eye1, eye2, pupil1, pupil2, hpBg, hpBar]);
    
    // Store HP bar reference
    (container as any).hpBar = hpBar;
    
    this.monsters.set(m.poolAddress, container);
    
    if (m.deadUntil > Date.now()) {
      container.setVisible(false);
    }
    
    // Idle animation - bounce
    this.tweens.add({
      targets: container,
      y: container.y - 5,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private updateMonster(m: any) {
    const container = this.monsters.get(m.poolAddress);
    if (container) {
      const hpBar = (container as any).hpBar as Phaser.GameObjects.Rectangle;
      const hpPercent = Math.max(0, m.hp / m.maxHp);
      hpBar.width = 40 * hpPercent;
      hpBar.fillColor = hpPercent > 0.5 ? 0x00ff00 : (hpPercent > 0.2 ? 0xffaa00 : 0xff0000);
      
      if (m.hp <= 0) {
        container.setVisible(false);
      } else {
        container.setVisible(true);
      }
    }
  }

  private tryAttack() {
    if (!this.myPlayerId || this.isAttacking) return;
    
    this.isAttacking = true;
    setTimeout(() => this.isAttacking = false, 500); // Attack cooldown
    
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
      
      // Visual attack effect
      const attackEffect = this.add.circle(player.x, player.y, 20, 0xffff00, 0.6);
      attackEffect.setDepth(player.y + 1);
      
      this.tweens.add({
        targets: attackEffect,
        scale: 2,
        alpha: 0,
        duration: 300,
        onComplete: () => attackEffect.destroy()
      });
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
