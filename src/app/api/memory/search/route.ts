import { NextRequest, NextResponse } from 'next/server'
import { searchMemories, saveMemory } from '@/lib/memory/vectors'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? undefined
  const limit = parseInt(searchParams.get('limit') ?? '8')

  if (!query) return NextResponse.json({ error: 'q parameter required' }, { status: 400 })

  const results = await searchMemories(query, { limit, category })
  return NextResponse.json({ query, results })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  await saveMemory(body)
  return NextResponse.json({ ok: true })
}
