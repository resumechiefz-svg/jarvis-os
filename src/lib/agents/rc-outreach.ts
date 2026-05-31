/**
 * RC Outreach — automated ResumeChiefz growth content
 *
 * Generates targeted posts for:
 * - Reddit (r/jobs, r/resumes, r/cscareerquestions, r/careerguidance)
 * - LinkedIn (professional tone, value-add content)
 * - Twitter/X (punchy, shareable takes)
 *
 * Strategy: "easy in, fast out" — low friction CTAs, not spammy
 * Timing: aligned to job seeker activity (Mon-Wed peak hiring activity)
 */
import Anthropic from '@anthropic-ai/sdk'
import { saveMemory } from '../memory/vectors'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BRAND_VOICE = `ResumeChiefz brand voice:
- Built by a 10-year recruiter (not an engineer) — that's the core differentiator
- Honest, direct, no corporate fluff
- "AI precision, human expertise" — real recruiting knowledge baked in
- Free for 1 resume, no credit card, 90 seconds
- Target: active job seekers, people who just got laid off, new grads
- Tone: knowledgeable older sibling who works in HR, not a salesperson`

const REDDIT_COMMUNITIES = [
  { sub: 'r/resumes', tone: 'helpful', audience: 'People actively working on resumes' },
  { sub: 'r/jobs', tone: 'empathetic', audience: 'Active job seekers, some stressed' },
  { sub: 'r/cscareerquestions', tone: 'technical', audience: 'Tech professionals, skeptical of fluff' },
  { sub: 'r/careerguidance', tone: 'mentoring', audience: 'Career changers and early career' },
  { sub: 'r/layoffs', tone: 'supportive', audience: 'Recently laid off, high urgency' },
]

interface OutreachPost {
  platform: string
  community?: string
  title?: string
  body: string
  cta: string
  bestTime: string
  estimatedReach: string
}

// ── Generate Reddit post ───────────────────────────────────
async function generateRedditPost(community: typeof REDDIT_COMMUNITIES[0]): Promise<OutreachPost> {
  const topics = [
    'common resume mistakes recruiters hate',
    'why ATS systems reject good candidates',
    'the real difference between a good and bad resume',
    'what recruiters actually look at in 6 seconds',
    'how to write a resume when you have no experience',
    'how to explain a career gap on your resume',
  ]
  const topic = topics[Math.floor(Math.random() * topics.length)]

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Write a Reddit post for ${community.sub} about: "${topic}"

${BRAND_VOICE}

Audience: ${community.audience}
Tone: ${community.tone}

Rules:
- Lead with VALUE, not promotion (80% value, 20% soft mention of ResumeChiefz)
- Sound like a real person sharing genuine expertise
- No corporate language, no "I", write as the brand voice
- Mention ResumeChiefz naturally at the end only ("If you want to skip the guesswork, we built ResumeChiefz for exactly this...")
- Reddit title should be specific and curiosity-driving
- Body: 150-250 words

Return as JSON: { "title": "...", "body": "..." }`,
    }],
  })

  let parsed = { title: '', body: '' }
  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    if (match) parsed = JSON.parse(match[0])
  } catch { /* use defaults */ }

  return {
    platform: 'Reddit',
    community: community.sub,
    title: parsed.title || topic,
    body: parsed.body || '',
    cta: 'resumechiefz.com — Free for 1 resume, 90 seconds',
    bestTime: 'Tuesday-Thursday 8-10am EST',
    estimatedReach: '500-2,000 views',
  }
}

// ── Generate LinkedIn post ─────────────────────────────────
async function generateLinkedInPost(): Promise<OutreachPost> {
  const angles = [
    'recruiter perspective: what I look for in resumes',
    'the resume mistake 90% of candidates make',
    'AI changed how I review resumes — here\'s what that means for you',
    'after 10 years recruiting, here\'s the resume template that always works',
  ]
  const angle = angles[Math.floor(Math.random() * angles.length)]

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Write a LinkedIn post for ResumeChiefz about: "${angle}"

${BRAND_VOICE}

Rules:
- Professional but not stiff
- Hook in first line (no "I'm excited to share...")
- Short paragraphs, easy to skim
- End with a question to drive comments, THEN soft CTA to ResumeChiefz
- 150-200 words
- Include 3-4 relevant hashtags at the bottom

Return just the post text, no JSON needed.`,
    }],
  })

  const body = msg.content[0].type === 'text' ? msg.content[0].text : ''

  return {
    platform: 'LinkedIn',
    body,
    cta: 'resumechiefz.com',
    bestTime: 'Tuesday-Thursday 7-9am or 5-6pm EST',
    estimatedReach: '200-1,000 impressions',
  }
}

