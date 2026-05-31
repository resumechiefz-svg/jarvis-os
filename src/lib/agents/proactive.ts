/**
 * Proactive Jarvis — monitors triggers and alerts AB without being asked
 * Runs every 15 minutes via cron
 * Checks: portfolio, RC metrics, card sales, training, market events
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function slack(msg: string) {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: msg }) })
}

async function checkPortfolio(): Promise<string | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'}/api/portfolio`, {
      headers: { Authorization: `Bearer ${process.env.JARVIS_SESSION_SECRET}` }
    })
    const d = await res.json()
    if (!d?.dayPLPct) return null
    if (d.dayPLPct <= -2) return `🔴 *Portfolio Alert*: Down ${d.dayPLPct.toFixed(2)}% today ($${Math.abs(d.dayPL).toFixed(0)}). Equity: $${d.equity.toLocaleString()}. Review positions.`
    if (d.dayPLPct >= 3) return `🟢 *Portfolio Win*: Up ${d.dayPLPct.toFixed(2)}% today (+$${d.dayPL.toFixed(0)}). Equity: $${d.equity.toLocaleString()}.`
    return null
  } catch { return null }
}

async function checkRCMetrics(): Promise<string | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'}/api/nova`, {
      headers: { Authorization: `Bearer ${process.env.JARVIS_SESSION_SECRET}` }
    })
    const d = await res.json()
    if (!d?.mrr) return null

    // Check for churn spike
    if (d.churn > 5) return `⚠️ *RC Churn Alert*: ${d.churn} cancellations in the last 30 days. Review retention.`
    // Check for new subs milestone
    if (d.newSubs > 0 && d.newSubs % 10 === 0) return `🎉 *RC Milestone*: ${d.newSubs} new subscribers this month! MRR: $${d.mrr.toFixed(0)}`
    return null
  } catch { return null }
}

async function checkEbaySales(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('ai_memories')
      .select('context, created_at')
      .eq('category', 'ebay_sale')
      .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5)
    if (!data?.length) return null
    const total = data.reduce((s, d) => s + (JSON.parse(d.context ?? '{}').amount ?? 0), 0)
    return `💳 *${data.length} eBay Sale${data.length > 1 ? 's' : ''} (last 15 min)*: $${total.toFixed(2)} total`
  } catch { return null }
}

async function checkTraining(): Promise<string | null> {
  const hour = new Date().getHours()
  const day = new Date().getDay()
  // Remind at 6am on training days if no log today
  if (hour !== 6) return null
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('created_at')
    .eq('category', 'training_log')
    .gte('created_at', new Date().toISOString().split('T')[0])
    .limit(1)
  if (data?.length) return null
  return `🏃 *Training Reminder*: No workout logged yet today. Whitewater 50 is ${Math.ceil((new Date('2026-10-17').getTime() - Date.now()) / 86400000)} days away.`
}

async function shouldAlert(key: string): Promise<boolean> {
  // Prevent duplicate alerts within 2 hours
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('created_at')
    .eq('category', 'proactive_alert')
    .eq('content', key)
    .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .limit(1)
  return !data?.length
}

export async function runProactiveChecks(): Promise<string[]> {
  const alerts: string[] = []
  const checks = [
    { key: 'portfolio', fn: checkPortfolio },
    { key: 'rc_metrics', fn: checkRCMetrics },
    { key: 'ebay_sales', fn: checkEbaySales },
    { key: 'training', fn: checkTraining },
  ]

  for (const { key, fn } of checks) {
    const msg = await fn()
    if (msg && await shouldAlert(key)) {
      alerts.push(msg)
      await slack(msg)
      await supabaseAdmin.from('ai_memories').insert({
        category: 'proactive_alert', content: key,
        context: msg, importance: 7, created_at: new Date().toISOString(),
      })
    }
  }
  return alerts
}
