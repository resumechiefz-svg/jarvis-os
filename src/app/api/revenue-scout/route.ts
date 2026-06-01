import { NextResponse } from 'next/server'
import { scanForOpportunities } from '@/lib/agents/revenue-scout'
export async function GET() { await scanForOpportunities(); return NextResponse.json({ ok: true }) }
export const POST = GET
