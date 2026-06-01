/**
 * RC Email Sequences — automated drip for new ResumeChiefz subscribers
 * Day 1, 3, 7, 14, 30 — written by Echo in AB's voice
 * Reduces churn in the critical first month
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const RESEND_KEY = process.env.RESEND_API_KEY

interface EmailTemplate {
  subject: string
  body: string
  day: number
}

const SEQUENCE_DAYS = [1, 3, 7, 14, 30]

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Anthony at ResumeChiefz <anthony@resumechiefz.com>',
      reply_to: 'resumechiefz@gmail.com',
      to: [to],
      subject,
      html,
    }),
  }).catch(console.error)
}

// Generate email for specific day in sequence
async function generateSequenceEmail(day: number, subscriberName: string): Promise<EmailTemplate> {
  const contexts: Record<number, string> = {
    1: 'Welcome and quick win — show them one thing they can do right now to improve their resume. Make it specific and actionable. They just signed up, they\'re excited.',
    3: 'Check in — most people build a resume and stare at it. Give them the #1 mistake recruiters see (task-based bullets vs achievement-based). Show them the fix with an example.',
    7: 'One week in — they either used it or forgot about it. If they forgot, re-engage. If they used it, push them to the next level: ATS optimization. Explain why keywords matter.',
    14: 'Two weeks — address the doubt. Some people wonder if any of this actually works. Share what makes RC different from generic builders. Be honest, not salesy.',
    30: 'One month — this is the conversion email. They\'ve had the tool for a month. If they haven\'t upgraded, this is the nudge. Don\'t be pushy — be real. Talk about what\'s possible when the resume isn\'t the blocker anymore.',
  }

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Write a ResumeChiefz email for day ${day} of the welcome sequence.

Subscriber name: ${subscriberName}
Tone: Written by Anthony (a real recruiter from Charlotte), direct, helpful, not salesy. Short paragraphs. Feels like a personal email, not a newsletter.
Goal: ${contexts[day]}

Rules:
- No "I hope this finds you well"
- No corporate language
- Under 200 words
- One clear takeaway
- Soft CTA only if appropriate
- Subject line that doesn't sound like marketing

Return JSON: {"subject": "...", "body": "plain text email body with \\n for line breaks"}`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    const data = match ? JSON.parse(match[0]) : {}
    return { subject: data.subject ?? `Day ${day}`, body: data.body ?? '', day }
  } catch {
    return { subject: `Quick tip from ResumeChiefz`, body: '', day }
  }
}

// Enroll new subscriber in sequence
export async function enrollInSequence(email: string, name: string, subscribedAt?: string): Promise<void> {
  const startDate = subscribedAt ? new Date(subscribedAt) : new Date()

  // Create sequence schedule
  const schedule = SEQUENCE_DAYS.map(day => ({
    day,
    sendAt: new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000).toISOString(),
    sent: false,
  }))

  await supabaseAdmin.from('ai_memories').upsert({
    category: 'email_sequence',
    content: email,
    context: JSON.stringify({ email, name, startDate: startDate.toISOString(), schedule }),
    importance: 7,
    created_at: new Date().toISOString(),
  })
}

// Run daily — send emails that are due
export async function runEmailSequences(): Promise<void> {
  const { data: subscribers } = await supabaseAdmin
    .from('ai_memories')
    .select('id, content, context')
    .eq('category', 'email_sequence')

  const now = new Date()
  let sent = 0

  for (const sub of subscribers ?? []) {
    try {
      const data = JSON.parse(sub.context ?? '{}')
      let updated = false

      for (const item of data.schedule ?? []) {
        if (item.sent) continue
        if (new Date(item.sendAt) > now) continue

        // Generate and send email
        const template = await generateSequenceEmail(item.day, data.name?.split(' ')[0] ?? 'there')
        const html = template.body.replace(/\n/g, '<br>')

        await sendEmail(data.email, template.subject, `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222">${html}<br><br>— Anthony<br><span style="color:#888;font-size:12px">ResumeChiefz • <a href="https://resumechiefz.com/unsubscribe">Unsubscribe</a></span></div>`)

        item.sent = true
        item.sentAt = now.toISOString()
        updated = true
        sent++
      }

      if (updated) {
        await supabaseAdmin.from('ai_memories').update({
          context: JSON.stringify(data),
        }).eq('id', sub.id)
      }
    } catch { /* skip */ }
  }

  if (sent > 0) {
    console.log(`[Email Sequences] Sent ${sent} emails`)
  }
}
