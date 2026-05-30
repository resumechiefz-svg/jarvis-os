import { NextRequest, NextResponse } from 'next/server'
import { runConversionCheck, sendApprovedEmail } from '@/lib/agents/conversion'

export async function GET() {
  try {
    const result = await runConversionCheck()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[Conversion API]', err)
    return NextResponse.json({ error: 'Conversion check failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  const sent = await sendApprovedEmail(email)
  return NextResponse.json({ ok: sent })
}
