import { NextResponse } from 'next/server'
import { runMarketIntel } from '@/lib/agents/market-intel'

export async function POST() {
  const result = await runMarketIntel()
  return NextResponse.json({ ok: true, ...result })
}

export async function GET() {
  // Return last report from Supabase
  const { supabaseAdmin } = await import('@/lib/supabase/client')
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context, created_at')
    .eq('category', 'market_intel_report')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return NextResponse.json(data ?? { content: 'No report yet', context: '' })
}
