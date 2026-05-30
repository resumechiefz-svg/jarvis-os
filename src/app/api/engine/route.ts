import { NextResponse } from 'next/server'
import { runAutonomousEngine, getTradingSummary } from '@/lib/trading/execution-engine'

// GET: run one engine cycle manually
export async function GET() {
  const result = await runAutonomousEngine()
  return NextResponse.json(result)
}

// POST: get today's trading summary for Jarvis
export async function POST() {
  const summary = await getTradingSummary()
  return NextResponse.json({ summary })
}
