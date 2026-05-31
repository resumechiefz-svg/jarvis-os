import { NextRequest, NextResponse } from 'next/server'
import { runAutoBlog } from '@/lib/agents/autoblog'
export async function POST(req: NextRequest) {
  const { brand } = await req.json().catch(() => ({}))
  const result = await runAutoBlog(brand ?? 'rc')
  return NextResponse.json({ ok: true, ...result })
}
export async function GET() {
  const result = await runAutoBlog('rc')
  return NextResponse.json({ ok: true, ...result })
}
