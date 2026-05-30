import { NextResponse } from 'next/server'
import { runMonitor } from '@/lib/agents/monitor'

export async function GET() {
  try {
    const result = await runMonitor()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[Monitor API]', err)
    return NextResponse.json({ error: 'Monitor failed' }, { status: 500 })
  }
}
