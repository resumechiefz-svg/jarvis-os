import { NextResponse } from 'next/server'
import { getNovaStats } from '@/lib/agents/nova'

export async function GET() {
  try {
    const stats = await getNovaStats()
    return NextResponse.json(stats)
  } catch (err) {
    console.error('[Nova API]', err)
    return NextResponse.json({ error: 'Nova failed' }, { status: 500 })
  }
}
