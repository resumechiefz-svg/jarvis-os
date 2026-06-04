/**
 * RC Analytics — pulls YouTube performance data and feeds back to content-intel
 * Runs weekly to teach the system what actually works on your channels
 */
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'
import { getAuthenticatedClient } from '@/lib/google/auth'
import { google } from 'googleapis'

const YT_KEY = process.env.GOOGLE_IMAGEN_API_KEY // same project, YouTube Data API
const RC_CHANNEL = process.env.YOUTUBE_RC_CHANNEL_ID ?? 'UC47aph3rOjY7HE32idpSY1w'
const CC_CHANNEL = process.env.YOUTUBE_CC_CHANNEL_ID ?? 'UCZRepn5lq3Eoteu9pIYMxdA'

async function getChannelVideoStats(channelId: string): Promise<Array<{
  title: string; views: number; watchTime: number; ctr: number; likes: number; published: string
}>> {
  try {
    // Get recent videos
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=25&order=date&type=video&key=${YT_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    )
    const searchData = await searchRes.json() as {
      items?: Array<{ id: { videoId: string }; snippet: { title: string; publishedAt: string } }>
    }
    if (!searchData.items?.length) return []

    const videoIds = searchData.items.map(v => v.id.videoId).join(',')
    const titles = Object.fromEntries(searchData.items.map(v => [v.id.videoId, { title: v.snippet.title, published: v.snippet.publishedAt }]))

    // Get stats for all videos
    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${YT_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    )
    const statsData = await statsRes.json() as {
      items?: Array<{ id: string; statistics: { viewCount?: string; likeCount?: string } }>
    }

    return (statsData.items ?? []).map(v => ({
      title: titles[v.id]?.title ?? '',
      published: titles[v.id]?.published ?? '',
      views: parseInt(v.statistics.viewCount ?? '0'),
      likes: parseInt(v.statistics.likeCount ?? '0'),
      watchTime: 0, // Requires YouTube Analytics API OAuth
      ctr: 0,
    })).filter(v => v.title)
  } catch { return [] }
}

export async function GET() {
  try {
    const [rcStats, ccStats] = await Promise.all([
      getChannelVideoStats(RC_CHANNEL),
      getChannelVideoStats(CC_CHANNEL),
    ])

    // Store performance data in Supabase
    for (const video of rcStats) {
      await supabaseAdmin.from('ai_memories').upsert({
        category: 'youtube_performance_rc',
        content: video.title,
        context: JSON.stringify({ ...video, channel: 'resumechiefz', syncedAt: new Date().toISOString() }),
        importance: 6,
        created_at: new Date().toISOString(),
      }, { onConflict: 'content' }).throwOnError().catch(() => {})
    }

    for (const video of ccStats) {
      await supabaseAdmin.from('ai_memories').upsert({
        category: 'youtube_performance_cc',
        content: video.title,
        context: JSON.stringify({ ...video, channel: 'cardchiefz', syncedAt: new Date().toISOString() }),
        importance: 6,
        created_at: new Date().toISOString(),
      }, { onConflict: 'content' }).throwOnError().catch(() => {})
    }

    // Identify top performers (top 25% by views) and store as style reference
    const topRC = rcStats.sort((a, b) => b.views - a.views).slice(0, Math.ceil(rcStats.length * 0.25))
    const topCC = ccStats.sort((a, b) => b.views - a.views).slice(0, Math.ceil(ccStats.length * 0.25))

    if (topRC.length > 0) {
      await supabaseAdmin.from('ai_memories').upsert({
        category: 'top_performers_rc',
        content: 'top_performers_rc',
        context: JSON.stringify({ videos: topRC, updatedAt: new Date().toISOString() }),
        importance: 8,
        created_at: new Date().toISOString(),
      }, { onConflict: 'content' }).throwOnError().catch(() => {})
    }

    const { slack } = await import('@/lib/slack')
    await slack(`📊 *YouTube Analytics Synced*
RC: ${rcStats.length} videos tracked, top performer: "${topRC[0]?.title ?? 'none'}" (${topRC[0]?.views ?? 0} views)
CC: ${ccStats.length} videos tracked, top performer: "${topCC[0]?.title ?? 'none'}" (${topCC[0]?.views ?? 0} views)
Content-intel updated — next videos will be optimized based on what works.`)

    return NextResponse.json({ ok: true, rc: rcStats.length, cc: ccStats.length, topRC: topRC.slice(0, 3), topCC: topCC.slice(0, 3) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
