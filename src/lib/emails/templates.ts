/**
 * RC Email Templates — Elite, editorial, human-designed
 * Font: Plus Jakarta Sans (matches resumechiefz.com exactly)
 * Colors: #0a1628 navy, #c9a84c gold
 * Voice: Anthony — 10-year recruiter, direct, warm, no fluff
 */

const FONT = `https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap`

const BASE = (content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${FONT}" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #060e1a; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: #c9a84c; }
    @media (max-width: 600px) {
      .wrapper { padding: 24px 20px !important; }
      .card { padding: 32px 24px !important; }
      .headline { font-size: 26px !important; }
    }
  </style>
</head>
<body>
  <div style="background:#060e1a; padding: 40px 24px;">
    <div style="max-width:580px; margin:0 auto;">

      <!-- Wordmark -->
      <div style="margin-bottom:32px;">
        <span style="font-size:15px; font-weight:800; letter-spacing:-.2px; color:#fff;">
          Resume<span style="color:#c9a84c;">Chiefz</span>
        </span>
      </div>

      ${content}

      <!-- Footer -->
      <div style="margin-top:40px; padding-top:24px; border-top:1px solid rgba(255,255,255,0.06);">
        <p style="font-size:12px; color:#3a4d66; line-height:1.7;">
          ResumeChiefz · Built by a 10-year recruiter<br/>
          <a href="https://resumechiefz.com" style="color:#3a4d66; text-decoration:none;">resumechiefz.com</a>
          &nbsp;·&nbsp;
          <a href="https://resumechiefz.com/unsubscribe" style="color:#3a4d66; text-decoration:none;">Unsubscribe</a>
        </p>
      </div>

    </div>
  </div>
</body>
</html>`

// ── 1. Welcome / Confirmation ──────────────────────────────────────────────────
export function welcomeEmail(name: string): { subject: string; html: string } {
  return {
    subject: `Your resume is about to get a lot better`,
    html: BASE(`
      <!-- Hero rule -->
      <div style="width:40px; height:3px; background:#c9a84c; margin-bottom:28px; border-radius:2px;"></div>

      <h1 class="headline" style="font-size:30px; font-weight:800; color:#ffffff; line-height:1.2; letter-spacing:-.5px; margin-bottom:20px;">
        Good to have you, ${name}.
      </h1>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:16px;">
        I spent 10 years on the other side of the hiring table. I've screened thousands of resumes — and I built ResumeChiefz because most resume tools are made by people who've never actually hired anyone.
      </p>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:32px;">
        This one is different. Let's build you something that actually gets callbacks.
      </p>

      <!-- CTA -->
      <a href="https://resumechiefz.com/app.html" style="display:inline-block; background:#c9a84c; color:#0a1628; font-size:14px; font-weight:700; padding:14px 28px; border-radius:8px; text-decoration:none; letter-spacing:.1px;">
        Build your resume →
      </a>

      <!-- Divider -->
      <div style="margin:40px 0; height:1px; background:rgba(255,255,255,0.06);"></div>

      <!-- Quick tips -->
      <p style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.15em; color:#c9a84c; margin-bottom:16px;">What to do first</p>

      ${[
        ['Start with your most recent job', 'Don\'t overthink the summary — fill in experience first, we\'ll sharpen everything after.'],
        ['Use numbers wherever you can', '"Increased sales by 34%" beats "responsible for sales" every single time.'],
        ['Let the AI clean it up', 'Once your experience is in, hit optimize. It rewrites your bullets to pass ATS and sound sharp.'],
      ].map(([title, desc]) => `
        <div style="display:flex; gap:14px; margin-bottom:20px; align-items:flex-start;">
          <div style="width:6px; height:6px; border-radius:50%; background:#c9a84c; margin-top:7px; flex-shrink:0;"></div>
          <div>
            <p style="font-size:14px; font-weight:700; color:#ffffff; margin-bottom:4px;">${title}</p>
            <p style="font-size:13px; color:#6b7f99; line-height:1.6;">${desc}</p>
          </div>
        </div>
      `).join('')}

      <!-- Signature -->
      <div style="margin-top:36px;">
        <p style="font-size:14px; color:#8a9bb0; margin-bottom:4px;">— Anthony</p>
        <p style="font-size:12px; color:#3a4d66;">Founder, ResumeChiefz · 10 years in recruiting</p>
      </div>
    `)
  }
}

// ── 2. Day-3 Conversion ────────────────────────────────────────────────────────
export function day3Email(name: string, resumesCreated: number): { subject: string; html: string } {
  const hasResume = resumesCreated > 0
  const subject = hasResume
    ? `${name}, your resume needs one more thing`
    : `Still thinking about it? Here's what I'd tell you.`

  return {
    subject,
    html: BASE(`
      <div style="width:40px; height:3px; background:#c9a84c; margin-bottom:28px; border-radius:2px;"></div>

      <h1 class="headline" style="font-size:28px; font-weight:800; color:#ffffff; line-height:1.25; letter-spacing:-.4px; margin-bottom:20px;">
        ${hasResume
          ? `You've started. Most people don't get this far.`
          : `The resume you keep meaning to fix.`}
      </h1>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:16px;">
        ${hasResume
          ? `You built ${resumesCreated > 1 ? `${resumesCreated} resumes` : 'a resume'} in ResumeChiefz. That's the hard part. The easy part is making sure it actually gets seen.`
          : `Here's something I see constantly as a recruiter: people spend months in a job they want to leave, but never quite get around to updating their resume.`}
      </p>

      <!-- Recruiter insight block -->
      <div style="background:rgba(201,168,76,0.06); border-left:3px solid #c9a84c; padding:20px 24px; margin:28px 0; border-radius:0 8px 8px 0;">
        <p style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:#c9a84c; margin-bottom:10px;">Recruiter reality check</p>
        <p style="font-size:14px; color:#c8d4e4; line-height:1.75;">
          ${hasResume
            ? `Resumes with quantified achievements get 40% more callbacks. If your bullets still say "responsible for" instead of "increased X by Y%", that's the fix. One hour of editing = months of better opportunities.`
            : `Most ATS systems reject 75% of resumes before a human ever sees them. The issue isn't your experience — it's formatting, keywords, and structure. That's exactly what ResumeChiefz fixes.`}
        </p>
      </div>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:32px;">
        ${hasResume
          ? `Your resume is almost there. Pro unlocks ATS scoring, unlimited versions, and the keyword optimizer that actually tells you what's missing for each job you apply to.`
          : `Your account is waiting. Takes 15 minutes to have a resume you're not embarrassed to send.`}
      </p>

      <a href="https://resumechiefz.com/app.html" style="display:inline-block; background:#c9a84c; color:#0a1628; font-size:14px; font-weight:700; padding:14px 28px; border-radius:8px; text-decoration:none;">
        ${hasResume ? 'Finish your resume →' : 'Build your resume →'}
      </a>

      <p style="font-size:13px; color:#3a4d66; margin-top:16px;">
        Pro is $7.99/month. Less than one Uber ride. Cancel anytime.
      </p>

      <div style="margin-top:36px;">
        <p style="font-size:14px; color:#8a9bb0; margin-bottom:4px;">— Anthony</p>
        <p style="font-size:12px; color:#3a4d66;">Founder, ResumeChiefz</p>
      </div>
    `)
  }
}

// ── 3. Payment Confirmation ────────────────────────────────────────────────────
export function paymentEmail(name: string, plan: string, amount: string): { subject: string; html: string } {
  return {
    subject: `You're in — welcome to ResumeChiefz Pro`,
    html: BASE(`
      <!-- Gold accent -->
      <div style="width:40px; height:3px; background:#c9a84c; margin-bottom:28px; border-radius:2px;"></div>

      <h1 class="headline" style="font-size:28px; font-weight:800; color:#ffffff; line-height:1.2; letter-spacing:-.4px; margin-bottom:20px;">
        You're now on Pro.
      </h1>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:32px;">
        ${name}, your payment went through. Everything's unlocked — ATS scoring, unlimited resumes, the keyword optimizer, and priority support.
      </p>

      <!-- Receipt block -->
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:24px; margin-bottom:32px;">
        <p style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.15em; color:#3a4d66; margin-bottom:16px;">Payment receipt</p>
        ${[
          ['Plan', plan],
          ['Amount', amount],
          ['Status', '✓ Paid'],
          ['Access', 'Immediate'],
        ].map(([label, value]) => `
          <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="font-size:13px; color:#6b7f99;">${label}</span>
            <span style="font-size:13px; font-weight:600; color:${value === '✓ Paid' ? '#4ade80' : '#fff'};">${value}</span>
          </div>
        `).join('')}
      </div>

      <a href="https://resumechiefz.com/app.html" style="display:inline-block; background:#c9a84c; color:#0a1628; font-size:14px; font-weight:700; padding:14px 28px; border-radius:8px; text-decoration:none;">
        Open ResumeChiefz →
      </a>

      <div style="margin-top:36px;">
        <p style="font-size:13px; color:#6b7f99; line-height:1.7;">
          Questions? Reply to this email. I read every one.<br/>
        </p>
        <p style="font-size:14px; color:#8a9bb0; margin-top:16px;">— Anthony</p>
      </div>
    `)
  }
}

