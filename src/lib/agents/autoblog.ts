import { slack } from '../slack'
/**
 * Auto-Blog Pipeline — ECHO monitors trends and drafts posts
 * ResumeChiefz: job market, resume tips, career advice
 * Card Chiefz: card market, player news, grading guides
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })


async function getTrendingTopics(brand: 'rc' | 'cc'): Promise<string[]> {
  // Pull trending Reddit topics
  const subs = brand === 'rc'
    ? ['resumes', 'jobs', 'cscareerquestions', 'careerguidance']
    : ['basketballcards', 'footballcards', 'baseballcards', 'sportscards']

  const topics: string[] = []
  for (const sub of subs.slice(0, 2)) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=5`, {
        headers: { 'User-Agent': 'JarvisOS/1.0 blog-research' }
      })
      const data = await res.json() as { data?: { children?: Array<{ data: { title: string } }> } }
      data?.data?.children?.forEach(c => topics.push(c.data.title))
    } catch { /* skip */ }
  }
  return topics.slice(0, 6)
}

async function writeBlogPost(brand: 'rc' | 'cc', topics: string[]): Promise<{ title: string; slug: string; content: string; excerpt: string; tag: string }> {
  const brandCtx = brand === 'rc'
    ? 'ResumeChiefz — AI resume builder built by a 10-year recruiter. Target: job seekers who want a competitive edge.'
    : 'Card Chiefz — premium sports card eBay store. 1,400+ sales, 99.5% feedback. Target: collectors and investors.'

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Write a blog post for ${brandCtx}

Trending topics for inspiration:
${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Pick the most SEO-valuable angle. Write a complete blog post:
- Title: specific, SEO-optimized, curiosity-driving (no clickbait)
- Excerpt: 1-2 sentences that hook the reader
- Tag: one of: MARKET, GUIDE, TIPS, GRADING, STRATEGY, CAREER
- Content: 500-700 words, scannable (headers, bullet points), genuinely valuable
- End with a soft CTA to ${brand === 'rc' ? 'resumechiefz.com' : 'Card Chiefz eBay store'}

Return JSON:
{
  "title": "...",
  "slug": "url-friendly-slug",
  "excerpt": "...",
  "tag": "...",
  "content": "full markdown content here"
}`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : { title: 'Draft post', slug: 'draft', content: text, excerpt: '', tag: 'GUIDE' }
  } catch {
    return { title: 'Draft post', slug: 'draft', content: '', excerpt: '', tag: 'GUIDE' }
  }
}

export async function runAutoBlog(brand: 'rc' | 'cc' = 'rc'): Promise<{ title: string; slug: string; savedId: string }> {
  const topics = await getTrendingTopics(brand)
  const post = await writeBlogPost(brand, topics)

  // Save draft to Supabase
  const { data } = await supabaseAdmin.from('ai_memories').insert({
    category: `blog_draft_${brand}`,
    content: post.title,
    context: JSON.stringify(post),
    importance: 7,
    created_at: new Date().toISOString(),
  }).select('id').single()

  const brandName = brand === 'rc' ? 'ResumeChiefz' : 'Card Chiefz'
  await slack(`
✍️ *New Blog Draft — ${brandName}*
*Title:* ${post.title}
*Tag:* ${post.tag} | *Slug:* /${post.slug}

${post.excerpt}

_React ✅ to approve for publishing | Draft ID: ${data?.id}_
  `.trim())

  return { title: post.title, slug: post.slug, savedId: data?.id ?? '' }
}
