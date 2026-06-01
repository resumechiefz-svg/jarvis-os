/**
 * Centralized Slack sender with deduplication
 * Every agent uses this — never sends the same message twice within a cooldown window
 * Prevents spam from crons running on overlapping schedules or retry loops
 */
import { supabaseAdmin } from './supabase/client'

const TOKEN = process.env.SLACK_BOT_TOKEN

// Hash a string to a short key for dedup lookup
function hashKey(text: string): string {
  let h = 0
  for (let i = 0; i < Math.min(text.length, 200); i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

// Check if this message was sent recently
async function wasSentRecently(key: string, cooldownHours: number): Promise<boolean> {
  try {
    const since = new Date(Date.now() - cooldownHours * 3600 * 1000).toISOString()
    const { data } = await supabaseAdmin
      .from('ai_memories')
      .select('id')
      .eq('category', 'slack_dedup')
      .eq('content', key)
      .gte('created_at', since)
      .limit(1)
    return (data?.length ?? 0) > 0
  } catch {
    return false // if dedup check fails, send anyway
  }
}

async function markSent(key: string): Promise<void> {
  try {
    await supabaseAdmin.from('ai_memories').insert({
      category: 'slack_dedup',
      content: key,
      context: new Date().toISOString(),
      importance: 1,
      created_at: new Date().toISOString(),
    })
  } catch { /* non-critical */ }
}

/**
 * Send a Slack message with deduplication
 * @param text     The message text
 * @param channel  Slack channel (default: #jarvis)
 * @param cooldownHours  Don't resend same message within this many hours (default: 6)
 */
export async function slack(
  text: string,
  channel = '#jarvis',
  cooldownHours = 6
): Promise<void> {
  if (!TOKEN) return

  const key = hashKey(text)

  if (await wasSentRecently(key, cooldownHours)) return // duplicate — skip

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  }).catch(() => {})

  await markSent(key)
}

/**
 * Send immediately without dedup — for user-triggered responses only
 */
export async function slackNow(text: string, channel = '#jarvis'): Promise<void> {
  if (!TOKEN) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  }).catch(() => {})
}