// ── 4. Win-back (churned user) ─────────────────────────────────────────────────
export function winbackEmail(name: string): { subject: string; html: string } {
  return {
    subject: `Still job searching, ${name}?`,
    html: BASE(`
      <div style="width:40px; height:3px; background:#c9a84c; margin-bottom:28px; border-radius:2px;"></div>

      <h1 class="headline" style="font-size:28px; font-weight:800; color:#ffffff; line-height:1.25; letter-spacing:-.4px; margin-bottom:20px;">
        The market's moved. Your resume should too.
      </h1>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:16px;">
        It's been a while since you were on ResumeChiefz. I don't do guilt-trip emails — but I do know the job market in 2026 is different than it was even 6 months ago.
      </p>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:28px;">
        ATS systems are pickier. Keywords matter more. And the resumes that get callbacks are the ones that look like they were built for 2026, not 2023.
      </p>

      <!-- What's new block -->
      <div style="margin-bottom:32px;">
        <p style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.15em; color:#c9a84c; margin-bottom:16px;">What's been added since you left</p>
        ${[
          'ATS keyword gap analyzer — tells you exactly what\'s missing',
          'Job description matcher — paste any JD, get a tailored resume',
          'LinkedIn import — pull your profile in one click',
        ].map(item => `
          <div style="display:flex; gap:12px; margin-bottom:14px; align-items:flex-start;">
            <div style="width:5px; height:5px; border-radius:50%; background:#c9a84c; margin-top:8px; flex-shrink:0;"></div>
            <p style="font-size:14px; color:#c8d4e4; line-height:1.6;">${item}</p>
          </div>
        `).join('')}
      </div>

      <a href="https://resumechiefz.com/app.html" style="display:inline-block; background:#c9a84c; color:#0a1628; font-size:14px; font-weight:700; padding:14px 28px; border-radius:8px; text-decoration:none;">
        Come back and build →
      </a>

      <p style="font-size:13px; color:#3a4d66; margin-top:14px;">No pressure. Your data's still there if you want it.</p>

      <div style="margin-top:36px;">
        <p style="font-size:14px; color:#8a9bb0; margin-bottom:4px;">— Anthony</p>
        <p style="font-size:12px; color:#3a4d66;">Founder, ResumeChiefz</p>
      </div>
    `)
  }
}

