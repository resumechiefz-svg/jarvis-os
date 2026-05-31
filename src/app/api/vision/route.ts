/**
 * Vision API — send an image to Jarvis for analysis
 * Use cases:
 * - Sports card photo → player ID, eBay comps, listing price
 * - Screenshot of chart → technical analysis
 * - Any image → general analysis
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const VISION_CONTEXT = `You are Jarvis — AB's personal AI. He's showing you an image.

Context about AB:
- Runs Card Chiefz (sports card eBay store, 1400+ sales, 99.5% feedback)
- Runs ResumeChiefz (AI resume builder SaaS)
- $98k paper trading portfolio (TradePilot)
- Goal: 7-figure portfolio, financial independence by 40

If it's a SPORTS CARD: identify the player, year, set, card number, condition estimate, parallel type.
Check what you know about recent eBay sold comps. Suggest a listing price and title.

If it's a TRADING CHART: give technical analysis — support/resistance, trend, signal.

If it's a SCREENSHOT or DOCUMENT: summarize key info, extract action items.

If it's anything else: describe and give AB relevant insight.

Be direct, no markdown, useful within 3 sentences max unless detail is needed.`

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('image') as File | null
  const context = formData.get('context') as string ?? ''

  if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: VISION_CONTEXT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: context || 'What do you see? Give me the relevant breakdown.' },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return NextResponse.json({ text })
}
