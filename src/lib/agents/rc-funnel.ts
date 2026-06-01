/**
 * RC Funnel Analytics — where do users drop off before converting?
 * Landing → signup → resume built → subscription
 * NOVA spots the leak and tells AB weekly
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

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

export async function analyzeFunnel(): Promise<void> {
  // Pull RC metrics from memory
  const { data: snapshots } = await supabaseAdmin
    .from('ai_memories')
    .select('context, created_at')
    .eq('category', 'nova_snapshot')
    .order('created_at', { ascending: false })
    .limit(8)

  const metrics = (snapshots ?? []).map(s => {
    try { return JSON.parse(s.context ?? '{}') } catch { return null }
  }).filter(Boolean)

  if (metrics.length < 2) {
    await slack(`📉 *RC Funnel — Not enough data yet*\nNeed 2+ weekly snapshots to identify funnel trends. Will analyze next week.`)
    return
  }

  const latest = metrics[0]
  const previous = metrics[1]

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Analyze RC funnel health. AB runs ResumeChiefz (AI resume builder, $7.99/mo).

Current metrics: ${JSON.stringify(latest)}
Previous week: ${JSON.stringify(previous)}

Funnel stages: Traffic → Signup → Resume Built → Paid Sub

Based on these numbers:
1. Where is the biggest drop-off right now?
2. What's the conversion rate trend?
3. One specific thing AB should change this week to fix the leak

Be specific and direct. One paragraph max.`,
    }],
  })

  const analysis = msg.content[0].type === 'text' ? msg.content[0].text : ''

  const churnRate = latest.churn ?? 0
  const mrr = latest.mrr ?? 0
  const newSubs = latest.newSubscribers ?? 0

  await slack(`📊 *RC Funnel Report — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}*

MRR: $${mrr} | New subs: ${newSubs} | Churn: ${churnRate}%

${analysis}`)

  await supabaseAdmin.from('ai_memories').insert({
    category: 'funnel_report',
    content: new Date().toISOString().split('T')[0],
    context: analysis,
    importance: 7,
    created_at: new Date().toISOString(),
  })
}
