import { NextResponse } from 'next/server'
import { runSEOTracker } from '@/lib/agents/seo-tracker'
export async function POST() { await runSEOTracker(); return NextResponse.json({ ok: true }) }
export const GET = POST
