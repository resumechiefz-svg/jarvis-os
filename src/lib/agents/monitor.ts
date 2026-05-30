/**
 * JARVIS Proactive Monitor — runs every 15 minutes via launchd
 * Watches all systems, fires Slack alerts when thresholds are crossed
 * AB never has to ask — Jarvis tells him first
 */

import Anthropic from '@anthropic-ai/sdk'
import { JARVIS_SYSTEM } from './prompts'
import { getNovaStats } from './nova'
import { getVaultStats } from './vault'
import { getPhantomStats } from './phantom'
import { runConversionCheck } from './conversion'
import { runSiteMonitor } from './dex'
import { supabaseAdmin } from '../supabase/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN

// ── Threshold config — tweak these as the business grows ──────────────────────
const THRESHOLDS = {
  rc: {
    mrrDropPct: 10,          // Alert if MRR drops more than 10% week-over-week
    conversionMin: 5,         // Alert if trial conversion drops below 5%
    churnMax: 3,              // Alert if more than 3 churns in 30 days
    newSubsWeekMin: 1,        // Alert if no new subs in 7 days
  },
  cc: {
    weeklyRevenueMin: 10,     // Alert if weekly CC revenue drops below $10
    salesDropPct: 40,         // Alert if weekly sales down 40%+ vs prior week
  },
  kalshi: {
    winRateMin: 50,           // Alert if win rate drops below 50%
    dailyLossMax: 100,        // Alert if P&L down more than $100 in a day
  },
  goals: {
    behindPaceDays: 14,       // Alert if goal is more than 14 days behind pace
  },
}

interface AlertPayload {
  level: 'info' | 'warn' | 'critical'
  agent: string
  title: string
  message: string
  action?: string
}

async function postSlack(channel: string, alert: AlertPayload): Promise<void> {
  if (!SLACK_BOT_TOKEN) return

  const emoji = alert.level === 'critical' ? '🔴' : alert.level === 'warn' ? '🟡' : '🔵'
  const text = `${emoji} *[${alert.agent.toUpperCase()}] ${alert.title}*\n${alert.message}${alert.action ? `\n\n_Recommended action: ${alert.action}_` : ''}`

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  })
}

// Store last-known values to detect changes
async function getLastSnapshot(key: string): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context')
    .eq('category', `monitor_snapshot_${key}`)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!data?.[0]) return {}
  try { return JSON.parse(data[0].content) } catch { return {} }
}

async function saveSnapshot(key: string, values: Record<string, number>): Promise<void> {
  await supabaseAdmin.from('ai_memories').insert({
    category: `monitor_snapshot_${key}`,
    content: JSON.stringify(values),
    context: new Date().toISOString(),
    importance: 3,
    created_at: new Date().toISOString(),
  })
}

// ── ResumeChiefz monitoring ───────────────────────────────────────────────────
async function monitorRC(): Promise<AlertPayload[]> {
  const alerts: AlertPayload[] = []

  try {
    const stats = await getNovaStats()
    const last = await getLastSnapshot('rc')

    // MRR drop
    if (last.mrr && stats.mrr < last.mrr * (1 - THRESHOLDS.rc.mrrDropPct / 100)) {
      alerts.push({
        level: 'critical',
        agent: 'nova',
        title: 'RC MRR Dropped',
        message: `MRR fell from $${last.mrr.toFixed(0)} to $${stats.mrr.toFixed(0)} — down ${((last.mrr - stats.mrr) / last.mrr * 100).toFixed(1)}%.`,
        action: 'Check Stripe for failed payments and recent cancellations.',
      })
    }

    // High churn
    if (stats.churn > THRESHOLDS.rc.churnMax) {
      alerts.push({
        level: 'warn',
        agent: 'nova',
        title: 'RC Churn Spike',
        message: `${stats.churn} cancellations in the last 30 days. That's above your 3-churn threshold.`,
        action: 'Check Stripe for cancellation reasons. Consider a win-back email.',
      })
    }

    // No new subs
    if (stats.newSubs === 0 && last.newSubs !== undefined) {
      alerts.push({
        level: 'warn',
        agent: 'nova',
        title: 'RC — No New Subscribers',
        message: `Zero new subscribers recorded. Traffic may be down or conversion is broken.`,
        action: 'Check RC site is live, Stripe checkout is working, and traffic sources.',
      })
    }

    await saveSnapshot('rc', { mrr: stats.mrr, newSubs: stats.newSubs, churn: stats.churn })
  } catch (err) {
    console.error('[Monitor RC]', err)
  }

  return alerts
}

