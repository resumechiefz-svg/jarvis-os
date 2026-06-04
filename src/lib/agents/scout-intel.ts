/**
 * Scout Universal Lead Intelligence
 * Works for ANY business — ResumeChiefz, Card Chiefz, or any Jarvis customer
 *
 * Monitors engagement signals across all platforms:
 * - Blog: time-on-page, repeat visitors, email opens → clicks
 * - YouTube: comments, likes, subscribers who also visited site
 * - LinkedIn: post reactions, profile views after content
 * - Pinterest: saves, click-throughs
 * - Email: opens → site visits → app actions
 *
 * Identifies warm leads → drafts personalized outreach → Slack for approval
 * AB reacts ✅ → message sends. ❌ → discards. No spam ever.
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'
import { slack } from '../slack'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface Business {
  id: string
  name: string
  description: string
  product: string
  ctaUrl: string
  voice: string               // brand voice
  platforms: string[]
}

export interface LeadSignal {
  source: string             // 'blog' | 'youtube' | 'email' | 'linkedin' | 'pinterest'
  identifier: string         // email, username, or profile URL
  action: string             // what they did
  contentTitle: string       // what they engaged with
  timestamp: string
  score: number              // 1-10 warmth score
}

// ── Score lead warmth ─────────────────────────────────────────────────────────
function scoreSignal(action: string, source: string): number {
  const scores: Record<string, number> = {
    // High intent
    'started_trial': 10,
    'visited_pricing': 9,
    'visited_app_twice': 8,
    'email_click_to_app': 8,
    'youtube_comment': 7,
    'email_opened_3x': 7,
    // Medium intent
    'blog_5min_read': 6,
    'pinterest_save': 5,
    'linkedin_reaction': 5,
    'email_opened': 4,
    'youtube_like': 4,
    // Low intent
    'blog_visit': 2,
    'youtube_view': 2,
  }
  return scores[action] ?? 3
}

// ── Pull signals from Supabase (populated by webhooks/integrations) ────────────
async function getWarmLeads(businessId: string, minScore = 5): Promise<LeadSignal[]> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // last 48h

  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context, created_at')
    .eq('category', `lead_signal_${businessId}`)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50)

  const signals = (data ?? [])
    .map(r => {
      try { return JSON.parse(r.context) as LeadSignal } catch { return null }
    })
    .filter((s): s is LeadSignal => s !== null && s.score >= minScore)

  // Deduplicate by identifier — keep highest score per person
  const byId = new Map<string, LeadSignal>()
  for (const s of signals) {
    const existing = byId.get(s.identifier)
    if (!existing || s.score > existing.score) byId.set(s.identifier, s)
  }

  return Array.from(byId.values()).sort((a, b) => b.score - a.score)
}

// ── Generate personalized outreach message ────────────────────────────────────
async function draftOutreach(lead: LeadSignal, business: Business): Promise<string> {
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Draft a short, personal outreach message for a warm lead.

Business: ${business.name} — ${business.description}
Product/CTA: ${business.product} → ${business.ctaUrl}
Brand voice: ${business.voice}

Lead signal: They ${lead.action} on "${lead.contentTitle}" via ${lead.source}
Warmth score: ${lead.score}/10

Rules:
- Under 3 sentences total
- Reference what they engaged with specifically — don't be generic
- Helpful first, sell second (or not at all if score < 8)
- Sounds like a human DM, not a sales email
- End with one natural question or soft CTA
- Never say "I noticed you..." — too creepy. Say "Saw you..." or just reference it

Return ONLY the message text, nothing else.`,
    }],
  })
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
}

// ── Log a new lead signal (called by webhooks/integrations) ──────────────────
export async function logLeadSignal(
  businessId: string,
  signal: Omit<LeadSignal, 'score'>
): Promise<void> {
  const scored: LeadSignal = { ...signal, score: scoreSignal(signal.action, signal.source) }
  await supabaseAdmin.from('ai_memories').insert({
    category: `lead_signal_${businessId}`,
    content: signal.identifier,
    context: JSON.stringify(scored),
    importance: scored.score,
    created_at: new Date().toISOString(),
  })
}

// ── Main: scan signals → draft outreach → Slack for approval ─────────────────
export async function runLeadIntel(business: Business): Promise<void> {
  const leads = await getWarmLeads(business.id, 5)

  if (leads.length === 0) {
    return // No warm leads right now — silent
  }

  // Draft outreach for top 5 hottest leads
  const topLeads = leads.slice(0, 5)
  const drafts: Array<{ lead: LeadSignal; message: string }> = []

  for (const lead of topLeads) {
    const message = await draftOutreach(lead, business)
    if (message) drafts.push({ lead, message })
  }

  if (drafts.length === 0) return

  // Save drafts to Supabase
  const { data: draftRecord } = await supabaseAdmin.from('ai_memories').insert({
    category: `lead_outreach_draft_${business.id}`,
    content: business.name,
    context: JSON.stringify({ business, drafts, createdAt: new Date().toISOString() }),
    importance: 8,
    created_at: new Date().toISOString(),
  }).select('id').single()

  const draftId = draftRecord?.id ?? ''

  // Slack the drafts for approval
  const preview = drafts.slice(0, 3).map((d, i) =>
    `*Lead ${i + 1}* — ${d.lead.source} · Score ${d.lead.score}/10\n` +
    `Engaged with: "${d.lead.contentTitle.slice(0, 50)}"\n` +
    `_${d.message}_`
  ).join('\n\n─────────────────────\n\n')

  await slack(`🎯 *Scout — ${business.name} Warm Leads (${leads.length} in 48h)*

Top ${drafts.length} outreach drafts ready:

${preview}

React ✅ to send all | ❌ to discard
_Draft ID: ${draftId}_`, 'echo')
}

// ── Run for all configured businesses ────────────────────────────────────────
export async function runAllLeadIntel(): Promise<void> {
  // Load businesses from Supabase (set up during onboarding)
  const { data: businesses } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'business_profile')
    .order('created_at', { ascending: false })

  // Always run for AB's businesses
  const defaultBusinesses: Business[] = [
    {
      id: 'resumechiefz',
      name: 'ResumeChiefz',
      description: 'AI resume builder by a 10-year recruiter',
      product: 'Build a free ATS-proof resume in 90 seconds',
      ctaUrl: 'https://resumechiefz.com/app.html',
      voice: 'Direct, warm, recruiter-insider. Like advice from a trusted friend who works in HR.',
      platforms: ['blog', 'email', 'linkedin', 'pinterest'],
    },
    {
      id: 'cardchiefz',
      name: 'Card Chiefz',
      description: 'Premium sports card eBay store, 1,400+ sales',
      product: 'Shop our eBay store for undervalued cards',
      ctaUrl: 'https://www.ebay.com/str/cardchiefz',
      voice: 'Enthusiastic card collector. Community-native. Knows the hobby inside out.',
      platforms: ['youtube', 'pinterest'],
    },
  ]

  const allBusinesses = [
    ...defaultBusinesses,
    ...(businesses ?? []).map(b => {
      try { return JSON.parse(b.context) as Business } catch { return null }
    }).filter((b): b is Business => b !== null),
  ]

  await Promise.allSettled(allBusinesses.map(b => runLeadIntel(b)))
}
