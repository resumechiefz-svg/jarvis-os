import { NextRequest, NextResponse } from 'next/server'
import { getPortfolio, placeTrade, cancelAllOrders } from '@/lib/agents/tradepilot'

export async function GET() {
  try {
    const portfolio = await getPortfolio()
    return NextResponse.json(portfolio)
  } catch (err) {
    console.error('[Portfolio API]', err)
    return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 })
  }
}

// Place a trade — requires explicit AB direction via Jarvis
export async function POST(req: NextRequest) {
  try {
    const { order, confirm } = await req.json()

    // Safety: require explicit confirmation
    if (!confirm) {
      return NextResponse.json({
        error: 'Trade requires confirm: true — Jarvis will ask AB first',
        preview: order,
      }, { status: 400 })
    }

    if (!order?.symbol || !order?.side || !order?.type) {
      return NextResponse.json({ error: 'symbol, side, and type required' }, { status: 400 })
    }

    const result = await placeTrade(order)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Trade failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Cancel all open orders
export async function DELETE() {
  try {
    const count = await cancelAllOrders()
    return NextResponse.json({ ok: true, cancelled: count })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Cancel failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
