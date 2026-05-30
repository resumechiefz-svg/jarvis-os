import Anthropic from '@anthropic-ai/sdk'
import { REEL_SYSTEM } from './prompts'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Card Chiefz Buffer Channel IDs — AB needs to add these from his CC Buffer account
export const CC_CHANNELS = {
  instagram: process.env.CC_BUFFER_INSTAGRAM ?? '',
  facebook:  process.env.CC_BUFFER_FACEBOOK ?? '',
  twitter:   process.env.CC_BUFFER_TWITTER ?? '',
  pinterest: process.env.CC_BUFFER_PINTEREST ?? '',
  orgId:     process.env.CC_BUFFER_ORG_ID ?? '',
}

const CC_DAY_THEMES = [
  'Card Market Update — what\'s hot, what\'s cooling, what\'s undervalued right now',
  'Grading Tips — when to grade, PSA vs BGS, what grades actually impact value',
  'Player Arc — rookies worth watching, veterans to sell, comeback stories',
  'Set Breakdown — best boxes to bust, worst value sets, hidden gems this week',
  'Collector Tips — storage, protection, authentication, avoiding fakes on eBay',
  'Investment Angles — cards as assets, long-term holds vs flips, market timing',
  'Card Chiefz Spotlight — recent pulls, inventory highlights, what\'s for sale',
]

export interface ReelContent {
  theme: string
  date: string
  instagram: string[]
  facebook: string[]
  twitter: string[]
  pinterest: Array<{ title: string; description: string }>
  youtubeIdea: string
  marketInsight: string
}

export async function generateCCDailyContent(dayOverride?: number): Promise<ReelContent> {
  const dayOfWeek = dayOverride ?? new Date().getDay()
  const theme = CC_DAY_THEMES[dayOfWeek] ?? CC_DAY_THEMES[0]
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const prompt = `Today is ${today}. Theme: ${theme}

Generate a full day of Card Chiefz social media content. Sound like a real collector, not a brand account. Every platform gets different copy.

Return ONLY valid JSON:

{
  "theme": "string",
  "date": "string",
  "instagram": [
    "caption 1 — conversational, collector voice, 20-25 hashtags",
    "caption 2 — different angle, 20-25 hashtags"
  ],
  "facebook": [
    "caption 1 — community-focused, start a conversation, 3-5 hashtags",
    "caption 2 — market insight or tip, 3-5 hashtags"
  ],
  "twitter": [
    "tweet 1 under 280 chars — hot take or market update",
    "tweet 2 under 280 chars — collector tip or observation",
    "tweet 3 under 280 chars — with soft CTA to check Card Chiefz on eBay"
  ],
  "pinterest": [
    {"title": "SEO title for card collectors", "description": "searchable description under 500 chars"},
    {"title": "SEO title for card collectors", "description": "searchable description under 500 chars"}
  ],
  "youtubeIdea": "faceless video concept for today — title + 3 bullet outline",
  "marketInsight": "one sharp market observation worth knowing today"
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: REEL_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Reel: No JSON in response')
  return JSON.parse(jsonMatch[0]) as ReelContent
}
