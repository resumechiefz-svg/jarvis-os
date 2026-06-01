/**
 * Photo-to-Listing API
 * POST: { image: base64string, mimeType?: string, draftMode?: boolean }
 * GET:  posts the most recent draft to eBay
 */
import { NextRequest, NextResponse } from 'next/server'
import { photoToListing, postPendingDraft } from '@/lib/agents/photo-to-listing'

export async function POST(req: NextRequest) {
  const { image, mimeType, draftMode = true } = await req.json()
  if (!image) return NextResponse.json({ error: 'image (base64) required' }, { status: 400 })

  // Run async — vision takes a moment
  photoToListing(image, { draftMode, mimeType }).catch(console.error)
  return NextResponse.json({ ok: true, message: 'Processing — updates in #jarvis' })
}

export async function GET(req: NextRequest) {
  const draftId = new URL(req.url).searchParams.get('id') ?? undefined
  await postPendingDraft(draftId)
  return NextResponse.json({ ok: true })
}
