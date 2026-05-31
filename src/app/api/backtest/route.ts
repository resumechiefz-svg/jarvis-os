import { NextRequest, NextResponse } from 'next/server'
import { runBacktest } from '@/lib/agents/backtester'
import type { BacktestConfig } from '@/lib/agents/backtester'

export async function POST(req: NextRequest) {
  const body = await req.json() as Partial<BacktestConfig>
  const {
    symbol = 'SPY',
    startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate = new Date().toISOString().split('T')[0],
    strategy = 'ema_cross',
    initialCapital = 10000,
    positionSize = 0.25,
  } = body

  try {
    const result = await runBacktest({ symbol, startDate, endDate, strategy, initialCapital, positionSize })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Backtest failed' }, { status: 400 })
  }
}
