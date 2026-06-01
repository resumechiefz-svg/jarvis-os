import { NextRequest, NextResponse } from 'next/server'
import { logAppleHealthWorkout } from '@/lib/agents/strava'
export async function POST(req: NextRequest) {
  const data = await req.json()
  await logAppleHealthWorkout(data)
  return NextResponse.json({ ok: true })
}
