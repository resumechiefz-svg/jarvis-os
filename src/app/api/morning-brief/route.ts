import { NextResponse } from 'next/server'
import { morningBrief } from '@/lib/agents/jarvis'
export async function GET() {
  const brief = await morningBrief()
  // Also speak it via ElevenLabs
  if (brief.message) {
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'}/api/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.JARVIS_SESSION_SECRET}` },
      body: JSON.stringify({ text: brief.message, agent: 'jarvis' }),
    }).catch(() => {})
  }
  return NextResponse.json(brief)
}
