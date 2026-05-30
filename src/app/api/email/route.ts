import { NextRequest, NextResponse } from 'next/server'
import { welcomeEmail, day3Email, paymentEmail, winbackEmail, weeklyTipEmail, featureUpdateEmail, marketNewsEmail, trialExpiringEmail } from '@/lib/emails/templates'

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
      // Use verified Resend domain until resumechiefz.com is verified at resend.com/domains
      // Reply-to ensures replies go to Anthony directly
      from: 'Anthony at ResumeChiefz <onboarding@resend.dev>',
      reply_to: 'resumechiefz@gmail.com',
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
    weekly: weeklyTipEmail({
      headline: 'The one resume mistake that kills 80% of applications',
      body: 'I\'ve reviewed thousands of resumes as a recruiter. The single most common reason a qualified candidate doesn\'t get called back has nothing to do with their experience.',
      insight: 'ATS systems scan for exact keyword matches from the job description. If the posting says "project management" and your resume says "managing projects" — you\'re invisible. One word off and the system moves on.',
      ctaText: 'Fix my resume keywords',
    }),
    feature: featureUpdateEmail({
      feature: 'Job Description Matcher',
      headline: 'Paste any job posting. Get a tailored resume.',
      description: 'The new Job Description Matcher analyzes any job posting and rewrites your resume bullets to match — pulling the exact keywords, skills, and language recruiters are looking for.',
      howToUse: [
        'Open your resume in the builder',
        'Click "Match to Job" in the top toolbar',
        'Paste the job description and hit analyze',
        'Review the suggested changes and apply with one click',
      ],
    }),
    news: marketNewsEmail({
      headline: 'Tech layoffs are down 60% — what that means for your search',
      context: 'After 18 months of mass layoffs, the data is shifting. Hiring in software, product, and operations is up across mid-market companies. This changes the strategy.',
      whatItMeans: 'Competition for roles is still real, but the market is opening back up — especially at companies under 500 people who didn\'t over-hire in 2021. If you\'ve been waiting, now is the time to move.',
      tip: 'Update your resume now before the Q3 hiring push. Companies start filling roles in July and August for fall headcount. Most candidates wait until September. Don\'t be most candidates.',
    }),
    expiring: trialExpiringEmail(name, 2),
  }

  const email = templates[type] ?? templates.welcome

  // Return raw HTML for preview in browser
  return new Response(email.html, { headers: { 'Content-Type': 'text/html' } })
}
