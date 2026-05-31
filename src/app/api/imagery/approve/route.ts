/**
 * LUMEN Approval Handler
 * GET /api/imagery/approve?id=xxx&action=approve|reject|post
 *
 * Called from Slack links (or browser)
 * action=approve  → mark approved, image saved, notify Slack
 * action=reject   → mark rejected, notify Slack
 * action=post     → approve + push to Buffer queue
 */
import { NextRequest, NextResponse } from 'next/server'
import { getJob, setJobStatus, postImageToBuffer } from '@/lib/agents/lumen'

async function notifySlack(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#imagery', text }),
  }).catch(() => {})
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const action = searchParams.get('action') as 'approve' | 'reject' | 'post' | null
  const caption = searchParams.get('caption')

  if (!id || !action) {
    return NextResponse.json({ error: 'Missing id or action' }, { status: 400 })
  }

  const job = getJob(id)
  if (!job) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;background:#000;color:#fff;padding:40px;text-align:center">
        <h2>Job not found: ${id}</h2>
        <p style="color:#666">This job may have expired from memory. Check Supabase.</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  if (action === 'reject') {
    setJobStatus(id, 'rejected')
    await notifySlack(`❌ *LUMEN — Image Rejected*\nJob: ${id}\nBrief: "${job.request.brief}"`)
    return new NextResponse(
      `<html><body style="font-family:sans-serif;background:#000;color:#ff4455;padding:40px;text-align:center">
        <h1>❌ Rejected</h1>
        <p style="color:#888">"${job.request.brief}"</p>
        <p style="color:#666;margin-top:20px">Image discarded. You can request a new one via Jarvis.</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  if (action === 'approve') {
    setJobStatus(id, 'approved', { approvedAt: new Date().toISOString() })
    await notifySlack(
      `✅ *LUMEN — Image Approved*\n` +
      `Brief: "${job.request.brief}"\n` +
      `Brand: ${job.request.brand} | Platform: ${job.request.platform}\n` +
      `URL: \`${job.imageUrl}\`\n\n` +
      `To post to Buffer: ${process.env.NEXT_PUBLIC_APP_URL}/api/imagery/approve?id=${id}&action=post`
    )
    return new NextResponse(
      `<html><body style="font-family:sans-serif;background:#000;color:#00ff88;padding:40px;text-align:center">
        <h1>✅ Approved</h1>
        <p style="color:#888">"${job.request.brief}"</p>
        <p style="color:#666;margin-top:20px">Image saved at <code style="color:#00d4ff">${job.imageUrl}</code></p>
        <p style="margin-top:20px">
          <a href="/api/imagery/approve?id=${id}&action=post" style="background:#F5C518;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700">
            📤 Post to Buffer →
          </a>
        </p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  if (action === 'post') {
    setJobStatus(id, 'approved', { approvedAt: new Date().toISOString() })
    const bufferId = await postImageToBuffer(job, caption ?? undefined)

    if (bufferId) {
      setJobStatus(id, 'posted', { bufferPostId: bufferId })
      await notifySlack(
        `📤 *LUMEN — Posted to Buffer*\n` +
        `Brief: "${job.request.brief}"\n` +
        `Brand: ${job.request.brand} | Platform: ${job.request.platform}\n` +
        `Buffer post ID: \`${bufferId}\``
      )
      return new NextResponse(
        `<html><body style="font-family:sans-serif;background:#000;color:#00ff88;padding:40px;text-align:center">
          <h1>📤 Posted to Buffer</h1>
          <p style="color:#888">"${job.request.brief}" queued for ${job.request.platform}</p>
          <p style="color:#444;margin-top:12px">Buffer ID: ${bufferId}</p>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      )
    } else {
      // No Buffer token — just approve and show the image
      setJobStatus(id, 'approved', { approvedAt: new Date().toISOString() })
      await notifySlack(
        `✅ *LUMEN — Image Approved (Buffer not configured)*\n` +
        `Brief: "${job.request.brief}"\n` +
        `URL: \`${job.imageUrl}\`\n` +
        `Add BUFFER_ACCESS_TOKEN + BUFFER_CARDCHIEFZ_CHANNEL etc. to .env.local to enable auto-posting.`
      )
      return new NextResponse(
        `<html><body style="font-family:sans-serif;background:#000;color:#F5C518;padding:40px;text-align:center">
          <h1>✅ Approved</h1>
          <p style="color:#888">Buffer not configured — image saved locally.</p>
          <p style="color:#666;margin-top:12px">Add BUFFER_ACCESS_TOKEN to .env.local to enable auto-posting.</p>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      )
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
