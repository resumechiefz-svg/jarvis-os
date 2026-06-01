import { NextResponse } from 'next/server'
import { analyzeSellThrough } from '@/lib/agents/card-sell-through'
export async function GET() { const r = await analyzeSellThrough(); return NextResponse.json({ report: r }) }
export const POST = GET
