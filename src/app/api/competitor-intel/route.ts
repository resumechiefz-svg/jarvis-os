import { NextResponse } from 'next/server'
import { runCompetitorIntel } from '@/lib/agents/competitor-intel'

export async function GET() {
  runCompetitorIntel().catch(console.error)
  return NextResponse.json({ ok: true, message: 'Competitor scan started — results in #jarvis' })
}
