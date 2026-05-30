import { NextResponse } from 'next/server'
import { getWeeklyAccountability, getGoalProgress, getMilestoneAlerts } from '@/lib/agents/beacon'

export async function GET() {
  try {
    const [brief, goals] = await Promise.all([
      getWeeklyAccountability(),
      getGoalProgress(),
    ])
    await getMilestoneAlerts().catch(console.error)
    return NextResponse.json({ ok: true, brief, goals })
  } catch (err) {
    console.error('[Beacon API]', err)
    return NextResponse.json({ error: 'Beacon failed' }, { status: 500 })
  }
}
