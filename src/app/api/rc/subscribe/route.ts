/**
 * RC Email Capture — Blog lead magnet opt-in
 * Called from every ResumeChiefz blog post
 * Stores subscriber → sends ATS checklist (Day 1 email) immediately
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'

const RESEND_KEY = process.env.RESEND_API_KEY

async function sendAtsChecklist(name: string, email: string): Promise<void> {
  if (!RESEND_KEY) return

  const firstName = name.split(' ')[0] || name

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#060e1a;font-family:'Plus Jakarta Sans',-apple-system,sans-serif;">
<div style="background:#060e1a;padding:40px 24px;">
<div style="max-width:580px;margin:0 auto;">

  <div style="margin-bottom:28px;">
    <span style="font-size:15px;font-weight:800;color:#fff;">Resume<span style="color:#c9a84c;">Chiefz</span></span>
  </div>

  <div style="background:#0a1628;border:1px solid rgba(201,168,76,0.2);border-radius:12px;padding:40px 36px;">
    <p style="font-size:14px;color:#c9a84c;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:16px;">Your Free ATS Checklist</p>
    <h1 style="font-size:28px;font-weight:800;color:#fff;line-height:1.25;margin-bottom:16px;">10 things to fix before submitting your resume</h1>
    <p style="font-size:16px;color:rgba(255,255,255,0.65);line-height:1.7;margin-bottom:28px;">Hey ${firstName} — here's the exact checklist I use when reviewing resumes as a recruiter. These are the things that get resumes rejected before a human ever reads them.</p>

    <div style="border-left:3px solid #c9a84c;padding-left:20px;margin-bottom:28px;">
      ${[
        ['File format', 'Submit .docx or PDF — never .pages or Google Docs link'],
        ['File name', '"FirstName-LastName-Resume.pdf" — not "Resume_Final_v3_ACTUAL.pdf"'],
        ['No tables or text boxes', 'ATS systems can\'t read content inside tables or text boxes'],
        ['Standard section headers', '"Work Experience" not "Where I\'ve Been" — ATS is literal'],
        ['Keywords from the job posting', 'Copy exact phrases from the JD — ATS matches strings, not meaning'],
        ['No photos or graphics', 'Images break parsing — remove headshots, logos, charts'],
        ['Contact info at top, plain text', 'Name, phone, email, LinkedIn — no header/footer placement'],
        ['Dates formatted consistently', '"Jan 2023 – Mar 2025" everywhere — mixed formats confuse parsers'],
        ['One-inch margins, 10-12pt font', 'Calibri, Arial, or Garamond — no decorative fonts'],
        ['Achievement bullets, not task bullets', '"Grew revenue 34%" not "Responsible for revenue growth"'],
      ].map(([title, desc]) => `
        <div style="margin-bottom:16px;">
          <p style="font-size:14px;font-weight:700;color:#fff;margin-bottom:4px;">✓ ${title}</p>
          <p style="font-size:13px;color:rgba(255,255,255,0.55);line-height:1.6;margin:0;">${desc}</p>
        </div>`).join('')}
    </div>

    <p style="font-size:15px;color:rgba(255,255,255,0.65);line-height:1.7;margin-bottom:28px;">If your resume passes this checklist, it'll make it through 90% of ATS filters. The other 10% is keywords — and that's exactly what ResumeChiefz is built to handle.</p>

    <a href="https://resumechiefz.com/app.html" style="display:inline-block;background:#c9a84c;color:#0a1628;font-size:15px;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;">Build Your ATS-Proof Resume Free →</a>
  </div>

  <p style="font-size:13px;color:rgba(255,255,255,0.25);margin-top:28px;line-height:1.7;">
    Anthony · ResumeChiefz · Built by a 10-year recruiter<br/>
    <a href="https://resumechiefz.com" style="color:rgba(255,255,255,0.25);text-decoration:none;">resumechiefz.com</a>
    &nbsp;·&nbsp;
    <a href="https://resumechiefz.com/unsubscribe?email=${encodeURIComponent(email)}" style="color:rgba(255,255,255,0.25);text-decoration:none;">Unsubscribe</a>
  </p>
</div>
</div>
</body>
</html>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Anthony at ResumeChiefz <anthony@resumechiefz.com>',
      reply_to: 'resumechiefz@gmail.com',
      to: [email],
      subject: 'Your free ATS checklist (10 things to fix now)',
      html,
    }),
  }).catch(console.error)
}

export async function POST(req: NextRequest) {
  try {
    const { name, email, source } = await req.json() as { name: string; email: string; source?: string }

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    // Check if already subscribed
    const { data: existing } = await supabaseAdmin
      .from('ai_memories')
      .select('id')
      .eq('category', 'rc_subscriber')
      .eq('content', email.toLowerCase())
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, message: 'Already subscribed' })
    }

    // Save subscriber to Supabase
    await supabaseAdmin.from('ai_memories').insert({
      category: 'rc_subscriber',
      content: email.toLowerCase(),
      context: JSON.stringify({
        name,
        email: email.toLowerCase(),
        source: source ?? 'blog',
        subscribedAt: new Date().toISOString(),
        sequenceDay: 0,
        nextEmailDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // Day 3 in 3 days
      }),
      importance: 8,
      created_at: new Date().toISOString(),
    })

    // Send ATS checklist immediately (Day 1)
    await sendAtsChecklist(name, email)

    return NextResponse.json({ ok: true, message: 'Check your email!' })
  } catch (err) {
    console.error('[RC Subscribe]', err)
    return NextResponse.json({ error: 'Subscribe failed' }, { status: 500 })
  }
}
