import { NextResponse } from 'next/server'
import { getPhantomStats } from '@/lib/agents/phantom'

export async function GET() {
  try {
    const stats = await getPhantomStats()
    return NextResponse.json(stats)
  } catch (err) {
    console.error('[Kalshi API]', err)
    return NextResponse.json({
      balance: 0, totalPnl: 0, winRate: 0, wins: 0, losses: 0,
      openPositions: [], totalOrders: 0, invested: 0,
      mode: 'paper', isRunning: false, lastUpdated: new Date().toISOString(),
    })
  }
}
