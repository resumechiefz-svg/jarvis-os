import Anthropic from '@anthropic-ai/sdk'
import { SCOUT_SYSTEM } from './prompts'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface RedditDraft {
  subreddit: string
  postTitle: string
  originalPost: string
  draftReply: string
  mentionsRC: boolean
  karmaNote: string
}

export async function draftRedditReply(
  subreddit: string,
  postTitle: string,
  postContent: string,
): Promise<RedditDraft> {
  const prompt = `Draft a Reddit reply for this post in r/${subreddit}:

TITLE: ${postTitle}
CONTENT: ${postContent}

Write a genuine, helpful reply that sounds like a real person. Follow all Reddit voice rules — short, no lists, no em dashes, never mention AI.
Only mention ResumeChiefz if it's genuinely the right fit and feels completely natural.

Return ONLY valid JSON:
{
  "subreddit": "${subreddit}",
  "postTitle": "${postTitle}",
  "originalPost": "${postContent.slice(0, 200)}",
  "draftReply": "your reply here",
  "mentionsRC": true/false,
  "karmaNote": "note about whether this is a safe post given current karma level"
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SCOUT_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Scout: No JSON')
  return JSON.parse(jsonMatch[0]) as RedditDraft
}

export async function getGrowthBrief(): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: SCOUT_SYSTEM,
    messages: [{
      role: 'user',
      content: 'Give me a quick growth brief for ResumeChiefz today. What Reddit opportunities exist, what SEO gaps should we be targeting, and what\'s the one growth move worth making this week?',
    }],
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}
