import { NextRequest, NextResponse } from 'next/server'
import { getStrategicBrief, getBusinessIdeas, getMarketIntel } from '@/lib/agents/atlas'

export async function GET() {
  try {
    const brief = await getStrategicBrief(0, 0)
    return NextResponse.json({ ok: true, brief })
  } catch (err) {
    console.error('[Atlas API]', err)
    return NextResponse.json({ error: 'Atlas failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, topic, rcMrr, ccRevenue } = await req.json()
    if (action === 'strategic') {
      const brief = await getStrategicBrief(rcMrr ?? 0, ccRevenue ?? 0)
      return NextResponse.json({ ok: true, brief })
    }
    if (action === 'ideas') {
      const ideas = await getBusinessIdeas()
      return NextResponse.json({ ok: true, ideas })
    }
    if (action === 'intel' && topic) {
      const intel = await getMarketIntel(topic)
      return NextResponse.json({ ok: true, intel })
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('[Atlas API]', err)
    return NextResponse.json({ error: 'Atlas failed' }, { status: 500 })
  }
}
