import { NextResponse } from 'next/server'
import { runDecisionFollowUps, getDecisionPatterns } from '@/lib/agents/decision-journal'
export async function GET() { const patterns = await getDecisionPatterns(); return NextResponse.json({ patterns }) }
export async function POST() { await runDecisionFollowUps(); return NextResponse.json({ ok: true }) }
