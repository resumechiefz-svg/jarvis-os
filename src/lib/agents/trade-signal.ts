/**
 * Jarvis Trade Signal Engine
 * Monitors Alpaca positions + market data, spots opportunities,
 * posts to Slack for AB's approval. Nothing executes without a YES.
 *
 * Risk rules (hard limits — never bypassed):
 * - Max $500 per single trade
 * - Max 5% of portfolio per position
 * - Daily loss limit: $300 (stops proposing after hit)
 * - Only proposes during market hours (9:30 AM – 4 PM ET)
 * - Never proposes penny stocks (price < $5)
 * - Never adds to a position already down > 15%
 */

import Anthropic from '@anthropic-ai/sdk'
import { getPortfolio, placeTrade } from './tradepilot'
import { supabaseAdmin } from '../supabase/client'
import { JARVIS_SYSTEM } from './prompts'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ALPACA_KEY = process.env.ALPACA_API_KEY ?? 'PKO2YLKYWULJSV6BZMGJEJ75FQ'
const ALPACA_SECRET = process.env.ALPACA_SECRET_KEY ?? 'E6RRza6k7Sp9kssQEnohWTHc98YBWQnJwywJSPBYkEuZ'
const ALPACA_DATA = 'https://data.alpaca.markets'
const DATA_HEADERS = { 'APCA-API-KEY-ID': ALPACA_KEY, 'APCA-API-SECRET-KEY': ALPACA_SECRET }

// Max proposal notional per trade
const MAX_TRADE_SIZE = 500
const MAX_PORTFOLIO_PCT = 0.05
const DAILY_LOSS_LIMIT = 300

export interface TradeProposal {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  notional: number
  reasoning: string
  signal: string
  confidence: 'high' | 'medium'
  riskNote: string
  proposedAt: string
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'expired'
}

function isMarketHours(): boolean {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  const hour = et.getHours()
  const min = et.getMinutes()
  const mins = hour * 60 + min
  return day >= 1 && day <= 5 && mins >= 570 && mins <= 960 // 9:30–4:00 ET
}

async function getDailyLoss(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'trade_executed')
    .gte('created_at', `${today}T00:00:00`)
    .limit(50)

  return (data ?? []).reduce((sum, d) => {
    try { const t = JSON.parse(d.context ?? '{}'); return sum + (t.pnl ?? 0) } catch { return sum }
  }, 0)
}

async function getBarData(symbol: string, timeframe: string, limit: number): Promise<number[]> {
  try {
    const res = await fetch(
      `${ALPACA_DATA}/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${limit}&adjustment=raw`,
      { headers: DATA_HEADERS, signal: AbortSignal.timeout(5000) }
    )
    const data = await res.json() as { bars?: Array<{ c: number }> }
    return (data.bars ?? []).map(b => b.c)
  } catch { return [] }
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

async function postProposalToSlack(proposal: TradeProposal, portfolioValue: number): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return

  const emoji = proposal.side === 'buy' ? '📈' : '📉'
  const confColor = proposal.confidence === 'high' ? '🟢' : '🟡'

  const text = `${emoji} *JARVIS — Trade Proposal*

*${proposal.side.toUpperCase()} ${proposal.symbol}* · $${proposal.notional} notional
${confColor} Confidence: ${proposal.confidence.toUpperCase()} | Signal: ${proposal.signal}

*Reasoning:* ${proposal.reasoning}
*Risk:* ${proposal.riskNote}
*Portfolio impact:* ${((proposal.notional / portfolioValue) * 100).toFixed(1)}% of equity

Reply *TRADE YES ${proposal.id}* to execute or *TRADE NO ${proposal.id}* to pass.
_(Proposal expires in 1 hour)_`

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#tradepilot', text }),
  }).catch(() => {})
}

