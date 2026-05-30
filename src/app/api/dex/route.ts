import { NextRequest, NextResponse } from 'next/server'
import { getDexStatus, analyzeBug, scanForErrors } from '@/lib/agents/dex'

export async function GET() {
  try {
    const status = await getDexStatus()
    return NextResponse.json({ ok: true, status })
  } catch (err) {
    console.error('[Dex API]', err)
    return NextResponse.json({ error: 'Dex failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, description } = await req.json()
    if (action === 'scan') {
      const reports = await scanForErrors()
      return NextResponse.json({ ok: true, reports })
    }
    if (action === 'analyze' && description) {
      const analysis = await analyzeBug(description)
      return NextResponse.json({ ok: true, analysis })
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('[Dex API]', err)
    return NextResponse.json({ error: 'Dex failed' }, { status: 500 })
  }
}
