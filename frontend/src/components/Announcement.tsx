import styled, { keyframes } from 'styled-components';

const scroll = keyframes`
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
`;

const Container = styled.div`
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  color: white;
  padding: 8px 0;
  overflow: hidden;
  position: relative;
  z-index: 20;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const Text = styled.div`
  white-space: nowrap;
  animation: ${scroll} 60s linear infinite;
  padding-left: 100%;
  display: inline-block;
  font-size: 14px;
  font-weight: 500;
`;

export default function Announcement() {
  return (
    <Container>
      <Text>
        🎉 欢迎来到 Lucky Pool！透明公正的区块链幸运池。每一笔交易都可在链上查询。祝您好运！ 🌊
      </Text>
    </Container>
  );
}
