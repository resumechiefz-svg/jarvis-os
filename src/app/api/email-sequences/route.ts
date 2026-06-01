import { NextRequest, NextResponse } from 'next/server'
import { runEmailSequences, enrollInSequence } from '@/lib/agents/email-sequences'
export async function GET() { await runEmailSequences(); return NextResponse.json({ ok: true }) }
export async function POST(req: NextRequest) {
  const { email, name, subscribedAt } = await req.json()
  await enrollInSequence(email, name, subscribedAt)
  return NextResponse.json({ ok: true })
}
