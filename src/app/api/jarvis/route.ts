import { NextRequest } from 'next/server'
import { morningBrief, chatStream } from '@/lib/agents/jarvis'

// Pre-warm on module load
import('@/lib/agents/jarvis').then(m => m.invalidateContextCache?.()).catch(() => {})
setTimeout(() => {
  import('@/lib/agents/jarvis').then(({ chat }) => chat('warmup', []).catch(() => {})).catch(() => {})
}, 2000)

export async function POST(req: NextRequest) {
  const { message, history, mode } = await req.json()

  // Morning brief — still blocking, returns JSON
  if (mode === 'morning_brief') {
    const result = await morningBrief()
    return Response.json(result)
  }

  if (!message) return Response.json({ error: 'No message' }, { status: 400 })

  // SSE streaming response
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        for await (const event of chatStream(message, history ?? [])) {
          send(event)
        }
      } catch (err) {
        console.error('[Jarvis stream]', err)
        send({ type: 'error', message: 'Jarvis stream failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  })
}
