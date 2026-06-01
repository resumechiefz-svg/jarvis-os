import { slack } from '../slack'
/**
 * Pattern Interrupt — detects when the same problem surfaces 3x in 6 weeks
 * Jarvis names it directly. Most people never see their own loops.
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN


export async function detectPatterns(): Promise<void> {
  const sixWeeksAgo = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString()

  const { data: decisions } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context, created_at')
    .eq('category', 'decision_journal')
    .gte('created_at', sixWeeksAgo)

  const { data: conversations } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context, created_at')
    .eq('category', 'conversation_summary')
    .gte('created_at', sixWeeksAgo)
    .order('created_at', { ascending: false })
    .limit(60)

  if (!conversations?.length) return

  const allContent = [
    ...(decisions ?? []).map(d => d.content),
    ...(conversations ?? []).map(c => c.content),
  ].join('\n')

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Analyze these 6 weeks of conversations and decisions for recurring patterns.

${allContent.slice(0, 5000)}

Look for:
- Same problem/situation arising 3+ times
- Same type of decision being revisited
- Same frustration or blocker
- Behaviors that keep showing up

If you find a real pattern (not a stretch), return JSON:
{"hasPattern": true, "pattern": "one sentence describing the loop", "occurrences": 3, "recommendation": "what to do about it"}

If nothing is genuinely recurring: {"hasPattern": false}`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    const data = match ? JSON.parse(match[0]) : {}

    if (!data.hasPattern) return

    // Check if we already flagged this pattern recently
    const { data: recent } = await supabaseAdmin
      .from('ai_memories')
      .select('content')
      .eq('category', 'pattern_interrupt')
      .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .single()

    if (recent?.content === data.pattern) return // Don't repeat within 2 weeks

    await supabaseAdmin.from('ai_memories').insert({
      category: 'pattern_interrupt',
      content: data.pattern,
      context: JSON.stringify(data),
      importance: 9,
      created_at: new Date().toISOString(),
    })

    await slack(`🔄 *Pattern Detected — AB*

This is the ${data.occurrences}rd time in 6 weeks this has come up:

*"${data.pattern}"*

${data.recommendation}`)

  } catch { /* skip */ }
}
