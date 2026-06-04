/**
 * Instagram Carousel Pipeline — Echo generates visual slide content
 *
 * Flow:
 * 1. content-intel picks viral topic (non-repetitive, educational)
 * 2. Claude writes 7-slide copy (hook, 5 value slides, CTA)
 * 3. Replicate generates 1:1 branded slide images
 * 4. Review screen shows all slides for approval
 * 5. Approve → queues to Buffer (LinkedIn + Pinterest — Instagram reconnect needed)
 *
 * Note: Instagram slot in Buffer is disconnected. To reconnect:
 * Go to publish.buffer.com → Channels → Add Instagram
 * Until then, carousels post to LinkedIn (as document) and Pinterest
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'
import { slack, slackWithTs } from '../slack'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const REPLICATE_KEY = process.env.REPLICATE_API_TOKEN
const BUFFER_TOKEN = process.env.BUFFER_API_TOKEN

interface Slide {
  headline: string
  body: string
  visualPrompt: string
  imageUrl?: string
}

interface Carousel {
  topic: string
  hook: string
  slides: Slide[]
  caption: string
  hashtags: string[]
}

// ── Generate slide copy ────────────────────────────────────────────────────────
async function generateCarouselCopy(
  channel: 'resumechiefz' | 'cardchiefz',
  topic: string
): Promise<Carousel> {
  const brandCtx = channel === 'resumechiefz'
    ? 'ResumeChiefz — resume tips by a 10-year recruiter. Audience: job seekers 22-45. Voice: direct, confident, practical. No corporate speak.'
    : 'Card Chiefz — sports card collector and eBay seller. Audience: collectors and investors. Voice: enthusiastic, knowledgeable, community-native.'

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Create an Instagram carousel for ${brandCtx}

Topic: "${topic}"

CAROUSEL RULES (what makes these go viral):
- Slide 1 (HOOK): Bold claim or question. Makes them STOP scrolling. Under 8 words. No fluff.
- Slides 2-6 (VALUE): One specific insight per slide. Numbered. Short headline + 1-2 lines of explanation.
- Slide 7 (CTA): Single action. Save this. Share with a friend. Build your resume.
- Caption: 150 chars max, starts with the hook, ends with 3-5 relevant hashtags

VISUAL DIRECTION (for each slide):
- Clean, minimal, high contrast
- Bold text overlay on gradient background
- Colors: ${channel === 'resumechiefz' ? '#0a1628 navy + #c9a84c gold' : '#1a0a28 dark purple + #c9a84c gold'}
- NO stock photos, NO complex scenes — text-on-background style like modern LinkedIn carousels

Return JSON:
{
  "topic": "...",
  "hook": "slide 1 text (under 8 words)",
  "slides": [
    {"headline": "Slide 1 headline", "body": "Supporting text", "visualPrompt": "Minimal gradient background, bold white text saying '[headline]', ${channel === 'resumechiefz' ? 'navy blue' : 'dark purple'} to dark background, gold accent line, professional clean design, 1:1 square format"},
    ... (7 slides total)
  ],
  "caption": "Full caption with hashtags",
  "hashtags": ["resume", "jobsearch", ...]
}`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    return JSON.parse(text.slice(start, end + 1)) as Carousel
  } catch {
    return { topic, hook: topic, slides: [], caption: topic, hashtags: [] }
  }
}

// ── Generate slide image via Replicate ────────────────────────────────────────
async function generateSlideImage(prompt: string): Promise<string | null> {
  if (!REPLICATE_KEY) return null
  try {
    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${REPLICATE_KEY}`, 'Content-Type': 'application/json', Prefer: 'wait' },
      body: JSON.stringify({ input: { prompt, aspect_ratio: '1:1', output_format: 'jpg', output_quality: 90 } }),
      signal: AbortSignal.timeout(60000),
    })
    const data = await res.json() as { output?: string[] }
    return data.output?.[0] ?? null
  } catch { return null }
}

// ── Queue to Buffer ────────────────────────────────────────────────────────────
async function queueToBuffer(carousel: Carousel, imageUrls: string[]): Promise<void> {
  if (!BUFFER_TOKEN || imageUrls.length === 0) return

  const caption = carousel.caption + '\n\n' + carousel.hashtags.map(h => `#${h}`).join(' ')

  // Post to LinkedIn (carousel as document or image series)
  const LI_CHANNEL = '69c7fcc3af47dacb6964c08e'
  await fetch('https://api.bufferapp.com/1/updates/create.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      access_token: BUFFER_TOKEN,
      profile_ids: LI_CHANNEL,
      text: caption,
      shorten: 'false',
    }),
  }).catch(() => {})
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function runCarouselPipeline(
  channel: 'resumechiefz' | 'cardchiefz' = 'resumechiefz',
  topic?: string
): Promise<void> {
  // Pick fresh viral topic
  let finalTopic = topic
  if (!finalTopic) {
    try {
      const { pickFreshTopic } = await import('./content-intel')
      finalTopic = await pickFreshTopic(channel, 'instagram')
    } catch {
      finalTopic = channel === 'resumechiefz'
        ? '5 resume mistakes costing you interviews right now'
        : '3 undervalued card categories before the next spike'
    }
  }

  await slack(`🖼️ *Carousel Pipeline Starting — ${channel}*\nTopic: "${finalTopic}"`, 'echo')

  // Generate copy
  const carousel = await generateCarouselCopy(channel, finalTopic)
  if (!carousel.slides.length) {
    await slack(`❌ Carousel copy generation failed for "${finalTopic}"`, 'echo')
    return
  }

  // Generate slide images in parallel (max 7)
  const slides = carousel.slides.slice(0, 7)
  const imageUrls = await Promise.all(
    slides.map(slide => generateSlideImage(slide.visualPrompt))
  )

  // Save draft to Supabase
  const { data: draft } = await supabaseAdmin.from('ai_memories').insert({
    category: 'carousel_draft',
    content: carousel.topic,
    context: JSON.stringify({
      channel,
      status: 'pending',
      carousel,
      slides: slides.map((s, i) => ({ ...s, imageUrl: imageUrls[i] })),
      caption: carousel.caption,
      hashtags: carousel.hashtags,
    }),
    importance: 7,
    created_at: new Date().toISOString(),
  }).select('id').single()

  const draftId = draft?.id ?? ''
  const reviewUrl = `http://localhost:3001/review/instagram/${draftId}`
  const mobileUrl = `https://jarvis-os-dusky.vercel.app/review/instagram/${draftId}`

  // Slack preview with first slide image
  const firstImage = imageUrls.find(Boolean)
  await slackWithTs(`🖼️ *Carousel Ready — ${channel === 'resumechiefz' ? 'ResumeChiefz' : 'Card Chiefz'}*

*"${carousel.hook}"*
${slides.length} slides generated

Review: ${reviewUrl}
Mobile: ${mobileUrl}

React ✅ to post | ❌ to discard
_Draft ID: ${draftId}_`, 'echo')
}
