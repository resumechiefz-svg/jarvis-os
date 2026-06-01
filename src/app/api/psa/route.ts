import { NextResponse } from 'next/server'
import { runPSAMonitor } from '@/lib/agents/psa-monitor'
export async function POST() { await runPSAMonitor(); return NextResponse.json({ ok: true }) }
export const GET = POST
