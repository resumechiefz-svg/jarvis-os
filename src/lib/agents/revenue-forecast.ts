import { slack } from '../slack'
/**
 * Revenue Forecasting — Nova projects MRR based on growth + churn trends
 */
import { supabaseAdmin } from '../supabase/client'

const TOKEN = process.env.SLACK_BOT_TOKEN
const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'


export async function runRevenueForecast(): Promise<void> {
  const HEADERS = { Authorization: `Bearer ${process.env.JARVIS_SESSION_SECRET}` }
  const nova = await fetch(`${BASE}/api/nova`, { headers: HEADERS }).then(r => r.json()).catch(() => null)
  if (!nova?.mrr) return

  const currentMRR = nova.mrr
  const newSubs = nova.newSubs ?? 0
  const churn = nova.churn ?? 0
  const netGrowth = newSubs - churn
  const avgSubValue = currentMRR / Math.max(nova.activeUsers ?? 1, 1)

  // Historical MRR from past reports
  const { data: history } = await supabaseAdmin
    .from('ai_memories')
    .select('context, created_at')
    .eq('category', 'revenue_snapshot')
    .order('created_at', { ascending: false })
    .limit(8)

  // Calculate monthly growth rate
  let monthlyGrowthRate = 0.05 // default 5%
  if (history && history.length >= 2) {
    try {
      const oldest = JSON.parse(history[history.length - 1].context ?? '{}').mrr ?? currentMRR
      const months = history.length
      monthlyGrowthRate = Math.pow(currentMRR / oldest, 1 / months) - 1
    } catch { /* use default */ }
  }

  // Project 3 and 6 months
  const m3 = currentMRR * Math.pow(1 + monthlyGrowthRate, 3)
  const m6 = currentMRR * Math.pow(1 + monthlyGrowthRate, 6)
  const m12 = currentMRR * Math.pow(1 + monthlyGrowthRate, 12)

  const trend = monthlyGrowthRate >= 0.1 ? '🚀 Accelerating' : monthlyGrowthRate >= 0.03 ? '📈 Growing' : monthlyGrowthRate >= 0 ? '📊 Flat' : '📉 Declining'

  const report = `
💰 *RC REVENUE FORECAST*

*Current:* $${currentMRR.toFixed(0)} MRR | Net growth: ${netGrowth >= 0 ? '+' : ''}${netGrowth} subs/month
*Trend:* ${trend} (${(monthlyGrowthRate * 100).toFixed(1)}%/mo)

*3 months:* $${m3.toFixed(0)} MRR
*6 months:* $${m6.toFixed(0)} MRR
*12 months:* $${m12.toFixed(0)} MRR

${m12 >= 10000 ? '✅ On track for $10k MRR in 12 months' : `⚠️ Need ${((10000 / currentMRR - 1) * 100 / 12).toFixed(1)}%/mo growth for $10k MRR in 12 months`}`.trim()

  await slack(report)

  // Save snapshot for future trend calculations
  await supabaseAdmin.from('ai_memories').insert({
    category: 'revenue_snapshot',
    content: new Date().toISOString().split('T')[0],
    context: JSON.stringify({ mrr: currentMRR, newSubs, churn, monthlyGrowthRate }),
    importance: 7,
    created_at: new Date().toISOString(),
  })
}
