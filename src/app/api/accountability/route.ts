import { NextResponse } from 'next/server'
import { runAccountabilityScore } from '@/lib/agents/accountability'
export async function POST() {
  const score = await runAccountabilityScore()
  return NextResponse.json({ ok: true, score })
}
export const GET = POST
