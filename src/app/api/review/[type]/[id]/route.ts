import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('id, content, context, created_at')
    .eq('id', id)
    .single()

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ctx = JSON.parse(data.context ?? '{}')
  return NextResponse.json({
    id: data.id,
    type,
    channel: ctx.channel ?? 'resumechiefz',
    title: data.content,
    status: ctx.status ?? 'pending',
    createdAt: data.created_at,
    // YouTube
    videoUrl: ctx.videoUrl,
    thumbnailUrl: ctx.thumbnailUrl,
    script: ctx.script,
    description: ctx.description,
    tags: ctx.tags,
    // Instagram
    slides: ctx.slides,
    // LinkedIn
    postText: ctx.postText ?? ctx.linkedin,
    // Blog
    blogUrl: ctx.blogUrl ?? ctx.pendingUrl,
    excerpt: ctx.excerpt,
    // Notes
    notes: ctx.notes,
  })
}
