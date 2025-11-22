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
  padding: 18px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(16px) saturate(160%);
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  pointer-events: auto;
  flex-wrap: wrap;
  gap: 14px;
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
  pointer-events: auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 100%;
`;

const WalletButton = styled.button`
  background: linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.08));
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: white;
  padding: 8px 18px;
  border-radius: 24px;
  cursor: pointer;
  font-weight: 600;
  backdrop-filter: blur(14px) saturate(160%);
  transition: all 0.22s cubic-bezier(.17,.67,.27,.99);
  font-size: 13px;
  letter-spacing: .3px;
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.35) 55%, rgba(255,255,255,0) 70%);
    opacity: .65;
    pointer-events: none;
  }

  &:hover {
    background: linear-gradient(145deg, rgba(255,255,255,0.28), rgba(255,255,255,0.12));
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(0,0,0,0.25) inset;
  }

  @media (max-width: 600px) {
    flex: 1 0 calc(33.33% - 8px);
    text-align: center;
    font-size: 12px;
    padding: 6px 10px;
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
        params: [{ chainId: '0x61' }], // BSC Testnet
      });
    } catch (error: any) {
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x61',
                chainName: 'Binance Smart Chain Testnet',
                nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
                rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
                blockExplorerUrls: ['https://testnet.bscscan.com/'],
              }
            ]
          });
        } catch (addError) { console.error(addError); }
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
