/**
 * Competitor Intelligence Dashboard — weekly structured report
 * Tracks ResumeChiefz competitors: pricing, features, positioning changes
 * ATLAS analyzes and surfaces what actually matters — not a data dump
 *
 * Weekly run (Monday 7am) posts to #jarvis:
 * - Pricing changes detected
 * - New features launched
 * - Positioning shifts
 * - Opportunities RC should act on
 * - Card market trends for Card Chiefz
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN

async function slack(text: string) {
  if (!TOKEN) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#jarvis', text }),
  })
}

const RC_COMPETITORS = [
  { name: 'Kickresume',  url: 'https://kickresume.com/en/pricing/', checkFor: 'price points, free tier limits, AI features' },
  { name: 'Zety',        url: 'https://zety.com/pricing',           checkFor: 'price points, subscription tiers, features' },
  { name: 'Resume.io',   url: 'https://resume.io/pricing',          checkFor: 'price points, plan names, AI features' },
  { name: 'Enhancv',     url: 'https://enhancv.com/pricing/',       checkFor: 'price points, positioning, AI writing' },
  { name: 'Teal',        url: 'https://www.tealhq.com/pricing',     checkFor: 'free vs paid, job search tools, AI resume' },
]

interface CompetitorSnapshot {
  name: string
  url: string
  scrapedAt: string
  rawText: string
  pricePoints: string[]
  keyFeatures: string[]
  positioning: string
}

interface IntelReport {
  weekOf: string
  competitors: CompetitorSnapshot[]
  changes: string[]       // What changed vs last week
  opportunities: string[] // What RC should do based on what we see
  threats: string[]       // Moves that could hurt RC
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await res.text()
    // Strip tags, keep text
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 3000)
  } catch {
    return ''
  }
}

async function analyzeCompetitor(comp: typeof RC_COMPETITORS[0]): Promise<CompetitorSnapshot> {
  const rawText = await fetchPageText(comp.url)

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Analyze this competitor pricing/feature page and extract structured data.

Competitor: ${comp.name}
Focus: ${comp.checkFor}
Page content: "${rawText.slice(0, 2000)}"

Extract:
- pricePoints: list of prices mentioned (e.g. "$4.99/mo", "$14.99/mo annual")
- keyFeatures: top 3-5 features they advertise
- positioning: their main value proposition in 1 sentence

Return JSON: {"pricePoints": [], "keyFeatures": [], "positioning": ""}`,
    }],
  })

  let parsed = { pricePoints: [] as string[], keyFeatures: [] as string[], positioning: '' }
  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    if (match) parsed = JSON.parse(match[0])
  } catch { /* use empty */ }

  return {
    name: comp.name,
    url: comp.url,
    scrapedAt: new Date().toISOString(),
    rawText: rawText.slice(0, 500),
    pricePoints: parsed.pricePoints,
    keyFeatures: parsed.keyFeatures,
    positioning: parsed.positioning,
  }
}

async function getLastReport(): Promise<IntelReport | null> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'competitor_intel')
    .order('created_at', { ascending: false })
    .limit(1)

  if (!data?.[0]) return null
  try { return JSON.parse(data[0].context) as IntelReport } catch { return null }
}

export async function runCompetitorIntel(): Promise<void> {
  await slack('🔍 *ATLAS — Running weekly competitor scan...*')

  // Scrape all competitors in parallel
  const snapshots = await Promise.all(RC_COMPETITORS.map(analyzeCompetitor))
  const lastReport = await getLastReport()

  // ATLAS analyzes changes and surfaces actionable intel
  const lastSummary = lastReport
    ? `Last week's data:\n${lastReport.competitors.map(c => `${c.name}: ${c.pricePoints.join(', ')} | ${c.positioning}`).join('\n')}`
    : 'No previous data — this is the first scan.'

  const currentSummary = snapshots
    .map(c => `${c.name}: Prices: ${c.pricePoints.join(', ') || 'not found'} | Features: ${c.keyFeatures.join(', ')} | Position: ${c.positioning}`)
    .join('\n')

  const analysisMsg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are ATLAS analyzing competitive intelligence for ResumeChiefz ($7.99/mo AI resume builder).

CURRENT WEEK:
${currentSummary}

${lastSummary}

ResumeChiefz context: $7.99/mo flat, AI resume builder, ATS optimization, built by a real recruiter.

Analyze and return:
1. Changes: what changed vs last week (pricing moves, new features, positioning shifts). If no prior data, note their current state.
2. Opportunities: 2-3 specific things RC should do based on what competitors are doing (or not doing)
3. Threats: any moves that could hurt RC's market position

Be specific and actionable. Not vague — tell us exactly what to do.

Return JSON: {
  "changes": ["..."],
  "opportunities": ["..."],
  "threats": ["..."],
  "headline": "one sentence summary of the week's competitive landscape"
}`,
    }],
  })

  let analysis = { changes: [] as string[], opportunities: [] as string[], threats: [] as string[], headline: '' }
  try {
    const text = analysisMsg.content[0].type === 'text' ? analysisMsg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    if (match) analysis = JSON.parse(match[0])
  } catch { /* use empty */ }

  const report: IntelReport = {
    weekOf: new Date().toISOString().split('T')[0],
    competitors: snapshots,
    changes: analysis.changes,
    opportunities: analysis.opportunities,
    threats: analysis.threats,
  }

  // Save report
  await supabaseAdmin.from('ai_memories').insert({
    category: 'competitor_intel',
    content: report.weekOf,
    context: JSON.stringify(report),
    importance: 8,
    created_at: new Date().toISOString(),
  })

  // Format Slack digest
  const competitorTable = snapshots
    .map(c => `*${c.name}:* ${c.pricePoints.length ? c.pricePoints.join(' / ') : '—'}\n  _${c.positioning || 'No positioning data'}_`)
    .join('\n')

  await slack(`📊 *Competitor Intel — Week of ${report.weekOf}*
${analysis.headline ? `\n_${analysis.headline}_` : ''}

*Current Landscape:*
${competitorTable}

${analysis.changes.length ? `*What Changed:*\n${analysis.changes.map(c => `• ${c}`).join('\n')}` : ''}

${analysis.opportunities.length ? `*RC Should:*\n${analysis.opportunities.map(o => `→ ${o}`).join('\n')}` : ''}

${analysis.threats.length ? `*Watch Out For:*\n${analysis.threats.map(t => `⚠️ ${t}`).join('\n')}` : ''}`)
}
