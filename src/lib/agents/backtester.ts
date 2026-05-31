/**
 * TradePilot Backtester — Test strategies against historical data
 * Uses Alpaca historical bars to simulate strategy performance
 * before risking real capital
 */
import Alpaca from '@alpacahq/alpaca-trade-api'

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY!,
  secretKey: process.env.ALPACA_SECRET_KEY!,
  paper: true,
})

export interface BacktestConfig {
  symbol: string
  startDate: string   // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
  strategy: 'momentum' | 'mean_reversion' | 'breakout' | 'ema_cross'
  initialCapital: number
  positionSize: number  // % of capital per trade (0.05 = 5%)
}

export interface Trade {
  date: string
  action: 'BUY' | 'SELL'
  price: number
  shares: number
  pnl?: number
  reason: string
}

export interface BacktestResult {
  symbol: string
  strategy: string
  startDate: string
  endDate: string
  initialCapital: number
  finalCapital: number
  totalReturn: number      // %
  annualizedReturn: number // %
  maxDrawdown: number      // %
  winRate: number          // %
  totalTrades: number
  winningTrades: number
  losingTrades: number
  sharpeRatio: number
  trades: Trade[]
  equity: Array<{ date: string; value: number }>
  summary: string
}

function calcEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const ema: number[] = [prices[0]]
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i-1] * (1 - k))
  }
  return ema
}

