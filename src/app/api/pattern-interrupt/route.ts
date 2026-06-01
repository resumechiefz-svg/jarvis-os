import { NextResponse } from 'next/server'
import { detectPatterns } from '@/lib/agents/pattern-interrupt'
export async function GET() { await detectPatterns(); return NextResponse.json({ ok: true }) }
export const POST = GET
