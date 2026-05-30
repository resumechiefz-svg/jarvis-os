import Anthropic from '@anthropic-ai/sdk'
import { ECHO_SYSTEM } from './prompts'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const RC_CHANNELS = {
  twitter:   '69c7fdb4af47dacb6964c63a',
  linkedin:  '69c7fcc3af47dacb6964c08e',
  pinterest: '69c7fcf6af47dacb6964c1ea',
  instagram: '69c8018faf47dacb6964d709',
  facebook:  '69c801abaf47dacb6964d76b',
  orgId:     '69c7fca3080ae4b56944dad0',
}

export const RC_PINTEREST_BOARDS = {
  aiResumeBuilder: '1099019184007804115',
  atsResumeHelp:   '1099019184007804106',
  jobSearchTips:   '1099019184007804108',
  resumeTips:      '1099019184007804102',
}

const DAY_THEMES = [
  'ATS Education — formatting, keyword optimization, why resumes get rejected by ATS systems',
  'Resume Tips — structure improvements, bullet writing, formatting best practices',
  'Recruiter Secrets — what recruiters actually look for, screening behavior, shortlists',
  'Career Market Insights — job trends, layoffs, hiring slowdowns, salary discussions',
  'Competitor Comparison — pricing, features, recruiter-built advantage over Resume.io/Zety/etc',
  'Feature Spotlight — ResumeChiefz AI tools, ATS optimization, speed and simplicity',
  'Free Trial CTA Push — conversion-focused, urgency, job search momentum',
]

export interface EchoContent {
  theme: string
  date: string
  twitter: string[]
  linkedin: string[]
  pinterest: Array<{ title: string; description: string; boardId: string }>
  instagram: string[]
  facebook: string[]
  blogIdea: string
  socialTeaser: string
}

export async function generateDailyContent(dayOverride?: number): Promise<EchoContent> {
  const dayOfWeek = dayOverride ?? new Date().getDay()
  const theme = DAY_THEMES[dayOfWeek] ?? DAY_THEMES[0]
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const prompt = `Today is ${today}. Theme: ${theme}

Generate a full day of ResumeChiefz social media content. Every platform must have DIFFERENT copy — platform-native, not copy-pasted.

Return ONLY valid JSON — no markdown wrapper, no explanation:

{
  "theme": "string",
  "date": "string",
  "twitter": ["tweet1 under 280 chars", "tweet2 under 280 chars", "tweet3 under 280 chars with CTA to resumechiefz.com"],
  "linkedin": ["full post 1 — hook, whitespace, bullets, soft CTA or question", "full post 2 — educational/industry news angle"],
  "pinterest": [
    {"title": "SEO title", "description": "SEO description under 500 chars", "boardId": "${RC_PINTEREST_BOARDS.atsResumeHelp}"},
    {"title": "SEO title", "description": "SEO description under 500 chars", "boardId": "${RC_PINTEREST_BOARDS.jobSearchTips}"},
    {"title": "SEO title", "description": "SEO description under 500 chars", "boardId": "${RC_PINTEREST_BOARDS.resumeTips}"}
  ],
  "instagram": ["caption1 with 20-25 hashtags", "caption2 with 20-25 hashtags"],
  "facebook": ["caption1 with 3-5 hashtags", "caption2 with 3-5 hashtags"],
  "blogIdea": "long-tail keyword — blog title for today",
  "socialTeaser": "one punchy sentence to tease the blog post"
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: ECHO_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Echo: No JSON in response')
  return JSON.parse(jsonMatch[0]) as EchoContent
}

export async function generateBlogPost(keyword: string): Promise<{ title: string; metaDescription: string; content: string; slug: string }> {
  const today = new Date().toISOString().split('T')[0]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: ECHO_SYSTEM,
    messages: [{
      role: 'user',
      content: `Write a complete SEO blog post for ResumeChiefz: "${keyword}"

Requirements:
- 900-1200 words
- Open with stat or bold claim, NOT "In today's job market..."
- Structure: H1 → intro → 4-6 H2 sections → conclusion
- Keyword used naturally 4-6 times
- 1 internal link: "build your free resume" → resumechiefz.com/app.html
- Conclusion CTA: "Ready to build a resume that gets interviews? Try ResumeChiefz free — no credit card required."
- Expert, direct, no fluff. Written by a 10-year recruiter.

Return ONLY valid JSON:
{"title":"","metaDescription":"under 155 chars","slug":"keyword-slug-${today}","content":"full post in markdown"}`
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Echo blog: No JSON')
  return JSON.parse(jsonMatch[0])
}
