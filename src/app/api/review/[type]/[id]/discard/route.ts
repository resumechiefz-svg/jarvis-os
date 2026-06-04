import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { id } = await params
  await supabaseAdmin.from('ai_memories').update({
    category: 'content_discarded',
  }).eq('id', id)
  return NextResponse.json({ ok: true })
}
