import { useRef } from 'react'
import './styles.css'
import ActivityList from './components/ActivityList'
import { useWeb3 } from './web3'
import { useTranslation } from 'react-i18next'
import WaterBackground, { WaterBackgroundRef } from './components/WaterBackground'
import Announcement from './components/Announcement'
import FloatingChat from './components/FloatingChat'
import styled from 'styled-components'

const Header = styled.header`
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  pointer-events: auto; /* 确保可点击 */
`;

const Title = styled.h1`
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.5px;
  text-shadow: 0 2px 4px rgba(0,0,0,0.1);
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 10px;
  pointer-events: auto; /* 确保可点击 */
`;

const WalletButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: 600;
  backdrop-filter: blur(10px);
  transition: all 0.2s;
  font-size: 14px;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }
`;

export default function App() {
  const { t, i18n } = useTranslation()
  const { account, connect } = useWeb3()
  const waterRef = useRef<WaterBackgroundRef>(null)

  const handleRipple = (count: number) => {
    if (waterRef.current) {
      waterRef.current.triggerRipple(count)
    }
  }

  const toggleLanguage = () => {
    const newLang = i18n.language.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
    localStorage.setItem('lang', newLang);
  };

  const switchNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x38' }], // BSC Mainnet
      });
    } catch (error: any) {
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x38',
                chainName: 'Binance Smart Chain',
                nativeCurrency: {
                  name: 'BNB',
                  symbol: 'BNB',
                  decimals: 18,
                },
                rpcUrls: ['https://bsc-dataseed.binance.org/'],
                blockExplorerUrls: ['https://bscscan.com/'],
              },
            ],
          });
        } catch (addError) {
          console.error(addError);
        }
      }
      console.error(error);
    }
  };

  return (
    <>
      <WaterBackground ref={waterRef}>
        <Announcement />
        <Header>
          <Title>Lucky Pool</Title>
        <ButtonGroup>
          <WalletButton onClick={toggleLanguage}>
            {i18n.language.startsWith('zh') ? 'English' : '中文'}
          </WalletButton>
          <WalletButton onClick={switchNetwork}>
            {t('switchToBscTestnet')}
          </WalletButton>
          <WalletButton onClick={connect}>
            {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : t('connect')}
          </WalletButton>
        </ButtonGroup>
        </Header>
        
        <ActivityList onRipple={handleRipple} />
      </WaterBackground>
      <FloatingChat />
    </>
  )
}
