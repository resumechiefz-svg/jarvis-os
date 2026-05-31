/**
 * LUMEN — Image Intelligence Agent
 *
 * Pipeline:
 * 1. Receive context (platform, brand, content brief)
 * 2. Generate an elite master prompt via Claude Sonnet
 * 3. Call Google Imagen 3 API to generate the image
 * 4. Save to disk + Supabase
 * 5. Post to Slack #imagery with Approve / Reject buttons
 * 6. On approval → route to Buffer queue or save as site asset
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'
import { supabaseAdmin } from '../supabase/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Types ────────────────────────────────────────────────────────────────────

export type Brand = 'cardchiefz' | 'resumechiefz' | 'jarvis' | 'general'
export type Platform = 'instagram' | 'twitter' | 'facebook' | 'linkedin' | 'blog_header' | 'og_image' | 'general'
export type ImageStyle = 'photorealistic' | 'graphic' | 'minimal' | 'bold' | 'cinematic'

export interface ImageRequest {
  id: string
  brief: string           // What the image should convey
  brand: Brand
  platform: Platform
  style?: ImageStyle
  aspectRatio?: '1:1' | '16:9' | '4:5' | '9:16'
  requestedBy?: string    // 'jarvis' | 'user' | 'forge'
  relatedContent?: string // Blog post title, tweet text, etc.
}

export interface ImageJob {
  id: string
  request: ImageRequest
  masterPrompt: string
  status: 'prompting' | 'generating' | 'pending_approval' | 'approved' | 'rejected' | 'posted' | 'failed'
  imageUrl?: string       // Local path or hosted URL
  slackTs?: string        // Slack message timestamp for threading
  error?: string
  createdAt: string
  approvedAt?: string
  bufferPostId?: string
}

// In-memory job store (also persisted to Supabase)
const jobs = new Map<string, ImageJob>()

// ── Brand Profiles ────────────────────────────────────────────────────────────

const BRAND_PROFILES: Record<Brand, string> = {
  cardchiefz: `
Brand: Card Chiefz — Sports card and collectibles seller
Visual identity: Black (#000000) and yellow (#F5C518). Bold, clean, premium.
Target audience: Sports card collectors, investors, hobby enthusiasts ages 18-45
Visual tone: Sharp, confident, collector-culture energy. Like a premium streetwear brand meets hobby shop.
Aesthetic reference: Supreme x Panini. Dark backgrounds, bold typography, high-contrast.
Common subjects: Trading cards, graded slabs (PSA/BGS), player action shots, card packs, stadium energy`,

  resumechiefz: `
Brand: ResumeChiefz — AI-powered resume and career tools
Visual identity: Professional, modern, clean. Blues, whites, subtle gradients.
Target audience: Job seekers, career changers, recent graduates, professionals ages 22-45
Visual tone: Aspirational, polished, trustworthy. Like a top-tier career coach.
Common subjects: Professionals in offices, laptops, handshakes, career milestones, abstract data/network visuals`,

  jarvis: `
Brand: Jarvis AI OS — Personal AI command center and trading system
Visual identity: Deep navy/black, cyan (#00d4ff), tech-HUD aesthetic. Futuristic.
Target audience: Tech-savvy traders, entrepreneurs, builders
Visual tone: Cinematic sci-fi meets Wall Street. Tron + Bloomberg Terminal energy.
Common subjects: Data visualizations, trading charts, abstract AI/neural imagery, digital command interfaces`,

  general: `
Brand: AB Enterprises — General content
Visual identity: Flexible, modern, premium
Visual tone: Clean, professional, eye-catching
Produce high-quality, versatile content suitable for professional contexts`,
}

const PLATFORM_SPECS: Record<Platform, string> = {
  instagram: 'Square (1:1) or portrait (4:5). Bold, scroll-stopping. Large visual impact, minimal text overlay space. Instagram feed quality.',
  twitter: 'Landscape (16:9). Clear at small size. Sharp details. Works in dark mode.',
  facebook: 'Landscape (16:9) or square. Warm, engaging. Works across all age groups.',
  linkedin: 'Professional landscape (16:9). Clean, business-appropriate. High credibility.',
  blog_header: 'Wide landscape (16:9 or 2:1). Mood-setting, thematic. Space for title text overlay on left or center.',
  og_image: 'Landscape (1200x630px, 16:9). Clear branding. Readable as thumbnail.',
  general: 'Flexible. High quality. Professional.',
}

// ── Master Prompt Generator ───────────────────────────────────────────────────

const LUMEN_SYSTEM = `You are LUMEN, an elite AI art director and prompt engineer.
Your specialty is generating world-class image prompts for Google Imagen 3 that produce
stunning, professional, brand-aligned visuals.

You understand:
- Photography: lighting, composition, depth of field, color grading
- Design: typography, hierarchy, brand identity, white space
- Commercial photography standards: Getty, Shutterstock top-tier quality
- Platform-specific needs: what performs on Instagram vs LinkedIn

Your prompts follow this structure:
[SUBJECT] — what is the main focus
[SETTING/ENVIRONMENT] — where/context
[LIGHTING] — specific lighting setup (golden hour, studio 3-point, neon, etc.)
[CAMERA/LENS] — camera angle, lens style (85mm portrait, wide angle, macro, etc.)
[MOOD/ATMOSPHERE] — emotional tone and color palette
[STYLE] — photography style or artistic direction
[QUALITY TAGS] — technical quality descriptors

Always end with quality boosters appropriate for the brand.
Never produce NSFW, violent, or misleading content.
Return ONLY the image prompt text — no explanation, no preamble.`

export async function generateMasterPrompt(request: ImageRequest): Promise<string> {
  const brandProfile = BRAND_PROFILES[request.brand]
  const platformSpec = PLATFORM_SPECS[request.platform]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: [
      { type: 'text', text: LUMEN_SYSTEM, cache_control: { type: 'ephemeral' } }
    ] as Parameters<typeof anthropic.messages.create>[0]['system'],
    messages: [{
      role: 'user',
      content: `Generate an elite Google Imagen 3 prompt for this image request.

BRAND PROFILE:
${brandProfile}

PLATFORM: ${request.platform}
PLATFORM SPECS: ${platformSpec}

CONTENT BRIEF: ${request.brief}
${request.relatedContent ? `RELATED CONTENT: ${request.relatedContent}` : ''}
${request.style ? `STYLE DIRECTION: ${request.style}` : ''}

Produce a single, detailed image generation prompt. No markdown. No explanation. Just the prompt.`,
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
}

// ── Google Imagen 3 API ───────────────────────────────────────────────────────
// Uses imagen-3.0-generate-001 — Google's best image model (highest quality)
// Falls back to imagen-3.0-fast-generate-001 if quota exceeded
// Same API key as Google AI Studio (aistudio.google.com)

async function generateWithImagen(prompt: string, aspectRatio: string = '1:1'): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_IMAGEN_API_KEY ?? process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_IMAGEN_API_KEY not set — go to aistudio.google.com → Get API key')

  // Imagen 3 aspect ratios (native support)
  const validRatios: Record<string, string> = {
    '1:1': '1:1',
    '16:9': '16:9',
    '4:5': '4:5',
    '9:16': '9:16',
    '3:4': '3:4',
  }
  const ratio = validRatios[aspectRatio] ?? '1:1'

  // Try Imagen 3 (best quality) first, fall back to Imagen 3 Fast
  const models = [
    'imagen-3.0-generate-001',        // Flagship — highest quality, photorealistic
    'imagen-3.0-fast-generate-001',   // Fast variant — good quality, quicker
  ]

  let lastError = ''
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: ratio,
              safetyFilterLevel: 'block_only_high',   // Less restrictive for creative content
              personGeneration: 'allow_adult',         // Allow people in images
            },
          }),
        }
      )

      if (!res.ok) {
        lastError = `${model}: HTTP ${res.status} — ${await res.text()}`
        continue
      }

      const data = await res.json() as {
        predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>
      }

      const imageData = data?.predictions?.[0]?.bytesBase64Encoded
      if (!imageData) {
        lastError = `${model}: No image in response`
        continue
      }

      console.log(`[LUMEN] Generated with ${model}, ratio ${ratio}`)
      return Buffer.from(imageData, 'base64')

    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`
      continue
    }
  }

  throw new Error(`Imagen 3 failed: ${lastError}`)
}

// ── Slack Notifications ────────────────────────────────────────────────────────

async function postToSlackForApproval(job: ImageJob, imageBuffer: Buffer): Promise<string | undefined> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return undefined

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://jarvis-os.vercel.app'

  // First upload the image
  const formData = new FormData()
  formData.append('channels', '#imagery')
  formData.append('filename', `lumen-${job.id}.png`)
  formData.append('file', new Blob([imageBuffer as unknown as ArrayBuffer], { type: 'image/png' }))
  formData.append('initial_comment',
    `🎨 *LUMEN — Image Ready for Approval*\n` +
    `*Brief:* ${job.request.brief}\n` +
    `*Brand:* ${job.request.brand.toUpperCase()}  |  *Platform:* ${job.request.platform.toUpperCase()}\n\n` +
    `*Master Prompt:*\n\`\`\`${job.masterPrompt}\`\`\`\n\n` +
    `✅ *Approve:* ${baseUrl}/api/imagery/approve?id=${job.id}&action=approve\n` +
    `❌ *Reject:* ${baseUrl}/api/imagery/approve?id=${job.id}&action=reject\n` +
    `📤 *Approve + Post to Buffer:* ${baseUrl}/api/imagery/approve?id=${job.id}&action=post`
  )

  const res = await fetch('https://slack.com/api/files.upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  }).catch(() => null)

  const data = await res?.json() as { ts?: string } | null
  return data?.ts
}

// ── Save Image ────────────────────────────────────────────────────────────────

function saveImageLocally(jobId: string, buffer: Buffer, brand: Brand): string {
  const dir = `/Users/anthonyb23xx/jarvis-os/public/generated/${brand}`
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${jobId}.png`)
  fs.writeFileSync(filePath, buffer)
  return `/generated/${brand}/${jobId}.png` // Public URL path
}

async function saveToSupabase(job: ImageJob): Promise<void> {
  void supabaseAdmin.from('ai_memories').upsert({
    category: 'lumen_image',
    content: job.request.brief,
    context: JSON.stringify({
      id: job.id,
      brand: job.request.brand,
      platform: job.request.platform,
      status: job.status,
      imageUrl: job.imageUrl,
      masterPrompt: job.masterPrompt,
      createdAt: job.createdAt,
      approvedAt: job.approvedAt,
      bufferPostId: job.bufferPostId,
    }),
    importance: 7,
    created_at: job.createdAt,
  })
}

// ── Post to Buffer ─────────────────────────────────────────────────────────────

export async function postImageToBuffer(job: ImageJob, caption?: string): Promise<string | undefined> {
  // Buffer posting is handled via the Buffer MCP / API
  // For now we queue it and the user can post via Buffer dashboard
  // Full Buffer API integration is in the approval route

  const BUFFER_TOKEN = process.env.BUFFER_ACCESS_TOKEN
  if (!BUFFER_TOKEN) return undefined

  // Get channels for the brand
  const channelMap: Record<Brand, string> = {
    cardchiefz: process.env.BUFFER_CARDCHIEFZ_CHANNEL ?? '',
    resumechiefz: process.env.BUFFER_RESUMECHIEFZ_CHANNEL ?? '',
    jarvis: process.env.BUFFER_JARVIS_CHANNEL ?? '',
    general: process.env.BUFFER_GENERAL_CHANNEL ?? '',
  }

  const channelId = channelMap[job.request.brand]
  if (!channelId) return undefined

  const imageUrl = `${process.env.NEXT_PUBLIC_APP_URL}${job.imageUrl}`

  const res = await fetch('https://api.bufferapp.com/1/updates/create.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      access_token: BUFFER_TOKEN,
      profile_ids: channelId,
      text: caption ?? job.request.brief,
      media: JSON.stringify({ photo: imageUrl, thumbnail: imageUrl, alt_text: job.request.brief }),
    }),
  }).catch(() => null)

  const data = await res?.json() as { updates?: Array<{ id?: string }> } | null
  return data?.updates?.[0]?.id
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────

export async function startImageGeneration(request: Omit<ImageRequest, 'id'>): Promise<ImageJob> {
  const id = `img-${Date.now()}`
  const job: ImageJob = {
    id,
    request: { ...request, id },
    masterPrompt: '',
    status: 'prompting',
    createdAt: new Date().toISOString(),
  }

  jobs.set(id, job)
  await saveToSupabase(job)

  // Run async — don't block
  runPipeline(job).catch(async (err) => {
    job.status = 'failed'
    job.error = err instanceof Error ? err.message : 'Unknown error'
    await saveToSupabase(job)
    console.error(`[LUMEN] Job ${id} failed:`, job.error)
  })

  return job
}

async function runPipeline(job: ImageJob): Promise<void> {
  console.log(`[LUMEN] Starting pipeline for job ${job.id}: "${job.request.brief}"`)

  // Step 1: Generate master prompt
  job.masterPrompt = await generateMasterPrompt(job.request)
  job.status = 'generating'
  console.log(`[LUMEN] Master prompt generated: ${job.masterPrompt.slice(0, 100)}...`)

  // Step 2: Generate image
  const imageBuffer = await generateWithImagen(job.masterPrompt, job.request.aspectRatio ?? '1:1')
  job.imageUrl = saveImageLocally(job.id, imageBuffer, job.request.brand)
  job.status = 'pending_approval'
  await saveToSupabase(job)

  // Step 3: Send to Slack for approval
  job.slackTs = await postToSlackForApproval(job, imageBuffer)
  await saveToSupabase(job)

  console.log(`[LUMEN] Job ${job.id} pending approval — image at ${job.imageUrl}`)
}

// ── Job Management ─────────────────────────────────────────────────────────────

export function getJob(id: string): ImageJob | undefined {
  return jobs.get(id)
}

export function setJobStatus(id: string, status: ImageJob['status'], extra?: Partial<ImageJob>): void {
  const job = jobs.get(id)
  if (job) {
    Object.assign(job, { status, ...extra })
    void saveToSupabase(job)
  }
}

export async function getRecentJobs(limit = 20): Promise<ImageJob[]> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context, created_at')
    .eq('category', 'lumen_image')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map(d => {
    try {
      const ctx = JSON.parse(d.context ?? '{}')
      return {
        id: ctx.id,
        request: { id: ctx.id, brief: d.content, brand: ctx.brand, platform: ctx.platform },
        masterPrompt: ctx.masterPrompt ?? '',
        status: ctx.status,
        imageUrl: ctx.imageUrl,
        createdAt: d.created_at,
        approvedAt: ctx.approvedAt,
        bufferPostId: ctx.bufferPostId,
      } as ImageJob
    } catch { return null }
  }).filter(Boolean) as ImageJob[]
}
