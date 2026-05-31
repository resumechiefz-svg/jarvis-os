import { NextRequest, NextResponse } from 'next/server'
import { chat, morningBrief, invalidateContextCache } from '@/lib/agents/jarvis'

// Pre-warm context cache on module load so first user message is fast
import('@/lib/agents/jarvis').then(m => m.invalidateContextCache?.()).catch(() => {})
// Actually warm it by triggering a background load
setTimeout(() => {
  import('@/lib/agents/jarvis').then(({ chat: warmChat }) => {
    // Fire a dummy internal call to populate the cache
    warmChat('warmup', []).catch(() => {})
  }).catch(() => {})
}, 2000)

export async function POST(req: NextRequest) {
  try {
    const { message, history, mode } = await req.json()

    if (mode === 'morning_brief') {
      const result = await morningBrief()
      return NextResponse.json(result)
    }

    if (!message) return NextResponse.json({ error: 'No message' }, { status: 400 })

    const result = await chat(message, history ?? [])
    // Strip markdown — Jarvis speaks in the HUD, not a doc editor
    result.message = result.message
      .replace(/^#{1,3}\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^---+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[Jarvis API]', err)
    return NextResponse.json({ error: 'Jarvis failed' }, { status: 500 })
  }
}
