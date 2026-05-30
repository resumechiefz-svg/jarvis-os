/**
 * JARVIS Deep Memory Engine
 * Runs weekly to analyze patterns across all data
 * Makes Jarvis smarter every week — learns what works, what doesn't,
 * what AB does vs says, and what's actually driving results
 */

import Anthropic from '@anthropic-ai/sdk'
import { JARVIS_SYSTEM } from './prompts'
import { getNovaStats } from './nova'
import { getVaultStats } from './vault'
import { supabaseAdmin } from '../supabase/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface WeeklyInsight {
  category: 'rc' | 'cc' | 'goals' | 'patterns' | 'beckett' | 'financial' | 'behavior'
  insight: string
  confidence: 'high' | 'medium' | 'low'
  actionable: boolean
  action?: string
}

// Pull recent conversation history from memory
async function getRecentConversations(days = 7): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context, category, created_at')
    .in('category', ['conversation', 'journal'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50)

  return (data ?? []).map(d => `[${d.category}] ${d.content}`)
}

// Pull monitor logs to see what was flagged
async function getMonitorHistory(days = 7): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context')
    .eq('category', 'monitor_log')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)

  return (data ?? []).map(d => d.content)
}

// Pull all existing insights to avoid duplicating
async function getExistingInsights(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content')
    .eq('category', 'weekly_insight')
    .order('created_at', { ascending: false })
    .limit(20)

  return (data ?? []).map(d => d.content)
}

// Save insights to memory with high importance
async function saveInsights(insights: WeeklyInsight[]): Promise<void> {
  for (const insight of insights) {
    await supabaseAdmin.from('ai_memories').insert({
      category: 'weekly_insight',
      content: insight.insight,
      context: JSON.stringify({ category: insight.category, confidence: insight.confidence, action: insight.action }),
      importance: insight.confidence === 'high' ? 9 : insight.confidence === 'medium' ? 7 : 5,
      created_at: new Date().toISOString(),
    })
  }
}

// Post insight summary to Slack
async function postInsightSummary(insights: WeeklyInsight[], synthesis: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return

  const topInsights = insights.filter(i => i.confidence === 'high').slice(0, 5)

  const text = `🧠 *JARVIS — Weekly Intelligence Report*\n\n${synthesis}\n\n*Top Insights:*\n${
    topInsights.map((i, n) => `${n + 1}. *[${i.category.toUpperCase()}]* ${i.insight}${i.action ? `\n   → ${i.action}` : ''}`).join('\n\n')
  }\n\n_${insights.length} total patterns analyzed this week._`

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#jarvis', text }),
  })
}

export async function runWeeklyAnalysis(): Promise<WeeklyInsight[]> {
  console.log('[Memory Engine] Starting weekly analysis...')

  const [rcStats, ccStats, conversations, monitorLogs, existingInsights] = await Promise.all([
    getNovaStats().catch(() => null),
    getVaultStats().catch(() => null),
    getRecentConversations(7),
    getMonitorHistory(7),
    getExistingInsights(),
  ])

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const prompt = `You are analyzing AB's full week of data to extract patterns and insights. Today is ${today}.

BUSINESS DATA THIS WEEK:
ResumeChiefz — MRR: $${rcStats?.mrr ?? 0}, New subs: ${rcStats?.newSubs ?? 0}, Churn: ${rcStats?.churn ?? 0}, Active users: ${rcStats?.activeUsers ?? 0}
Card Chiefz — Weekly revenue: $${ccStats?.weeklyRevenue ?? 0}, Monthly sales: ${ccStats?.monthlySales ?? 0}, Total sales: ${ccStats?.totalSales ?? 0}

CONVERSATIONS THIS WEEK (${conversations.length} recorded):
${conversations.slice(0, 20).join('\n') || 'None recorded yet'}

SYSTEM ALERTS THIS WEEK:
${monitorLogs.join('\n') || 'No alerts fired'}

EXISTING INSIGHTS (do not repeat these):
${existingInsights.slice(0, 10).join('\n') || 'None yet'}

AB CONTEXT:
- Anthony, 34, recruiter, Charlotte NC, son Beckett (turns 5 June 2026)
- Goal: 7-figure business portfolio, FI by 40
- Philosophy: "Easy in, fast out" — action over analysis
- Known patterns: gets discouraged by red positions, works best in non-custody weeks

Analyze everything and return a JSON array of 5-8 high-value insights. Look for:
- What's working vs not working in RC or CC
- Behavioral patterns (when AB is most productive, what he avoids)
- Business momentum signals
- Goal pace vs actual
- Opportunities being missed
- Risks building up quietly

Return ONLY valid JSON array:
[
  {
    "category": "rc|cc|goals|patterns|beckett|financial|behavior",
    "insight": "Specific, data-backed observation about AB's situation",
    "confidence": "high|medium|low",
    "actionable": true,
    "action": "The one concrete thing AB should do about this"
  }
]`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: JARVIS_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  const insights: WeeklyInsight[] = JSON.parse(jsonMatch[0])
  await saveInsights(insights)

  // Jarvis synthesis
  const synthPrompt = `Based on these weekly insights for AB:\n${insights.map(i => i.insight).join('\n')}\n\nWrite 2 crisp sentences: what's the single most important thing happening in AB's world right now, and what should he focus on this coming week. Be direct. Call him AB.`

  const synthRes = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    system: JARVIS_SYSTEM,
    messages: [{ role: 'user', content: synthPrompt }],
  })

  const synthesis = synthRes.content[0].type === 'text' ? synthRes.content[0].text : ''
  await postInsightSummary(insights, synthesis)

  // Save synthesis as high-importance memory
  await supabaseAdmin.from('ai_memories').insert({
    category: 'weekly_synthesis',
    content: synthesis,
    context: `Week of ${today} — ${insights.length} insights analyzed`,
    importance: 9,
    created_at: new Date().toISOString(),
  })

  console.log(`[Memory Engine] Done — ${insights.length} insights saved`)
  return insights
}

// Load rich memory context for Jarvis conversations
// Called before every Jarvis response to make him smarter
export async function loadRichMemory(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('category, content, importance, created_at')
    .in('category', ['weekly_insight', 'weekly_synthesis', 'journal', 'conversation'])
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(30)

  if (!data?.length) return ''

  const syntheses = data.filter(d => d.category === 'weekly_synthesis').slice(0, 2)
  const insights = data.filter(d => d.category === 'weekly_insight').slice(0, 10)
  const journals = data.filter(d => d.category === 'journal').slice(0, 5)

  let context = '\n\n--- JARVIS LEARNED INTELLIGENCE ---\n'

  if (syntheses.length) {
    context += '\nRecent weekly synthesis:\n' + syntheses.map(s => s.content).join('\n')
  }

  if (insights.length) {
    context += '\n\nActive insights:\n' + insights.map(i => `• ${i.content}`).join('\n')
  }

  if (journals.length) {
    context += '\n\nRecent journal entries:\n' + journals.map(j => j.content).join('\n')
  }

  context += '\n--- END INTELLIGENCE ---\n'
  return context
}
