import { NextResponse } from 'next/server'
import { morningBrief } from '@/lib/agents/jarvis'

export async function GET() {
  const brief = await morningBrief()
  // TTS is handled by the HUD client — only Jarvis speaks via the client-side speakText pipeline.
  // Never call /api/speak from the server — that creates a second voice channel.
  return NextResponse.json(brief)
}
