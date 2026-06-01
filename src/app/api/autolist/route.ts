import { NextResponse } from 'next/server'
import { runAutoRelist } from '@/lib/agents/ebay-autolist'
export async function POST() { await runAutoRelist(); return NextResponse.json({ ok: true }) }
export const GET = POST
