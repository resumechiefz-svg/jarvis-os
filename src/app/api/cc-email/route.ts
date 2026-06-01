import { NextRequest, NextResponse } from 'next/server'
import { subscribeToCCList, sendWeeklyMarketUpdate, getSubscriberCount } from '@/lib/agents/cc-email'

export async function GET() {
  await sendWeeklyMarketUpdate()
  return NextResponse.json({ ok: true, subscribers: await getSubscriberCount() })
}

export async function POST(req: NextRequest) {
  const { email, name, source } = await req.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  await subscribeToCCList(email, name, source)
  return NextResponse.json({ ok: true })
}
