import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { JARVIS_SYSTEM } from '@/lib/agents/prompts'
import { supabaseAdmin } from '@/lib/supabase/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const JOURNAL_ADDON = `

You are now in END-OF-DAY JOURNAL mode.

This is your most important conversation of the day. AB is debriefing with you.

Your role:
1. Ask how the day went — open-ended, warm but real
2. Listen deeply. Reflect back what you hear.
3. Help AB identify wins, losses, and lessons
4. Spot patterns across time (use memory)
5. Give one piece of honest advice based on what you heard
6. Lock in tomorrow's top priority together

Rules for this conversation:
- Never rush. Let AB talk.
- Ask follow-up questions that go deeper
- Don't just validate — challenge when it matters
- If AB had a tough day, acknowledge it before advising
- If AB had a great day, celebrate it genuinely before moving on
- Log key insights to memory automatically

End every journal session by:
1. Summarizing today in 2-3 sentences
2. Naming one pattern you noticed
3. Locking in tomorrow's #1 priority
4. One piece of advice for tonight`

export async function POST(req: NextRequest) {
  try {
    const { message, history, mode } = await req.json()

    if (mode === 'start') {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: JARVIS_SYSTEM + JOURNAL_ADDON,
        messages: [{ role: 'user', content: 'Start my end of day journal.' }],
      })
      const reply = response.content[0].type === 'text' ? response.content[0].text : ''
      return NextResponse.json({ message: reply })
    }

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...(history ?? []),
      { role: 'user', content: message },
    ]

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: JARVIS_SYSTEM + JOURNAL_ADDON,
      messages,
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''

    // Auto-save journal entries to memory
    if (message.length > 30) {
      void supabaseAdmin.from('ai_memories').insert({
        category: 'journal',
        content: `[${new Date().toLocaleDateString()}] AB: ${message.slice(0, 200)}`,
        context: reply.slice(0, 200),
        importance: 7,
        created_at: new Date().toISOString(),
      })
    }

    return NextResponse.json({ message: reply })
  } catch (err) {
    console.error('[Journal API]', err)
    return NextResponse.json({ error: 'Journal failed' }, { status: 500 })
  }
}
