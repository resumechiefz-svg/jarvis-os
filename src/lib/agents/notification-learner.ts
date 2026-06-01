/**
 * Smart Notification Learning — tracks which Slack alerts AB actually responds to
 * Stops sending things he ignores, amplifies what he acts on
 * Over time: fewer alerts, all of them worth reading
 */
import { supabaseAdmin } from '../supabase/client'

export type AlertCategory =
  | 'portfolio_drop' | 'portfolio_gain' | 'ebay_sale' | 'rc_signup'
  | 'churn_risk' | 'training_reminder' | 'psa_pop' | 'market_intel'
  | 'revenue_opportunity' | 'pattern_interrupt' | 'checkin' | 'habit'

interface AlertRecord {
  category: AlertCategory
  sentAt: string
  responded: boolean
  respondedAt?: string
  action?: string  // what AB did after seeing it
}

// Log that an alert was sent
export async function logAlertSent(category: AlertCategory, content: string): Promise<string> {
  const id = `alert_${Date.now()}`
  await supabaseAdmin.from('ai_memories').insert({
    category: 'alert_log',
    content: id,
    context: JSON.stringify({ category, content: content.slice(0, 200), sentAt: new Date().toISOString(), responded: false }),
    importance: 4,
    created_at: new Date().toISOString(),
  })
  return id
}

// Log that AB responded (called when they reply to Slack or take action)
export async function logAlertResponse(alertId: string, action?: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'alert_log')
    .eq('content', alertId)
    .single()

  if (!data) return
  const record = JSON.parse(data.context ?? '{}') as AlertRecord
  await supabaseAdmin.from('ai_memories').update({
    context: JSON.stringify({ ...record, responded: true, respondedAt: new Date().toISOString(), action }),
  }).eq('content', alertId)
}

// Get response rates by category — what's worth sending?
export async function getAlertEffectiveness(): Promise<Record<AlertCategory, { sent: number; responded: number; rate: number }>> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'alert_log')
    .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())

  const stats: Record<string, { sent: number; responded: number }> = {}

  for (const item of data ?? []) {
    try {
      const record = JSON.parse(item.context ?? '{}') as AlertRecord
      if (!stats[record.category]) stats[record.category] = { sent: 0, responded: 0 }
      stats[record.category].sent++
      if (record.responded) stats[record.category].responded++
    } catch { /* skip */ }
  }

  return Object.fromEntries(
    Object.entries(stats).map(([cat, s]) => [
      cat,
      { ...s, rate: s.sent > 0 ? Math.round((s.responded / s.sent) * 100) : 0 },
    ])
  ) as Record<AlertCategory, { sent: number; responded: number; rate: number }>
}

// Should this category alert be sent? Returns false if response rate < 10% over 20+ sends
export async function shouldSendAlert(category: AlertCategory): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'alert_log')
    .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  const categoryAlerts = (data ?? []).filter(d => {
    try { return JSON.parse(d.context ?? '{}').category === category } catch { return false }
  })

  // Not enough data to suppress — send it
  if (categoryAlerts.length < 15) return true

  const responded = categoryAlerts.filter(d => {
    try { return JSON.parse(d.context ?? '{}').responded } catch { return false }
  }).length

  const rate = responded / categoryAlerts.length
  return rate >= 0.10 // Suppress if less than 10% response rate
}

// Weekly report — what's working, what to cut
export async function getNotificationReport(): Promise<string> {
  const stats = await getAlertEffectiveness()
  const sorted = Object.entries(stats).sort(([,a], [,b]) => b.rate - a.rate)

  const high = sorted.filter(([,s]) => s.rate >= 50).map(([c,s]) => `${c}: ${s.rate}% (${s.sent} sent)`)
  const low = sorted.filter(([,s]) => s.rate < 15 && s.sent >= 10).map(([c,s]) => `${c}: ${s.rate}% (${s.sent} sent)`)

  return [
    high.length ? `*High engagement:* ${high.join(', ')}` : '',
    low.length ? `*Consider cutting:* ${low.join(', ')}` : '',
  ].filter(Boolean).join('\n')
}
