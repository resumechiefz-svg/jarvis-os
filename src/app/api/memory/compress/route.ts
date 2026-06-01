import { NextResponse } from 'next/server'
import { runMemoryCompression } from '@/lib/agents/memory-compress'
export async function POST() { const result = await runMemoryCompression(); return NextResponse.json({ ok: true, ...result }) }
export const GET = POST
