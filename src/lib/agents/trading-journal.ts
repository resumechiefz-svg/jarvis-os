/**
 * Trading Journal — logs every Alpaca trade with full context
 * Thesis, entry, exit, Jarvis commentary, outcome
 * Pattern recognition on actual trading behavior over time
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'
import { saveMemory } from '../memory/vectors'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN

async function slack(text: string) {
  if (!TOKEN) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#jarvis', text }),
  })
}

export interface TradeEntry {
  symbol: string
  side: 'buy' | 'sell'
  qty: number
  price: number
  totalValue: number
  thesis?: string         // Why this trade
  jarvisNote?: string     // Jarvis's take at entry
  exitPrice?: number
  pnl?: number
  pnlPct?: number
  outcome?: 'win' | 'loss' | 'breakeven'
  date: string
  exitDate?: string
  holdDays?: number
}

export async function logTrade(trade: TradeEntry): Promise<void> {
  // Generate Jarvis commentary on the trade
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `Jarvis is logging this trade for AB's trading journal. One sentence commentary — what's the thesis, any risk to watch, or what makes this interesting. Direct, no fluff.

Trade: ${trade.side.toUpperCase()} ${trade.qty} shares of ${trade.symbol} at $${trade.price} ($${trade.totalValue.toFixed(0)} total)
${trade.thesis ? `AB's thesis: ${trade.thesis}` : ''}`,
    }],
  })

  trade.jarvisNote = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''

  await supabaseAdmin.from('ai_memories').insert({
    category: 'trade_journal',
    content: `${trade.side.toUpperCase()} ${trade.symbol} $${trade.price}`,
    context: JSON.stringify(trade),
    importance: 7,
    created_at: trade.date,
  })

  await saveMemory({
    category: 'trade_journal',
    content: `${trade.side} ${trade.symbol} at $${trade.price}`,
    context: trade.thesis ?? trade.jarvisNote ?? '',
    importance: 7,
  })
}

// Update journal when a position closes
export async function closeTradeEntry(symbol: string, exitPrice: number, exitDate: string): Promise<void> {
  const { data: entries } = await supabaseAdmin
    .from('ai_memories')
    .select('id, context')
    .eq('category', 'trade_journal')
    .ilike('content', `%${symbol}%`)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!entries?.length) return

  const trade = JSON.parse(entries[0].context ?? '{}') as TradeEntry
  if (trade.exitPrice) return // Already closed

  trade.exitPrice = exitPrice
  trade.exitDate = exitDate
  trade.pnl = (exitPrice - trade.price) * trade.qty * (trade.side === 'sell' ? -1 : 1)
  trade.pnlPct = ((exitPrice - trade.price) / trade.price) * 100 * (trade.side === 'sell' ? -1 : 1)
  trade.outcome = trade.pnl > 0 ? 'win' : trade.pnl < 0 ? 'loss' : 'breakeven'
  trade.holdDays = Math.round((new Date(exitDate).getTime() - new Date(trade.date).getTime()) / 86400000)

  await supabaseAdmin.from('ai_memories').update({
    context: JSON.stringify(trade),
    importance: trade.outcome === 'win' ? 8 : 7,
  }).eq('id', entries[0].id)

  const emoji = trade.outcome === 'win' ? '✅' : '❌'
  await slack(`${emoji} *Trade Closed — ${symbol}*\n${trade.side.toUpperCase()} ${trade.qty}sh | Entry $${trade.price} → Exit $${exitPrice}\nP&L: ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)} (${trade.pnlPct.toFixed(1)}%) | Held ${trade.holdDays} day${trade.holdDays !== 1 ? 's' : ''}`)
}

// Weekly: analyze trading patterns
export async function analyzeTradingPatterns(): Promise<string> {
  const { data: trades } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'trade_journal')
    .order('created_at', { ascending: false })
    .limit(30)

  const closed = (trades ?? []).map(t => {
    try { return JSON.parse(t.context ?? '{}') as TradeEntry } catch { return null }
  }).filter(t => t?.outcome) as TradeEntry[]

  if (closed.length < 5) return `${(trades ?? []).length} trades logged. Need at least 5 closed trades for pattern analysis.`

  const wins = closed.filter(t => t.outcome === 'win')
  const losses = closed.filter(t => t.outcome === 'loss')
  const winRate = ((wins.length / closed.length) * 100).toFixed(0)
  const avgWin = wins.reduce((s, t) => s + (t.pnlPct ?? 0), 0) / (wins.length || 1)
  const avgLoss = losses.reduce((s, t) => s + (t.pnlPct ?? 0), 0) / (losses.length || 1)

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Analyze these trades for patterns. Win rate: ${winRate}%. Avg win: ${avgWin.toFixed(1)}%. Avg loss: ${avgLoss.toFixed(1)}%.

Trades: ${closed.map(t => `${t.symbol} ${t.outcome} ${t.pnlPct?.toFixed(1)}% held ${t.holdDays}d`).join(', ')}

What setups are working? What isn't? One direct paragraph.`,
    }],
  })

  return msg.content[0].type === 'text' ? msg.content[0].text : ''
}