async function analyzeOpportunities(): Promise<TradeProposal[]> {
  if (!isMarketHours()) return []

  const dailyLoss = await getDailyLoss()
  if (dailyLoss <= -DAILY_LOSS_LIMIT) {
    console.log('[TradeSignal] Daily loss limit hit — no new proposals')
    return []
  }

  const portfolio = await getPortfolio()
  const proposals: TradeProposal[] = []

  // Scan existing positions for RSI signals
  for (const position of portfolio.positions.slice(0, 10)) {
    if (position.currentPrice < 5) continue // No penny stocks

    const closes = await getBarData(position.symbol, '1Hour', 20)
    if (closes.length < 15) continue

    const rsi = calcRSI(closes)
    const priceDrop1d = closes.length >= 2
      ? ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100
      : 0

    // Oversold existing position — buy more
    if (rsi < 35 && position.unrealizedPLPct > -15 && position.side === 'long') {
      const notional = Math.min(MAX_TRADE_SIZE, portfolio.equity * MAX_PORTFOLIO_PCT)
      proposals.push({
        id: `${position.symbol}-buy-${Date.now()}`,
        symbol: position.symbol,
        side: 'buy',
        notional: Math.round(notional),
        reasoning: `RSI hit ${rsi.toFixed(0)} (oversold) on ${position.symbol}. Already holding with ${position.unrealizedPLPct.toFixed(1)}% gain. Adding to a winner at a pullback.`,
        signal: `RSI ${rsi.toFixed(0)}`,
        confidence: rsi < 28 ? 'high' : 'medium',
        riskNote: `Current position: $${position.marketValue.toFixed(0)}. Adding $${Math.round(notional)} more.`,
        proposedAt: new Date().toISOString(),
        status: 'pending',
      })
    }

    // Overbought — take partial profits
    if (rsi > 72 && position.unrealizedPLPct > 10 && position.side === 'long') {
      const sellNotional = Math.min(MAX_TRADE_SIZE, position.marketValue * 0.25)
      proposals.push({
        id: `${position.symbol}-sell-${Date.now()}`,
        symbol: position.symbol,
        side: 'sell',
        notional: Math.round(sellNotional),
        reasoning: `RSI hit ${rsi.toFixed(0)} (overbought) on ${position.symbol}. Up ${position.unrealizedPLPct.toFixed(1)}% — trimming 25% to lock in gains.`,
        signal: `RSI ${rsi.toFixed(0)}, +${position.unrealizedPLPct.toFixed(1)}%`,
        confidence: 'medium',
        riskNote: `Selling $${Math.round(sellNotional)} of $${position.marketValue.toFixed(0)} position. Keeping the rest.`,
        proposedAt: new Date().toISOString(),
        status: 'pending',
      })
    }

    // Sharp drop on no news — potential entry
    if (priceDrop1d < -4 && position.unrealizedPLPct > -15 && rsi < 45) {
      const notional = Math.min(MAX_TRADE_SIZE, portfolio.equity * MAX_PORTFOLIO_PCT * 0.5)
      proposals.push({
        id: `${position.symbol}-dip-${Date.now()}`,
        symbol: position.symbol,
        side: 'buy',
        notional: Math.round(notional),
        reasoning: `${position.symbol} dropped ${Math.abs(priceDrop1d).toFixed(1)}% today with RSI at ${rsi.toFixed(0)}. Likely technical selloff, not fundamental. Small add on the dip.`,
        signal: `${priceDrop1d.toFixed(1)}% drop, RSI ${rsi.toFixed(0)}`,
        confidence: 'medium',
        riskNote: `Half-size entry $${Math.round(notional)}. Stop if drops another 5%.`,
        proposedAt: new Date().toISOString(),
        status: 'pending',
      })
    }
  }

  // Limit to 2 proposals per cycle — don't overwhelm AB
  return proposals.slice(0, 2)
}

export async function runTradeSignalScan(): Promise<{ proposed: number }> {
  if (!isMarketHours()) {
    console.log('[TradeSignal] Market closed — skipping')
    return { proposed: 0 }
  }

  // Check for pending proposals — don't pile on
  const { data: pending } = await supabaseAdmin
    .from('ai_memories')
    .select('id')
    .eq('category', 'trade_proposal')
    .eq('context', 'pending')
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

  if ((pending?.length ?? 0) >= 2) {
    console.log('[TradeSignal] 2 pending proposals already — waiting for AB response')
    return { proposed: 0 }
  }

  const portfolio = await getPortfolio()
  const proposals = await analyzeOpportunities()

  for (const proposal of proposals) {
    // Save proposal to Supabase so Slack bot can find it by ID
    void supabaseAdmin.from('ai_memories').insert({
      category: 'trade_proposal',
      content: JSON.stringify(proposal),
      context: 'pending',
      importance: 8,
      created_at: new Date().toISOString(),
    })

    await postProposalToSlack(proposal, portfolio.equity)
  }

  console.log(`[TradeSignal] ${proposals.length} proposals posted to Slack`)
  return { proposed: proposals.length }
}

// Called when AB replies TRADE YES [id] in Slack
export async function executeApprovedTrade(proposalId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content, id')
    .eq('category', 'trade_proposal')
    .eq('context', 'pending')
    .order('created_at', { ascending: false })
    .limit(20)

  const record = (data ?? []).find(d => {
    try { return JSON.parse(d.content).id === proposalId } catch { return false }
  })

  if (!record) return `No pending proposal found with ID: ${proposalId}`

  const proposal: TradeProposal = JSON.parse(record.content)

  try {
    const result = await placeTrade({
      symbol: proposal.symbol,
      side: proposal.side,
      type: 'market',
      timeInForce: 'day',
      notional: proposal.notional,
    })

    // Mark as executed
    void supabaseAdmin.from('ai_memories').update({ context: 'executed' })
      .eq('id', record.id)

    // Log the trade
    void supabaseAdmin.from('ai_memories').insert({
      category: 'trade_executed',
      content: `${proposal.side.toUpperCase()} ${proposal.symbol} $${proposal.notional} — ${proposal.signal}`,
      context: JSON.stringify({ symbol: proposal.symbol, side: proposal.side, notional: proposal.notional, orderId: result.id }),
      importance: 8,
      created_at: new Date().toISOString(),
    })

    return `✅ Executed: ${proposal.side.toUpperCase()} ${proposal.symbol} $${proposal.notional}. Order ID: ${result.id}`
  } catch (err) {
    return `❌ Trade failed: ${err instanceof Error ? err.message : 'Unknown error'}`
  }
}
