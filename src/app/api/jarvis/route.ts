import { NextRequest, NextResponse } from 'next/server'
import { chat, morningBrief } from '@/lib/agents/jarvis'

export async function POST(req: NextRequest) {
  try {
    const { message, history, mode } = await req.json()

    if (mode === 'morning_brief') {
      const result = await morningBrief()
      return NextResponse.json(result)
    }

    if (!message) return NextResponse.json({ error: 'No message' }, { status: 400 })

    const result = await chat(message, history ?? [])
    return NextResponse.json(result)
  } catch (err) {
    console.error('[Jarvis API]', err)
    return NextResponse.json({ error: 'Jarvis failed' }, { status: 500 })
  }
}
