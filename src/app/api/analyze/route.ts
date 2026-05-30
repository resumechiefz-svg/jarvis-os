import { NextResponse } from 'next/server'
import { runWeeklyAnalysis } from '@/lib/agents/memory-engine'

export async function GET() {
  try {
    const insights = await runWeeklyAnalysis()
    return NextResponse.json({ ok: true, insights: insights.length, data: insights })
  } catch (err) {
    console.error('[Analyze API]', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