// ── 5. Password Reset ──────────────────────────────────────────────────────────
export function passwordResetEmail(resetUrl: string): { subject: string; html: string } {
  return {
    subject: `Reset your ResumeChiefz password`,
    html: BASE(`
      <div style="width:40px; height:3px; background:#c9a84c; margin-bottom:28px; border-radius:2px;"></div>

      <h1 style="font-size:26px; font-weight:800; color:#ffffff; line-height:1.2; letter-spacing:-.4px; margin-bottom:16px;">
        Password reset
      </h1>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:28px;">
        Someone requested a password reset for your ResumeChiefz account. If that was you, use the button below. If it wasn't, you can safely ignore this email.
      </p>

      <a href="${resetUrl}" style="display:inline-block; background:#c9a84c; color:#0a1628; font-size:14px; font-weight:700; padding:14px 28px; border-radius:8px; text-decoration:none;">
        Reset my password →
      </a>

      <p style="font-size:13px; color:#3a4d66; margin-top:20px;">
        This link expires in 1 hour. After that, you'll need to request a new one.
      </p>
    `)
  }
}

// ── 6. Weekly tip / newsletter ─────────────────────────────────────────────────
export function weeklyTipEmail(tip: { headline: string; body: string; insight: string; ctaText: string }): { subject: string; html: string } {
  return {
    subject: tip.headline,
    html: BASE(`
      <div style="width:40px; height:3px; background:#c9a84c; margin-bottom:28px; border-radius:2px;"></div>

      <p style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.18em; color:#c9a84c; margin-bottom:16px;">This week from ResumeChiefz</p>

      <h1 class="headline" style="font-size:28px; font-weight:800; color:#ffffff; line-height:1.25; letter-spacing:-.4px; margin-bottom:20px;">
        ${tip.headline}
      </h1>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:28px;">${tip.body}</p>

      <!-- Recruiter insight -->
      <div style="background:rgba(201,168,76,0.06); border-left:3px solid #c9a84c; padding:20px 24px; margin:0 0 32px; border-radius:0 8px 8px 0;">
        <p style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:#c9a84c; margin-bottom:10px;">From the recruiting desk</p>
        <p style="font-size:14px; color:#c8d4e4; line-height:1.75;">${tip.insight}</p>
      </div>

      <a href="https://resumechiefz.com/app.html" style="display:inline-block; background:#c9a84c; color:#0a1628; font-size:14px; font-weight:700; padding:14px 28px; border-radius:8px; text-decoration:none;">
        ${tip.ctaText} →
      </a>

      <div style="margin-top:36px;">
        <p style="font-size:14px; color:#8a9bb0; margin-bottom:4px;">— Anthony</p>
        <p style="font-size:12px; color:#3a4d66;">Founder, ResumeChiefz</p>
      </div>
    `)
  }
}

