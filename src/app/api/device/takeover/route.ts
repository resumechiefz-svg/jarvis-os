import { NextRequest, NextResponse } from 'next/server'
import { takeOverSession } from '@/lib/agents/device-coordinator'
export async function POST(req: NextRequest) {
  const { deviceId, deviceType } = await req.json()
  await takeOverSession(deviceId, deviceType)
  return NextResponse.json({ ok: true })
}
