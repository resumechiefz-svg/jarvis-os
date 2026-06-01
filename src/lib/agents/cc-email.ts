import { slack } from '../slack'
/**
 * Card Chiefz Email List — audience you own, not eBay's
 * Collectors subscribe at cardchiefz.com
 * REEL sends weekly card market updates via Resend
 * Algorithm-proof revenue channel
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const RESEND_KEY = process.env.RESEND_API_KEY
const TOKEN = process.env.SLACK_BOT_TOKEN


async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Card Chiefz <cards@cardchiefz.com>',
      reply_to: 'cardchiefz@gmail.com',
      to: [to],
      subject,
      html,
    }),
  }).catch(console.error)
}

// Subscribe a new collector
export async function subscribeToCCList(email: string, name?: string, source?: string): Promise<void> {
  // Check if already subscribed
  const { data: existing } = await supabaseAdmin
    .from('ai_memories')
    .select('id')
    .eq('category', 'cc_subscriber')
    .eq('content', email)
    .single()

  if (existing) return

  await supabaseAdmin.from('ai_memories').insert({
    category: 'cc_subscriber',
    content: email,
    context: JSON.stringify({ email, name: name ?? '', source: source ?? 'website', subscribedAt: new Date().toISOString(), active: true }),
    importance: 7,
    created_at: new Date().toISOString(),
  })

  // Welcome email
  const firstName = name?.split(' ')[0] ?? 'there'
  await sendEmail(email, 'Welcome to Card Chiefz Market Updates', `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222">
      <h2 style="color:#1a1a2e">Welcome to the hobby, ${firstName}.</h2>
      <p>You're in. Every week I send out what's actually moving in the card market — what to buy, what to hold, what to skip.</p>
      <p>No fluff. Just what I'm seeing from running Card Chiefz with 1,400+ sales.</p>
      <p>First update drops this week. In the meantime, check out what's in the store:</p>
      <a href="https://cardchiefz.com" style="background:#1a1a2e;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">Browse Cards →</a>
      <p style="color:#888;font-size:12px;margin-top:32px">Card Chiefz • <a href="https://cardchiefz.com/unsubscribe">Unsubscribe</a></p>
    </div>
  `)

  await slack(`🃏 *New CC subscriber* — ${email}${name ? ` (${name})` : ''}${source ? ` via ${source}` : ''}`)
}

// Generate and send weekly market update
export async function sendWeeklyMarketUpdate(): Promise<void> {
  // Get all active subscribers
  const { data: subscribers } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context')
    .eq('category', 'cc_subscriber')

  const active = (subscribers ?? []).filter(s => {
    try { return JSON.parse(s.context ?? '{}').active !== false } catch { return true }
  })

  if (active.length === 0) {
    await slack('📧 CC Email: No subscribers yet.')
    return
  }

  // Get recent card market data for context
  const { data: psa } = await supabaseAdmin
    .from('ai_memories').select('content, context').eq('category', 'psa_pop').order('created_at', { ascending: false }).limit(3)
  const { data: sales } = await supabaseAdmin
    .from('ai_memories').select('content').eq('category', 'ebay_sale').order('created_at', { ascending: false }).limit(10)

  // REEL writes the email in authentic collector voice
  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are REEL writing the weekly Card Chiefz email newsletter.

Voice: Authentic card collector. Been in the hobby for years. No corporate speak. Sounds like the most trusted person at the card show texting you what's moving.

Recent activity: ${(sales ?? []).map(s => s.content).join(', ')}
PSA pop data: ${(psa ?? []).map(p => p.content).join(', ')}
Week: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Write a weekly market update email. Include:
1. What's hot right now (specific players/sets with actual market reasoning)
2. What to watch this week (upcoming events, pack releases, pop report changes)
3. One undervalued card worth looking at
4. Quick tip or hobby insight

Rules:
- Under 300 words
- No fake stats — only what you'd actually know
- Conversational, not a newsletter
- End with something from the store (soft sell)

Return JSON: {"subject": "...", "body": "plain text with \\n for breaks"}`,
    }],
  })

  let subject = 'Card Market Update', body = ''
  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    const data = match ? JSON.parse(match[0]) : {}
    subject = data.subject ?? subject
    body = data.body ?? ''
  } catch { /* use defaults */ }

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;line-height:1.6">
      ${body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}
      <p style="margin-top:24px">
        <a href="https://cardchiefz.com" style="background:#1a1a2e;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">Browse the Store →</a>
      </p>
      <p style="color:#888;font-size:12px;margin-top:32px">Card Chiefz • <a href="https://cardchiefz.com/unsubscribe">Unsubscribe</a></p>
    </div>
  `

  let sent = 0
  for (const sub of active) {
    await sendEmail(sub.content, subject, html)
    sent++
    await new Promise(r => setTimeout(r, 200)) // Rate limit
  }

  await slack(`📧 *CC Weekly Email Sent*\nSubject: "${subject}"\n${sent} subscribers`)
}

export async function getSubscriberCount(): Promise<number> {
  const { count } = await supabaseAdmin
    .from('ai_memories')
    .select('*', { count: 'exact', head: true })
    .eq('category', 'cc_subscriber')
  return count ?? 0
}
