import { NextRequest, NextResponse } from 'next/server'
import { runForgeScsan, executeFix, getChangeLog } from '@/lib/agents/forge'
import { supabaseAdmin } from '@/lib/supabase/client'

// GET — returns build monitor state (what ForgeBuildMonitor polls)
export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('ai_memories')
      .select('content, context, created_at')
      .eq('category', 'forge_deployed')
      .order('created_at', { ascending: false })
      .limit(5)

    const recent = (data ?? []).map(d => {
      try {
        const c = JSON.parse(d.context)
        return { idea: c.title, status: 'live', title: c.title, startedAt: c.deployedAt ?? d.created_at }
      } catch { return { idea: d.content, status: 'live', startedAt: d.created_at } }
    })

    return NextResponse.json({ active: null, recent })
  } catch {
    return NextResponse.json({ active: null, recent: [] })
  }
}

// POST — run scan, deploy a proposal, or get change log
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { action, proposalId, days } = body

  if (action === 'scan' || !action) {
    runForgeScsan().catch(console.error)
    return NextResponse.json({ ok: true, message: 'FORGE scan started — proposals in #jarvis' })
  }

  if (action === 'deploy' && proposalId) {
    const result = await executeFix(proposalId)
    return NextResponse.json(result)
  }

  if (action === 'changelog') {
    const log = await getChangeLog(days ?? 7)
    return NextResponse.json({ log })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
