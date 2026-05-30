import { NextResponse } from 'next/server'
import { getLedgerBrief, getFinancialSnapshot } from '@/lib/agents/ledger'

export async function GET() {
  try {
    const [brief, snapshot] = await Promise.all([
      getLedgerBrief(),
      getFinancialSnapshot(),
    ])
    return NextResponse.json({ ok: true, brief, snapshot })
  } catch (err) {
    console.error('[Ledger API]', err)
    return NextResponse.json({ error: 'Ledger failed' }, { status: 500 })
  }
}
