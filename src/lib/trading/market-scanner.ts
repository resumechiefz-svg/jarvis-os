/**
 * SCANNER Agent — Finds high-probability setups across the market universe
 * Screens stocks using momentum, volume, and trend filters
 * Runs every 15 min during market hours
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ALPACA_KEY = process.env.ALPACA_API_KEY ?? 'PKO2YLKYWULJSV6BZMGJEJ75FQ'
const ALPACA_SECRET = process.env.ALPACA_SECRET_KEY ?? 'E6RRza6k7Sp9kssQEnohWTHc98YBWQnJwywJSPBYkEuZ'
const DATA_BASE = 'https://data.alpaca.markets'
const BROKER_BASE = 'https://paper-api.alpaca.markets'

const HEADERS = {
  'APCA-API-KEY-ID': ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
}

// Curated universe — high liquidity, known movers, sector leaders
export const UNIVERSE = [
  // Mega cap tech
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA',
  // Semiconductors
  'AMD', 'ARM', 'AVGO', 'QCOM', 'AMAT', 'MU',
  // Finance
  'JPM', 'GS', 'V', 'MA',
  // Energy/Commodities
  'XOM', 'CVX',
  // High-beta growth
  'COIN', 'PLTR', 'RKLB', 'HOOD',
  // ETFs for broad exposure
  'SPY', 'QQQ', 'IWM', 'ARKK',
  // Crypto exposure via stock
  'MSTR', 'IBIT',
]

export interface ScannerHit {
  symbol: string
  price: number
  change1d: number
  change5d: number
  volume: number
  avgVolume: number
  volumeRatio: number
  rsi14: number
  aboveMA20: boolean
  aboveMA50: boolean
  signal: 'BREAKOUT' | 'PULLBACK' | 'MOMENTUM' | 'REVERSAL' | 'OVERSOLD'
  score: number // 0-100
}

async function getMultiBars(symbols: string[], timeframe: string, limit: number): Promise<Record<string, number[]>> {
  const chunk = symbols.slice(0, 10).join(',')
  try {
    const res = await fetch(
      `${DATA_BASE}/v2/stocks/bars?symbols=${chunk}&timeframe=${timeframe}&limit=${limit}&adjustment=raw`,
      { headers: HEADERS, signal: AbortSignal.timeout(8000) }
    )
    const data = await res.json() as { bars?: Record<string, Array<{ c: number; v: number }>> }
    const result: Record<string, number[]> = {}
    for (const [sym, bars] of Object.entries(data.bars ?? {})) {
      result[sym] = bars.map(b => b.c)
    }
    return result
  } catch { return {} }
}

async function getMultiVolume(symbols: string[], limit: number): Promise<Record<string, number[]>> {
  const chunk = symbols.slice(0, 10).join(',')
  try {
    const res = await fetch(
      `${DATA_BASE}/v2/stocks/bars?symbols=${chunk}&timeframe=1Day&limit=${limit}&adjustment=raw`,
      { headers: HEADERS, signal: AbortSignal.timeout(8000) }
    )
    const data = await res.json() as { bars?: Record<string, Array<{ v: number }>> }
    const result: Record<string, number[]> = {}
    for (const [sym, bars] of Object.entries(data.bars ?? {})) {
      result[sym] = bars.map(b => b.v)
    }
    return result
  } catch { return {} }
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) gains += diff
    else losses += Math.abs(diff)
  }
  const rs = gains / (losses || 0.001)
  return 100 - 100 / (1 + rs)
}

function sma(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period
}

function scoreSignal(hit: Partial<ScannerHit>): { signal: ScannerHit['signal']; score: number } {
  const { rsi14 = 50, change1d = 0, change5d = 0, volumeRatio = 1, aboveMA20 = false, aboveMA50 = false } = hit

  // BREAKOUT: strong momentum + above MAs + volume surge
  if (change1d > 2 && aboveMA20 && aboveMA50 && volumeRatio > 1.5 && rsi14 > 55 && rsi14 < 80)
    return { signal: 'BREAKOUT', score: 80 + Math.min(20, volumeRatio * 5) }

  // MOMENTUM: trending up strongly
  if (change5d > 5 && aboveMA20 && aboveMA50 && rsi14 > 55 && rsi14 < 75)
    return { signal: 'MOMENTUM', score: 72 + Math.min(15, change5d) }

  // PULLBACK: healthy pullback in uptrend — buy the dip
  if (change1d < -2 && change1d > -6 && aboveMA50 && rsi14 > 30 && rsi14 < 50)
    return { signal: 'PULLBACK', score: 70 + Math.min(15, Math.abs(change1d) * 3) }

  // OVERSOLD: RSI capitulation — potential reversal
  if (rsi14 < 30 && change1d < -3 && volumeRatio > 1.3)
    return { signal: 'OVERSOLD', score: 65 + Math.min(20, (30 - rsi14) * 2) }

  // REVERSAL: big drop reversing with volume
  if (change1d > 1.5 && change5d < -5 && volumeRatio > 1.8)
    return { signal: 'REVERSAL', score: 62 + Math.min(15, volumeRatio * 4) }

  return { signal: 'MOMENTUM', score: 30 }
}

export async function runScan(): Promise<ScannerHit[]> {
  const hits: ScannerHit[] = []

  // Process in chunks of 10 (Alpaca multi-bar limit)
  const chunks: string[][] = []
  for (let i = 0; i < UNIVERSE.length; i += 10) chunks.push(UNIVERSE.slice(i, i + 10))

  for (const chunk of chunks) {
    const [dailyBars, volumeBars] = await Promise.all([
      getMultiBars(chunk, '1Day', 60),
      getMultiVolume(chunk, 30),
    ])

    for (const symbol of chunk) {
      const closes = dailyBars[symbol]
      const volumes = volumeBars[symbol]
      if (!closes || closes.length < 20) continue

      const price = closes[closes.length - 1]
      const prev1d = closes[closes.length - 2] ?? price
      const prev5d = closes[closes.length - 6] ?? price

      const change1d = ((price - prev1d) / prev1d) * 100
      const change5d = ((price - prev5d) / prev5d) * 100
      const rsi14 = calcRSI(closes)
      const ma20 = sma(closes, 20)
      const ma50 = sma(closes, 50)

      const volume = volumes[volumes.length - 1] ?? 0
      const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(20, volumes.length))
      const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1

      const partial: Partial<ScannerHit> = {
        rsi14, change1d, change5d, volumeRatio,
        aboveMA20: price > ma20,
        aboveMA50: price > ma50,
      }
      const { signal, score } = scoreSignal(partial)

      if (score >= 60) {
        hits.push({
          symbol, price, change1d, change5d,
          volume, avgVolume, volumeRatio,
          rsi14, aboveMA20: price > ma20, aboveMA50: price > ma50,
          signal, score,
        })
      }
    }
  }

  // Also scan existing positions not already in hits
  try {
    const res = await fetch(`${BROKER_BASE}/v2/positions`, { headers: HEADERS })
    const positions = await res.json() as Array<{ symbol: string }>
    const posSymbols = positions.map(p => p.symbol).filter(s => !hits.find(h => h.symbol === s)).slice(0, 5)
    if (posSymbols.length > 0) {
      const posBars = await getMultiBars(posSymbols, '1Day', 60)
      for (const sym of posSymbols) {
        const bars: number[] = posBars[sym] ?? []
        if (!bars.length) continue
        const price = bars[bars.length - 1]
        const prev = bars[bars.length - 2] ?? price
        const rsi14 = calcRSI(bars)
        const { signal, score } = scoreSignal({ rsi14, change1d: ((price - prev) / prev) * 100, aboveMA50: price > sma(bars, 50) })
        if (score >= 55) hits.push({ symbol: sym, price, change1d: ((price - prev) / prev) * 100, change5d: 0, volume: 0, avgVolume: 0, volumeRatio: 1, rsi14, aboveMA20: price > sma(bars, 20), aboveMA50: price > sma(bars, 50), signal, score })
      }
    }
  } catch { /* ignore */ }

  return hits.sort((a, b) => b.score - a.score).slice(0, 8)
}

// Synthesize scan results into a strategy recommendation using Claude
export async function synthesizeScanWithAI(hits: ScannerHit[], portfolioEquity: number): Promise<string> {
  if (!hits.length) return ''

  const prompt = `You are an elite quantitative trading analyst. Analyze these scanner hits and recommend the top 2-3 trade setups.

Portfolio equity: $${portfolioEquity.toLocaleString()}
Max per trade: $500 or 5% of equity (whichever is lower)

SCANNER HITS (sorted by score):
${hits.map(h => `${h.symbol}: ${h.signal} | Score: ${h.score} | RSI: ${h.rsi14.toFixed(0)} | 1d: ${h.change1d.toFixed(1)}% | 5d: ${h.change5d.toFixed(1)}% | Vol ratio: ${h.volumeRatio.toFixed(1)}x | Above MA50: ${h.aboveMA50}`).join('\n')}

For each recommended trade provide:
- Symbol, direction (buy/sell), notional amount, entry rationale (1-2 sentences)
- Risk note
- Confidence: high/medium

Return JSON array ONLY:
[{"symbol":"X","side":"buy","notional":250,"rationale":"...","risk":"...","confidence":"high"}]`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  return text
}
