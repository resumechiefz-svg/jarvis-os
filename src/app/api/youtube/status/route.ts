import { NextResponse } from 'next/server'
import { getPendingVideos } from '@/lib/agents/youtube-pipeline'
export async function GET() {
  const videos = await getPendingVideos()
  return NextResponse.json({ videos: videos.map(v => ({ id: v.id, title: v.title, status: v.status, youtubeId: v.youtubeId })) })
}
