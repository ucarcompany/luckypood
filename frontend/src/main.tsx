import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './i18n'
import { Web3Provider } from './web3'
import ToastProvider from './components/ToastProvider'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Web3Provider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </Web3Provider>
  </React.StrictMode>
)
