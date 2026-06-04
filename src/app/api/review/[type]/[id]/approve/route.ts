import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params

  try {
    if (type === 'blog') {
      const { approveBlogDraft } = await import('@/lib/agents/autoblog')
      const result = await approveBlogDraft(id)
      return NextResponse.json(result)
    }

    if (type === 'linkedin') {
      const { data } = await supabaseAdmin.from('ai_memories').select('context').eq('id', id).single()
      const ctx = JSON.parse(data?.context ?? '{}')
      const { postToLinkedInBuffer } = await import('@/lib/agents/buffer-social')
      const result = await postToLinkedInBuffer(ctx.postText ?? ctx.linkedin ?? '')
      await supabaseAdmin.from('ai_memories').update({
        context: JSON.stringify({ ...ctx, status: 'approved' }),
      }).eq('id', id)
      return NextResponse.json({ ok: result.success, url: 'https://linkedin.com' })
    }

    if (type === 'youtube') {
      const { data } = await supabaseAdmin.from('ai_memories').select('context').eq('id', id).single()
      const ctx = JSON.parse(data?.context ?? '{}')
      // If video is already rendered, post it; otherwise trigger pipeline
      if (ctx.videoUrl) {
        const { runFullPipeline } = await import('@/lib/agents/youtube-pipeline')
        await runFullPipeline(ctx.channel ?? 'resumechiefz', ctx.title)
      }
      await supabaseAdmin.from('ai_memories').update({
        context: JSON.stringify({ ...ctx, status: 'approved' }),
      }).eq('id', id)
      const { slack } = await import('@/lib/slack')
      await slack(`✅ YouTube approved: *${ctx.title ?? 'Video'}* — uploading now`, 'echo')
      return NextResponse.json({ ok: true })
    }

    // Generic approval
    const { data } = await supabaseAdmin.from('ai_memories').select('context').eq('id', id).single()
    const ctx = JSON.parse(data?.context ?? '{}')
    await supabaseAdmin.from('ai_memories').update({
      context: JSON.stringify({ ...ctx, status: 'approved' }),
    }).eq('id', id)
    return NextResponse.json({ ok: true })

  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
