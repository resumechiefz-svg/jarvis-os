/**
 * Weekly Sunday Review — auto-compiles AB's full week every Sunday at 8pm
 * Portfolio | RC Revenue | CC Sales | Training | Goal Velocity
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN
const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'
const HEADERS = { Authorization: `Bearer ${process.env.JARVIS_SESSION_SECRET}` }

async function slack(text: string) {
  if (!TOKEN) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#jarvis', text }),
  })
}

export async function runWeeklyReview(): Promise<void> {
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Gather all week's data in parallel
  const [portfolio, nova, dailyScores, trainingSessions, eBaySales] = await Promise.all([
    fetch(`${BASE}/api/portfolio`, { headers: HEADERS }).then(r => r.json()).catch(() => null),
    fetch(`${BASE}/api/nova`, { headers: HEADERS }).then(r => r.json()).catch(() => null),
    supabaseAdmin.from('ai_memories').select('context, created_at').eq('category', 'daily_score')
      .gte('created_at', weekStart.toISOString()).order('created_at', { ascending: true }).then(r => r.data ?? []),
    supabaseAdmin.from('ai_memories').select('context').eq('category', 'training_log')
      .gte('created_at', weekStart.toISOString()).then(r => r.data ?? []),
    supabaseAdmin.from('ai_memories').select('context').eq('category', 'ebay_sale')
      .gte('created_at', weekStart.toISOString()).then(r => r.data ?? []),
  ])

  // Calculate week stats
  const avgScore = dailyScores.length > 0
    ? (dailyScores.reduce((s, d) => { try { return s + (JSON.parse(d.context ?? '{}').overall ?? 0) } catch { return s } }, 0) / dailyScores.length).toFixed(1)
    : 'N/A'

  const ccRevenue = eBaySales.reduce((s, d) => { try { return s + (JSON.parse(d.context ?? '{}').amount ?? 0) } catch { return s } }, 0)
  const trainingDays = trainingSessions.length

  // Generate synthesis with Claude
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Write a sharp weekly review for AB. One paragraph max per section. Direct, no fluff.

Week data:
- Portfolio equity: $${portfolio?.equity?.toLocaleString() ?? 'unknown'} | Week P&L: $${portfolio?.dayPL?.toFixed(0) ?? 'unknown'}
- RC MRR: $${nova?.mrr?.toFixed(0) ?? 'unknown'} | New subs: ${nova?.newSubs ?? 0} | Churn: ${nova?.churn ?? 0}
- Card Chiefz revenue this week: $${ccRevenue.toFixed(2)} (${eBaySales.length} sales)
- Training days completed: ${trainingDays}/7
- Avg daily score: ${avgScore}/10

For each: what happened, what it means, one action for next week. End with overall verdict.`,
    }],
  })
  const synthesis = msg.content[0].type === 'text' ? msg.content[0].text : ''

  const weekStr = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  const report = `
━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *WEEKLY REVIEW — ${weekStr}*
━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 *Portfolio:* $${portfolio?.equity?.toLocaleString() ?? '—'} equity
💰 *RC Revenue:* $${nova?.mrr?.toFixed(0) ?? '—'} MRR | +${nova?.newSubs ?? 0} subs | -${nova?.churn ?? 0} churn
💳 *Card Chiefz:* $${ccRevenue.toFixed(2)} (${eBaySales.length} sales)
🏃 *Training:* ${trainingDays}/7 days
⭐ *Avg Daily Score:* ${avgScore}/10

━━━━━━━━━━━━━━━━━━━━━━━━━━
${synthesis}
━━━━━━━━━━━━━━━━━━━━━━━━━━`.trim()

  await slack(report)

  await supabaseAdmin.from('ai_memories').insert({
    category: 'weekly_review',
    content: weekStr,
    context: report,
    importance: 8,
    created_at: new Date().toISOString(),
  })
}
