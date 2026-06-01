import { NextRequest, NextResponse } from 'next/server'
import { uploadToYouTube, getPendingVideos } from '@/lib/agents/youtube-pipeline'
import * as fs from 'fs'
import * as path from 'path'
export async function POST(req: NextRequest) {
  const { videoId } = await req.json()
  const videos = await getPendingVideos()
  const pkg = videos.find(v => v.id === videoId || v.status === 'assembled')
  if (!pkg) return NextResponse.json({ error: 'No assembled video found' }, { status: 404 })
  const url = await uploadToYouTube(pkg)
  return NextResponse.json({ ok: true, url })
}
