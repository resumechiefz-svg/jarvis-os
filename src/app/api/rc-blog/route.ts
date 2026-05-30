import { NextResponse } from 'next/server'
import { generateAndPublishRCPost, getRCBlogPosts } from '@/lib/agents/rc-blog'

export async function GET() {
  try {
    const post = await generateAndPublishRCPost()
    return NextResponse.json({ ok: true, title: post.title, slug: post.slug })
  } catch (err) {
    console.error('[RC Blog API]', err)
    return NextResponse.json({ error: 'RC blog generation failed' }, { status: 500 })
  }
}

export async function POST() {
  const posts = await getRCBlogPosts(20)
  return NextResponse.json(posts)
}
