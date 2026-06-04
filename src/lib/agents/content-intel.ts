/**
 * Content Intelligence — adaptive memory for Echo's content engine
 *
 * Knows what's already been published across:
 *   - ResumeChiefz YouTube (via YouTube Data API)
 *   - Card Chiefz YouTube (via YouTube Data API)
 *   - ResumeChiefz blog (local file scan)
 *   - Buffer queue (via Buffer API — what's scheduled)
 *
 * Feeds into content generation so:
 *   - No topic is repeated
 *   - Style stays consistent with top performers
 *   - Every new piece is viral-optimized for the current moment
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const YT_KEY = process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_CLIENT_ID ?? ''
const RC_CHANNEL = process.env.YOUTUBE_RC_CHANNEL_ID ?? 'UC47aph3rOjY7HE32idpSY1w'
const CC_CHANNEL = process.env.YOUTUBE_CC_CHANNEL_ID ?? 'UCZRepn5lq3Eoteu9pIYMxdA'

// ── Pull existing YouTube video titles from a channel ─────────────────────────
async function getYouTubeTitles(channelId: string): Promise<string[]> {
  try {
    // Use YouTube Data API v3
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=50&order=date&type=video&key=${YT_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const data = await res.json() as { items?: Array<{ snippet: { title: string } }> }
    return (data.items ?? []).map(v => v.snippet.title).filter(Boolean)
  } catch {
    // Fall back to Supabase memory if API fails
    const { data } = await supabaseAdmin
      .from('ai_memories')
      .select('content')
      .eq('category', 'youtube_script')
      .order('created_at', { ascending: false })
      .limit(30)
    return (data ?? []).map(r => r.content)
  }
}

// ── Pull existing blog post titles ────────────────────────────────────────────
async function getBlogTitles(): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin
      .from('ai_memories')
      .select('content')
      .in('category', ['blog_published_rc', 'blog_draft_rc', 'blog_published_cc'])
      .order('created_at', { ascending: false })
      .limit(50)
    return (data ?? []).map(r => r.content)
  } catch { return [] }
}

// ── Pull what's already queued in Buffer ──────────────────────────────────────
async function getBufferQueue(): Promise<string[]> {
  const token = process.env.BUFFER_API_TOKEN
  if (!token) return []
  try {
    const channels = ['69c7fcc3af47dacb6964c08e', '69c7fdb4af47dacb6964c63a']
    const texts: string[] = []
    for (const ch of channels) {
      const res = await fetch(`https://api.bufferapp.com/1/profiles/${ch}/updates/pending.json?access_token=${token}&count=20`)
      const data = await res.json() as { updates?: Array<{ text: string }> }
      texts.push(...(data.updates ?? []).map(u => u.text.slice(0, 100)))
    }
    return texts
  } catch { return [] }
}

// ── Viral topic intelligence — what's working RIGHT NOW in each niche ─────────
async function getTrendingTopics(niche: 'cards' | 'resume'): Promise<string[]> {
  const subs = niche === 'cards'
    ? ['basketballcards', 'footballcards', 'baseballcards', 'sportscards', 'PokemonCardValue']
    : ['resumes', 'jobs', 'cscareerquestions', 'careerguidance', 'jobsearchhacks']

  const topics: Array<{ title: string; score: number }> = []

  for (const sub of subs.slice(0, 3)) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=10`, {
        headers: { 'User-Agent': 'JarvisOS/1.0 content-intel' },
        signal: AbortSignal.timeout(4000),
      })
      const data = await res.json() as { data?: { children?: Array<{ data: { title: string; score: number; num_comments: number } }> } }
      data?.data?.children?.forEach(c => {
        if (c.data.score > 100) {
          topics.push({ title: c.data.title, score: c.data.score + c.data.num_comments * 5 })
        }
      })
    } catch { /* skip */ }
  }

  return topics
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(t => t.title)
}

// ── Main: build full content context for generation ───────────────────────────
export interface ContentContext {
  publishedTitles: string[]     // what's already out there — don't repeat
  trendingTopics: string[]      // what's getting traction right now
  bufferedPosts: string[]       // what's already queued
  topPerformers: string[]       // best performing titles by style reference
}

