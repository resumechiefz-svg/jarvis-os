import { NextResponse } from 'next/server'
const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'
const HEADERS = { Authorization: `Bearer ${process.env.JARVIS_SESSION_SECRET ?? ''}` }
const AB_BIRTH_YEAR = 1996
const TARGET = 1_000_000

export async function GET() {
  const [portfolio, nova] = await Promise.all([
    fetch(`${BASE}/api/portfolio`, { headers: HEADERS }).then(r => r.json()).catch(() => null),
    fetch(`${BASE}/api/nova`, { headers: HEADERS }).then(r => r.json()).catch(() => null),
  ])

  const currentEquity = portfolio?.equity ?? 98000
  const currentMRR = nova?.mrr ?? 0
  const monthlyContribution = 75 * 2 // biweekly deposits
  const monthlyGrowthRate = 0.02 // 2% monthly estimate
  const currentAge = new Date().getFullYear() - AB_BIRTH_YEAR

  // Build 36-month trajectory
  const trajectoryPoints = []
  let value = currentEquity
  for (let i = 0; i <= 36; i++) {
    trajectoryPoints.push({ month: i, value: Math.round(value) })
    value = value * (1 + monthlyGrowthRate) + monthlyContribution + (currentMRR * 0.3)
  }

  const monthsToTarget = Math.ceil(Math.log(TARGET / currentEquity) / Math.log(1 + monthlyGrowthRate))
  const projectedAge = currentAge + Math.floor(monthsToTarget / 12)
  const onTrack = projectedAge <= 40

  return NextResponse.json({
    currentEquity, currentMRR, targetEquity: TARGET,
    projectedAge, currentAge, monthlyContribution, monthlyGrowthRate,
    confidencePercent: onTrack ? 85 : 60,
    trajectoryPoints, yearsToGo: projectedAge - currentAge, onTrack,
  })
}
