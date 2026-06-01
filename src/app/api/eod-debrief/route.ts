import { NextResponse } from 'next/server'
import { runHabitCheckin } from '@/lib/agents/habit-tracker'
import { runPendingCheckins } from '@/lib/agents/jarvis-checkins'
import { getNotificationReport } from '@/lib/agents/notification-learner'
import { supabaseAdmin } from '@/lib/supabase/client'

const TOKEN = process.env.SLACK_BOT_TOKEN

export async function GET() {
  // Run all end-of-day checks in parallel
  const [, , notifReport] = await Promise.all([
    runHabitCheckin(),
    runPendingCheckins(),
    getNotificationReport(),
  ])

  // Pull today's wins — trading P&L, eBay sales, RC signups
  const today = new Date().toISOString().split('T')[0]
  const [trades, sales] = await Promise.all([
    supabaseAdmin.from('ai_memories').select('context').eq('category', 'trade_journal').gte('created_at', today).then(r => r.data ?? []),
    supabaseAdmin.from('ai_memories').select('content').eq('category', 'ebay_sale').gte('created_at', today).then(r => r.data ?? []),
  ])

  const tradePnl = trades.reduce((sum, t) => {
    try { return sum + (JSON.parse(t.context ?? '{}').pnl ?? 0) } catch { return sum }
  }, 0)

  if (TOKEN) {
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' })
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: '#jarvis',
        text: `🌙 *End of Day — ${dayOfWeek}*

${sales.length > 0 ? `🃏 eBay: ${sales.length} sales today` : ''}
${tradePnl !== 0 ? `📈 Trading P&L: ${tradePnl >= 0 ? '+' : ''}$${tradePnl.toFixed(2)}` : ''}
${notifReport || ''}

_Habit check and open loop follow-ups sent above ↑_`,
      }),
    })
  }

  return NextResponse.json({ ok: true })
}
