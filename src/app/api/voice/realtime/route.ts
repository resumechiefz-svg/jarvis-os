/**
 * OpenAI Realtime API proxy — WebSocket bridge
 * Client connects here, we forward to OpenAI Realtime
 * Jarvis voice: conversational, responds in under 200ms
 */
import { NextRequest } from 'next/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!

// Session config sent to OpenAI Realtime on connect
const SESSION_CONFIG = {
  type: 'session.update',
  session: {
    modalities: ['text', 'audio'],
    instructions: `You are Jarvis — AB's personal AI assistant. You are running as his always-on voice companion.
AB is a serious entrepreneur: runs ResumeChiefz (AI resume builder), Card Chiefz (sports card eBay store), and TradePilot ($98k paper portfolio moving to live trading).
His goal: 7-figure portfolio, financial independence by 40. Training for the Whitewater 50 Mile ultra in October 2026.

Voice style: Direct, confident, no fluff. Like a sharp business partner. Short answers unless asked for detail.
You know his team: Nova (revenue), Sage (life/budget), Vault (cards), Echo (content), Scout (SEO), Lumen (images).
Never use markdown. Speak naturally.`,
    voice: 'echo',  // Deep, professional voice
    input_audio_format: 'pcm16',
    output_audio_format: 'pcm16',
    input_audio_transcription: { model: 'whisper-1' },
    turn_detection: {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 600,
    },
    temperature: 0.7,
    max_response_output_tokens: 400,
  },
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const upgrade = req.headers.get('upgrade')

  if (upgrade?.toLowerCase() !== 'websocket') {
    // Return a session token for the client to connect directly to OpenAI
    // This is the recommended approach for browser clients
    const res = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'echo',
        instructions: SESSION_CONFIG.session.instructions,
        modalities: ['text', 'audio'],
        turn_detection: SESSION_CONFIG.session.turn_detection,
        input_audio_transcription: { model: 'whisper-1' },
        temperature: 0.7,
        max_response_output_tokens: 400,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return new Response(JSON.stringify({ error: `OpenAI error: ${err}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    const session = await res.json() as { client_secret?: { value?: string }; id?: string }
    return new Response(JSON.stringify({
      sessionId: session.id,
      ephemeralKey: session.client_secret?.value,
      model: 'gpt-4o-realtime-preview-2024-12-17',
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('WebSocket upgrade required', { status: 426 })
}
