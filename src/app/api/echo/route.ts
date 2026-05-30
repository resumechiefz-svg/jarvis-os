import { NextRequest, NextResponse } from 'next/server'
import { generateDailyContent, generateBlogPost } from '@/lib/agents/echo'
import { notifyEchoContent } from '@/lib/agents/slack-notify'

export async function POST(req: NextRequest) {
  try {
    const { action, keyword, day } = await req.json()

    if (action === 'blog') {
      if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 })
      const blog = await generateBlogPost(keyword)
      return NextResponse.json(blog)
    }

    // Default: generate daily social content
    const content = await generateDailyContent(day)

    // Push to Slack for AB approval
    await notifyEchoContent(content).catch(console.error)

    return NextResponse.json({ ok: true, content })
  } catch (err) {
    console.error('[Echo API]', err)
    return NextResponse.json({ error: 'Echo failed' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const content = await generateDailyContent()
    await notifyEchoContent(content).catch(console.error)
    return NextResponse.json({ ok: true, content })
  } catch (err) {
    console.error('[Echo API]', err)
    return NextResponse.json({ error: 'Echo failed' }, { status: 500 })
  }
}
