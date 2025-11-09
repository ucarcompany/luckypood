import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { BrowserProvider } from 'ethers'

type Web3State = {
  provider: BrowserProvider | null
  account: string | null
  chainIdHex: string | null
  connect: () => Promise<void>
}

const Ctx = createContext<Web3State>({ provider: null, account: null, chainIdHex: null, connect: async () => {} })

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [provider, setProvider] = useState<BrowserProvider | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [chainIdHex, setChainIdHex] = useState<string | null>(null)

  useEffect(() => {
    const eth = (window as any).ethereum
    if (!eth) return
    const p = new BrowserProvider(eth)
    setProvider(p)
    ;(async () => {
      try {
        const net = await p.getNetwork()
        setChainIdHex('0x' + net.chainId.toString(16))
        const accs = await eth.request({ method: 'eth_accounts' })
        if (accs && accs[0]) setAccount(accs[0])
      } catch {}
    })()

    const onAccountsChanged = (accs: string[]) => setAccount(accs[0] ?? null)
    const onChainChanged = (cid: string) => setChainIdHex(cid)
    eth.on?.('accountsChanged', onAccountsChanged)
    eth.on?.('chainChanged', onChainChanged)
    return () => {
      eth.removeListener?.('accountsChanged', onAccountsChanged)
      eth.removeListener?.('chainChanged', onChainChanged)
    }
  }, [])

  const connect = useCallback(async () => {
    const eth = (window as any).ethereum
    if (!eth) throw new Error('No wallet detected')
    const accs: string[] = await eth.request({ method: 'eth_requestAccounts' })
    setAccount(accs[0] ?? null)
  }, [])

  const value = useMemo(() => ({ provider, account, chainIdHex, connect }), [provider, account, chainIdHex, connect])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWeb3() { return useContext(Ctx) }
