import { useEffect, useMemo, useState } from 'react'
import { BrowserProvider } from 'ethers'
import './styles.css'
import ActivityList from './components/ActivityList'
import Transparency from './pages/Transparency'
import { useWeb3 } from './web3'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import { PUBLIC_URL } from './config'

const bscTestnet = {
  chainId: 97,
  chainIdHex: '0x61',
  name: 'BSC Testnet'
}

export default function App() {
  const { t } = useTranslation()
  const { provider, account, chainIdHex, connect } = useWeb3()
  const [tab, setTab] = useState<'list'|'transparency'>('list')
  const [lang, setLang] = useState(i18n.language)

  const onLangChange = (v: string) => {
    setLang(v)
    i18n.changeLanguage(v)
    try { localStorage.setItem('lang', v) } catch {}
  }

  const switchToBscTestnet = async () => {
    if (!(window as any).ethereum) return
    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: bscTestnet.chainIdHex }]
      })
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await (window as any).ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: bscTestnet.chainIdHex,
            chainName: bscTestnet.name,
            nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
            rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
            blockExplorerUrls: ['https://testnet.bscscan.com']
          }]
        })
      } else {
        console.error(switchError)
      }
    }
  }

  return (
    <div className="container">
      <div className="koi-bg">
        <div className="koi-dot one" />
        <div className="koi-dot two" />
      </div>
      <header>
        <div className="title">
          <h1>{t('title')}</h1>
          <span className="subtitle">愿望在此汇聚，幸运自此发生</span>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <select value={lang} onChange={(e)=>onLangChange(e.target.value)} style={{padding:'6px 8px', borderRadius:8}}>
            <option value="zh">简体中文</option>
            <option value="en">English</option>
          </select>
          {account ? (
            <span className="badge">{account.slice(0, 6)}...{account.slice(-4)}</span>
          ) : (
            <button className="btn-primary" onClick={connect}>{t('connect')}</button>
          )}
        </div>
      </header>

      <section>
        <div className="hero">
          <h2>许愿池</h2>
          <p>投入你的心愿与 1 USDT，随着池水的波动与群星的加持，幸运将由 VRF 公正降临。</p>
          <svg viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden>
            <path fill="var(--wave)" fillOpacity="0.3" d="M0,128L60,160C120,192,240,256,360,245.3C480,235,600,149,720,138.7C840,128,960,192,1080,208C1200,224,1320,192,1380,176L1440,160L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z"></path>
          </svg>
        </div>
        <div className="ripples"><div className="ripple r1"></div><div className="ripple r2"></div><div className="ripple r3"></div></div>
        <p className="subtitle" style={{marginTop:6}}>{t('currentNetwork')}: {chainIdHex ?? '...'}</p>
        <button onClick={switchToBscTestnet}>{t('switchToBscTestnet')}</button>
      </section>

      <section>
        <div style={{display:'flex', gap:8, marginBottom:10}}>
          <button onClick={()=>setTab('list')} disabled={tab==='list'}>活动列表</button>
          <button onClick={()=>setTab('transparency')} disabled={tab==='transparency'}>透明度</button>
        </div>
        {tab==='list' ? (
          <>
            <h2>{t('activities')}</h2>
            <ActivityList />
          </>
        ) : (
          <Transparency />
        )}
      </section>

      <footer>
        <small>合约与资金透明：所有交易均在链上可查</small>
        <div style={{marginTop:8, display:'flex', gap:8, flexWrap:'wrap'}}>
          {(() => {
            const dappUrl = (PUBLIC_URL && PUBLIC_URL.length>0) ? PUBLIC_URL : (window?.location?.origin || '')
            const mm = `https://metamask.app.link/dapp/${dappUrl.replace(/^https?:\/\//,'')}`
            const okx = `okx://wallet/dapp?url=${encodeURIComponent(dappUrl)}`
            return (
              <>
                <a href={mm} target="_blank" rel="noreferrer"><button>用 MetaMask 打开</button></a>
                <a href={okx}><button>用 OKX 打开</button></a>
              </>
            )
          })()}
        </div>
      </footer>
    </div>
  )
}
