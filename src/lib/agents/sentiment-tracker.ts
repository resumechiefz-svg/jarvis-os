import { slack } from '../slack'
/**
 * Sentiment Tracker — reads AB's emotional patterns from conversations
 * Not invasive — just aware. Helps Jarvis read the room.
 * Detects stress, energy, momentum, and flags patterns
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN


export interface SentimentReading {
  energy: 'high' | 'medium' | 'low'
  stress: 'high' | 'medium' | 'low'
  focus: 'sharp' | 'scattered' | 'normal'
  mood: 'positive' | 'neutral' | 'negative'
  flags: string[]  // Notable observations
  date: string
}

export async function analyzeSentiment(recentMessages: string[]): Promise<SentimentReading | null> {
  if (recentMessages.length < 2) return null

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Analyze the emotional tone of these messages from AB:

${recentMessages.slice(-10).join('\n')}

Return JSON: {
  "energy": "high|medium|low",
  "stress": "high|medium|low",
  "focus": "sharp|scattered|normal",
  "mood": "positive|neutral|negative",
  "flags": ["array of notable observations, max 2"]
}

Be objective, not clinical. Read between the lines.`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    const data = match ? JSON.parse(match[0]) : null
    if (!data) return null
    return { ...data, date: new Date().toISOString() }
  } catch { return null }
}

// Save reading and check for concerning patterns
export async function saveSentimentReading(reading: SentimentReading): Promise<void> {
  await supabaseAdmin.from('ai_memories').insert({
    category: 'sentiment_log',
    content: `${reading.mood} mood, ${reading.energy} energy, ${reading.stress} stress`,
    context: JSON.stringify(reading),
    importance: 5,
    created_at: reading.date,
  })

  // Check for patterns — 3+ consecutive low energy or high stress
  const { data: recent } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'sentiment_log')
    .order('created_at', { ascending: false })
    .limit(5)

  const readings = (recent ?? []).map(r => {
    try { return JSON.parse(r.context ?? '{}') as SentimentReading } catch { return null }
  }).filter(Boolean) as SentimentReading[]

  // Detect patterns
  const lowEnergyStreak = readings.filter(r => r.energy === 'low').length
  const highStressStreak = readings.filter(r => r.stress === 'high').length

  if (lowEnergyStreak >= 3) {
    await slack(`⚡ *SAGE — Energy Pattern Detected*\n\nAB, you've been running low for ${lowEnergyStreak} sessions. Worth pausing to check what's draining you. Sleep? Workload? Something else?`)
  }

  if (highStressStreak >= 3) {
    await slack(`🧠 *SAGE — Stress Pattern Detected*\n\nHigh stress across ${highStressStreak} recent sessions, AB. Not calling it a problem — just making sure you're aware. What's the main source right now?`)
  }
}

// Get sentiment context for Jarvis to inject into responses
export async function getCurrentSentimentContext(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context, created_at')
    .eq('category', 'sentiment_log')
    .order('created_at', { ascending: false })
    .limit(3)

  if (!data?.length) return ''

  const readings = data.map(r => {
    try { return JSON.parse(r.context ?? '{}') as SentimentReading } catch { return null }
  }).filter(Boolean) as SentimentReading[]

  const latest = readings[0]
  if (!latest) return ''

  return `[AB CURRENT STATE: ${latest.energy} energy, ${latest.stress} stress, ${latest.mood} mood — adjust tone accordingly]`
}
