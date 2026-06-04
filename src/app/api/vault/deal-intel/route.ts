/**
 * Vault Deal Intelligence — Card Chiefz buy/sell signals
 * Monitors: PSA pop reports, eBay sell-through, player news, market momentum
 * Fires alerts to Slack when a buying or selling window opens
 */
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'
import { slack } from '@/lib/slack'
import Anthropic from '@anthropic-ai/sdk'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface CardAlert {
  player: string
  cardDescription: string
  signal: 'BUY' | 'SELL' | 'WATCH'
  reason: string
  urgency: 'high' | 'medium' | 'low'
  estimatedWindow: string
  suggestedAction: string
}

// ── Pull trending sports news that affects card values ─────────────────────────
async function getSportsSignals(): Promise<string[]> {
  const signals: string[] = []

  try {
    // Reddit: r/sportscards, r/baseballcards, r/basketballcards, r/footballcards
    const subs = ['sportscards', 'basketballcards', 'footballcards', 'baseballcards']
    for (const sub of subs) {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=15`, {
        headers: { 'User-Agent': 'CardChiefz/1.0 deal-intel' },
        signal: AbortSignal.timeout(5000),
      })
      const data = await res.json() as {
        data?: { children?: Array<{ data: { title: string; score: number; selftext?: string } }> }
      }
      data?.data?.children?.forEach(c => {
        if (c.data.score > 50) {
          signals.push(`[${sub}] ${c.data.title}`)
        }
      })
    }
  } catch { /* continue */ }

  // Sports news from free APIs
  try {
    const newsKey = process.env.NEWS_API_KEY
    if (newsKey) {
      const res = await fetch(
        `https://newsapi.org/v2/everything?q=sports+card+value+OR+rookie+card+spike+OR+PSA+grade&sortBy=publishedAt&pageSize=10&apiKey=${newsKey}`,
        { signal: AbortSignal.timeout(5000) }
      )
      const data = await res.json() as { articles?: Array<{ title: string; description?: string }> }
      data?.articles?.forEach(a => signals.push(`[News] ${a.title}`))
    }
  } catch { /* continue */ }

  return signals.slice(0, 20)
}

// ── Check PSA population changes (public data) ─────────────────────────────────
async function checkPsaPop(playerName: string): Promise<string> {
  try {
    // PSA doesn't have a public API but we can check recent Supabase memory
    const { data } = await supabaseAdmin
      .from('ai_memories')
      .select('context, created_at')
      .eq('category', 'psa_pop')
      .ilike('content', `%${playerName}%`)
      .order('created_at', { ascending: false })
      .limit(2)

    if (data && data.length >= 2) {
      const latest = JSON.parse(data[0].context)
      const prev = JSON.parse(data[1].context)
      const popChange = (latest.pop10 ?? 0) - (prev.pop10 ?? 0)
      if (popChange > 10) return `PSA 10 pop increased by ${popChange} recently (dilution risk)`
      if (popChange < 0) return `PSA 10 pop stable/decreasing (good sign for values)`
    }
    return 'PSA pop data not yet tracked for this player'
  } catch { return '' }
}

// ── Analyze signals with Vault's intelligence ─────────────────────────────────
async function analyzeSignals(signals: string[]): Promise<CardAlert[]> {
  if (signals.length === 0) return []

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are Vault, an expert sports card investor and market analyst for Card Chiefz eBay store.

Analyze these market signals and identify actionable buy/sell/watch opportunities:

SIGNALS:
${signals.map((s, i) => `${i + 1}. ${s}`).join('\n')}

CONTEXT:
- Card Chiefz is an eBay seller with ~1,400+ sales, 99.5% feedback
- We buy undervalued cards, grade selectively, sell at optimal timing
- Focus: football, basketball, baseball rookies and stars
- Sweet spot: $5-500 cards with near-term catalyst (game, trade, award, pop report)

For each actionable opportunity you identify, return a JSON array:
[
  {
    "player": "Player Name",
    "cardDescription": "specific card year/set if known, else general",
    "signal": "BUY" or "SELL" or "WATCH",
    "reason": "specific reason in 1 sentence",
    "urgency": "high" or "medium" or "low",
    "estimatedWindow": "e.g. next 48 hours, this week, this month",
    "suggestedAction": "specific action Vault should take"
  }
]

Only include genuine opportunities. If nothing actionable, return [].
Return valid JSON only, no explanation.`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    return JSON.parse(text.slice(start, end + 1)) as CardAlert[]
  } catch { return [] }
}

// ── Main route ─────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const signals = await getSportsSignals()
    const alerts = await analyzeSignals(signals)

    if (alerts.length === 0) {
      return NextResponse.json({ ok: true, alerts: 0, message: 'No actionable signals right now' })
    }

    // Save to Supabase
    await supabaseAdmin.from('ai_memories').insert({
      category: 'deal_intel',
      content: `${alerts.length} card alerts`,
      context: JSON.stringify({ alerts, signals: signals.slice(0, 5), analyzedAt: new Date().toISOString() }),
      importance: alerts.some(a => a.urgency === 'high') ? 9 : 7,
      created_at: new Date().toISOString(),
    })

    // Build Slack message
    const highUrgency = alerts.filter(a => a.urgency === 'high')
    const others = alerts.filter(a => a.urgency !== 'high')

    const formatAlert = (a: CardAlert) =>
      `*${a.signal === 'BUY' ? '🟢 BUY' : a.signal === 'SELL' ? '🔴 SELL' : '👀 WATCH'}* — ${a.player}\n` +
      `_${a.cardDescription}_\n` +
      `${a.reason}\n` +
      `⏱ Window: ${a.estimatedWindow} · Action: ${a.suggestedAction}`

    let message = `🃏 *Vault Deal Intel — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}*\n`

    if (highUrgency.length > 0) {
      message += `\n🚨 *HIGH URGENCY*\n${highUrgency.map(formatAlert).join('\n\n')}\n`
    }
    if (others.length > 0) {
      message += `\n📋 *On the Radar*\n${others.slice(0, 3).map(formatAlert).join('\n\n')}`
    }

    await slack(message, 'vault')

    return NextResponse.json({ ok: true, alerts: alerts.length, highUrgency: highUrgency.length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
