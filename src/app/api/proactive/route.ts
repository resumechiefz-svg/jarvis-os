import { NextResponse } from 'next/server'
import { runProactiveChecks } from '@/lib/agents/proactive'
export async function POST() {
  const alerts = await runProactiveChecks()
  return NextResponse.json({ ok: true, alerts })
}
export const GET = POST
