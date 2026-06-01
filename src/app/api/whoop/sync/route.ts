import { NextResponse } from 'next/server'
import { syncWhoopData } from '@/lib/agents/whoop'
export async function POST() { const data = await syncWhoopData(); return NextResponse.json({ ok: true, data }) }
export const GET = POST
