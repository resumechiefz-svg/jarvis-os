import { slack } from '../slack'
/**
 * Daily Accountability Score — nightly 9pm Slack report
 * Scores AB's day across 5 dimensions, 1-10 each
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })


interface DayScore {
  trading: number; tradingNote: string
  revenue: number; revenueNote: string
  training: number; trainingNote: string
  focus: number; focusNote: string
  progress: number; progressNote: string
  overall: number
  highlight: string
  tomorrow: string
}

export async function runAccountabilityScore(): Promise<DayScore> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'
  const headers = { Authorization: `Bearer ${process.env.JARVIS_SESSION_SECRET}` }

  // Gather today's data
  const [portfolio, nova, convos] = await Promise.all([
    fetch(`${base}/api/portfolio`, { headers }).then(r => r.json()).catch(() => null),
    fetch(`${base}/api/nova`, { headers }).then(r => r.json()).catch(() => null),
    supabaseAdmin.from('ai_memories').select('content').eq('category', 'conversation_summary')
      .gte('created_at', new Date().toISOString().split('T')[0]).limit(10).then(r => r.data ?? []),
  ])

  const trainingToday = await supabaseAdmin.from('ai_memories').select('context')
    .eq('category', 'training_log').gte('created_at', new Date().toISOString().split('T')[0]).limit(1)
    .then(r => r.data?.[0] ?? null)

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Score AB's day. Be honest and direct. Use real data.

Trading: ${portfolio ? `Day P&L: ${portfolio.dayPLPct?.toFixed(2)}%, Equity: $${portfolio.equity?.toLocaleString()}` : 'No data'}
Revenue: ${nova ? `MRR: $${nova.mrr?.toFixed(0)}, New subs: ${nova.newSubs}, Churn: ${nova.churn}` : 'No data'}
Training: ${trainingToday ? JSON.stringify(trainingToday.context).slice(0, 100) : 'No workout logged today'}
Conversations today: ${convos.length} Jarvis interactions
Goals: 7-figure portfolio, financial independence by 40, Whitewater 50 Mile

Score each 1-10 with a 1-line note. Be tough — 7 is good, 10 is exceptional.

Return JSON only:
{
  "trading": 7, "tradingNote": "...",
  "revenue": 6, "revenueNote": "...",
  "training": 8, "trainingNote": "...",
  "focus": 7, "focusNote": "...",
  "progress": 7, "progressNote": "...",
  "overall": 7,
  "highlight": "Best thing today in one sentence",
  "tomorrow": "One specific thing to do tomorrow"
}`,
    }],
  })

  let score: DayScore
  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    score = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
  } catch {
    score = { trading: 5, tradingNote: 'No data', revenue: 5, revenueNote: 'No data', training: 5, trainingNote: 'No data', focus: 7, focusNote: 'Stayed engaged', progress: 6, progressNote: 'Moving forward', overall: 6, highlight: 'Another day of execution', tomorrow: 'Push harder' }
  }

  const bar = (n: number) => '█'.repeat(Math.round(n)) + '░'.repeat(10 - Math.round(n))
  const emoji = (n: number) => n >= 9 ? '🔥' : n >= 7 ? '✅' : n >= 5 ? '⚠️' : '🔴'

  const report = `
━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 *DAILY SCORE — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}*
━━━━━━━━━━━━━━━━━━━━━━━━━━

${emoji(score.trading)} *Trading* \`${bar(score.trading)}\` *${score.trading}/10*
_${score.tradingNote}_

${emoji(score.revenue)} *Revenue* \`${bar(score.revenue)}\` *${score.revenue}/10*
_${score.revenueNote}_

${emoji(score.training)} *Training* \`${bar(score.training)}\` *${score.training}/10*
_${score.trainingNote}_

${emoji(score.focus)} *Focus* \`${bar(score.focus)}\` *${score.focus}/10*
_${score.focusNote}_

${emoji(score.progress)} *Progress* \`${bar(score.progress)}\` *${score.progress}/10*
_${score.progressNote}_

━━━━━━━━━━━━━━━━━━━━━━━━━━
*OVERALL: ${score.overall}/10* ${emoji(score.overall)}

💡 *Today's highlight:* ${score.highlight}
🎯 *Tomorrow:* ${score.tomorrow}
━━━━━━━━━━━━━━━━━━━━━━━━━━`.trim()

  await slack(report)

  await supabaseAdmin.from('ai_memories').insert({
    category: 'daily_score',
    content: new Date().toISOString().split('T')[0],
    context: JSON.stringify({ ...score, report }),
    importance: 8,
    created_at: new Date().toISOString(),
  })

  return score
}
