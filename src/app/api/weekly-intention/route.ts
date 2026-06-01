import { NextRequest, NextResponse } from 'next/server'
import { promptWeeklyIntention, setWeeklyIntention, getWeeklyIntention } from '@/lib/agents/weekly-intention'
export async function GET() { const intention = await getWeeklyIntention(); return NextResponse.json({ intention }) }
export async function POST(req: NextRequest) {
  const { intention, prompt } = await req.json()
  if (prompt) { await promptWeeklyIntention(); return NextResponse.json({ ok: true }) }
  await setWeeklyIntention(intention)
  return NextResponse.json({ ok: true })
}
