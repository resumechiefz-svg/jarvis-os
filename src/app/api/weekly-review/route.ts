import { NextResponse } from 'next/server'
import { runWeeklyReview } from '@/lib/agents/weekly-review'
export async function POST() { await runWeeklyReview(); return NextResponse.json({ ok: true }) }
export const GET = POST
