/**
 * Buffer Social — posts RC blog content to LinkedIn, Twitter, and Pinterest
 * Called by autoblog after publishing a new post
 *
 * Channels (Buffer org: 69c7fca3080ae4b56944dad0):
 *   LinkedIn:  69c7fcc3af47dacb6964c08e
 *   Twitter:   69c7fdb4af47dacb6964c63a
 *   Pinterest: 69c7fcf6af47dacb6964c1ea
 */
import Anthropic from '@anthropic-ai/sdk'
import { slack } from '../slack'

const BUFFER_TOKEN = process.env.BUFFER_API_TOKEN ?? ''
const BUFFER_API = 'https://api.bufferapp.com/1'

const CHANNELS = {
  linkedin: '69c7fcc3af47dacb6964c08e',
  twitter:  '69c7fdb4af47dacb6964c63a',
  pinterest: '69c7fcf6af47dacb6964c1ea',
}

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface PostResult {
  platform: string
  success: boolean
  id?: string
  error?: string
}

// ── Generate platform-specific copy ──────────────────────────────────────────
async function generateCopy(post: { title: string; excerpt: string; url: string }): Promise<{
  linkedin: string
  twitter: string
  pinterest: string
}> {
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Write social copy for this ResumeChiefz blog post:

Title: ${post.title}
Excerpt: ${post.excerpt}
URL: ${post.url}

Return JSON:
{
  "linkedin": "Professional post, 150-200 chars, 2-3 relevant hashtags, ends with URL",
  "twitter": "Tweet under 240 chars including URL, punchy opener, 1-2 hashtags",
  "pinterest": "Pinterest description 100-150 chars, tips-focused, ends with URL"
}`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    const fallback = `${post.title} — ${post.excerpt.slice(0, 80)} ${post.url}`
    return { linkedin: fallback, twitter: `${post.title} ${post.url}`, pinterest: fallback }
  }
}

// ── Post to Buffer via REST API ───────────────────────────────────────────────
async function postToBuffer(channelId: string, text: string, platform: string): Promise<PostResult> {
  if (!BUFFER_TOKEN) return { platform, success: false, error: 'No BUFFER_API_TOKEN' }

  try {
    const res = await fetch(`${BUFFER_API}/updates/create.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        access_token: BUFFER_TOKEN,
        profile_ids: channelId,
        text,
        shorten: 'false',
        now: 'false',  // add to queue, don't post immediately
      }),
    })
    const data = await res.json() as { success?: boolean; updates?: Array<{ id: string }>; error?: string }
    if (data.success && data.updates?.[0]?.id) {
      return { platform, success: true, id: data.updates[0].id }
    }
    return { platform, success: false, error: data.error ?? 'Unknown error' }
  } catch (err) {
    return { platform, success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function postBlogToSocial(post: {
  title: string
  excerpt: string
  slug: string
  liveUrl: string
}): Promise<void> {
  const copy = await generateCopy({ title: post.title, excerpt: post.excerpt, url: post.liveUrl })

  const results = await Promise.all([
    postToBuffer(CHANNELS.linkedin, copy.linkedin, 'LinkedIn'),
    postToBuffer(CHANNELS.twitter, copy.twitter, 'Twitter/X'),
    postToBuffer(CHANNELS.pinterest, copy.pinterest, 'Pinterest'),
  ])

  const ok = results.filter(r => r.success).map(r => r.platform)
  const failed = results.filter(r => !r.success).map(r => `${r.platform} (${r.error})`)

  const statusLine = ok.length > 0
    ? `Queued on: ${ok.join(', ')}${failed.length > 0 ? ` | Failed: ${failed.join(', ')}` : ''}`
    : `All failed: ${failed.join(', ')}`

  await slack(`📣 *Echo — Social Queued*\n*Post:* ${post.title}\n${statusLine}\n${post.liveUrl}`, 'echo')
}

// ── Post any custom content to LinkedIn ──────────────────────────────────────
export async function postToLinkedInBuffer(text: string): Promise<PostResult> {
  return postToBuffer(CHANNELS.linkedin, text, 'LinkedIn')
}

// ── Post any custom content to Twitter ───────────────────────────────────────
export async function postToTwitterBuffer(text: string): Promise<PostResult> {
  return postToBuffer(CHANNELS.twitter, text, 'Twitter/X')
}
