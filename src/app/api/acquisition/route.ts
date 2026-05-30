import { NextRequest, NextResponse } from 'next/server'
import { getAcquisitionReadiness } from '@/lib/agents/acquisition'
import { getNovaStats } from '@/lib/agents/nova'

export async function GET() {
  try {
    const stats = await getNovaStats()
    const score = await getAcquisitionReadiness(
      stats.mrr,
      stats.churn,
      stats.activeUsers,
      6, // default months running — update as RC ages
    )
    return NextResponse.json({ ok: true, score, stats })
  } catch (err) {
    console.error('[Acquisition API]', err)
    return NextResponse.json({ error: 'Acquisition analysis failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { mrr, churn, activeUsers, monthsRunning } = await req.json()
  const score = await getAcquisitionReadiness(mrr ?? 0, churn ?? 0, activeUsers ?? 0, monthsRunning ?? 6)
  return NextResponse.json({ ok: true, score })
}
