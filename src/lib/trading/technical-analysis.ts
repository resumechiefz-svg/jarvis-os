/**
 * TECHNICAL Agent — Deep indicator analysis
 * RSI, MACD, Bollinger Bands, EMA crossovers, volume analysis
 * Returns structured signals with entry/exit levels
 */

const ALPACA_KEY = process.env.ALPACA_API_KEY ?? 'PKO2YLKYWULJSV6BZMGJEJ75FQ'
const ALPACA_SECRET = process.env.ALPACA_SECRET_KEY ?? 'E6RRza6k7Sp9kssQEnohWTHc98YBWQnJwywJSPBYkEuZ'
const DATA_BASE = 'https://data.alpaca.markets'
const HEADERS = { 'APCA-API-KEY-ID': ALPACA_KEY, 'APCA-API-SECRET-KEY': ALPACA_SECRET }

export interface TechnicalSignal {
  symbol: string
  price: number
  rsi14: number
  rsi7: number
  macdLine: number
  macdSignal: number
  macdHist: number
  bbUpper: number
  bbMiddle: number
  bbLower: number
  bbPct: number      // Where price sits in BB (0=bottom, 1=top)
  ema9: number
  ema21: number
  ema50: number
  ema200: number
  volumeRatio: number
  atr14: number      // Average True Range — volatility measure
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  strength: 'STRONG' | 'MODERATE' | 'WEAK'
  entry?: number
  stopLoss?: number
  takeProfit?: number
  signalSummary: string
}

async function fetchBars(symbol: string, timeframe: string, limit: number): Promise<Array<{ o: number; h: number; l: number; c: number; v: number }>> {
  try {
    const res = await fetch(
      `${DATA_BASE}/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${limit}&adjustment=raw`,
      { headers: HEADERS, signal: AbortSignal.timeout(8000) }
    )
    const data = await res.json() as { bars?: Array<{ o: number; h: number; l: number; c: number; v: number }> }
    return data.bars ?? []
  } catch { return [] }
}

function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const result: number[] = [data[0]]
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k))
  }
  return result
}

function rsi(closes: number[], period: number): number {
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

function macd(closes: number[]): { line: number; signal: number; hist: number } {
  if (closes.length < 26) return { line: 0, signal: 0, hist: 0 }
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1]
  const macdSeries = ema12.map((v, i) => v - ema26[i])
  const signalLine = ema(macdSeries.slice(-9), 9)
  const sig = signalLine[signalLine.length - 1]
  return { line: macdLine, signal: sig, hist: macdLine - sig }
}

function bollingerBands(closes: number[], period = 20, stdMult = 2): { upper: number; middle: number; lower: number; pct: number } {
  if (closes.length < period) return { upper: 0, middle: closes[closes.length - 1], lower: 0, pct: 0.5 }
  const slice = closes.slice(-period)
  const middle = slice.reduce((a, b) => a + b, 0) / period
  const variance = slice.reduce((a, b) => a + (b - middle) ** 2, 0) / period
  const std = Math.sqrt(variance)
  const upper = middle + stdMult * std
  const lower = middle - stdMult * std
  const price = closes[closes.length - 1]
  const pct = (upper - lower) > 0 ? (price - lower) / (upper - lower) : 0.5
  return { upper, middle, lower, pct }
}

function atr(bars: Array<{ h: number; l: number; c: number }>, period = 14): number {
  if (bars.length < 2) return 0
  const trs = bars.slice(-period - 1).map((b, i, arr) => {
    if (i === 0) return b.h - b.l
    const prev = arr[i - 1].c
    return Math.max(b.h - b.l, Math.abs(b.h - prev), Math.abs(b.l - prev))
  })
  return trs.reduce((a, b) => a + b, 0) / trs.length
}

