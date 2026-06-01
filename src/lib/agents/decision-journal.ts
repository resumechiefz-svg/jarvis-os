/**
 * Decision Journal — logs every major decision with context
 * Follows up 30 days later: how did it turn out?
 * Builds a personal wisdom database over time
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

export interface Decision {
  id?: string
  summary: string       // What was decided
  context: string       // Why, what the stakes were
  alternatives?: string // What else was considered
  date: string
  followUpDate: string  // 30 days out
  outcome?: string      // Filled in on follow-up
  rating?: number       // 1-10 in hindsight
}

// Detect if a message contains a major decision worth logging
export async function detectAndLogDecision(userMessage: string, assistantReply: string): Promise<boolean> {
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Does this conversation contain a major decision AB made? Major = financial, business, personal, career, or strategic.

User: "${userMessage}"
Jarvis: "${assistantReply}"

If yes, extract: {"isDecision": true, "summary": "one sentence what was decided", "context": "why, what the stakes were", "alternatives": "what else was considered if mentioned"}
If no: {"isDecision": false}

Return JSON only.`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    const data = match ? JSON.parse(match[0]) : {}

    if (!data.isDecision) return false

    const now = new Date()
    const followUp = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const decision: Decision = {
      summary: data.summary,
      context: data.context,
      alternatives: data.alternatives,
      date: now.toISOString(),
      followUpDate: followUp.toISOString(),
    }

    await supabaseAdmin.from('ai_memories').insert({
      category: 'decision_journal',
      content: data.summary,
      context: JSON.stringify(decision),
      importance: 8,
      created_at: now.toISOString(),
    })

    // Save to vector memory for semantic search
    await saveMemory({
      category: 'decision_journal',
      content: `Decision: ${data.summary}`,
      context: data.context,
      importance: 8,
    })

    return true
  } catch { return false }
}

// Run daily — check for decisions that need follow-up
export async function runDecisionFollowUps(): Promise<void> {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const { data: decisions } = await supabaseAdmin
    .from('ai_memories')
    .select('id, content, context, created_at')
    .eq('category', 'decision_journal')
    .lte('created_at', now.toISOString())

  for (const d of decisions ?? []) {
    try {
      const decision = JSON.parse(d.context ?? '{}') as Decision
      if (decision.outcome) continue // Already followed up

      const followUpTime = new Date(decision.followUpDate).getTime()
      if (followUpTime > now.getTime()) continue // Not time yet
      if (followUpTime < new Date(yesterday).getTime() - 2 * 24 * 60 * 60 * 1000) continue // Too old

      await slack(`📓 *Decision Follow-Up — 30 days ago*

*Decision:* ${decision.summary}
*Context:* ${decision.context}
*Date:* ${new Date(decision.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}

How did this turn out, AB? Reply with the outcome and I'll log it permanently. Rate it 1-10 in hindsight.`)

    } catch { /* skip malformed */ }
  }
}

// Log outcome when AB responds to a follow-up
export async function logDecisionOutcome(decisionId: string, outcome: string, rating: number): Promise<void> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('id', decisionId)
    .single()

  if (!data) return
  const decision = JSON.parse(data.context ?? '{}') as Decision
  decision.outcome = outcome
  decision.rating = rating

  await supabaseAdmin.from('ai_memories').update({
    context: JSON.stringify(decision),
    importance: 9,
  }).eq('id', decisionId)

  await saveMemory({
    category: 'decision_wisdom',
    content: `${decision.summary} — outcome: ${outcome}`,
    context: `Decided: ${decision.summary}. Result: ${outcome}. Rating: ${rating}/10.`,
    importance: 9,
  })
}

// Get decision patterns — what kinds of decisions does AB make well vs poorly
export async function getDecisionPatterns(): Promise<string> {
  const { data: decisions } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context')
    .eq('category', 'decision_journal')
    .order('created_at', { ascending: false })
    .limit(20)

  if (!decisions?.length) return 'Not enough decisions logged yet.'

  const withOutcomes = decisions.filter(d => {
    try { return JSON.parse(d.context ?? '{}').outcome } catch { return false }
  })

  if (withOutcomes.length < 3) return `${decisions.length} decisions logged. Need at least 3 follow-ups to identify patterns.`

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Analyze these decisions and outcomes for patterns:

${withOutcomes.map(d => {
  try {
    const dec = JSON.parse(d.context ?? '{}') as Decision
    return `Decision: ${dec.summary}\nOutcome: ${dec.outcome}\nRating: ${dec.rating}/10`
  } catch { return '' }
}).filter(Boolean).join('\n\n')}

What types of decisions does this person make well? Where do they consistently struggle? Be specific and direct.`,
    }],
  })

  return msg.content[0].type === 'text' ? msg.content[0].text : 'Pattern analysis unavailable.'
}
