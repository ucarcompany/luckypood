import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import styled from 'styled-components';

const GameContainer = styled.div`
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background-color: #2e8b57;
  touch-action: none; /* Prevent browser zooming/scrolling */
`;

const UIOverlay = styled.div`
  position: absolute;
  top: 20px;
  left: 20px;
  color: white;
  pointer-events: none;
  text-shadow: 2px 2px 0 #000;
  font-family: 'Courier New', Courier, monospace;
  font-weight: bold;
`;

const ControlsOverlay = styled.div`
  position: absolute;
  bottom: 20px;
  left: 20px;
  right: 20px;
  height: 150px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  pointer-events: none; /* Let touches pass through to buttons */
`;

const JoystickArea = styled.div`
  width: 120px;
  height: 120px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  position: relative;
  pointer-events: auto;
  backdrop-filter: blur(4px);
  border: 2px solid rgba(255,255,255,0.4);
`;

const JoystickKnob = styled.div<{ x: number, y: number }>`
  width: 50px;
  height: 50px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) translate(${props => props.x}px, ${props => props.y}px);
  box-shadow: 0 4px 10px rgba(0,0,0,0.3);
`;

const ActionButton = styled.button`
  width: 80px;
  height: 80px;
  background: #ff4757;
  border: 4px solid #fff;
  border-radius: 50%;
  color: white;
  font-weight: bold;
  font-size: 16px;
  pointer-events: auto;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 4px 0 #c0392b;
  &:active {
    transform: translateY(4px);
    box-shadow: 0 0 0 #c0392b;
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

interface GameProps {
  walletAddress: string;
}

const Game: React.FC<GameProps> = ({ walletAddress }) => {
  const gameRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Phaser.Game | null>(null);
  const [activePool, setActivePool] = useState<string | null>(null);
  
  // Joystick State
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const joystickRef = useRef<HTMLDivElement>(null);
  const touchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (gameRef.current && !game) {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: gameRef.current,
        width: window.innerWidth,
        height: window.innerHeight,
        pixelArt: true, // Enable Pixel Art mode
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false
          }
        },
        scene: [new MainScene(walletAddress, (poolAddress) => {
          setActivePool(poolAddress);
        })]
      };

      const newGame = new Phaser.Game(config);
      setGame(newGame);

      const handleResize = () => {
        if (newGame) {
          newGame.scale.resize(window.innerWidth, window.innerHeight);
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        newGame.destroy(true);
      };
    }
  }, [walletAddress]);

  // Joystick Logic
  const handleTouchStart = (e: React.TouchEvent) => {
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    updateJoystick(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
    if (touch) {
      updateJoystick(touch.clientX, touch.clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
    if (touch) {
      touchIdRef.current = null;
      setJoystickPos({ x: 0, y: 0 });
      emitJoystick(0, 0);
    }
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joystickRef.current) return;
    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDist = 35; // Max movement radius

    if (distance > maxDist) {
      const angle = Math.atan2(dy, dx);
      dx = Math.cos(angle) * maxDist;
      dy = Math.sin(angle) * maxDist;
    }

    setJoystickPos({ x: dx, y: dy });
    
    // Normalize output -1 to 1
    emitJoystick(dx / maxDist, dy / maxDist);
  };

  const emitJoystick = (x: number, y: number) => {
    if (game) {
      game.events.emit('joystick_move', { x, y });
    }
  };

  const handleAttack = () => {
    if (game) {
      game.events.emit('attack_button');
    }
  };

  return (
    <GameContainer ref={gameRef}>
      <UIOverlay>
        <h1>Lucky World</h1>
        <p>Lv.1 Adventurer</p>
      </UIOverlay>

      <ControlsOverlay>
        <JoystickArea 
          ref={joystickRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <JoystickKnob x={joystickPos.x} y={joystickPos.y} />
        </JoystickArea>

        <ActionButton onTouchStart={handleAttack} onClick={handleAttack}>
          ATTACK
        </ActionButton>
      </ControlsOverlay>

      {activePool && (
        <ModalOverlay onClick={() => setActivePool(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '400px', background: '#fff', borderRadius: '16px', overflow: 'hidden', border: '4px solid #4f46e5' }}>
             <div style={{ padding: '20px', color: '#0f172a', textAlign: 'center' }}>
               <h2 style={{margin: '0 0 10px 0'}}>✨ Wishing Well ✨</h2>
               <p style={{color: '#64748b', fontSize: '14px'}}>Throw a coin to make a wish!</p>
               <div style={{margin: '20px 0', padding: '20px', background: '#f1f5f9', borderRadius: '8px'}}>
                  <strong>Pool: {activePool.slice(0,6)}...{activePool.slice(-4)}</strong>
               </div>
               <button 
                 onClick={() => setActivePool(null)}
                 style={{
                   background: '#4f46e5', color: 'white', border: 'none', padding: '12px 24px', 
                   borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer'
                 }}
               >
                 Close
               </button>
             </div>
          </div>
        </ModalOverlay>
      )}
    </GameContainer>
  );
};

export default Game;