export async function getContentContext(
  channel: 'cardchiefz' | 'resumechiefz'
): Promise<ContentContext> {
  const isCards = channel === 'cardchiefz'
  const channelId = isCards ? CC_CHANNEL : RC_CHANNEL

  const [ytTitles, blogTitles, buffered, trending] = await Promise.allSettled([
    getYouTubeTitles(channelId),
    isCards ? Promise.resolve([]) : getBlogTitles(),
    getBufferQueue(),
    getTrendingTopics(isCards ? 'cards' : 'resume'),
  ])

  const published = [
    ...(ytTitles.status === 'fulfilled' ? ytTitles.value : []),
    ...(blogTitles.status === 'fulfilled' ? blogTitles.value : []),
  ]

  // Pull actual top performers from analytics (stored by /api/rc/analytics cron)
  const perfCategory = isCards ? 'top_performers_cc' : 'top_performers_rc'
  const { data: perfData } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', perfCategory)
    .order('created_at', { ascending: false })
    .limit(1)
  const storedTopPerformers: string[] = perfData?.[0]
    ? (JSON.parse(perfData[0].context).videos ?? []).map((v: { title: string }) => v.title)
    : published.slice(0, 10)

  return {
    publishedTitles: published.slice(0, 40),
    trendingTopics: trending.status === 'fulfilled' ? trending.value : [],
    bufferedPosts: buffered.status === 'fulfilled' ? buffered.value : [],
    topPerformers: storedTopPerformers, // actual best performers by view count
  }
}

// ── Generate a viral-optimized topic that hasn't been covered ─────────────────
export async function pickFreshTopic(
  channel: 'cardchiefz' | 'resumechiefz',
  contentType: 'youtube' | 'blog' | 'linkedin' | 'instagram'
): Promise<string> {
  const ctx = await getContentContext(channel)
  const isCards = channel === 'cardchiefz'

  const brandContext = isCards
    ? 'Card Chiefz — premium sports card eBay seller. 1,400+ sales, 99.5% feedback. Audience: card collectors and investors.'
    : 'ResumeChiefz — AI resume builder by a 10-year recruiter. Audience: job seekers who want to get hired faster.'

  const formatGuidance = {
    youtube: 'A YouTube video topic. Should be something people actively search. Pattern: "How to X", "Why X", "X mistakes", "X tips". Hook in the first 3 words.',
    blog: 'A blog post angle. SEO-driven. High search volume, specific problem being solved, helpful to someone actively job searching or buying cards.',
    linkedin: 'A LinkedIn post angle. Conversational insight or counterintuitive take. Not promotional — something a professional would actually share. Career truth, industry insight, personal story angle.',
    instagram: 'An Instagram carousel topic. Visual-friendly, list-based, immediately actionable. "5 things", "3 mistakes", "How to" that can be shown in 6-8 slides.',
  }

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You're the content strategist for ${brandContext}

Content type: ${formatGuidance[contentType]}

TOP PERFORMING videos on this channel (study the style, angle, and specificity of what works):
${ctx.topPerformers.slice(0, 5).map(t => `- ${t}`).join('\n') || '(no data yet)'}

ALREADY PUBLISHED (do NOT repeat these or anything similar):
${ctx.publishedTitles.slice(0, 20).map(t => `- ${t}`).join('\n') || '(none yet)'}

CURRENTLY TRENDING in this niche (use for inspiration, not to copy):
${ctx.trendingTopics.slice(0, 5).map(t => `- ${t}`).join('\n') || '(no data)'}

Pick ONE fresh topic that:
1. Has NOT been covered in the published list
2. Is genuinely useful/interesting to the audience (not promotional)
3. Has viral potential — the kind people share, save, or comment on
4. Fits the platform and format

Return ONLY the topic/title, nothing else.`,
    }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  return text || (isCards ? 'The card market is shifting — here\'s what to watch' : 'What recruiters actually do when they open your resume')
}

// ── Cron: refresh content catalog in Supabase weekly ─────────────────────────
export async function refreshContentCatalog(): Promise<void> {
  const [rcTitles, ccTitles] = await Promise.all([
    getYouTubeTitles(RC_CHANNEL),
    getYouTubeTitles(CC_CHANNEL),
  ])

  const allTitles = [
    ...rcTitles.map(t => ({ channel: 'resumechiefz', title: t })),
    ...ccTitles.map(t => ({ channel: 'cardchiefz', title: t })),
  ]

  // Upsert into Supabase content catalog
  for (const item of allTitles.slice(0, 60)) {
    await supabaseAdmin.from('ai_memories').upsert({
      category: `content_catalog_${item.channel}`,
      content: item.title,
      context: JSON.stringify({ source: 'youtube', syncedAt: new Date().toISOString() }),
      importance: 5,
      created_at: new Date().toISOString(),
    }, { onConflict: 'content' }).throwOnError().catch(() => {})
  }
}