function calcRSI(prices: number[], period = 14): number[] {
  const rsi: number[] = new Array(period).fill(50)
  const gains: number[] = []
  const losses: number[] = []

  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i-1]
    gains.push(diff > 0 ? diff : 0)
    losses.push(diff < 0 ? Math.abs(diff) : 0)
  }

  let avgGain = gains.slice(0, period).reduce((a,b) => a+b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a,b) => a+b, 0) / period

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period-1) + gains[i]) / period
    avgLoss = (avgLoss * (period-1) + losses[i]) / period
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi.push(100 - (100 / (1 + rs)))
  }

  return rsi
}

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  // Fetch historical bars from Alpaca
  const bars = await alpaca.getBarsV2(config.symbol, {
    start: config.startDate,
    end: config.endDate,
    timeframe: '1Day',
    adjustment: 'all',
  })

  const barData: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> = []
  for await (const bar of bars) {
    barData.push({
      date: new Date(bar.Timestamp).toISOString().split('T')[0],
      open: bar.OpenPrice,
      high: bar.HighPrice,
      low: bar.LowPrice,
      close: bar.ClosePrice,
      volume: bar.Volume,
    })
  }

  if (barData.length < 50) throw new Error(`Not enough data for ${config.symbol} — got ${barData.length} bars`)

  const closes = barData.map(b => b.close)
  const ema9 = calcEMA(closes, 9)
  const ema21 = calcEMA(closes, 21)
  const ema50 = calcEMA(closes, 50)
  const rsi = calcRSI(closes, 14)

  // Run the selected strategy
  let capital = config.initialCapital
  let shares = 0
  let entryPrice = 0
  const trades: Trade[] = []
  const equity: Array<{ date: string; value: number }> = []
  let peakCapital = capital
  let maxDrawdown = 0

  for (let i = 50; i < barData.length; i++) {
    const bar = barData[i]
    const price = bar.close
    const currentValue = capital + shares * price
    equity.push({ date: bar.date, value: currentValue })

    if (currentValue > peakCapital) peakCapital = currentValue
    const drawdown = (peakCapital - currentValue) / peakCapital * 100
    if (drawdown > maxDrawdown) maxDrawdown = drawdown

    let signal: 'BUY' | 'SELL' | null = null
    let reason = ''

    if (config.strategy === 'ema_cross') {
      const prevCross = ema9[i-1] - ema21[i-1]
      const currCross = ema9[i] - ema21[i]
      if (prevCross < 0 && currCross > 0 && ema50[i] < price) { signal = 'BUY'; reason = 'EMA9 crossed above EMA21, price above EMA50' }
      if (prevCross > 0 && currCross < 0) { signal = 'SELL'; reason = 'EMA9 crossed below EMA21' }
    }

    if (config.strategy === 'momentum') {
      const momentum = (price - closes[i-20]) / closes[i-20] * 100
      if (momentum > 5 && rsi[i] > 50 && rsi[i] < 70 && shares === 0) { signal = 'BUY'; reason = `+${momentum.toFixed(1)}% momentum, RSI ${rsi[i].toFixed(0)}` }
      if (shares > 0 && (rsi[i] > 75 || momentum < 0)) { signal = 'SELL'; reason = `RSI ${rsi[i].toFixed(0)} overbought or momentum faded` }
    }

    if (config.strategy === 'mean_reversion') {
      const avg20 = closes.slice(i-20, i).reduce((a,b) => a+b, 0) / 20
      const deviation = (price - avg20) / avg20 * 100
      if (deviation < -3 && rsi[i] < 35) { signal = 'BUY'; reason = `${deviation.toFixed(1)}% below 20MA, RSI oversold` }
      if (shares > 0 && (deviation > 2 || rsi[i] > 65)) { signal = 'SELL'; reason = 'Mean reversion target hit' }
    }

    if (config.strategy === 'breakout') {
      const high20 = Math.max(...barData.slice(i-20, i).map(b => b.high))
      const avgVol = barData.slice(i-10, i).reduce((a, b) => a + b.volume, 0) / 10
      if (price > high20 * 0.999 && bar.volume > avgVol * 1.5 && shares === 0) { signal = 'BUY'; reason = `20-day breakout with ${(bar.volume/avgVol).toFixed(1)}x volume` }
      if (shares > 0 && price < ema21[i]) { signal = 'SELL'; reason = 'Price broke below EMA21' }
    }

    // Execute signal
    if (signal === 'BUY' && shares === 0) {
      const tradeCapital = capital * config.positionSize
      shares = Math.floor(tradeCapital / price)
      if (shares > 0) {
        entryPrice = price
        capital -= shares * price
        trades.push({ date: bar.date, action: 'BUY', price, shares, reason })
      }
    } else if (signal === 'SELL' && shares > 0) {
      const pnl = (price - entryPrice) * shares
      capital += shares * price
      trades.push({ date: bar.date, action: 'SELL', price, shares, pnl, reason })
      shares = 0
      entryPrice = 0
    }
  }

  // Close any open position at end
  if (shares > 0) {
    const lastPrice = closes[closes.length - 1]
    const pnl = (lastPrice - entryPrice) * shares
    capital += shares * lastPrice
    trades.push({ date: barData[barData.length-1].date, action: 'SELL', price: lastPrice, shares, pnl, reason: 'End of backtest period' })
  }

  const winningTrades = trades.filter(t => t.action === 'SELL' && (t.pnl ?? 0) > 0)
  const losingTrades = trades.filter(t => t.action === 'SELL' && (t.pnl ?? 0) <= 0)
  const sellTrades = trades.filter(t => t.action === 'SELL')
  const totalReturn = (capital - config.initialCapital) / config.initialCapital * 100
  const days = (new Date(config.endDate).getTime() - new Date(config.startDate).getTime()) / (1000 * 86400)
  const annualizedReturn = ((1 + totalReturn/100) ** (365/days) - 1) * 100

  // Sharpe ratio (simplified, assumes risk-free rate of 5%)
  const returns = equity.map((e, i) => i > 0 ? (e.value - equity[i-1].value) / equity[i-1].value : 0).slice(1)
  const avgReturn = returns.reduce((a,b) => a+b, 0) / returns.length
  const stdDev = Math.sqrt(returns.map(r => (r - avgReturn)**2).reduce((a,b) => a+b, 0) / returns.length)
  const sharpeRatio = stdDev > 0 ? ((avgReturn * 252) - 0.05) / (stdDev * Math.sqrt(252)) : 0

  const summary = `${config.strategy.toUpperCase()} on ${config.symbol}: ` +
    `${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(1)}% return ` +
    `(${annualizedReturn.toFixed(1)}% annualized), ` +
    `${winningTrades.length}/${sellTrades.length} wins (${sellTrades.length > 0 ? (winningTrades.length/sellTrades.length*100).toFixed(0) : 0}% win rate), ` +
    `max drawdown ${maxDrawdown.toFixed(1)}%, Sharpe ${sharpeRatio.toFixed(2)}`

  return {
    symbol: config.symbol,
    strategy: config.strategy,
    startDate: config.startDate,
    endDate: config.endDate,
    initialCapital: config.initialCapital,
    finalCapital: capital,
    totalReturn,
    annualizedReturn,
    maxDrawdown,
    winRate: sellTrades.length > 0 ? winningTrades.length / sellTrades.length * 100 : 0,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    sharpeRatio,
    trades: trades.slice(-20), // last 20 trades
    equity: equity.filter((_, i) => i % 5 === 0), // every 5th point
    summary,
  }
}
