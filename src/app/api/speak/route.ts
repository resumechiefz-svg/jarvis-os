import { NextRequest, NextResponse } from 'next/server'

// Agent voice map — each agent has a distinct ElevenLabs voice
const AGENT_VOICES: Record<string, string> = {
  jarvis:  'JBFqnCBsd6RMkjVDRZzb', // George  — deep, British, authoritative
  nova:    '21m00Tcm4TlvDq8ikWAM', // Rachel  — sharp, precise CFO female
  sage:    'EXAVITQu4vr4xnSDxMaL', // Bella   — warm, calm, personal advisor
  vault:   'TxGEqnHWrfWFTfGW9XjX', // Josh    — sharp, eBay-native male
  echo:    'ErXwobaYiN019PkySvjV', // Antoni  — creative, storyteller
  scout:   'yoZ06aMxZJJ28mfd3POQ', // Sam     — scrappy, community-native
  reel:    'MF3mGyEYCl7XYWbV9V6O', // Elli    — casual, collector voice
  dex:     'VR6AewLTigWG4xSOukaG', // Arnold  — technical, systematic
  beacon:  'pNInz6obpgDQGcFmaJgB', // Adam    — direct, motivating
  ledger:  'AZnzlk1XvdvUeBnXmlld', // Domi    — no-nonsense female
  atlas:   'nPczCjzI2devNBz1zQrb', // Brian   — strategic, big-picture
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 500 })

  const { text, agent } = await req.json()
  const VOICE_ID = AGENT_VOICES[agent as string] ?? AGENT_VOICES.jarvis
  if (!text) return NextResponse.json({ error: 'No text' }, { status: 400 })

  // Strip markdown
  const clean = text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`{1,3}[^`]*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/---+/g, '.')
    .replace(/\|[^\n]*/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim()
    .slice(0, 2000) // ElevenLabs limit per request

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: clean,
        model_id: 'eleven_turbo_v2_5', // fastest model
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[ElevenLabs]', err)
      return NextResponse.json({ error: 'ElevenLabs failed' }, { status: 500 })
    }

    const audio = await res.arrayBuffer()
    return new NextResponse(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.byteLength.toString(),
      },
    })
  } catch (err) {
    console.error('[ElevenLabs]', err)
    return NextResponse.json({ error: 'ElevenLabs failed' }, { status: 500 })
  }
}