// ── Card Chiefz monitoring ────────────────────────────────────────────────────
async function monitorCC(): Promise<AlertPayload[]> {
  const alerts: AlertPayload[] = []

  try {
    const stats = await getVaultStats()
    const last = await getLastSnapshot('cc')

    if (stats.weeklyRevenue < THRESHOLDS.cc.weeklyRevenueMin && stats.weeklyRevenue > 0) {
      alerts.push({
        level: 'warn',
        agent: 'vault',
        title: 'CC Sales Slow This Week',
        message: `Weekly Card Chiefz revenue is $${stats.weeklyRevenue.toFixed(2)} — below your $${THRESHOLDS.cc.weeklyRevenueMin} floor.`,
        action: 'Consider listing more inventory or repricing slow movers.',
      })
    }

    if (last.weeklyRevenue && stats.weeklyRevenue < last.weeklyRevenue * (1 - THRESHOLDS.cc.salesDropPct / 100)) {
      alerts.push({
        level: 'warn',
        agent: 'vault',
        title: 'CC Revenue Drop',
        message: `Weekly revenue dropped ${((last.weeklyRevenue - stats.weeklyRevenue) / last.weeklyRevenue * 100).toFixed(0)}% vs last check ($${last.weeklyRevenue.toFixed(0)} → $${stats.weeklyRevenue.toFixed(2)}).`,
        action: 'Check eBay listings for delistings or price undercuts.',
      })
    }

    await saveSnapshot('cc', { weeklyRevenue: stats.weeklyRevenue, monthlySales: stats.monthlySales })
  } catch (err) {
    console.error('[Monitor CC]', err)
  }

  return alerts
}

// ── Kalshi/Phantom monitoring ─────────────────────────────────────────────────
async function monitorKalshi(): Promise<AlertPayload[]> {
  const alerts: AlertPayload[] = []

  try {
    const stats = await getPhantomStats()
    const last = await getLastSnapshot('kalshi')

    if (stats.totalOrders > 5 && stats.winRate < THRESHOLDS.kalshi.winRateMin) {
      alerts.push({
        level: 'warn',
        agent: 'vault',
        title: 'Phantom Win Rate Below 50%',
        message: `Kalshi win rate is ${stats.winRate}% across ${stats.totalOrders} orders. Below your 50% floor.`,
        action: 'Review agent strategy settings. Consider pausing until win rate recovers.',
      })
    }

    const pnlDrop = last.pnl !== undefined ? stats.totalPnl - last.pnl : 0
    if (pnlDrop < -THRESHOLDS.kalshi.dailyLossMax) {
      alerts.push({
        level: 'critical',
        agent: 'vault',
        title: 'Phantom — Large Loss Detected',
        message: `Kalshi P&L dropped $${Math.abs(pnlDrop).toFixed(2)} since last check. Total P&L: ${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}.`,
        action: 'Review open positions. Consider activating kill switch if loss continues.',
      })
    }

    await saveSnapshot('kalshi', { pnl: stats.totalPnl, winRate: stats.winRate, orders: stats.totalOrders })
  } catch (err) {
    console.error('[Monitor Kalshi]', err)
  }

  return alerts
}

// ── Goals monitoring ──────────────────────────────────────────────────────────
async function monitorGoals(): Promise<AlertPayload[]> {
  const alerts: AlertPayload[] = []

  try {
    const { data: goals } = await supabaseAdmin
      .from('goals')
      .select('title, current, target, target_date, active')
      .eq('active', true)
      .eq('completed', false)

    for (const goal of goals ?? []) {
      if (!goal.target_date) continue
      const daysLeft = Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      const pct = goal.target > 0 ? goal.current / goal.target : 0
      const requiredPct = daysLeft > 0 ? 1 - (daysLeft / 365) : 1

      if (pct < requiredPct - 0.15 && daysLeft > 0) {
        alerts.push({
          level: 'warn',
          agent: 'beacon',
          title: `Goal Behind Pace: ${goal.title}`,
          message: `You're at ${(pct * 100).toFixed(0)}% but need ${(requiredPct * 100).toFixed(0)}% by now to hit the target date. ${daysLeft} days left.`,
          action: 'Review goal strategy with Beacon this week.',
        })
      }

      // Milestone celebrations
      const milestones = [25, 50, 75, 90]
      const last = await getLastSnapshot(`goal_${goal.title}`)
      const lastPct = last.pct ?? 0
      for (const m of milestones) {
        if (pct * 100 >= m && lastPct * 100 < m) {
          alerts.push({
            level: 'info',
            agent: 'beacon',
            title: `🎯 Milestone Hit: ${goal.title}`,
            message: `${goal.title} just crossed ${m}%. You're at ${(pct * 100).toFixed(1)}% of the target. Keep going.`,
          })
        }
      }
      await saveSnapshot(`goal_${goal.title}`, { pct })
    }
  } catch (err) {
    console.error('[Monitor Goals]', err)
  }

  return alerts
}

