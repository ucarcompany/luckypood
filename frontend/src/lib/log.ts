import { BACKEND_API_KEY, BACKEND_URL } from '../config'

export type LogPayload = {
  type: 'participate'|'refund'|'tryDraw'|'drawFulfilled'|'create'
  pool: string
  txHash?: string
  address?: string
  count?: number
  timestamp?: number
  extra?: Record<string, any>
}

export async function postLog(payload: LogPayload) {
  if (!BACKEND_URL) return
  try {
    const res = await fetch(`${BACKEND_URL.replace(/\/$/,'')}/api/log`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(BACKEND_API_KEY ? { 'x-api-key': BACKEND_API_KEY } : {})
      },
      body: JSON.stringify({ ...payload, timestamp: payload.timestamp ?? Math.floor(Date.now()/1000) })
    })
    return await res.json().catch(()=>null)
  } catch (e) {
    // ignore
    return null
  }
}
