/**
 * Jarvis-Initiated Check-ins — proactively follows up on things AB mentioned
 * "I'll think about it" → Jarvis asks 3 days later
 * "I need to follow up with Marcus" → Jarvis flags it Tuesday
 * Listens for open loops and closes them
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

interface CheckIn {
  id?: string
  topic: string
  context: string
  checkInQuestion?: string
  followUpDate: string
  triggered: boolean
  source: 'conversation' | 'decision' | 'manual'
}

// Scan recent conversations for open loops to follow up on
export async function detectOpenLoops(userMessage: string, assistantReply: string): Promise<void> {
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Does this conversation contain something AB should be followed up on in 2-5 days?

Look for:
- "I'll think about it" / "let me consider"
- "I need to follow up with someone"
- A decision being deferred
- Something being tried that should be checked
- A goal being set without a deadline

User: "${userMessage}"
Jarvis: "${assistantReply}"

If yes: {"hasLoop": true, "topic": "what to follow up on", "followUpDays": 3, "checkInQuestion": "how Jarvis should ask about it"}
If no: {"hasLoop": false}`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    const data = match ? JSON.parse(match[0]) : {}
    if (!data.hasLoop) return

    const followUpDate = new Date(Date.now() + (data.followUpDays ?? 3) * 86400000).toISOString()

    await supabaseAdmin.from('ai_memories').insert({
      category: 'checkin_pending',
      content: data.topic,
      context: JSON.stringify({
        topic: data.topic,
        context: userMessage.slice(0, 200),
        checkInQuestion: data.checkInQuestion,
        followUpDate,
        triggered: false,
        source: 'conversation',
      } as CheckIn),
      importance: 7,
      created_at: new Date().toISOString(),
    })
  } catch { /* skip */ }
}

// Run daily — fire any pending check-ins
export async function runPendingCheckins(): Promise<void> {
  const now = new Date()

  const { data: pending } = await supabaseAdmin
    .from('ai_memories')
    .select('id, content, context')
    .eq('category', 'checkin_pending')

  for (const item of pending ?? []) {
    try {
      const checkin = JSON.parse(item.context ?? '{}') as CheckIn
      if (checkin.triggered) continue
      if (new Date(checkin.followUpDate) > now) continue

      await slack(`🔔 *Jarvis Check-in*\n\n${checkin.checkInQuestion ?? `AB, you mentioned "${checkin.topic}" a few days ago — where did that land?`}`)

      await supabaseAdmin.from('ai_memories').update({
        context: JSON.stringify({ ...checkin, triggered: true }),
      }).eq('id', item.id)
    } catch { /* skip */ }
  }
}
