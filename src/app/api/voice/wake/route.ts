/**
 * Wake word notification endpoint
 * Called by Porcupine when "Hey Jarvis" is detected
 * Sends SSE event to all connected clients to activate voice mode
 */
import { NextResponse } from 'next/server'

// Global broadcast — any connected Jarvis tab activates voice
const clients = new Set<ReadableStreamController<Uint8Array>>()

export function addWakeClient(controller: ReadableStreamController<Uint8Array>) {
  clients.add(controller)
}

export function removeWakeClient(controller: ReadableStreamController<Uint8Array>) {
  clients.delete(controller)
}

export async function POST() {
  const encoder = new TextEncoder()
  const event = encoder.encode(`data: ${JSON.stringify({ type: 'wake' })}\n\n`)

  // Broadcast to all connected tabs
  for (const client of clients) {
    try { client.enqueue(event) } catch { clients.delete(client) }
  }

  return NextResponse.json({ ok: true, clients: clients.size })
}

// SSE subscription — Jarvis HUD connects here to receive wake events
export async function GET() {
  let controller: ReadableStreamController<Uint8Array>

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl
      addWakeClient(ctrl)
      // Keepalive ping every 30s
      const ping = setInterval(() => {
        try { ctrl.enqueue(new TextEncoder().encode(': ping\n\n')) }
        catch { clearInterval(ping); removeWakeClient(ctrl) }
      }, 30000)
    },
    cancel() {
      removeWakeClient(controller)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