// ── Generate Twitter/X thread ─────────────────────────────
async function generateTwitterThread(): Promise<OutreachPost> {
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Write a 5-tweet thread for ResumeChiefz.

${BRAND_VOICE}

Topic: A punchy, shareable take on resume writing from a recruiter's POV
Format: Tweet 1 (hook) → Tweets 2-4 (value) → Tweet 5 (soft CTA to resumechiefz.com)
Each tweet max 280 chars. Number them 1/5, 2/5 etc.

Be direct and opinionated. Job seekers love when someone says what recruiters actually think.`,
    }],
  })

  const body = msg.content[0].type === 'text' ? msg.content[0].text : ''

  return {
    platform: 'Twitter/X',
    body,
    cta: 'resumechiefz.com',
    bestTime: 'Tuesday-Thursday 9am or 5-7pm EST',
    estimatedReach: '100-500 impressions',
  }
}

// ── Post to Slack for approval (same ECHO workflow) ────────
async function postToSlackForApproval(posts: OutreachPost[]): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return

  for (const post of posts) {
    const message = `
🚀 *RC Outreach — ${post.platform}${post.community ? ` (${post.community})` : ''}*
📅 Best time: ${post.bestTime} | 📊 Est. reach: ${post.estimatedReach}

${post.title ? `*Title:* ${post.title}\n\n` : ''}${post.body}

🔗 CTA: ${post.cta}

_React ✅ to approve, ❌ to reject_
    `.trim()

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    })

    await new Promise(r => setTimeout(r, 1000)) // rate limit
  }
}

// ── Main: generate full outreach batch ────────────────────
export async function runRCOutreach(): Promise<OutreachPost[]> {
  const today = new Date()
  const dayOfWeek = today.getDay()

  // Only generate on Mon-Thu (peak job seeker activity)
  const posts: OutreachPost[] = []

  // Always generate LinkedIn + Twitter
  const [linkedin, twitter] = await Promise.all([
    generateLinkedInPost(),
    generateTwitterThread(),
  ])
  posts.push(linkedin, twitter)

  // Reddit: 2 communities per run, rotate through the list
  const weekNum = Math.floor(today.getTime() / (7 * 24 * 60 * 60 * 1000))
  const startIdx = (weekNum * 2) % REDDIT_COMMUNITIES.length
  const communities = [
    REDDIT_COMMUNITIES[startIdx % REDDIT_COMMUNITIES.length],
    REDDIT_COMMUNITIES[(startIdx + 1) % REDDIT_COMMUNITIES.length],
  ]

  for (const community of communities) {
    const post = await generateRedditPost(community)
    posts.push(post)
  }

  // Send to Slack for approval
  await postToSlackForApproval(posts)

  // Save to memory
  await saveMemory({
    category: 'rc_outreach',
    content: `Generated ${posts.length} outreach posts: LinkedIn, Twitter, ${communities.map(c => c.sub).join(', ')}`,
    context: JSON.stringify(posts.map(p => ({ platform: p.platform, community: p.community, title: p.title }))),
    importance: 6,
  })

  // Log to Supabase
  await supabaseAdmin.from('ai_memories').insert({
    category: 'rc_outreach_log',
    content: today.toISOString().split('T')[0],
    context: JSON.stringify(posts),
    importance: 5,
    created_at: new Date().toISOString(),
  })

  return posts
}
