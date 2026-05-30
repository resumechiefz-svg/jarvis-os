/**
 * RC Trial Conversion Engine
 * Monitors new RC customers and fires Day-3 personalized emails
 * Echo writes the email, AB approves in Slack, Resend delivers it
 */

import Anthropic from '@anthropic-ai/sdk'
import Stripe from 'stripe'
import { ECHO_SYSTEM } from './prompts'
import { supabaseAdmin } from '../supabase/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface TrialUser {
  email: string
  name: string
  signupDate: Date
  daysSinceSignup: number
  resumesCreated: number
  lastActive?: Date
}

async function getDay3Users(): Promise<TrialUser[]> {
  if (!process.env.STRIPE_SECRET_KEY) return []

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const threeDaysAgo = Math.floor((Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000)
  const fourDaysAgo = Math.floor((Date.now() - 4 * 24 * 60 * 60 * 1000) / 1000)

  // Get customers who signed up 3 days ago (Day-3 window)
  const customers = await stripe.customers.list({
    created: { gte: fourDaysAgo, lte: threeDaysAgo },
    limit: 50,
  })

  const users: TrialUser[] = []

  for (const customer of customers.data) {
    if (!customer.email) continue

    // Check if they've already converted (have active subscription or payment)
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 1 })
    if (subs.data.length > 0) continue // Already paying — skip

    // Check if we already sent them a Day-3 email
    const { data: alreadySent } = await supabaseAdmin
      .from('ai_memories')
      .select('id')
      .eq('category', 'conversion_email_sent')
      .eq('context', customer.email)
      .limit(1)

    if (alreadySent?.length) continue // Already emailed — skip

    // Get their Supabase activity
    let resumesCreated = 0
    let lastActive: Date | undefined

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, created_at')
      .eq('email', customer.email)
      .single()

    if (profile) {
      const { count } = await supabaseAdmin
        .from('resumes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)

      resumesCreated = count ?? 0
    }

    users.push({
      email: customer.email,
      name: customer.name ?? customer.email.split('@')[0],
      signupDate: new Date(customer.created * 1000),
      daysSinceSignup: 3,
      resumesCreated,
      lastActive,
    })
  }

  return users
}

async function draftConversionEmail(user: TrialUser): Promise<{ subject: string; html: string; preview: string }> {
  const prompt = `Write a Day-3 conversion email for a ResumeChiefz trial user.

User context:
- Name: ${user.name}
- Signed up: 3 days ago
- Resumes created: ${user.resumesCreated}
- Status: Free trial, not yet paying

Email goals:
- Feel like it's from a real recruiter who cares, not a marketing bot
- Address the most common Day-3 objection: "I'll come back to this later"
- Share one recruiter insight they can actually use TODAY
- Soft CTA to complete their resume or upgrade — never pushy
- Subject line that gets opened (not "Don't forget about ResumeChiefz")

Brand voice: Expert, direct, warm. Written by a 10-year recruiter. No fluff.
Length: 150-200 words max. Mobile-first.

Return ONLY valid JSON:
{
  "subject": "email subject line",
  "preview": "2-sentence preview of what the email says (for AB's Slack approval)",
  "html": "full email HTML body"
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: ECHO_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in conversion email response')
  return JSON.parse(jsonMatch[0])
}

async function postToSlackForApproval(user: TrialUser, email: { subject: string; preview: string }): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return

  const text = `📧 *ECHO — RC Day-3 Conversion Email Ready*

*To:* ${user.email} (${user.name})
*Signed up:* 3 days ago | Resumes created: ${user.resumesCreated}
*Subject:* ${email.subject}

*Preview:* ${email.preview}

Reply *SEND ${user.email}* to deliver, or *SKIP ${user.email}* to pass.`

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#echo', text }),
  })
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[Conversion] Would send to ${to}: ${subject}`)
    return
  }

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Anthony at ResumeChiefz <anthony@resumechiefz.com>',
      to: [to],
      subject,
      html,
    }),
  })

  // Mark as sent in memory
  await supabaseAdmin.from('ai_memories').insert({
    category: 'conversion_email_sent',
    content: `Day-3 email sent to ${to}: ${subject}`,
    context: to,
    importance: 6,
    created_at: new Date().toISOString(),
  })
}

export async function runConversionCheck(): Promise<{ usersFound: number; emailsDrafted: number }> {
  const users = await getDay3Users()

  let drafted = 0
  for (const user of users) {
    try {
      const email = await draftConversionEmail(user)
      await postToSlackForApproval(user, email)

      // Store draft in memory for when AB approves
      await supabaseAdmin.from('ai_memories').insert({
        category: 'conversion_email_draft',
        content: JSON.stringify({ to: user.email, subject: email.subject, html: email.html }),
        context: user.email,
        importance: 7,
        created_at: new Date().toISOString(),
      })

      drafted++
    } catch (err) {
      console.error(`[Conversion] Failed for ${user.email}:`, err)
    }
  }

  return { usersFound: users.length, emailsDrafted: drafted }
}

// Called when AB replies SEND [email] in Slack
export async function sendApprovedEmail(toEmail: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content')
    .eq('category', 'conversion_email_draft')
    .eq('context', toEmail)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!data?.[0]) return false

  try {
    const draft = JSON.parse(data[0].content)
    await sendEmail(draft.to, draft.subject, draft.html)
    return true
  } catch {
    return false
  }
}
