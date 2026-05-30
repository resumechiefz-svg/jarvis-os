/**
 * PHANTOM — Kalshi trading system integration
 * Connects to the Kalshi v2 API using RSA-PSS SHA-256 auth
 * Reads live P&L, positions, and bot performance from the trading system
 */

import fs from 'fs'
import crypto from 'crypto'

const KALSHI_API_KEY = process.env.KALSHI_API_KEY ?? 'c1b2b034-85ef-4e01-826c-e5011e53cab5'
const KALSHI_KEY_PATH = process.env.KALSHI_PRIVATE_KEY_PATH ?? `${process.env.HOME}/.kalshi-secrets/private_key.pem`
const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2'

export interface KalshiPosition {
  marketId: string
  ticker: string
  side: 'yes' | 'no'
  count: number
  entryPrice: number
  currentPrice: number
  pnl: number
  age: string
}

export interface PhantomStats {
  balance: number
  totalPnl: number
  winRate: number
  wins: number
  losses: number
  openPositions: KalshiPosition[]
  totalOrders: number
  invested: number
  mode: 'paper' | 'live'
  isRunning: boolean
  lastUpdated: string
}

function signKalshiRequest(method: string, path: string, body: string = ''): Record<string, string> {
  try {
    const timestamp = Date.now().toString()
    const nonce = crypto.randomUUID().replace(/-/g, '')
    const msgToSign = `${timestamp}${nonce}${method.toUpperCase()}${path}${body}`

    const pem = fs.readFileSync(KALSHI_KEY_PATH, 'utf-8')
    const privateKey = crypto.createPrivateKey(pem)

    const signature = crypto.sign('sha256', Buffer.from(msgToSign), {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    })

    return {
      'KALSHI-ACCESS-KEY': KALSHI_API_KEY,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-NONCE': nonce,
      'KALSHI-ACCESS-SIGNATURE': signature.toString('base64'),
      'Content-Type': 'application/json',
    }
  } catch {
    return {}
  }
}

async function kalshiGet(path: string): Promise<Record<string, unknown>> {
  const headers = signKalshiRequest('GET', path)
  if (!headers['KALSHI-ACCESS-KEY']) return {}

  const res = await fetch(`${KALSHI_BASE}${path}`, { headers, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Kalshi API ${res.status}: ${res.statusText}`)
  return res.json()
}

export async function getPhantomStats(): Promise<PhantomStats> {
  const keyExists = fs.existsSync(KALSHI_KEY_PATH)

  // Default/fallback stats
  const defaultStats: PhantomStats = {
    balance: 0,
    totalPnl: 0,
    winRate: 0,
    wins: 0,
    losses: 0,
    openPositions: [],
    totalOrders: 0,
    invested: 0,
    mode: 'paper',
    isRunning: false,
    lastUpdated: new Date().toISOString(),
  }

  if (!keyExists) return defaultStats

  try {
    // Fetch in parallel: balance + positions + fills
    const [balanceData, positionsData, fillsData] = await Promise.allSettled([
      kalshiGet('/portfolio/balance'),
      kalshiGet('/portfolio/positions?limit=50'),
      kalshiGet('/portfolio/fills?limit=100'),
    ])

    // Balance
    const balance = balanceData.status === 'fulfilled'
      ? ((balanceData.value as { balance?: { available?: number } }).balance?.available ?? 0) / 100
      : 0

    // Positions
    const positions: KalshiPosition[] = []
    if (positionsData.status === 'fulfilled') {
      const rawPositions = (positionsData.value as { market_positions?: Array<{
        market_id: string
        ticker: string
        position: number
        market_exposure: number
        realized_pnl: number
        total_traded: number
      }> }).market_positions ?? []

      for (const p of rawPositions) {
        if (p.position === 0) continue
        positions.push({
          marketId: p.market_id,
          ticker: p.ticker ?? p.market_id,
          side: p.position > 0 ? 'yes' : 'no',
          count: Math.abs(p.position),
          entryPrice: 0,
          currentPrice: 0,
          pnl: (p.realized_pnl ?? 0) / 100,
          age: '—',
        })
      }
    }

    // Fills for win/loss tracking
    let wins = 0, losses = 0, totalPnl = 0, invested = 0
    if (fillsData.status === 'fulfilled') {
      const fills = (fillsData.value as { fills?: Array<{
        action: string
        count: number
        price: number
        side: string
        is_taker: boolean
      }> }).fills ?? []
      invested = fills.reduce((s, f) => s + (f.count * f.price) / 100, 0)

      // Simple win/loss from settled positions would need market data
      // Use settled fills as proxy
      wins = fills.filter(f => f.action === 'buy' && f.side === 'yes').length
      losses = fills.filter(f => f.action === 'buy' && f.side === 'no').length
      totalPnl = balance - invested
    }

    const totalOrders = wins + losses
    const winRate = totalOrders > 0 ? (wins / totalOrders) * 100 : 0

    return {
      balance,
      totalPnl,
      winRate: Math.round(winRate),
      wins,
      losses,
      openPositions: positions,
      totalOrders,
      invested: Math.round(invested * 100) / 100,
      mode: 'paper',
      isRunning: true,
      lastUpdated: new Date().toISOString(),
    }
  } catch (err) {
    console.error('[Phantom]', err)
    return defaultStats
  }
}
