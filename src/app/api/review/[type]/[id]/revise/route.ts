import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'
import Anthropic from '@anthropic-ai/sdk'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params
  const { notes } = await req.json() as { notes: string }

  try {
    const { data } = await supabaseAdmin.from('ai_memories').select('content, context').eq('id', id).single()
    const ctx = JSON.parse(data?.context ?? '{}')

    let revisedCtx = { ...ctx, status: 'revised', revisionNotes: notes }

    if (type === 'blog' || type === 'linkedin' || type === 'youtube') {
      // Ask Claude to revise based on feedback
      const originalContent = ctx.script ?? ctx.postText ?? ctx.content ?? ''
      const msg = await claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Revise this ${type} content based on the feedback below.

ORIGINAL:
${originalContent.slice(0, 3000)}

FEEDBACK:
${notes}

Return only the revised content, no explanation.`,
        }],
      })
      const revised = msg.content[0].type === 'text' ? msg.content[0].text : originalContent

      if (type === 'blog') revisedCtx = { ...revisedCtx, content: revised }
      else if (type === 'linkedin') revisedCtx = { ...revisedCtx, postText: revised }
      else if (type === 'youtube') revisedCtx = { ...revisedCtx, script: revised }
    }

    // Save revised version as new draft
    const { data: newDraft } = await supabaseAdmin.from('ai_memories').insert({
      category: `${type}_draft_revised`,
      content: data?.content ?? '',
      context: JSON.stringify(revisedCtx),
      importance: 7,
      created_at: new Date().toISOString(),
    }).select('id').single()

    // Mark original as revised
    await supabaseAdmin.from('ai_memories').update({
      context: JSON.stringify({ ...ctx, status: 'superseded' }),
    }).eq('id', id)

    return NextResponse.json({ ok: true, newId: newDraft?.id })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
