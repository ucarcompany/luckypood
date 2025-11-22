import styled from 'styled-components';

export const GlassCard = styled.div`
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 24px;
  color: white;
  transition: transform 0.2s;
  margin-bottom: 20px;
  position: relative;
  overflow: hidden;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 50%;
    background: linear-gradient(to bottom, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%);
    pointer-events: none;
  }
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 40px 0 rgba(31, 38, 135, 0.25);
  }
`;

export const GlassButton = styled.button<{ variant?: 'primary' | 'danger' | 'secondary' }>`
  background: ${props => {
    if (props.variant === 'danger') return 'rgba(255, 59, 48, 0.4)';
    if (props.variant === 'secondary') return 'rgba(142, 142, 147, 0.4)';
    return 'rgba(0, 122, 255, 0.4)';
  }};
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(4px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 12px 20px;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover {
    background: ${props => {
      if (props.variant === 'danger') return 'rgba(255, 59, 48, 0.6)';
      if (props.variant === 'secondary') return 'rgba(142, 142, 147, 0.6)';
      return 'rgba(0, 122, 255, 0.6)';
    }};
    transform: scale(1.02);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

export const ProgressBar = styled.div<{ percent: number }>`
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
  margin: 10px 0;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: ${props => Math.min(100, Math.max(0, props.percent))}%;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 4px;
    transition: width 0.5s ease-out;
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
  }
`;

export const CardTitle = styled.h3`
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 700;
  text-shadow: 0 2px 4px rgba(0,0,0,0.1);
`;

export const CardContent = styled.p`
  margin: 0 0 16px 0;
  font-size: 14px;
  line-height: 1.5;
  opacity: 0.9;
`;

export const CardImage = styled.img`
  width: 100%;
  height: 160px;
  object-fit: cover;
  border-radius: 12px;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
`;
