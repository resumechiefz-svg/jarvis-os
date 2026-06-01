import { NextRequest, NextResponse } from 'next/server'
import { claimVoiceSession } from '@/lib/agents/device-coordinator'
export async function POST(req: NextRequest) {
  const { deviceId, deviceType } = await req.json()
  const result = await claimVoiceSession(deviceId, deviceType)
  return NextResponse.json(result)
}
