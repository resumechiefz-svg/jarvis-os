import { NextRequest, NextResponse } from 'next/server'
import { heartbeat } from '@/lib/agents/device-coordinator'
export async function POST(req: NextRequest) {
  const { deviceId } = await req.json()
  const active = await heartbeat(deviceId)
  return NextResponse.json({ active })
}
