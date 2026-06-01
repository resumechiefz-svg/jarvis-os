import { NextResponse } from 'next/server'
import { runForgeScsan } from '@/lib/agents/forge'
export async function GET() {
  runForgeScsan().catch(console.error)
  return NextResponse.json({ ok: true })
}