// ── 7. Feature update / product news ──────────────────────────────────────────
export function featureUpdateEmail(update: { feature: string; headline: string; description: string; howToUse: string[] }): { subject: string; html: string } {
  return {
    subject: `New in ResumeChiefz: ${update.feature}`,
    html: BASE(`
      <div style="width:40px; height:3px; background:#c9a84c; margin-bottom:28px; border-radius:2px;"></div>

      <p style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.18em; color:#c9a84c; margin-bottom:16px;">Product update</p>

      <h1 class="headline" style="font-size:28px; font-weight:800; color:#ffffff; line-height:1.25; letter-spacing:-.4px; margin-bottom:20px;">
        ${update.headline}
      </h1>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:32px;">${update.description}</p>

      <!-- How to use -->
      <div style="margin-bottom:32px;">
        <p style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.15em; color:#c9a84c; margin-bottom:16px;">How to use it</p>
        ${update.howToUse.map((step, i) => `
          <div style="display:flex; gap:16px; margin-bottom:16px; align-items:flex-start;">
            <div style="width:22px; height:22px; border-radius:50%; background:rgba(201,168,76,0.15); border:1px solid rgba(201,168,76,0.3); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:11px; font-weight:700; color:#c9a84c; text-align:center; line-height:22px;">
              ${i + 1}
            </div>
            <p style="font-size:14px; color:#c8d4e4; line-height:1.6; margin-top:2px;">${step}</p>
          </div>
        `).join('')}
      </div>

      <a href="https://resumechiefz.com/app.html" style="display:inline-block; background:#c9a84c; color:#0a1628; font-size:14px; font-weight:700; padding:14px 28px; border-radius:8px; text-decoration:none;">
        Try it now →
      </a>

      <div style="margin-top:36px;">
        <p style="font-size:14px; color:#8a9bb0; margin-bottom:4px;">— Anthony</p>
        <p style="font-size:12px; color:#3a4d66;">Founder, ResumeChiefz</p>
      </div>
    `)
  }
}

