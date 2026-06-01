import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { image } = await req.json()
  if (!image) return NextResponse.json({ insight: 'nothing_notable' })

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: image },
        },
        {
          type: 'text',
          text: `You are Jarvis analyzing AB's screen. AB runs ResumeChiefz, Card Chiefz, and TradePilot.

Look at this screenshot. If you see something actionable or notable, say it in ONE direct sentence (max 20 words).
Examples:
- eBay listing → "That Wembanyama PSA 10 is priced 30% below comps — reprice to $220."
- Portfolio down → "NVDA is dragging the portfolio down 2.3% — watch the $200 support level."
- Resume → "This resume is missing quantified achievements — weak without numbers."
- Nothing interesting → respond with exactly: nothing_notable

If it's just code, email, or routine browsing, respond: nothing_notable`,
        },
      ],
    }],
  })

  const insight = msg.content[0].type === 'text' ? msg.content[0].text.trim() : 'nothing_notable'
  return NextResponse.json({ insight: insight === 'nothing_notable' ? 'nothing_notable' : insight })
}
