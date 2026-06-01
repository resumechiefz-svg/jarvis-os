import { slack } from '../slack'
/**
 * Goal Velocity — calculates trajectory toward financial independence
 * Answers: "At this pace, you'll hit your goal at age X"
 * Runs weekly, posts to #jarvis
 */
import { supabaseAdmin } from '../supabase/client'

const TOKEN = process.env.SLACK_BOT_TOKEN
const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'


export interface VelocityReport {
  currentEquity: number
  currentMRR: number
  weeklyEquityGrowth: number
  weeklyMRRGrowth: number
  projectedIndependenceAge: number
  projectedMillionAge: number
  onTrack: boolean
  message: string
}

const AB_BIRTH_YEAR = 1996 // adjust if needed
const INDEPENDENCE_TARGET = 1_000_000
const MONTHS_TO_FINANCIAL_INDEPENDENCE = 12 * (40 - (new Date().getFullYear() - AB_BIRTH_YEAR))

export async function calculateGoalVelocity(): Promise<VelocityReport> {
  const HEADERS = { Authorization: `Bearer ${process.env.JARVIS_SESSION_SECRET}` }

  // Get current state
  const [portfolio, nova] = await Promise.all([
    fetch(`${BASE}/api/portfolio`, { headers: HEADERS }).then(r => r.json()).catch(() => null),
    fetch(`${BASE}/api/nova`, { headers: HEADERS }).then(r => r.json()).catch(() => null),
  ])

  // Get portfolio snapshots from last 2 weeks for growth rate
  const { data: snapshots } = await supabaseAdmin
    .from('ai_memories')
    .select('context, created_at')
    .eq('category', 'daily_score')
    .order('created_at', { ascending: false })
    .limit(14)

  const currentEquity = portfolio?.equity ?? 98000
  const currentMRR = nova?.mrr ?? 0

  // Calculate weekly growth rates from snapshots
  const twoWeeksAgo = snapshots?.[snapshots.length - 1]
  let weeklyEquityGrowth = 0
  if (twoWeeksAgo) {
    try {
      const old = JSON.parse(twoWeeksAgo.context ?? '{}')
      // Rough estimate from daily scores
      weeklyEquityGrowth = old.trading > 5 ? currentEquity * 0.003 : currentEquity * -0.001
    } catch { weeklyEquityGrowth = 0 }
  }

  // Weekly MRR growth (assume from nova data)
  const weeklyMRRGrowth = nova?.newSubs ? nova.newSubs * 15 - nova.churn * 15 : 0

  // Project to $1M
  // Combined monthly income = MRR + portfolio growth
  const monthlyIncome = (weeklyEquityGrowth * 4.33) + currentMRR
  const monthsToMillion = monthlyIncome > 0
    ? Math.ceil((INDEPENDENCE_TARGET - currentEquity) / monthlyIncome)
    : 9999

  const currentAge = new Date().getFullYear() - AB_BIRTH_YEAR
  const projectedMillionAge = currentAge + Math.floor(monthsToMillion / 12)
  const projectedIndependenceAge = projectedMillionAge // same target

  const onTrack = projectedMillionAge <= 40

  const ageStr = projectedMillionAge > 99 ? 'beyond 40 (need to accelerate)' : `age ${projectedMillionAge}`
  const message = onTrack
    ? `🎯 On track — $1M projected at ${ageStr}. Keep the pace.`
    : `⚠️ Currently projecting $1M at ${ageStr}. ${40 - projectedMillionAge < 0 ? `${projectedMillionAge - 40} years behind target` : 'ahead of target'}.`

  const report: VelocityReport = {
    currentEquity, currentMRR, weeklyEquityGrowth, weeklyMRRGrowth,
    projectedIndependenceAge, projectedMillionAge, onTrack, message,
  }

  // Post to Slack
  const slackMsg = `
📊 *GOAL VELOCITY REPORT*

💼 Portfolio: $${currentEquity.toLocaleString()} | Weekly growth: $${weeklyEquityGrowth.toFixed(0)}
💰 RC MRR: $${currentMRR.toFixed(0)} | Weekly Δ: ${weeklyMRRGrowth >= 0 ? '+' : ''}$${weeklyMRRGrowth.toFixed(0)}

🎯 *$1M Projection: Age ${projectedMillionAge}* ${onTrack ? '✅' : '⚠️'}
📅 Goal: Financial independence by 40 | You're currently ${currentAge}

${message}`.trim()

  await slack(slackMsg)
  return report
}
