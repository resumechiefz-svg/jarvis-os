/**
 * RC Trial Conversion Engine
 * Monitors Stripe for Day-3 non-converting users
 * Uses branded email templates — not generic AI output
 * AB approves in Slack → Resend delivers
 */

import Stripe from 'stripe'
import { day3Email } from '../emails/templates'
import { supabaseAdmin } from '../supabase/client'

interface TrialUser {
  email: string
  name: string
  resumesCreated: number
}

async function getDay3Users(): Promise<TrialUser[]> {
  if (!process.env.STRIPE_SECRET_KEY) return []

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const threeDaysAgo = Math.floor((Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000)
  const fourDaysAgo = Math.floor((Date.now() - 4 * 24 * 60 * 60 * 1000) / 1000)

  const customers = await stripe.customers.list({
    created: { gte: fourDaysAgo, lte: threeDaysAgo },
    limit: 50,
  })

  const users: TrialUser[] = []

  for (const customer of customers.data) {
    if (!customer.email) continue

    // Skip if already paying
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 1 })
    if (subs.data.length > 0) continue

    // Skip if already emailed
    const { data: alreadySent } = await supabaseAdmin
      .from('ai_memories')
      .select('id')
      .eq('category', 'conversion_email_sent')
      .eq('context', customer.email)
      .limit(1)

    if (alreadySent?.length) continue

    // Get resume count from Supabase
    let resumesCreated = 0
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
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
      resumesCreated,
    })
  }

  return users
}

async function postToSlackForApproval(user: TrialUser, subject: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return

  const hasResume = user.resumesCreated > 0
  const text = `📧 *ECHO — RC Day-3 Email Ready for Approval*

*To:* ${user.email} (${user.name})
*Resumes built:* ${user.resumesCreated}
*Subject:* ${subject}
*Angle:* ${hasResume ? 'They started — help them finish' : 'They haven\'t started — nudge them back'}

Preview: jarvis-os.vercel.app/api/email?type=day3&name=${encodeURIComponent(user.name)}

Reply *SEND ${user.email}* to deliver or *SKIP ${user.email}* to pass.`

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#echo', text }),
  }).catch(() => {})
}

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[Conversion] No Resend key — would send "${subject}" to ${to}`)
    return
  }

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Anthony at ResumeChiefz <anthony@resumechiefz.com>',
      reply_to: 'anthony@resumechiefz.com',
      to: [to],
      subject,
      html,
    }),
  })

  void supabaseAdmin.from('ai_memories').insert({
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
      const { subject, html } = day3Email(user.name, user.resumesCreated)

      // Store draft
      void supabaseAdmin.from('ai_memories').insert({
        category: 'conversion_email_draft',
        content: JSON.stringify({ to: user.email, subject, html }),
        context: user.email,
        importance: 7,
        created_at: new Date().toISOString(),
      })

      await postToSlackForApproval(user, subject)
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
    await sendViaResend(draft.to, draft.subject, draft.html)
    return true
  } catch {
    return false
  }
}
