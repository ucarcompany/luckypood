import styled from 'styled-components';

export const GlassCard = styled.div`
  background: rgba(255, 255, 255, 0.85); /* 更不透明的白色，接近图1效果 */
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.1);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  padding: 24px;
  color: #333; /* 深色文字 */
  transition: transform 0.2s;
  margin-bottom: 20px;
  position: relative;
  overflow: hidden;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 40px 0 rgba(31, 38, 135, 0.15);
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
