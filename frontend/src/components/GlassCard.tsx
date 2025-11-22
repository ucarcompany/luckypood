import styled from 'styled-components';

export const GlassCard = styled.div`
  /* 纯玻璃感：极低不透明度 + 轻雾化 + 边框高光 */
  background: rgba(255,255,255,0.06);
  backdrop-filter: blur(30px) saturate(180%) contrast(110%);
  -webkit-backdrop-filter: blur(30px) saturate(180%) contrast(110%);
  border-radius: 28px;
  border: 1px solid rgba(255,255,255,0.35);
  border-top: 1px solid rgba(255,255,255,0.55);
  border-left: 1px solid rgba(255,255,255,0.45);
  padding: 26px 28px;
  color: #0e1116;
  box-shadow:
    0 4px 18px -4px rgba(0,0,0,0.25),
    0 2px 6px -1px rgba(0,0,0,0.12),
    inset 0 0 0 0 rgba(255,255,255,0.25);
  position: relative;
  overflow: hidden;
  transition: box-shadow .35s cubic-bezier(.17,.67,.27,.99), transform .25s;
  margin: 18px 0 26px;

  &::before { /* 内部柔光 */
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 25% 15%, rgba(255,255,255,0.35), rgba(255,255,255,0) 60%);
    pointer-events: none;
    mix-blend-mode: overlay;
  }

  &::after { /* 斜向高光线条 */
    content: '';
    position: absolute;
    top: -30%;
    left: -10%;
    width: 140%;
    height: 200%;
    background: linear-gradient(115deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 45%, rgba(255,255,255,0) 60%);
    opacity: .45;
    transform: rotate(3deg);
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow:
      0 8px 26px -6px rgba(0,0,0,0.3),
      0 12px 42px 4px rgba(0,0,0,0.15);
  }
`;

export const GlassButton = styled.button<{ variant?: 'primary' | 'danger' | 'secondary' }>`
  background: ${props => {
    if (props.variant === 'danger') return '#fff'; // 退款白色
    if (props.variant === 'secondary') return '#fff'; // 尝试开奖白色
    return '#5856d6'; // 参与紫色
  }};
  color: ${props => {
    if (props.variant === 'danger' || props.variant === 'secondary') return '#999';
    return 'white';
  }};
  border: ${props => {
    if (props.variant === 'danger' || props.variant === 'secondary') return '1px solid #eee';
    return 'none';
  }};
  box-shadow: ${props => props.variant === 'primary' ? '0 4px 12px rgba(88, 86, 214, 0.3)' : 'none'};
  border-radius: 12px;
  padding: 10px 20px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    opacity: 0.9;
    transform: scale(1.02);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    background: #f5f5f5;
    color: #ccc;
  }
`;

export const ProgressBar = styled.div<{ percent: number }>`
  width: 100%;
  height: 12px;
  background: #f0f0f5;
  border-radius: 6px;
  overflow: hidden;
  margin: 15px 0;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: ${props => Math.min(100, Math.max(0, props.percent))}%;
    background: #5856d6; /* 紫色进度条 */
    border-radius: 6px;
    transition: width 0.5s ease-out;
  }
`;

export const CardTitle = styled.h3`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #000;
`;

export const CardContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const CardImage = styled.img`
  width: 60px;
  height: 60px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid white;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
`;
