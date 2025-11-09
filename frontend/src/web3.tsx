import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { BrowserProvider } from 'ethers'

async function waitForProvider(timeoutMs = 3000): Promise<any | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const w: any = window as any
    const cand = w.ethereum || w.okxwallet?.ethereum || w.okxwallet
    if (cand && typeof cand.request === 'function') return cand
    await new Promise(res=>setTimeout(res, 150))
  }
  const w: any = window as any
  return w.ethereum || w.okxwallet?.ethereum || w.okxwallet || null
}

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
    let unsub: (()=>void) | null = null
    ;(async () => {
      const eth = await waitForProvider(3000)
      if (!eth) return
      const p = new BrowserProvider(eth as any)
    setProvider(p)
    ;(async () => {
      try {
        const net = await p.getNetwork()
        setChainIdHex('0x' + net.chainId.toString(16))
        const accs = await (eth as any).request({ method: 'eth_accounts' })
        if (accs && accs[0]) setAccount(accs[0])
      } catch {}
    })()

    const onAccountsChanged = (accs: string[]) => setAccount(accs[0] ?? null)
    const onChainChanged = (cid: string) => setChainIdHex(cid)
    ;(eth as any).on?.('accountsChanged', onAccountsChanged)
    ;(eth as any).on?.('chainChanged', onChainChanged)
    unsub = () => {
      (eth as any).removeListener?.('accountsChanged', onAccountsChanged)
      (eth as any).removeListener?.('chainChanged', onChainChanged)
    }
    })()
    return () => { try { unsub?.() } catch {} }
  }, [])

  const connect = useCallback(async () => {
    const eth = await waitForProvider(3000)
    if (!eth) throw new Error('No wallet detected')
    const accs: string[] = await (eth as any).request({ method: 'eth_requestAccounts' })
    setAccount(accs[0] ?? null)
  }, [])

  const value = useMemo(() => ({ provider, account, chainIdHex, connect }), [provider, account, chainIdHex, connect])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWeb3() { return useContext(Ctx) }
