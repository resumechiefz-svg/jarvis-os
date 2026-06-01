/**
 * Weekly Intention — Sunday evening prompt + carries through the week
 * One question: what's the one thing that makes everything else easier?
 * AB's answer gets injected into every Jarvis context that week
 */
import { supabaseAdmin } from '../supabase/client'

const TOKEN = process.env.SLACK_BOT_TOKEN

async function slack(text: string, channel = '#jarvis') {
  if (!TOKEN) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  })
}

export async function promptWeeklyIntention(): Promise<void> {
  const weekStart = getWeekStart()
  await slack(`🎯 *Weekly Intention — ${weekStart}*

AB, one question before the week starts:

*What's the one thing that, if you got it done this week, would make everything else easier or less important?*

Reply here and I'll carry it into every conversation we have this week.`)
}

export async function setWeeklyIntention(intention: string): Promise<void> {
  const weekKey = getWeekKey()
  await supabaseAdmin.from('ai_memories').upsert({
    category: 'weekly_intention',
    content: weekKey,
    context: JSON.stringify({
      intention,
      weekKey,
      setAt: new Date().toISOString(),
    }),
    importance: 9,
    created_at: new Date().toISOString(),
  })

  await slack(`✅ Locked in for the week:\n\n*"${intention}"*\n\nI'll keep this front and center, AB.`)
}

export async function getWeeklyIntention(): Promise<string | null> {
  const weekKey = getWeekKey()
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'weekly_intention')
    .eq('content', weekKey)
    .single()

  if (!data?.context) return null
  try {
    return JSON.parse(data.context).intention ?? null
  } catch { return null }
}

// Get context string to inject into Jarvis responses
export async function getIntentionContext(): Promise<string> {
  const intention = await getWeeklyIntention()
  if (!intention) return ''
  return `[THIS WEEK'S INTENTION: "${intention}" — keep this visible in your responses when relevant]`
}

function getWeekKey(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.setDate(diff))
  return monday.toISOString().split('T')[0]
}

function getWeekStart(): string {
  const weekKey = getWeekKey()
  return new Date(weekKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
