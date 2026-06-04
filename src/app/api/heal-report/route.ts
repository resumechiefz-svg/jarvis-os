import { NextResponse } from 'next/server'
import { runHealReport } from '@/lib/self-heal'

export async function GET() {
  await runHealReport()
  return NextResponse.json({ ok: true })
}
