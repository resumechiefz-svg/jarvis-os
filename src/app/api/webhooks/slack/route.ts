/**
 * Slack Events Webhook — handles reaction_added events
 *
 * Setup in Slack app dashboard:
 *   Event Subscriptions → Request URL: https://your-domain.com/api/webhooks/slack
 *   Subscribe to bot events: reaction_added
 *
 * Reactions:
 *   ✅ (white_check_mark) on a blog draft → approve + publish + social post
 *   ❌ (x) on a blog draft → discard draft
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? ''

// Verify the request came from Slack
function verifySlack(req: NextRequest, body: string): boolean {
  const ts = req.headers.get('x-slack-request-timestamp') ?? ''
  const sig = req.headers.get('x-slack-signature') ?? ''
  if (!ts || !sig) return false

  // Reject requests older than 5 minutes
  if (Math.abs(Date.now() / 1000 - parseInt(ts)) > 300) return false

  const base = `v0:${ts}:${body}`
  const expected = 'v0=' + crypto.createHmac('sha256', SIGNING_SECRET).update(base).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}

// Extract draft ID from message text (last line: "_Draft ID: 1234_")
function extractDraftId(text: string): string | null {
  const match = text.match(/Draft ID:\s*(\d+)/i)
  return match ? match[1] : null
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const payload = JSON.parse(body) as {
    type: string
    challenge?: string
    event?: {
      type: string
      reaction: string
      item: { type: string; channel: string; ts: string }
      user: string
    }
  }

  // Slack URL verification challenge — respond immediately, no signature check needed
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge })
  }

  // Verify signature for all other events
  if (SIGNING_SECRET && !verifySlack(req, body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = payload.event
  if (!event || event.type !== 'reaction_added') {
    return NextResponse.json({ ok: true })
  }

  const reaction = event.reaction  // e.g. 'white_check_mark', 'x'
  const isApprove = reaction === 'white_check_mark'
  const isDiscard = reaction === 'x'

  if (!isApprove && !isDiscard) {
    return NextResponse.json({ ok: true })  // not a relevant reaction
  }

  // Fetch the original message to get the Draft ID
  const TOKEN = process.env.SLACK_BOT_TOKEN
  if (!TOKEN) return NextResponse.json({ ok: true })

  try {
    const histRes = await fetch(
      `https://slack.com/api/conversations.history?channel=${event.item.channel}&latest=${event.item.ts}&limit=1&inclusive=true`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    )
    const hist = await histRes.json() as { messages?: Array<{ text: string }> }
    const msgText = hist.messages?.[0]?.text ?? ''
    const draftId = extractDraftId(msgText)

    if (!draftId) return NextResponse.json({ ok: true })

    if (isApprove) {
      // Publish blog + post to socials
      const { approveBlogDraft } = await import('@/lib/agents/autoblog')
      const result = await approveBlogDraft(draftId)
      if (!result.ok) {
        const { slackNow } = await import('@/lib/slack')
        await slackNow(`⚠️ Failed to publish draft ${draftId}: ${result.error}`, 'echo')
      }
    } else if (isDiscard) {
      // Mark as discarded in Supabase
      const { supabaseAdmin } = await import('@/lib/supabase/client')
      await supabaseAdmin
        .from('ai_memories')
        .update({ category: 'blog_discarded' })
        .eq('id', draftId)
      const { slackNow } = await import('@/lib/slack')
      await slackNow(`🗑️ Draft ${draftId} discarded.`, 'echo')
    }
  } catch (err) {
    console.error('[Slack webhook]', err)
  }

  return NextResponse.json({ ok: true })
}
