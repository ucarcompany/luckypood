import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import styled from 'styled-components';
import WishingWell from '../components/WishingWell'; // Reuse existing component

const GameContainer = styled.div`
  width: 100%;
  height: 100vh;
  overflow: hidden;
`;

const UIOverlay = styled.div`
  position: absolute;
  top: 20px;
  left: 20px;
  color: white;
  pointer-events: none;
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

  useEffect(() => {
    if (gameRef.current && !game) {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: gameRef.current,
        width: window.innerWidth,
        height: window.innerHeight,
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 0 }, // No gravity for top-down
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

  return (
    <GameContainer ref={gameRef}>
      <UIOverlay>
        <h1>Lucky World</h1>
        <p>Use Arrow Keys to Move. SPACE to Attack.</p>
      </UIOverlay>

      {activePool && (
        <ModalOverlay onClick={() => setActivePool(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '80%', height: '80%', background: 'white', borderRadius: '10px', overflow: 'auto' }}>
             {/* We need to adapt WishingWell to take a pool address or just show the generic one for now */}
             {/* Assuming WishingWell is the component we built earlier. We might need to pass the pool address to it. */}
             <div style={{ padding: '20px', color: 'black' }}>
               <h2>Wishing Well: {activePool}</h2>
               <p>The Fairy says: "Throw a coin to make a wish!"</p>
               {/* Placeholder for actual interaction */}
               <button onClick={() => setActivePool(null)}>Close</button>
             </div>
          </div>
        </ModalOverlay>
      )}
    </GameContainer>
  );
};

export default Game;