// ── Beckett proactive alerts ──────────────────────────────────────────────────
async function monitorBeckett(): Promise<AlertPayload[]> {
  const alerts: AlertPayload[] = []

  try {
    const now = new Date()
    const hour = now.getHours()
    const day = now.getDay() // 0=Sun, 1=Mon...

    // Wednesday 6 PM — remind about upcoming weekend plans if Beckett week
    if (day === 3 && hour === 18) {
      alerts.push({
        level: 'info',
        agent: 'sage',
        title: 'Weekend Planning Reminder',
        message: `It's Wednesday evening. If you have Beckett this weekend, now's the time to lock in plans. Charlotte has farmers markets, Discovery Place Kids, and Freedom Park on weekends.`,
        action: 'Tell Sage "Plan Beckett\'s weekend" for activity suggestions.',
      })
    }

    // Check for upcoming birthday (Beckett turns 5 June 2026)
    const beckettBirthday = new Date('2026-06-01')
    const daysUntilBirthday = Math.ceil((beckettBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const last = await getLastSnapshot('beckett_birthday')

    if ([30, 14, 7].includes(daysUntilBirthday) && last.alerted !== daysUntilBirthday) {
      alerts.push({
        level: 'info',
        agent: 'sage',
        title: `Beckett's Birthday in ${daysUntilBirthday} Days`,
        message: `Beckett turns 5 in ${daysUntilBirthday} days. ${daysUntilBirthday >= 14 ? 'Time to start planning.' : 'Crunch time — lock in the plan.'}`,
        action: 'Tell Sage "Plan Beckett\'s 5th birthday" to get ideas.',
      })
      await saveSnapshot('beckett_birthday', { alerted: daysUntilBirthday })
    }
  } catch (err) {
    console.error('[Monitor Beckett]', err)
  }

  return alerts
}

// ── Jarvis synthesis — smart summary if multiple alerts ───────────────────────
async function synthesizeAlerts(alerts: AlertPayload[]): Promise<string> {
  if (alerts.length === 0) return ''
  if (alerts.length === 1) return ''

  const prompt = `These alerts just fired across AB's systems:\n\n${
    alerts.map(a => `[${a.level.toUpperCase()}] ${a.title}: ${a.message}`).join('\n')
  }\n\nGive AB a 2-sentence synthesis of what's happening across the board and one overall priority. Be direct. No fluff.`

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    system: JARVIS_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  return res.content[0].type === 'text' ? res.content[0].text : ''
}

// ── Main monitor run ──────────────────────────────────────────────────────────
export async function runMonitor(): Promise<{ alerts: number; critical: number }> {
  console.log(`[Monitor] Running at ${new Date().toISOString()}`)

  const [rcAlerts, ccAlerts, kalshiAlerts, goalAlerts, beckettAlerts] = await Promise.all([
    monitorRC(),
    monitorCC(),
    monitorKalshi(),
    monitorGoals(),
    monitorBeckett(),
  ])

  // RC Day-3 conversion check — runs every cycle, skips if no new users
  runConversionCheck().catch(console.error)

  // DEX site monitor — checks resumechiefz.com, cardchiefz.com, Jarvis OS
  runSiteMonitor().catch(console.error)

  const allAlerts = [...rcAlerts, ...ccAlerts, ...kalshiAlerts, ...goalAlerts, ...beckettAlerts]
  const criticals = allAlerts.filter(a => a.level === 'critical')

  // Post each alert to #jarvis
  for (const alert of allAlerts) {
    await postSlack('#jarvis', alert)
  }

  // Jarvis synthesis if multiple alerts
  if (allAlerts.length > 1) {
    const synthesis = await synthesizeAlerts(allAlerts)
    if (synthesis) {
      await postSlack('#jarvis', {
        level: 'info',
        agent: 'jarvis',
        title: 'Situation Summary',
        message: synthesis,
      })
    }
  }

  // Log to memory
  if (allAlerts.length > 0) {
    await supabaseAdmin.from('ai_memories').insert({
      category: 'monitor_log',
      content: `Monitor cycle: ${allAlerts.length} alerts fired. ${criticals.length} critical.`,
      context: allAlerts.map(a => a.title).join(', '),
      importance: criticals.length > 0 ? 8 : 4,
      created_at: new Date().toISOString(),
    })
  }

  console.log(`[Monitor] Done — ${allAlerts.length} alerts, ${criticals.length} critical`)
  return { alerts: allAlerts.length, critical: criticals.length }
}
