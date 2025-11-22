import { useRef } from 'react'
import './styles.css'
import ActivityList from './components/ActivityList'
import { useWeb3 } from './web3'
import { useTranslation } from 'react-i18next'
import WaterBackground, { WaterBackgroundRef } from './components/WaterBackground'
import styled from 'styled-components'

const Header = styled.header
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
  background: rgba(0,0,0,0.1);
  backdrop-filter: blur(5px);
  position: sticky;
  top: 0;
  z-index: 10;
;

const Title = styled.h1
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.5px;
  text-shadow: 0 2px 4px rgba(0,0,0,0.1);
;

const WalletButton = styled.button
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: 600;
  backdrop-filter: blur(5px);
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
;

export default function App() {
  const { t } = useTranslation()
  const { account, connect } = useWeb3()
  const waterRef = useRef<WaterBackgroundRef>(null)

  const handleRipple = (count: number) => {
    if (waterRef.current) {
      waterRef.current.triggerRipple(count)
    }
  }

  return (
    <WaterBackground ref={waterRef}>
      <Header>
        <Title>Lucky Pool</Title>
        <WalletButton onClick={connect}>
          {account ? \\...\\ : t('connect_wallet')}
        </WalletButton>
      </Header>
      
      <ActivityList onRipple={handleRipple} />
    </WaterBackground>
  )
}
