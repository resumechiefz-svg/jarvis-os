import { NextRequest, NextResponse } from 'next/server'
import { releaseVoiceSession } from '@/lib/agents/device-coordinator'
export async function POST(req: NextRequest) {
  const { deviceId } = await req.json()
  await releaseVoiceSession(deviceId)
  return NextResponse.json({ ok: true })
}
