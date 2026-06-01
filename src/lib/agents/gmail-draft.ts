import { slack } from '../slack'
/**
 * Gmail Draft Agent — Jarvis drafts emails, AB approves via Slack, it sends
 * Uses Google Gmail API (already authenticated via anthonybowles23@gmail.com)
 */
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedClient } from '../google/auth'
import { google } from 'googleapis'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN


export async function draftEmail(opts: {
  to: string
  subject?: string
  context: string
  tone?: 'professional' | 'warm' | 'direct'
}): Promise<{ subject: string; body: string; draftId: string }> {

  // Generate email with Claude
  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Draft an email for AB (Anthony Bowles, entrepreneur in Charlotte NC).

To: ${opts.to}
Context: ${opts.context}
Tone: ${opts.tone ?? 'professional'} — AB sounds like a sharp, direct professional. No fluff.

Return JSON: {"subject": "...", "body": "full email text"}

Rules: No "I hope this email finds you well." No corporate filler. Direct, confident, gets to the point.`,
    }],
  })

  let subject = '', body = ''
  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const m = text.match(/\{[\s\S]*\}/)
    const d = m ? JSON.parse(m[0]) : {}
    subject = d.subject ?? 'Follow up'
    body = d.body ?? ''
  } catch { subject = 'Draft'; body = opts.context }

  // Save draft to Gmail
  const auth = await getAuthenticatedClient()
  let draftId = ''
  if (auth) {
    const gmail = google.gmail({ version: 'v1', auth })
    const raw = Buffer.from(
      `To: ${opts.to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')

    const draft = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw } },
    })
    draftId = draft.data.id ?? ''
  }

  // Save to Supabase
  await supabaseAdmin.from('ai_memories').insert({
    category: 'email_draft',
    content: subject,
    context: JSON.stringify({ to: opts.to, subject, body, draftId }),
    importance: 7,
    created_at: new Date().toISOString(),
  })

  // Post to Slack for approval
  await slack(`✉️ *Email Draft Ready*
*To:* ${opts.to}
*Subject:* ${subject}

${body.slice(0, 400)}${body.length > 400 ? '...' : ''}

_React ✅ to send, ✏️ to edit, ❌ to discard | Draft ID: ${draftId}_`)

  return { subject, body, draftId }
}

export async function sendDraft(draftId: string): Promise<void> {
  const auth = await getAuthenticatedClient()
  if (!auth) throw new Error('Google not connected')
  const gmail = google.gmail({ version: 'v1', auth })
  await gmail.users.drafts.send({ userId: 'me', requestBody: { id: draftId } })
  await slack(`✅ *Email sent* — Draft ${draftId}`)
}
