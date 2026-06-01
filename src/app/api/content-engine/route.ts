import { NextRequest, NextResponse } from 'next/server'
import { runContentPipeline } from '@/lib/agents/content-engine'
export async function POST(req: NextRequest) {
  const { channel, type } = await req.json()
  await runContentPipeline(channel ?? 'resumechiefz', type ?? 'youtube')
  return NextResponse.json({ ok: true })
}
export async function GET() {
  await Promise.all([
    runContentPipeline('resumechiefz', 'youtube'),
    runContentPipeline('cardchiefz', 'youtube'),
  ])
  return NextResponse.json({ ok: true })
}
