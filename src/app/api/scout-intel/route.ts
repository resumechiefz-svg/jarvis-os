import { NextResponse } from 'next/server'
import { runAllLeadIntel } from '@/lib/agents/scout-intel'

export async function GET() {
  try {
    await runAllLeadIntel()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
