import { NextRequest, NextResponse } from 'next/server'
import { runForgeScsan, executeFix, getChangeLog } from '@/lib/agents/forge'

// GET — run weekly scan (also triggered by cron)
export async function GET() {
  runForgeScsan().catch(console.error)
  return NextResponse.json({ ok: true, message: 'FORGE scan started — proposals in #jarvis' })
}

// POST — approve and deploy a proposal, or get change log
export async function POST(req: NextRequest) {
  const { action, proposalId, days } = await req.json()

  if (action === 'deploy' && proposalId) {
    const result = await executeFix(proposalId)
    return NextResponse.json(result)
  }

  if (action === 'changelog') {
    const log = await getChangeLog(days ?? 7)
    return NextResponse.json({ log })
  }

  return NextResponse.json({ error: 'action required: deploy | changelog' }, { status: 400 })
}
