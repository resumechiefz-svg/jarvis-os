import { NextRequest, NextResponse } from 'next/server'
import { logTrade, analyzeTradingPatterns } from '@/lib/agents/trading-journal'
export async function GET() { const p = await analyzeTradingPatterns(); return NextResponse.json({ patterns: p }) }
export async function POST(req: NextRequest) { const trade = await req.json(); await logTrade(trade); return NextResponse.json({ ok: true }) }
