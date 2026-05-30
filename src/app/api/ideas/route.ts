import { NextRequest, NextResponse } from 'next/server'
import { generateIdeas, getIdeas, updateIdeaStatus } from '@/lib/agents/ideas'

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? undefined
  const ideas = await getIdeas(status ?? undefined)
  return NextResponse.json({ ok: true, ideas })
}

export async function POST(req: NextRequest) {
  const { action, context, id, status } = await req.json()

  if (action === 'generate') {
    const ideas = await generateIdeas(context)
    return NextResponse.json({ ok: true, ideas })
  }

  if (action === 'update' && id && status) {
    await updateIdeaStatus(id, status)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
