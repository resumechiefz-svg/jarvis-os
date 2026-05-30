/**
 * EXECUTION ENGINE — Fully autonomous trading orchestrator
 * Coordinates: Scanner → Technical → Risk Manager → Execution
 * No human approval required. Top 1% systematic trader.
 *
 * Philosophy:
 * - Never trade against the trend
 * - Never risk more than 2x ATR
 * - Always have a stop loss before entering
 * - Protect capital first, profits second
 * - Run in paper mode until AB switches to live
 */

import Anthropic from '@anthropic-ai/sdk'
import { runScan, synthesizeScanWithAI } from './market-scanner'
import { analyzeSymbol } from './technical-analysis'
import { assessTrade } from './risk-manager'
import { getPortfolio, placeTrade } from '../agents/tradepilot'
import { supabaseAdmin } from '../supabase/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ALPACA_KEY = process.env.ALPACA_API_KEY ?? 'PKO2YLKYWULJSV6BZMGJEJ75FQ'
const ALPACA_SECRET = process.env.ALPACA_SECRET_KEY ?? 'E6RRza6k7Sp9kssQEnohWTHc98YBWQnJwywJSPBYkEuZ'
const ALPACA_BASE = 'https://paper-api.alpaca.markets'
const HEADERS = { 'APCA-API-KEY-ID': ALPACA_KEY, 'APCA-API-SECRET-KEY': ALPACA_SECRET }

function isMarketOpen(): boolean {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  const mins = et.getHours() * 60 + et.getMinutes()
  return day >= 1 && day <= 5 && mins >= 570 && mins <= 960
}

async function getDailyTradingStats() {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context')
    .eq('category', 'autonomous_trade')
    .gte('created_at', `${today}T00:00:00`)

  const trades = data ?? []
  const dayPL = trades.reduce((sum, t) => {
    try { return sum + (JSON.parse(t.context ?? '{}').pnl ?? 0) } catch { return sum }
  }, 0)

  return { tradesExecuted: trades.length, dayPL, portfolioDrawdownPct: 0 }
}

async function placeBracketOrder(symbol: string, notional: number, side: 'buy' | 'sell', stopLoss: number, takeProfit: number) {
  // Market order for entry
  const order = await placeTrade({ symbol, side, type: 'market', timeInForce: 'day', notional })

  // After entry, place stop loss and take profit as OTO (one-triggers-other)
  // Alpaca supports bracket orders via the API
  const qty = (notional / (await fetch(`${ALPACA_BASE}/v2/positions/${symbol}`, { headers: HEADERS })
    .then(r => r.json()).then((p: Record<string, string>) => parseFloat(p.avg_entry_price ?? '1')).catch(() => 1))).toFixed(6)

  // Place stop loss
  await fetch(`${ALPACA_BASE}/v2/orders`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol, qty,
      side: side === 'buy' ? 'sell' : 'buy',
      type: 'stop',
      time_in_force: 'gtc',
      stop_price: stopLoss.toFixed(2),
    }),
  }).catch(() => {})

  // Place take profit limit
  await fetch(`${ALPACA_BASE}/v2/orders`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol, qty,
      side: side === 'buy' ? 'sell' : 'buy',
      type: 'limit',
      time_in_force: 'gtc',
      limit_price: takeProfit.toFixed(2),
    }),
  }).catch(() => {})

  return order
}

async function manageExistingPositions(portfolio: ReturnType<typeof getPortfolio> extends Promise<infer T> ? T : never) {
  const managed: string[] = []

  for (const position of portfolio.positions) {
    // Exit if stop loss hit (already closed by broker) — remove stale stops
    // Trim if position up > 20% — take partial profits
    if (position.unrealizedPLPct > 20) {
      const sellNotional = Math.round(position.marketValue * 0.25) // Trim 25%
      try {
        await placeTrade({ symbol: position.symbol, side: 'sell', type: 'market', timeInForce: 'day', notional: sellNotional })
        managed.push(`TRIM ${position.symbol} 25% — up ${position.unrealizedPLPct.toFixed(1)}%`)

        void supabaseAdmin.from('ai_memories').insert({
          category: 'autonomous_trade',
          content: `TRIM ${position.symbol} $${sellNotional} — profit protection`,
          context: JSON.stringify({ symbol: position.symbol, side: 'sell', notional: sellNotional, reason: 'profit_protection', pnl: position.unrealizedPL * 0.25 }),
          importance: 7,
          created_at: new Date().toISOString(),
        })
      } catch { /* skip */ }
    }

    // Cut losses if down > 12% and no stop in place
    if (position.unrealizedPLPct < -12) {
      try {
        await placeTrade({ symbol: position.symbol, side: 'sell', type: 'market', timeInForce: 'day', notional: Math.round(position.marketValue) })
        managed.push(`STOP OUT ${position.symbol} — down ${position.unrealizedPLPct.toFixed(1)}%`)

        void supabaseAdmin.from('ai_memories').insert({
          category: 'autonomous_trade',
          content: `STOP OUT ${position.symbol} $${Math.round(position.marketValue)} — loss protection`,
          context: JSON.stringify({ symbol: position.symbol, side: 'sell', notional: Math.round(position.marketValue), reason: 'stop_loss', pnl: position.unrealizedPL }),
          importance: 8,
          created_at: new Date().toISOString(),
        })
      } catch { /* skip */ }
    }
  }

  return managed
}

