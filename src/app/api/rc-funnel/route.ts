import { NextResponse } from 'next/server'
import { analyzeFunnel } from '@/lib/agents/rc-funnel'
export async function GET() { await analyzeFunnel(); return NextResponse.json({ ok: true }) }
export const POST = GET
