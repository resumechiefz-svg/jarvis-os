/**
 * RC Blog Engine — Echo generates SEO-optimized recruiter content
 * Auto-publishes to resumechiefz.com/blog every other day
 * 10x more SEO opportunity than CC — resume tips, ATS, job market
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ECHO_RC_SYSTEM = `You are ECHO — ResumeChiefz content engine and a 10-year recruiting veteran.

You write blog posts that sound like they came from a real recruiter who's seen thousands of resumes — not a content farm. Specific, actionable, honest.

Brand: ResumeChiefz — AI-powered resume builder built by a real recruiter. $7.99/mo Pro.

Blog standards:
- 900-1300 words
- SEO title naturally includes target keyword
- Open with a specific, relatable recruiter scenario ("I screened 47 resumes last Tuesday...")
- Real insights from recruiting experience, not generic advice
- 3-4 sections with specific, actionable tips
- Include at least one statistic or data point
- End with a soft CTA to ResumeChiefz — never pushy, always relevant
- Voice: direct, knowledgeable, slightly blunt. Like the most helpful recruiter you've ever met.
- No "In conclusion", no "As a job seeker you know that", no corporate fluff`

const RC_BLOG_TOPICS = [
  { keyword: 'how to beat ATS resume screening 2026', category: 'ATS Tips' },
  { keyword: 'best resume format 2026', category: 'Resume Tips' },
  { keyword: 'resume keywords recruiters look for', category: 'ATS Tips' },
  { keyword: 'how long should a resume be 2026', category: 'Resume Tips' },
  { keyword: 'resume summary examples that work', category: 'Resume Writing' },
  { keyword: 'job market trends 2026', category: 'Job Market' },
  { keyword: 'how recruiters screen resumes in 6 seconds', category: 'Recruiter Insights' },
  { keyword: 'AI resume builder vs human written resume', category: 'Resume Tips' },
  { keyword: 'LinkedIn profile tips 2026', category: 'Job Search' },
  { keyword: 'salary negotiation email templates', category: 'Career Advice' },
  { keyword: 'career change resume tips', category: 'Resume Tips' },
  { keyword: 'remote job resume tips 2026', category: 'Job Search' },
  { keyword: 'quantifying resume achievements examples', category: 'Resume Writing' },
  { keyword: 'cover letter tips that actually work', category: 'Job Search' },
  { keyword: 'tech layoffs job search strategy 2026', category: 'Job Market' },
  { keyword: 'how to tailor resume to job description', category: 'ATS Tips' },
  { keyword: 'resume gaps how to explain them', category: 'Resume Tips' },
  { keyword: 'entry level resume with no experience', category: 'Resume Writing' },
]

interface RCBlogPost {
  title: string
  slug: string
  excerpt: string
  content: string
  category: string
  keyword: string
  readTime: string
  publishedAt: string
}

async function getNextRCTopic() {
  const { data } = await supabaseAdmin
    .from('rc_blog_posts')
    .select('keyword')
    .order('published_at', { ascending: false })
    .limit(20)

  const used = new Set((data ?? []).map((d: { keyword: string }) => d.keyword))
  const available = RC_BLOG_TOPICS.filter(t => !used.has(t.keyword))
  return available[0] ?? RC_BLOG_TOPICS[Math.floor(Math.random() * RC_BLOG_TOPICS.length)]
}

async function generateRCPost(topic: { keyword: string; category: string }): Promise<RCBlogPost> {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const prompt = `Write a complete blog post for resumechiefz.com targeting: "${topic.keyword}"

Today: ${today} | Category: ${topic.category}

Requirements:
- 900-1300 words
- SEO title that naturally includes the keyword
- Excerpt: 2 sentences, under 160 chars, includes keyword
- Slug: lowercase hyphens
- Start with a specific recruiter scenario (not "In today's job market...")
- Include 3-4 concrete tips with real examples
- One real stat or data point
- Soft CTA to ResumeChiefz at the end — never "click here"
- Read time estimate

Return ONLY valid JSON:
{
  "title": "SEO title",
  "slug": "url-slug",
  "excerpt": "2-sentence excerpt",
  "content": "full markdown post",
  "readTime": "X min"
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3500,
    system: ECHO_RC_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON from RC blog engine')

  const data = JSON.parse(match[0])
  return {
    title: data.title,
    slug: data.slug,
    excerpt: data.excerpt,
    content: data.content,
    category: topic.category,
    keyword: topic.keyword,
    readTime: data.readTime,
    publishedAt: new Date().toISOString(),
  }
}

export async function generateAndPublishRCPost(): Promise<RCBlogPost> {
  const topic = await getNextRCTopic()
  console.log(`[RC Blog] Generating: "${topic.keyword}"`)

  const post = await generateRCPost(topic)

  await supabaseAdmin.from('rc_blog_posts').insert({
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    category: post.category,
    keyword: post.keyword,
    read_time: post.readTime,
    published_at: post.publishedAt,
  })

  // Notify Slack
  const token = process.env.SLACK_BOT_TOKEN
  if (token) {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: '#echo',
        text: `📝 *ECHO — RC Blog Published*\nTitle: ${post.title}\nLive at: resumechiefz.com/blog/${post.slug}`,
      }),
    }).catch(() => {})
  }

  console.log(`[RC Blog] Published: ${post.title}`)
  return post
}

export async function getRCBlogPosts(limit = 10) {
  const { data } = await supabaseAdmin
    .from('rc_blog_posts')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit)
  return data ?? []
}
