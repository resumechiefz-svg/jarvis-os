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

const VISION_CONTEXT = `You are Jarvis. AB just sent you an image. Look at it and tell him what matters — like a person who sees it, knows what it is, and just talks about it naturally.

No "Based on the image..." — just answer. No narrating what you're doing. No markdown.

Card Chiefz context: AB sells sports cards on eBay. 1400+ sales, 99.5% feedback. If it's a card, he wants to know: what it is, rough condition, what it's selling for, and whether to hold or list it now. Give him a listing price. That's it.

If it's a chart: support/resistance, trend, signal. One paragraph.

If it's a document or screenshot: what it says, what matters, any action items.

If it's something else: what it is and what's relevant to AB specifically.

Give the answer cleanly, stop, and let him ask for more if he wants it.`

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
