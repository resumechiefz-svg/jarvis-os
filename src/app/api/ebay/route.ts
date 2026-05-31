import { NextResponse } from 'next/server'
import { checkEbaySales } from '@/lib/agents/ebay-monitor'
export async function POST() {
  const count = await checkEbaySales()
  return NextResponse.json({ ok: true, newSales: count })
}
export const GET = POST
