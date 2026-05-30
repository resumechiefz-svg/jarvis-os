import { NextResponse } from 'next/server'
import { runTradeSignalScan, executeApprovedTrade } from '@/lib/agents/trade-signal'

// GET — run a scan and post proposals to Slack
export async function GET() {
  const result = await runTradeSignalScan()
  return NextResponse.json({ ok: true, ...result })
}

// POST — execute an approved trade (called by Slack bot)
export async function POST(req: Request) {
  const { proposalId } = await req.json()
  if (!proposalId) return NextResponse.json({ error: 'proposalId required' }, { status: 400 })
  const result = await executeApprovedTrade(proposalId)
  return NextResponse.json({ ok: true, result })
}
