/**
 * LUMEN Imagery API
 * POST /api/imagery — request a new image
 * GET  /api/imagery — list recent jobs + status
 */
import { NextRequest, NextResponse } from 'next/server'
import { startImageGeneration, getRecentJobs } from '@/lib/agents/lumen'
import type { Brand, Platform, ImageStyle } from '@/lib/agents/lumen'

export async function GET() {
  const jobs = await getRecentJobs(20)
  return NextResponse.json({ jobs })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    brief,
    brand = 'general',
    platform = 'instagram',
    style,
    aspectRatio,
    relatedContent,
    requestedBy = 'user',
  } = body as {
    brief: string
    brand: Brand
    platform: Platform
    style?: ImageStyle
    aspectRatio?: string
    relatedContent?: string
    requestedBy?: string
  }

  if (!brief?.trim()) {
    return NextResponse.json({ error: 'Describe what you want — brief is required' }, { status: 400 })
  }

  const job = await startImageGeneration({
    brief: brief.trim(),
    brand,
    platform,
    style,
    aspectRatio: (aspectRatio as '1:1' | '16:9' | '4:5' | '9:16') ?? '1:1',
    relatedContent,
    requestedBy,
  })

  return NextResponse.json({
    ok: true,
    id: job.id,
    message: `LUMEN is generating: "${brief}" for ${brand}/${platform}. Check #imagery in Slack to approve.`,
  })
}
