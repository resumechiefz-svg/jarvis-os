import { NextRequest, NextResponse } from 'next/server'
import { welcomeEmail, day3Email, paymentEmail, winbackEmail } from '@/lib/emails/templates'

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[Email] No Resend key — would send "${subject}" to ${to}`)
    return false
  }

  const res = await fetch('https://api.resend.com/emails', {
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

  return res.ok
}

export async function POST(req: NextRequest) {
  const { type, to, name, plan, amount, resetUrl, resumesCreated } = await req.json()

  if (!to || !type) return NextResponse.json({ error: 'to and type required' }, { status: 400 })

  let email: { subject: string; html: string }

  switch (type) {
    case 'welcome':
      email = welcomeEmail(name ?? to.split('@')[0])
      break
    case 'day3':
      email = day3Email(name ?? to.split('@')[0], resumesCreated ?? 0)
      break
    case 'payment':
      email = paymentEmail(name ?? to.split('@')[0], plan ?? 'Pro', amount ?? '$7.99')
      break
    case 'winback':
      email = winbackEmail(name ?? to.split('@')[0])
      break
    case 'password_reset':
      email = { subject: 'Reset your ResumeChiefz password', html: '' }
      if (resetUrl) {
        const { passwordResetEmail } = await import('@/lib/emails/templates')
        email = passwordResetEmail(resetUrl)
      }
      break
    default:
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
  }

  const sent = await send(to, email.subject, email.html)
  return NextResponse.json({ ok: sent, subject: email.subject })
}

// Preview endpoint — GET /api/email?type=welcome&name=Anthony
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? 'welcome'
  const name = req.nextUrl.searchParams.get('name') ?? 'Anthony'

  const templates: Record<string, { subject: string; html: string }> = {
    welcome: welcomeEmail(name),
    day3: day3Email(name, 2),
    payment: paymentEmail(name, 'Pro Monthly', '$7.99/mo'),
    winback: winbackEmail(name),
  }

  const email = templates[type] ?? templates.welcome

  // Return raw HTML for preview in browser
  return new Response(email.html, { headers: { 'Content-Type': 'text/html' } })
}
