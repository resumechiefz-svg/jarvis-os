import { NextRequest, NextResponse } from 'next/server'
import { logHealth, getHealthSummary } from '@/lib/agents/health'

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '7')
  const summary = await getHealthSummary(days)
  return NextResponse.json({ ok: true, summary })
}

export async function POST(req: NextRequest) {
  const data = await req.json()
  await logHealth(data)
  const summary = await getHealthSummary(7)
  return NextResponse.json({ ok: true, summary })
}
