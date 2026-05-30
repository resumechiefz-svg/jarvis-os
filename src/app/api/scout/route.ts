import { NextRequest, NextResponse } from 'next/server'
import { draftRedditReply, getGrowthBrief } from '@/lib/agents/scout'
import { notifyRedditDraft } from '@/lib/agents/slack-notify'

export async function POST(req: NextRequest) {
  try {
    const { subreddit, postTitle, postContent } = await req.json()
    if (!subreddit || !postTitle || !postContent) {
      return NextResponse.json({ error: 'subreddit, postTitle, postContent required' }, { status: 400 })
    }
    const draft = await draftRedditReply(subreddit, postTitle, postContent)
    await notifyRedditDraft(draft).catch(console.error)
    return NextResponse.json({ ok: true, draft })
  } catch (err) {
    console.error('[Scout API]', err)
    return NextResponse.json({ error: 'Scout failed' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const brief = await getGrowthBrief()
    return NextResponse.json({ ok: true, brief })
  } catch (err) {
    console.error('[Scout API]', err)
    return NextResponse.json({ error: 'Scout failed' }, { status: 500 })
  }
}
