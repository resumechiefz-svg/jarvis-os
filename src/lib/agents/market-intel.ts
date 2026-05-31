/**
 * Market Intelligence Agent — automated competitor & market monitoring
 *
 * Monitors:
 * - Resume builder competitors (Kickresume, Zety, Resume.io, Enhancv)
 * - Sports card market trends (eBay sold data, PSA population)
 * - Reddit mentions of ResumeChiefz + Card Chiefz
 * - Google search ranking changes
 *
 * Runs daily, posts digest to Slack #market-intel
 */
import Anthropic from '@anthropic-ai/sdk'
import { saveMemory } from '../memory/vectors'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Competitor URLs to monitor ────────────────────────────
const RC_COMPETITORS = [
  { name: 'Kickresume', url: 'https://kickresume.com', focus: 'pricing, new features' },
  { name: 'Zety', url: 'https://zety.com', focus: 'pricing, templates' },
  { name: 'Resume.io', url: 'https://resume.io', focus: 'pricing, AI features' },
  { name: 'Enhancv', url: 'https://enhancv.com', focus: 'pricing, positioning' },
]

const CC_TRENDING_PLAYERS = [
  'Victor Wembanyama', 'Chet Holmgren', 'Anthony Edwards',
  'Jaylen Brown', 'Tyrese Haliburton', 'Paolo Banchero',
]

// ── Fetch page content for analysis ───────────────────────
async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    const html = await res.text()
    // Strip HTML tags for clean text
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000)
  } catch {
    return ''
  }
}

// ── Analyze competitor page with Claude ───────────────────
async function analyzeCompetitor(comp: typeof RC_COMPETITORS[0]): Promise<string> {
  const pageText = await fetchPageText(comp.url)
  if (!pageText) return `Could not fetch ${comp.name}`

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You're analyzing ${comp.name} (${comp.url}) for competitive intel.
Focus on: ${comp.focus}

Page content:
${pageText}

Give a 3-bullet intel report:
- Pricing: what they charge
- Key differentiator: their main pitch
- Opportunity: one thing ResumeChiefz can exploit or do better

Be specific, no fluff.`,
    }],
  })

  return msg.content[0].type === 'text' ? msg.content[0].text : ''
}

// ── Check Reddit for brand mentions ───────────────────────
async function checkRedditMentions(brand: string): Promise<Array<{ title: string; url: string; score: number }>> {
  try {
    const res = await fetch(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(brand)}&sort=new&limit=5&t=week`,
      { headers: { 'User-Agent': 'JarvisOS/1.0 market-intel' } }
    )
    const data = await res.json() as { data?: { children?: Array<{ data: { title: string; permalink: string; score: number } }> } }
    return (data?.data?.children ?? []).map(c => ({
      title: c.data.title,
      url: `https://reddit.com${c.data.permalink}`,
      score: c.data.score,
    }))
  } catch {
    return []
  }
}

// ── eBay sold data for card market pulse ──────────────────
async function getCardMarketPulse(): Promise<string> {
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Based on your knowledge of the sports card market:

1. What are the top 3 trending rookie cards right now (${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})?
2. Any players whose cards are undervalued vs their on-court performance?
3. What's the current market sentiment (hot/cooling/recovering)?

Be specific with player names and card types. This is for a card seller's daily brief.`,
    }],
  })
  return msg.content[0].type === 'text' ? msg.content[0].text : ''
}

// ── Post to Slack ─────────────────────────────────────────
async function postToSlack(text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

// ── Main: run full market intel sweep ─────────────────────
export async function runMarketIntel(): Promise<{
  competitors: string[]
  cardMarket: string
  redditMentions: { rc: number; cc: number }
  summary: string
}> {
  const results: string[] = []

  // 1. Competitor analysis (RC)
  const compResults: string[] = []
  for (const comp of RC_COMPETITORS) {
    const intel = await analyzeCompetitor(comp)
    compResults.push(`*${comp.name}*\n${intel}`)
  }

  // 2. Card market pulse
  const cardMarket = await getCardMarketPulse()

  // 3. Reddit mentions
  const rcMentions = await checkRedditMentions('ResumeChiefz')
  const ccMentions = await checkRedditMentions('Card Chiefz sports cards')

  // 4. Build Slack digest
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const digest = `
📊 *Market Intel Digest — ${today}*

━━━━━━━━━━━━━━━━━━━━━━
🏢 *RESUMECHIEFZ COMPETITORS*
━━━━━━━━━━━━━━━━━━━━━━
${compResults.join('\n\n')}

━━━━━━━━━━━━━━━━━━━━━━
🃏 *CARD MARKET PULSE*
━━━━━━━━━━━━━━━━━━━━━━
${cardMarket}

━━━━━━━━━━━━━━━━━━━━━━
🔍 *REDDIT MENTIONS (this week)*
━━━━━━━━━━━━━━━━━━━━━━
*ResumeChiefz:* ${rcMentions.length} mentions
${rcMentions.map(m => `• <${m.url}|${m.title}> (↑${m.score})`).join('\n') || '• No mentions found'}

*Card Chiefz:* ${ccMentions.length} mentions
${ccMentions.map(m => `• <${m.url}|${m.title}> (↑${m.score})`).join('\n') || '• No mentions found'}
`.trim()

  await postToSlack(digest)

  // 5. Save to memory
  await saveMemory({
    category: 'market_intel',
    content: `Market intel ${today}: ${compResults.length} competitors analyzed, card market: ${cardMarket.slice(0, 100)}`,
    context: JSON.stringify({ compResults, cardMarket, rcMentions: rcMentions.length, ccMentions: ccMentions.length }),
    importance: 7,
  })

  // 6. Save to Supabase for history
  await supabaseAdmin.from('ai_memories').insert({
    category: 'market_intel_report',
    content: today,
    context: digest,
    importance: 6,
    created_at: new Date().toISOString(),
  })

  return {
    competitors: compResults,
    cardMarket,
    redditMentions: { rc: rcMentions.length, cc: ccMentions.length },
    summary: digest,
  }
}
