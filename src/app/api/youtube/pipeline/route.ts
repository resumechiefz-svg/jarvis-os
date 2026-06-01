import { NextRequest, NextResponse } from 'next/server'
import { runFullPipeline } from '@/lib/agents/youtube-pipeline'
export async function POST(req: NextRequest) {
  const { channel, topic, theme } = await req.json()
  // Run async — don't wait, pipeline posts to Slack when done
  runFullPipeline(channel ?? 'resumechiefz', topic, theme).catch(console.error)
  return NextResponse.json({ ok: true, message: 'Pipeline started — updates in #jarvis' })
}
export const GET = async () => {
  runFullPipeline('cardchiefz', undefined, 'lego').catch(console.error)
  return NextResponse.json({ ok: true })
}
