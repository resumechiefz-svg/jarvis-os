/**
 * Jarvis Mobile API — optimized for iOS Shortcut
 * Returns both text + audio so Siri can speak the response
 *
 * iOS Shortcut setup:
 * 1. Open Shortcuts app → New Shortcut
 * 2. Add "Ask for Input" → prompt: "What do you want to ask Jarvis?"
 * 3. Add "Get Contents of URL"
 *    - URL: https://your-vercel-url.vercel.app/api/mobile
 *    - Method: POST
 *    - Headers: x-jarvis-key: [your MOBILE_API_KEY]
 *    - Body: JSON → { "message": [Provided Input] }
 * 4. Add "Get Dictionary Value" → Key: text, from: Contents of URL
 * 5. Add "Speak Text" → Input: Dictionary Value
 * Optional: trigger with "Hey Siri, ask Jarvis"
 */

import { NextRequest, NextResponse } from 'next/server'
import { chat } from '@/lib/agents/jarvis'

const MOBILE_API_KEY = process.env.MOBILE_API_KEY ?? 'jarvis-mobile-2026'

export async function POST(req: NextRequest) {
  // Simple API key auth
  const key = req.headers.get('x-jarvis-key')
  if (key !== MOBILE_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { message, history, voice } = await req.json()
  if (!message) return NextResponse.json({ error: 'No message' }, { status: 400 })

  try {
    // Get Jarvis response
    const result = await chat(message, history ?? [])
    const text = result.message

    // Optionally return audio (base64) for richer iOS integration
    if (voice === true && process.env.ELEVENLABS_API_KEY) {
      const VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb' // George — Jarvis voice

      const clean = text
        .replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/\*/g, '')
        .replace(/`{1,3}[^`]*/g, '').replace(/---+/g, '.').replace(/\|[^\n]*/g, '')
        .replace(/\n{2,}/g, '. ').replace(/\n/g, ' ').trim().slice(0, 1500)

      const audioRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: clean,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2 },
        }),
      })

      if (audioRes.ok) {
        const audioBuffer = await audioRes.arrayBuffer()
        const audioBase64 = Buffer.from(audioBuffer).toString('base64')
        return NextResponse.json({
          text,
          agent: result.agent,
          audio: audioBase64,
          audioType: 'audio/mpeg',
        })
      }
    }

    // Text-only response (works great with iOS Speak Text action)
    return NextResponse.json({
      text,
      agent: result.agent,
    })
  } catch (err) {
    console.error('[Mobile API]', err)
    return NextResponse.json({ error: 'Jarvis failed' }, { status: 500 })
  }
}

// Quick health check for Shortcut testing
export async function GET(req: NextRequest) {
  const key = req.headers.get('x-jarvis-key')
  if (key !== MOBILE_API_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, message: 'Jarvis mobile API online.' })
}
