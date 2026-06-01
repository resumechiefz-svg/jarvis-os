/**
 * Predictive Suggestions — Jarvis acts before you ask
 * Learns patterns from memory and suggests actions at the right time
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface Suggestion {
  text: string
  action?: string
  priority: 'high' | 'medium' | 'low'
}

export async function getPredictiveSuggestions(): Promise<Suggestion[]> {
  const now = new Date()
  const hour = now.getHours()
  const day = now.getDay() // 0=Sun, 1=Mon...
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day]

  // Pull recent patterns from memory
  const { data: recentConvos } = await supabaseAdmin
    .from('ai_memories')
    .select('content, created_at')
    .eq('category', 'conversation_summary')
    .order('created_at', { ascending: false })
    .limit(30)

  // Pull daily scores to understand patterns
  const { data: scores } = await supabaseAdmin
    .from('ai_memories')
    .select('context, created_at')
    .eq('category', 'daily_score')
    .order('created_at', { ascending: false })
    .limit(7)

  // Training log
  const { data: training } = await supabaseAdmin
    .from('ai_memories')
    .select('created_at')
    .eq('category', 'training_log')
    .gte('created_at', new Date().toISOString().split('T')[0])
    .limit(1)

  const hasTrainedToday = (training?.length ?? 0) > 0

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `You are Jarvis predicting what AB needs right now.

Context:
- Time: ${hour}:00 on ${dayName}
- Trained today: ${hasTrainedToday}
- Recent topics: ${(recentConvos ?? []).slice(0, 10).map(c => c.content).join(', ')}
- AB's goals: 7-figure portfolio, RC growth, Card Chiefz sales, Whitewater 50 Mile ultra

Generate 2-3 proactive suggestions for RIGHT NOW based on time, day, and patterns.
Examples:
- Sunday evening → "Want me to pull your weekly review?"
- Monday morning → "RC churn report is ready — 2 at-risk subscribers"
- No workout logged by 7pm → "No training logged today — push to tomorrow or log rest day?"
- Wednesday → "RC outreach batch is due today"

Return JSON array:
[{"text": "...", "action": "optional_api_endpoint", "priority": "high|medium|low"}]

Be specific, direct, max 15 words per suggestion.`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  } catch {
    return []
  }
}
