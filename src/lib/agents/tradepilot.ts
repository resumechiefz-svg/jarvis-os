/**
 * TradePilot Agent — Alpaca paper/live trading integration
 * Wires the $98k portfolio into Jarvis OS
 * Jarvis can read positions, P&L, place trades, and brief AB
 */

const ALPACA_KEY = process.env.ALPACA_API_KEY ?? 'PKO2YLKYWULJSV6BZMGJEJ75FQ'
const ALPACA_SECRET = process.env.ALPACA_SECRET_KEY ?? 'E6RRza6k7Sp9kssQEnohWTHc98YBWQnJwywJSPBYkEuZ'
const ALPACA_BASE = 'https://paper-api.alpaca.markets'
const ALPACA_DATA = 'https://data.alpaca.markets'

const HEADERS = {
  'APCA-API-KEY-ID': ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
  'Content-Type': 'application/json',
}

export interface Position {
  symbol: string
  qty: number
  side: 'long' | 'short'
  entryPrice: number
  currentPrice: number
  marketValue: number
  unrealizedPL: number
  unrealizedPLPct: number
  todayPL: number
}

export interface PortfolioSummary {
  equity: number
  cash: number
  portfolioValue: number
  dayPL: number
  dayPLPct: number
  totalPL: number
  positions: Position[]
  openOrders: number
  buyingPower: number
  isLive: boolean
}

export interface TradeOrder {
  symbol: string
  qty?: number
  notional?: number
  side: 'buy' | 'sell'
  type: 'market' | 'limit' | 'stop'
  timeInForce: 'day' | 'gtc' | 'ioc'
  limitPrice?: number
  stopPrice?: number
}

async function alpacaGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${ALPACA_BASE}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Alpaca ${res.status}: ${path}`)
  return res.json()
}

async function alpacaDataGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${ALPACA_DATA}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Alpaca data ${res.status}: ${path}`)
  return res.json()
}

export async function getPortfolio(): Promise<PortfolioSummary> {
  const [account, rawPositions, orders] = await Promise.all([
    alpacaGet('/v2/account'),
    alpacaGet('/v2/positions'),
    alpacaGet('/v2/orders?status=open&limit=50'),
  ])

  const acc = account as Record<string, string>
  const equity = parseFloat(acc.equity ?? '0')
  const lastEquity = parseFloat(acc.last_equity ?? '0')
  const cash = parseFloat(acc.cash ?? '0')
  const portfolioValue = parseFloat(acc.portfolio_value ?? '0')
  const dayPL = equity - lastEquity
  const dayPLPct = lastEquity > 0 ? (dayPL / lastEquity) * 100 : 0
  const totalPL = equity - parseFloat(acc.initial_equity ?? acc.last_equity ?? equity.toString())

  const positions: Position[] = ((rawPositions as unknown) as Array<Record<string, string>>).map(p => ({
    symbol: p.symbol,
    qty: parseFloat(p.qty ?? '0'),
    side: (p.side as 'long' | 'short') ?? 'long',
    entryPrice: parseFloat(p.avg_entry_price ?? '0'),
    currentPrice: parseFloat(p.current_price ?? '0'),
    marketValue: parseFloat(p.market_value ?? '0'),
    unrealizedPL: parseFloat(p.unrealized_pl ?? '0'),
    unrealizedPLPct: parseFloat(p.unrealized_plpc ?? '0') * 100,
    todayPL: parseFloat(p.unrealized_intraday_pl ?? '0'),
  }))

  const openOrders = Array.isArray(orders) ? orders.length : 0

  return {
    equity,
    cash,
    portfolioValue,
    dayPL,
    dayPLPct,
    totalPL,
    positions,
    openOrders,
    buyingPower: parseFloat(acc.buying_power ?? '0'),
    isLive: acc.status === 'ACTIVE' && !acc.account_number?.startsWith('PA'),
  }
}

// Place a trade — called by Jarvis when AB gives direction
export async function placeTrade(order: TradeOrder): Promise<{ id: string; status: string; symbol: string }> {
  const body: Record<string, unknown> = {
    symbol: order.symbol.toUpperCase(),
    side: order.side,
    type: order.type,
    time_in_force: order.timeInForce,
  }

  if (order.notional) {
    body.notional = order.notional.toFixed(2)
  } else if (order.qty) {
    body.qty = order.qty.toString()
  }

  if (order.type === 'limit' && order.limitPrice) body.limit_price = order.limitPrice.toFixed(2)
  if (order.type === 'stop' && order.stopPrice) body.stop_price = order.stopPrice.toFixed(2)

  const res = await fetch(`${ALPACA_BASE}/v2/orders`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json() as Record<string, string>
    throw new Error(`Trade failed: ${err.message ?? res.statusText}`)
  }

  const order_res = await res.json() as Record<string, string>
  return { id: order_res.id, status: order_res.status, symbol: order_res.symbol }
}

// Cancel all open orders
export async function cancelAllOrders(): Promise<number> {
  const res = await fetch(`${ALPACA_BASE}/v2/orders`, { method: 'DELETE', headers: HEADERS })
  if (!res.ok) return 0
  const cancelled = await res.json() as unknown[]
  return Array.isArray(cancelled) ? cancelled.length : 0
}

// Get recent account activity (trades)
export async function getRecentTrades(limit = 10): Promise<Array<{ date: string; symbol: string; side: string; qty: number; price: number; pnl: number }>> {
  try {
    const data = await alpacaGet(`/v2/account/activities/FILL?page_size=${limit}`) as unknown
    const activities = Array.isArray(data) ? data : []
    return activities.map((a: Record<string, string>) => ({
      date: new Date(a.transaction_time ?? a.date ?? '').toLocaleDateString(),
      symbol: a.symbol ?? '',
      side: a.side ?? '',
      qty: parseFloat(a.qty ?? '0'),
      price: parseFloat(a.price ?? '0'),
      pnl: 0,
    }))
  } catch {
    return []
  }
}

// Portfolio brief for Jarvis to deliver to AB
export async function getPortfolioBrief(): Promise<string> {
  const portfolio = await getPortfolio()

  const topGainers = [...portfolio.positions]
    .sort((a, b) => b.unrealizedPL - a.unrealizedPL)
    .slice(0, 3)

  const topLosers = [...portfolio.positions]
    .sort((a, b) => a.unrealizedPL - b.unrealizedPL)
    .slice(0, 2)

  const daySign = portfolio.dayPL >= 0 ? '+' : ''
  const totalPLSign = portfolio.totalPL >= 0 ? '+' : ''

  return `TRADEPILOT — PORTFOLIO BRIEF
━━━━━━━━━━━━━━━━━━━━━━
Equity: $${portfolio.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Day P&L: ${daySign}$${portfolio.dayPL.toFixed(2)} (${daySign}${portfolio.dayPLPct.toFixed(2)}%)
Total P&L: ${totalPLSign}$${portfolio.totalPL.toFixed(2)}
Cash available: $${portfolio.cash.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
Open positions: ${portfolio.positions.length} | Open orders: ${portfolio.openOrders}

TOP GAINERS:
${topGainers.map(p => `  ${p.symbol}: +$${p.unrealizedPL.toFixed(2)} (${p.unrealizedPLPct.toFixed(1)}%)`).join('\n')}

WATCHING:
${topLosers.map(p => `  ${p.symbol}: $${p.unrealizedPL.toFixed(2)} (${p.unrealizedPLPct.toFixed(1)}%)`).join('\n')}

Mode: ${portfolio.isLive ? '🔴 LIVE' : '📄 PAPER'} | Buying power: $${portfolio.buyingPower.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
