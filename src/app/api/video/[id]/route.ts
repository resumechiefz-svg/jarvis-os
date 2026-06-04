/**
 * Video file server — streams the final assembled MP4 to the review screen
 * Supports range requests so the browser video player can seek
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'
import * as fs from 'fs'
import * as path from 'path'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Look up video path from Supabase
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('id', id)
    .single()

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ctx = JSON.parse(data.context ?? '{}')
  const videoPath: string = ctx.videoPath ?? ctx.outputPath ?? ''

  if (!videoPath || !fs.existsSync(videoPath)) {
    return NextResponse.json({ error: 'Video file not found', path: videoPath }, { status: 404 })
  }

  const stat = fs.statSync(videoPath)
  const fileSize = stat.size
  const range = req.headers.get('range')

  if (range) {
    // Partial content for seeking
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunkSize = end - start + 1

    const stream = fs.createReadStream(videoPath, { start, end })
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', chunk => controller.enqueue(chunk))
        stream.on('end', () => controller.close())
        stream.on('error', err => controller.error(err))
      },
    })

    return new Response(webStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': 'video/mp4',
      },
    })
  }

  // Full file
  const stream = fs.createReadStream(videoPath)
  const webStream = new ReadableStream({
    start(controller) {
      stream.on('data', chunk => controller.enqueue(chunk))
      stream.on('end', () => controller.close())
      stream.on('error', err => controller.error(err))
    },
  })

  return new Response(webStream, {
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    },
  })
}
