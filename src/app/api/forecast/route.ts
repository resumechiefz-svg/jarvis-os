import { NextResponse } from 'next/server'
import { runRevenueForecast } from '@/lib/agents/revenue-forecast'
export async function POST() { await runRevenueForecast(); return NextResponse.json({ ok: true }) }
export const GET = POST
