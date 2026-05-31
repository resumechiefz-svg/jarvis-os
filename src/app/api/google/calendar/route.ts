import { NextRequest, NextResponse } from 'next/server'
import { getUpcomingEvents, getTodaysEvents, createEvent } from '@/lib/google/calendar'
import { isConnected } from '@/lib/google/auth'

export async function GET(req: NextRequest) {
  const connected = await isConnected()
  if (!connected) return NextResponse.json({ connected: false, events: [], message: 'Visit /api/google/auth to connect Google' })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'upcoming'
  const days = parseInt(searchParams.get('days') ?? '7')

  const events = type === 'today' ? await getTodaysEvents() : await getUpcomingEvents(days)
  return NextResponse.json({ connected: true, events })
}

export async function POST(req: NextRequest) {
  const connected = await isConnected()
  if (!connected) return NextResponse.json({ error: 'Google not connected' }, { status: 401 })

  const body = await req.json()
  const url = await createEvent(body)
  return NextResponse.json({ ok: true, url })
}
