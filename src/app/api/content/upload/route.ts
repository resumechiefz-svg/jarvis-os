/**
 * Content Upload Pipeline
 * User dumps their own video/photos → Jarvis generates a full week of content
 *
 * Input: video file, images, or URLs to existing content
 * Output: reel cut, carousel, LinkedIn post, tweet thread, Pinterest pin, YouTube Short
 *         — all in their voice, their brand, their face
 *         — scheduled across the week automatically via Buffer
 *
 * This is the product differentiator:
 * Record once → publish everywhere → forever
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'
import { slack } from '@/lib/slack'
import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const REPLICATE_KEY = process.env.REPLICATE_API_TOKEN

interface ContentPlan {
  topic: string
  keyInsights: string[]
  hook: string
  formats: {
    reel: { script: string; duration: string; caption: string }
    carousel: { slides: Array<{ headline: string; body: string }>; caption: string }
    linkedin: { post: string }
    twitter: { thread: string[] }
    pinterest: { title: string; description: string }
    youtubeShort: { title: string; script: string; description: string }
  }
  hashtags: string[]
  schedulingPlan: Array<{ platform: string; format: string; day: string; time: string }>
}

// ── Analyze uploaded content with Claude Vision ───────────────────────────────
async function analyzeContent(
  fileType: 'video' | 'image' | 'url',
  content: string,  // base64 or URL
  businessContext: string
): Promise<{ topic: string; keyPoints: string[]; tone: string; visualStyle: string }> {
  // For video: extract first frame as thumbnail for analysis
  // For images: analyze directly
  // For URL: fetch and analyze

  const analysisMsg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: fileType === 'image' && content.startsWith('data:')
        ? [
            {
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: 'image/jpeg', data: content.replace(/^data:[^;]+;base64,/, '') },
            },
            {
              type: 'text' as const,
              text: `Business context: ${businessContext}\n\nAnalyze this content. Return JSON:\n{"topic": "main topic", "keyPoints": ["point1", "point2", "point3"], "tone": "casual/professional/educational/entertaining", "visualStyle": "description of visual approach"}`,
            },
          ]
        : [{
            type: 'text' as const,
            text: `Business context: ${businessContext}\n\nContent description/URL: ${content}\n\nAnalyze what this content is about. Return JSON:\n{"topic": "main topic", "keyPoints": ["point1", "point2", "point3"], "tone": "casual/professional/educational/entertaining", "visualStyle": "description of visual approach"}`,
          }],
    }],
  })

  try {
    const text = analysisMsg.content[0].type === 'text' ? analysisMsg.content[0].text : '{}'
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return { topic: 'Business insights', keyPoints: [], tone: 'professional', visualStyle: 'clean, minimal' }
  }
}

// ── Generate full week content plan ─────────────────────────────────────────
async function generateContentPlan(
  analysis: { topic: string; keyPoints: string[]; tone: string; visualStyle: string },
  businessContext: string,
  brandVoice: string
): Promise<ContentPlan> {
  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `You are a world-class social media strategist creating a complete week of content from ONE piece of source material.

BUSINESS: ${businessContext}
BRAND VOICE: ${brandVoice}
SOURCE TOPIC: ${analysis.topic}
KEY INSIGHTS: ${analysis.keyPoints.join(', ')}
TONE: ${analysis.tone}

Generate a complete content plan that repurposes this single source into maximum reach across platforms.
Every piece must feel native to that platform — not copy-pasted.
Every piece must provide genuine value — not just promotion.

Return JSON:
{
  "topic": "refined topic title",
  "keyInsights": ["3-5 core insights from the source"],
  "hook": "the single most attention-grabbing line",
  "formats": {
    "reel": {
      "script": "30-60 second spoken script for Instagram/TikTok reel. Hook in first 3 seconds.",
      "duration": "30s or 60s",
      "caption": "caption with hook + value + CTA, max 150 chars + hashtags"
    },
    "carousel": {
      "slides": [
        {"headline": "Slide 1 hook — stops scroll, under 8 words", "body": "1-2 supporting lines"},
        {"headline": "Slide 2", "body": "..."},
        {"headline": "Slide 3", "body": "..."},
        {"headline": "Slide 4", "body": "..."},
        {"headline": "Slide 5", "body": "..."},
        {"headline": "Slide 6 — CTA slide", "body": "single action"}
      ],
      "caption": "LinkedIn/Instagram caption, conversational, under 200 chars"
    },
    "linkedin": {
      "post": "LinkedIn post. Conversational, insight-driven, 150-300 words. Not promotional. Ends with a question to drive comments."
    },
    "twitter": {
      "thread": ["Tweet 1 — hook that stops the scroll", "Tweet 2", "Tweet 3", "Tweet 4", "Tweet 5 — summary + CTA"]
    },
    "pinterest": {
      "title": "Pinterest pin title — searchable, benefit-driven",
      "description": "Pinterest description, 100 words, keyword-rich, evergreen"
    },
    "youtubeShort": {
      "title": "YouTube Short title — keyword-first, under 60 chars",
      "script": "55-second script. Hook in first 3 seconds. Value in middle. CTA at end.",
      "description": "Short description for YouTube, 80 words"
    }
  },
  "hashtags": ["10 relevant hashtags without #"],
  "schedulingPlan": [
    {"platform": "Instagram", "format": "reel", "day": "Monday", "time": "9am"},
    {"platform": "LinkedIn", "format": "carousel", "day": "Tuesday", "time": "8am"},
    {"platform": "Twitter", "format": "thread", "day": "Wednesday", "time": "10am"},
    {"platform": "Pinterest", "format": "pin", "day": "Thursday", "time": "2pm"},
    {"platform": "YouTube", "format": "short", "day": "Friday", "time": "12pm"},
    {"platform": "LinkedIn", "format": "post", "day": "Sunday", "time": "7pm"}
  ]
}`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    return JSON.parse(text.slice(start, end + 1)) as ContentPlan
  } catch {
    return {
      topic: analysis.topic,
      keyInsights: analysis.keyPoints,
      hook: analysis.keyPoints[0] ?? '',
      formats: {
        reel: { script: '', duration: '30s', caption: '' },
        carousel: { slides: [], caption: '' },
        linkedin: { post: '' },
        twitter: { thread: [] },
        pinterest: { title: '', description: '' },
        youtubeShort: { title: '', script: '', description: '' },
      },
      hashtags: [],
      schedulingPlan: [],
    }
  }
}

// ── Generate carousel slide images ────────────────────────────────────────────
async function generateSlideImages(
  slides: Array<{ headline: string; body: string }>,
  brandColors: { primary: string; accent: string }
): Promise<string[]> {
  if (!REPLICATE_KEY) return []

  const urls: string[] = []
  for (const slide of slides.slice(0, 6)) {
    try {
      const prompt = `Clean minimal social media slide, ${brandColors.primary} background, bold white text "${slide.headline.slice(0, 40)}", gold accent line, modern professional design, 1:1 square format, no stock photos, typographic`
      const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${REPLICATE_KEY}`, 'Content-Type': 'application/json', Prefer: 'wait' },
        body: JSON.stringify({ input: { prompt, aspect_ratio: '1:1', output_format: 'jpg', output_quality: 90 } }),
        signal: AbortSignal.timeout(60000),
      })
      const data = await res.json() as { output?: string[] }
      urls.push(data.output?.[0] ?? '')
    } catch { urls.push('') }
  }
  return urls
}

// ── Main upload handler ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const url = formData.get('url') as string | null
    const businessId = formData.get('businessId') as string ?? 'resumechiefz'
    const brandVoice = formData.get('brandVoice') as string ?? 'Direct, helpful, expert'
    const businessContext = formData.get('businessContext') as string ?? 'Content creator'

    let contentData = ''
    let fileType: 'video' | 'image' | 'url' = 'url'

    if (file) {
      const buffer = await file.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      contentData = `data:${file.type};base64,${base64}`
      fileType = file.type.startsWith('video') ? 'video' : 'image'

      // Save file locally for video processing
      if (fileType === 'video') {
        const uploadDir = path.join(process.env.HOME ?? '/tmp', 'jarvis-uploads')
        fs.mkdirSync(uploadDir, { recursive: true })
        const fileName = `upload_${Date.now()}_${file.name}`
        fs.writeFileSync(path.join(uploadDir, fileName), Buffer.from(buffer))
        contentData = fileName // store filename reference
      }
    } else if (url) {
      contentData = url
      fileType = 'url'
    } else {
      return NextResponse.json({ error: 'Provide file or url' }, { status: 400 })
    }

    await slack(`📤 *Content Upload Received — ${businessId}*\nProcessing ${fileType}... generating full week content plan`, 'echo')

    // Analyze the content
    const analysis = await analyzeContent(fileType, contentData, businessContext)

    // Generate full content plan
    const plan = await generateContentPlan(analysis, businessContext, brandVoice)

    // Generate carousel slide images
    const slideImages = await generateSlideImages(
      plan.formats.carousel.slides,
      { primary: '#0a1628', accent: '#c9a84c' }
    )

    // Save to Supabase
    const { data: saved } = await supabaseAdmin.from('ai_memories').insert({
      category: 'content_upload_plan',
      content: plan.topic,
      context: JSON.stringify({
        businessId,
        plan,
        slideImages,
        sourceType: fileType,
        status: 'pending_review',
        createdAt: new Date().toISOString(),
      }),
      importance: 8,
      created_at: new Date().toISOString(),
    }).select('id').single()

    const planId = saved?.id ?? ''
    const reviewUrl = `http://localhost:3001/review/content-plan/${planId}`
    const mobileUrl = `https://jarvis-os-dusky.vercel.app/review/content-plan/${planId}`

    // Slack the full plan summary
    const platformCount = plan.schedulingPlan.length
    const formatList = Object.keys(plan.formats).join(', ')

    await slack(`✅ *Content Plan Ready — ${plan.topic}*

*Hook:* "${plan.hook}"

*Generated ${platformCount} posts across:* ${formatList}

*Scheduling:*
${plan.schedulingPlan.slice(0, 5).map(s => `• ${s.day} ${s.time} — ${s.platform} ${s.format}`).join('\n')}

Review all content: ${reviewUrl}
Mobile: ${mobileUrl}

React ✅ to schedule all | ❌ to discard | Reply to edit`, 'echo')

    return NextResponse.json({
      ok: true,
      planId,
      topic: plan.topic,
      formatsGenerated: Object.keys(plan.formats).length,
      postsScheduled: plan.schedulingPlan.length,
      reviewUrl,
    })
  } catch (err) {
    console.error('[Content Upload]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
