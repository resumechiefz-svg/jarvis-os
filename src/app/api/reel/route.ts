import { NextRequest, NextResponse } from 'next/server'
import { generateCCDailyContent } from '@/lib/agents/reel'
import { notifyReelContent } from '@/lib/agents/slack-notify'

export async function GET() {
  try {
    const content = await generateCCDailyContent()
    await notifyReelContent(content).catch(console.error)
    return NextResponse.json({ ok: true, content })
  } catch (err) {
    console.error('[Reel API]', err)
    return NextResponse.json({ error: 'Reel failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { day } = await req.json()
    const content = await generateCCDailyContent(day)
    await notifyReelContent(content).catch(console.error)
    return NextResponse.json({ ok: true, content })
  } catch (err) {
    console.error('[Reel API]', err)
    return NextResponse.json({ error: 'Reel failed' }, { status: 500 })
  }
}