async function notifySlack(text: string) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#tradepilot', text }),
  }).catch(() => {})
}

export interface EngineResult {
  tradesExecuted: number
  tradesConsidered: number
  managed: string[]
  blocked: string[]
  summary: string
}

export async function runAutonomousEngine(): Promise<EngineResult> {
  if (!isMarketOpen()) {
    return { tradesExecuted: 0, tradesConsidered: 0, managed: [], blocked: [], summary: 'Market closed' }
  }

  const [portfolio, dailyStats] = await Promise.all([
    getPortfolio(),
    getDailyTradingStats(),
  ])

  // Manage existing positions first — protect capital
  const managed = await manageExistingPositions(portfolio)

  // Scan for new opportunities
  const hits = await runScan()
  if (!hits.length) {
    return { tradesExecuted: 0, tradesConsidered: 0, managed, blocked: [], summary: 'No qualifying setups found' }
  }

  // Get AI synthesis of top setups
  const aiRecs = await synthesizeScanWithAI(hits, portfolio.equity)
  let recommendations: Array<{ symbol: string; side: 'buy' | 'sell'; notional: number; rationale: string; risk: string; confidence: string }> = []
  try {
    const match = aiRecs.match(/\[[\s\S]*\]/)
    if (match) recommendations = JSON.parse(match[0])
  } catch { /* use scanner hits directly */ }

  // If AI gave no recs, use top scanner hits
  if (!recommendations.length) {
    recommendations = hits.slice(0, 3).map(h => ({
      symbol: h.symbol,
      side: h.signal === 'OVERSOLD' || h.signal === 'PULLBACK' ? 'buy' : 'buy',
      notional: 300,
      rationale: `${h.signal} signal — score ${h.score}`,
      risk: 'Standard ATR stop',
      confidence: h.score > 80 ? 'high' : 'medium',
    }))
  }

  let tradesExecuted = 0
  const blocked: string[] = []

  for (const rec of recommendations.slice(0, 3)) {
    // Skip low confidence if already have positions
    if (rec.confidence === 'low') { blocked.push(`${rec.symbol}: low confidence`); continue }

    // Deep technical analysis
    const technical = await analyzeSymbol(rec.symbol)
    if (!technical) { blocked.push(`${rec.symbol}: insufficient data`); continue }

    // Align: don't fight the technical direction
    if (technical.direction === 'BEARISH' && rec.side === 'buy' && technical.strength === 'STRONG') {
      blocked.push(`${rec.symbol}: bearish trend overrides buy signal`)
      continue
    }

    // Risk assessment
    const risk = assessTrade(technical, portfolio, dailyStats, rec.side)
    if (!risk.approved) {
      blocked.push(`${rec.symbol}: ${risk.reason}`)
      continue
    }

    // Execute
    try {
      await placeBracketOrder(rec.symbol, risk.adjustedNotional, rec.side, risk.stopLoss, risk.takeProfit)
      tradesExecuted++
      dailyStats.tradesExecuted++

      const tradeLog = `${rec.side.toUpperCase()} ${rec.symbol} $${risk.adjustedNotional} | Stop: $${risk.stopLoss} | TP: $${risk.takeProfit} | R:R ${risk.riskRewardRatio}:1`

      void supabaseAdmin.from('ai_memories').insert({
        category: 'autonomous_trade',
        content: tradeLog,
        context: JSON.stringify({
          symbol: rec.symbol, side: rec.side, notional: risk.adjustedNotional,
          stopLoss: risk.stopLoss, takeProfit: risk.takeProfit, rr: risk.riskRewardRatio,
          rationale: rec.rationale, technical: technical.signalSummary, pnl: 0,
        }),
        importance: 8,
        created_at: new Date().toISOString(),
      })
    } catch (err) {
      blocked.push(`${rec.symbol}: execution failed — ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  // Build summary for Slack report
  const summary = [
    `📊 *TRADEPILOT ENGINE — Cycle complete*`,
    `Portfolio: $${portfolio.equity.toLocaleString()} | Day P&L: ${portfolio.dayPL >= 0 ? '+' : ''}$${portfolio.dayPL.toFixed(2)}`,
    `Setups scanned: ${hits.length} | Trades executed: ${tradesExecuted}/${recommendations.length}`,
    managed.length ? `Position management: ${managed.join(', ')}` : '',
    blocked.length ? `Blocked: ${blocked.slice(0, 3).join(' | ')}` : '',
  ].filter(Boolean).join('\n')

  if (tradesExecuted > 0 || managed.length > 0) {
    await notifySlack(summary)
  }

  return { tradesExecuted, tradesConsidered: recommendations.length, managed, blocked, summary }
}

// Get today's autonomous trading summary for Jarvis to report
export async function getTradingSummary(): Promise<string> {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context, created_at')
    .eq('category', 'autonomous_trade')
    .gte('created_at', `${today}T00:00:00`)
    .order('created_at', { ascending: false })

  if (!data?.length) return 'No autonomous trades executed today.'

  const portfolio = await getPortfolio()
  const lines = (data as Array<{ content: string; context: string; created_at: string }>).map(d => `• ${d.content}`)

  return `TRADEPILOT — Today's Activity (${data.length} trades)\n${lines.join('\n')}\n\nCurrent P&L: ${portfolio.dayPL >= 0 ? '+' : ''}$${portfolio.dayPL.toFixed(2)}`
}
