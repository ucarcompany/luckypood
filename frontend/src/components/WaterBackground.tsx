import React, { useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import styled, { keyframes } from 'styled-components';

const rippleAnimation = keyframes`
  0% {
    transform: scale(0);
    opacity: 1;
  }
  100% {
    transform: scale(4);
    opacity: 0;
  }
`;

const Container = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #006994 0%, #00a8cc 100%);
  z-index: -1;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop');
    background-size: cover;
    background-position: center;
    opacity: 0.8;
  }
`;

const Ripple = styled.div<{ x: number; y: number }>`
  position: absolute;
  left: ${props => props.x}px;
  top: ${props => props.y}px;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
  transform: translate(-50%, -50%);
  animation: ${rippleAnimation} 1.5s ease-out forwards;
  pointer-events: none;
  z-index: 0;
`;

export interface WaterBackgroundRef {
  triggerRipple: (count: number) => void;
}

const WaterBackground = forwardRef<WaterBackgroundRef, { children?: React.ReactNode }>((props, ref) => {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  const addRipple = useCallback((count: number) => {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;
        const id = Date.now() + Math.random();
        setRipples(prev => [...prev, { id, x, y }]);
        
        // Cleanup
        setTimeout(() => {
          setRipples(prev => prev.filter(r => r.id !== id));
        }, 1500);
      }, i * 400); // Stagger ripples
    }
  }, []);

  useImperativeHandle(ref, () => ({
    triggerRipple: addRipple
  }));

  return (
    <>
      <Container>
        {ripples.map(r => (
          <Ripple key={r.id} x={r.x} y={r.y} />
        ))}
      </Container>
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', overflowY: 'auto' }}>
        {props.children}
      </div>
    </>
  );
});

export default WaterBackground;