// ── 8. Market news / job market update ────────────────────────────────────────
export function marketNewsEmail(news: { headline: string; context: string; whatItMeans: string; tip: string }): { subject: string; html: string } {
  return {
    subject: news.headline,
    html: BASE(`
      <div style="width:40px; height:3px; background:#c9a84c; margin-bottom:28px; border-radius:2px;"></div>

      <p style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.18em; color:#c9a84c; margin-bottom:16px;">Job market update</p>

      <h1 class="headline" style="font-size:28px; font-weight:800; color:#ffffff; line-height:1.25; letter-spacing:-.4px; margin-bottom:20px;">
        ${news.headline}
      </h1>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:28px;">${news.context}</p>

      <!-- What it means -->
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:24px; margin-bottom:28px;">
        <p style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:#3a4d66; margin-bottom:12px;">What this means for your job search</p>
        <p style="font-size:14px; color:#c8d4e4; line-height:1.75;">${news.whatItMeans}</p>
      </div>

      <!-- Recruiter tip -->
      <div style="background:rgba(201,168,76,0.06); border-left:3px solid #c9a84c; padding:20px 24px; margin-bottom:32px; border-radius:0 8px 8px 0;">
        <p style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:#c9a84c; margin-bottom:10px;">Recruiter's take</p>
        <p style="font-size:14px; color:#c8d4e4; line-height:1.75;">${news.tip}</p>
      </div>

      <a href="https://resumechiefz.com/app.html" style="display:inline-block; background:#c9a84c; color:#0a1628; font-size:14px; font-weight:700; padding:14px 28px; border-radius:8px; text-decoration:none;">
        Update your resume →
      </a>

      <div style="margin-top:36px;">
        <p style="font-size:14px; color:#8a9bb0; margin-bottom:4px;">— Anthony</p>
        <p style="font-size:12px; color:#3a4d66;">Founder, ResumeChiefz · 10 years in recruiting</p>
      </div>
    `)
  }
}

// ── 9. Trial expiring soon ─────────────────────────────────────────────────────
export function trialExpiringEmail(name: string, daysLeft: number): { subject: string; html: string } {
  return {
    subject: `Your ResumeChiefz access expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
    html: BASE(`
      <div style="width:40px; height:3px; background:#c9a84c; margin-bottom:28px; border-radius:2px;"></div>

      <h1 class="headline" style="font-size:28px; font-weight:800; color:#ffffff; line-height:1.25; letter-spacing:-.4px; margin-bottom:20px;">
        ${daysLeft === 1 ? 'Last chance, ' : `${daysLeft} days left, `}${name}.
      </h1>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:16px;">
        Your ResumeChiefz access expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. After that, you lose access to your resume builder, ATS scoring, and any resumes you've saved.
      </p>

      <p style="font-size:15px; color:#8a9bb0; line-height:1.8; margin-bottom:32px;">
        Pro is $7.99/month. If you're actively job searching, that's a no-brainer — one callback from a better resume pays for months of access.
      </p>

      <a href="https://resumechiefz.com/app.html" style="display:inline-block; background:#c9a84c; color:#0a1628; font-size:14px; font-weight:700; padding:14px 28px; border-radius:8px; text-decoration:none;">
        Keep my access →
      </a>

      <p style="font-size:13px; color:#3a4d66; margin-top:16px;">Cancel anytime. No contracts.</p>

      <div style="margin-top:36px;">
        <p style="font-size:14px; color:#8a9bb0; margin-bottom:4px;">— Anthony</p>
        <p style="font-size:12px; color:#3a4d66;">Founder, ResumeChiefz</p>
      </div>
    `)
  }
}
