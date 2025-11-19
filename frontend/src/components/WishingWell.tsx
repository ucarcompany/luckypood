import { useEffect, useRef, useState } from 'react'
import styled, { keyframes, css } from 'styled-components'

const wave = keyframes`
  0% { transform: translateX(0) translateZ(0) scaleY(1) }
  50% { transform: translateX(-25%) translateZ(0) scaleY(0.55) }
  100% { transform: translateX(-50%) translateZ(0) scaleY(1) }
`

const coinDrop = keyframes`
  0% { transform: translateY(-200px) rotateY(0); opacity: 0; }
  20% { opacity: 1; }
  90% { transform: translateY(0) rotateY(720deg); opacity: 1; }
  100% { transform: translateY(10px) rotateY(720deg); opacity: 0; }
`

const fountain = keyframes`
  0% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(-100px) scale(0); opacity: 0; }
`

const WellContainer = styled.div`
  position: relative;
  width: 100%;
  height: 200px;
  background: #e0e0e0;
  border-radius: 12px;
  overflow: hidden;
  border: 4px solid #8d6e63;
  box-shadow: inset 0 0 20px rgba(0,0,0,0.2);
  margin-bottom: 16px;
`

const Water = styled.div<{ level: number }>`
  position: absolute;
  bottom: 0;
  left: 0;
  width: 200%;
  height: ${p => Math.max(5, p.level)}%;
  background: rgba(33, 150, 243, 0.8);
  transform-origin: center bottom;
  animation: ${wave} 8s linear infinite;
  transition: height 1s ease-in-out;
  &::before {
    content: '';
    position: absolute;
    width: 100%;
    height: 100%;
    background: rgba(33, 150, 243, 0.4);
    top: -5px;
    left: 0;
    animation: ${wave} 12s linear infinite reverse;
  }
`

const Coin = styled.div`
  position: absolute;
  left: 50%;
  top: 60%;
  width: 20px;
  height: 20px;
  background: gold;
  border-radius: 50%;
  border: 2px solid orange;
  animation: ${coinDrop} 1s ease-in forwards;
  z-index: 10;
`

const Particle = styled.div<{ x: number, y: number, color: string }>`
  position: absolute;
  left: ${p => p.x}%;
  bottom: ${p => p.y}%;
  width: 6px;
  height: 6px;
  background: ${p => p.color};
  border-radius: 50%;
  animation: ${fountain} 1.5s ease-out infinite;
  animation-delay: ${() => Math.random() * 1}s;
`

export default function WishingWell({ progress, isFull, isDrawn, triggerDrop }: { progress: number, isFull: boolean, isDrawn: boolean, triggerDrop: number }) {
  const [coins, setCoins] = useState<number[]>([])
  
  useEffect(() => {
    if (triggerDrop > 0) {
      const id = Date.now()
      setCoins(prev => [...prev, id])
      setTimeout(() => setCoins(prev => prev.filter(c => c !== id)), 1000)
    }
  }, [triggerDrop])

  return (
    <WellContainer>
      <div style={{position:'absolute', top:10, left:0, width:'100%', textAlign:'center', color:'#5d4037', fontWeight:'bold', zIndex:5}}>
        {isDrawn ? '🎉 许愿达成 🎉' : isFull ? '🌊 池子已满 🌊' : '💧 许愿池 💧'}
      </div>
      <Water level={progress * 100} />
      {coins.map(id => <Coin key={id} />)}
      {(isFull || isDrawn) && Array.from({length: 20}).map((_, i) => (
        <Particle 
          key={i} 
          x={40 + Math.random() * 20} 
          y={progress * 100} 
          color={isDrawn ? `hsl(${Math.random()*360}, 100%, 50%)` : '#a0e0ff'} 
          style={{ animationDuration: 0.5 + Math.random() + 's', animationDelay: Math.random() + 's' }}
        />
      ))}
    </WellContainer>
  )
}
