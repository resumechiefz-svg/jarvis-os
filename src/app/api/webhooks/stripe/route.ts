/**
 * Stripe Webhook Handler
 * Fires RC emails automatically on Stripe events
 * No more manual triggers — the funnel runs itself
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { welcomeEmail, paymentEmail, winbackEmail } from '@/lib/emails/templates'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Anthony at ResumeChiefz <onboarding@resend.dev>',
      reply_to: 'resumechiefz@gmail.com',
      to: [to],
      subject,
      html,
    }),
  }).catch(console.error)
}

async function notifySlack(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#echo', text }),
  }).catch(() => {})
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('[Stripe Webhook] signature failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  console.log(`[Stripe Webhook] ${event.type}`)

  try {
    switch (event.type) {

      // New customer signed up → welcome email
      case 'customer.created': {
        const customer = event.data.object as Stripe.Customer
        if (!customer.email) break

        const name = (customer.name ?? customer.email.split('@')[0]).split(' ')[0]
        const { subject, html } = welcomeEmail(name)
        await sendEmail(customer.email, subject, html)
        await notifySlack(`📧 *New RC signup* — ${customer.email}\nWelcome email sent automatically.`)
        break
      }

      // Payment succeeded → payment confirmation
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        if (!pi.receipt_email) break

        const customer = pi.customer
          ? await stripe.customers.retrieve(pi.customer as string).catch(() => null)
          : null

        const email = pi.receipt_email
        const name = ((customer as Stripe.Customer)?.name ?? email.split('@')[0]).split(' ')[0]
        const amount = `$${(pi.amount / 100).toFixed(2)}`

        const { subject, html } = paymentEmail(name, 'ResumeChiefz Pro', amount)
        await sendEmail(email, subject, html)
        await notifySlack(`💰 *RC Payment received* — ${email} paid ${amount}\nConfirmation email sent.`)
        // Log revenue to Google Sheets
        import('@/lib/google/sheets').then(({ logRevenue }) =>
          logRevenue('ResumeChiefz', pi.amount / 100, 'subscription', email).catch(() => {})
        ).catch(() => {})
        break
      }

      // Subscription canceled → schedule win-back (30 days)
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const customer = await stripe.customers.retrieve(sub.customer as string).catch(() => null)
        const cust = customer as Stripe.Customer
        if (!cust?.email) break

        const name = (cust.name ?? cust.email.split('@')[0]).split(' ')[0]
        await notifySlack(`⚠️ *RC Churn* — ${cust.email} canceled.\nWin-back email will fire in 30 days. Reply *WINBACK ${cust.email}* to send now.`)

        // Store for win-back later — monitor will pick it up
        const { supabaseAdmin } = await import('@/lib/supabase/client')
        void supabaseAdmin.from('ai_memories').insert({
          category: 'winback_scheduled',
          content: `Churned: ${cust.email} (${name})`,
          context: JSON.stringify({ email: cust.email, name, scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }),
          importance: 7,
          created_at: new Date().toISOString(),
        })
        break
      }

      // Invoice payment failed → alert AB + draft recovery email
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const email = invoice.customer_email
        if (!email) break
        await notifySlack(`🔴 *RC Payment Failed* — ${email}\nCard declined. Consider sending a recovery email: Reply *RECOVER ${email}*`)
        break
      }
    }
  } catch (err) {
    console.error('[Stripe Webhook] handler error:', err)
  }

  return NextResponse.json({ received: true })
}