export async function analyzeSymbol(symbol: string): Promise<TechnicalSignal | null> {
  const [dailyBars, hourlyBars] = await Promise.all([
    fetchBars(symbol, '1Day', 210),
    fetchBars(symbol, '1Hour', 50),
  ])

  if (dailyBars.length < 50) return null

  const closes = dailyBars.map(b => b.c)
  const price = closes[closes.length - 1]
  const volumes = dailyBars.map(b => b.v)
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const curVol = volumes[volumes.length - 1]

  const ema9v = ema(closes, 9)
  const ema21v = ema(closes, 21)
  const ema50v = ema(closes, 50)
  const ema200v = closes.length >= 200 ? ema(closes, 200) : ema(closes, closes.length)

  const rsi14 = rsi(closes, 14)
  const rsi7 = rsi(closes, 7)
  const { line: macdLine, signal: macdSignal, hist: macdHist } = macd(closes)
  const bb = bollingerBands(closes)
  const atrVal = atr(dailyBars)

  const e9 = ema9v[ema9v.length - 1]
  const e21 = ema21v[ema21v.length - 1]
  const e50 = ema50v[ema50v.length - 1]
  const e200 = ema200v[ema200v.length - 1]

  // Direction scoring
  let bullScore = 0, bearScore = 0

  // RSI
  if (rsi14 < 35) bullScore += 3
  else if (rsi14 < 45) bullScore += 1
  else if (rsi14 > 70) bearScore += 3
  else if (rsi14 > 60) bearScore += 1

  // MACD
  if (macdHist > 0 && macdLine > macdSignal) bullScore += 2
  else if (macdHist < 0 && macdLine < macdSignal) bearScore += 2

  // EMA alignment
  if (e9 > e21 && e21 > e50) bullScore += 2
  else if (e9 < e21 && e21 < e50) bearScore += 2

  // Price vs MA200
  if (price > e200) bullScore += 1
  else bearScore += 1

  // Bollinger position
  if (bb.pct < 0.2) bullScore += 2
  else if (bb.pct > 0.8) bearScore += 2

  // Volume confirmation
  const volRatio = avgVol > 0 ? curVol / avgVol : 1

  const direction: TechnicalSignal['direction'] =
    bullScore > bearScore + 1 ? 'BULLISH' :
    bearScore > bullScore + 1 ? 'BEARISH' : 'NEUTRAL'

  const totalScore = bullScore + bearScore
  const dominantScore = Math.max(bullScore, bearScore)
  const strength: TechnicalSignal['strength'] =
    dominantScore >= 7 ? 'STRONG' :
    dominantScore >= 4 ? 'MODERATE' : 'WEAK'

  // Entry/exit levels using ATR
  let entry: number | undefined, stopLoss: number | undefined, takeProfit: number | undefined
  if (direction === 'BULLISH' && strength !== 'WEAK') {
    entry = price
    stopLoss = price - (atrVal * 1.5)
    takeProfit = price + (atrVal * 3)
  } else if (direction === 'BEARISH' && strength !== 'WEAK') {
    entry = price
    stopLoss = price + (atrVal * 1.5)
    takeProfit = price - (atrVal * 3)
  }

  // Signal summary
  const signals: string[] = []
  if (rsi14 < 35) signals.push(`RSI oversold ${rsi14.toFixed(0)}`)
  if (rsi14 > 70) signals.push(`RSI overbought ${rsi14.toFixed(0)}`)
  if (macdHist > 0 && macdLine > macdSignal) signals.push('MACD bullish cross')
  if (macdHist < 0 && macdLine < macdSignal) signals.push('MACD bearish cross')
  if (bb.pct < 0.15) signals.push('BB lower band touch')
  if (bb.pct > 0.85) signals.push('BB upper band touch')
  if (e9 > e21 && e21 > e50) signals.push('EMA bullish alignment')
  if (e9 < e21 && e21 < e50) signals.push('EMA bearish alignment')
  if (volRatio > 1.5) signals.push(`Vol surge ${volRatio.toFixed(1)}x`)

  return {
    symbol, price, rsi14, rsi7,
    macdLine, macdSignal, macdHist,
    bbUpper: bb.upper, bbMiddle: bb.middle, bbLower: bb.lower, bbPct: bb.pct,
    ema9: e9, ema21: e21, ema50: e50, ema200: e200,
    volumeRatio: volRatio, atr14: atrVal,
    direction, strength, entry, stopLoss, takeProfit,
    signalSummary: signals.join(' | ') || `Neutral — score ${bullScore}B/${bearScore}Br`,
  }
}
