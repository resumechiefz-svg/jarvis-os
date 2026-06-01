import { NextResponse } from 'next/server'
import { runNewsIntel } from '@/lib/agents/news-intel'
export async function POST() { await runNewsIntel(); return NextResponse.json({ ok: true }) }
export const GET = POST
