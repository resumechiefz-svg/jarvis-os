import { NextResponse } from 'next/server'
import { getSageBrief } from '@/lib/agents/sage'

export async function GET() {
  try {
    const brief = await getSageBrief()
    return NextResponse.json(brief)
  } catch (err) {
    console.error('[Sage API]', err)
    return NextResponse.json({ error: 'Sage failed' }, { status: 500 })
  }
}
