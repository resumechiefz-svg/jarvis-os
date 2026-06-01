import { NextRequest, NextResponse } from 'next/server'
import { logAppleHealthWorkout } from '@/lib/agents/strava'

const HEALTH_SECRET = process.env.HEALTH_WEBHOOK_SECRET ?? process.env.JARVIS_SESSION_SECRET ?? ''

export async function POST(req: NextRequest) {
  // Require secret header — set in iOS Shortcut as x-health-key
  const key = req.headers.get('x-health-key') ?? ''
  if (!key || key !== HEALTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const data = await req.json()
  await logAppleHealthWorkout(data)
  return NextResponse.json({ ok: true })
}
