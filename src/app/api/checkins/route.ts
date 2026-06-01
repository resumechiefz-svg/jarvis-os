import { NextResponse } from 'next/server'
import { runPendingCheckins } from '@/lib/agents/jarvis-checkins'

export async function GET() {
  await runPendingCheckins()
  return NextResponse.json({ ok: true })
}
