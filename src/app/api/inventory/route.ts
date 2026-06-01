import { NextRequest, NextResponse } from 'next/server'
import { getInventorySummary, upsertCard } from '@/lib/agents/card-inventory'
export async function GET() { return NextResponse.json(await getInventorySummary()) }
export async function POST(req: NextRequest) { const card = await req.json(); await upsertCard(card); return NextResponse.json({ ok: true }) }
