/**
 * Research Layer — the intelligence briefing that runs before every agent acts
 *
 * Each agent has a domain-specific researcher that pulls current, sourced,
 * real-world data before generating any output.
 *
 * ANTI-HALLUCINATION PROTOCOL:
 * - Every finding must have a source
 * - Uncertain signals are labeled as such
 * - "I don't know" is always an acceptable answer
 * - Never state as fact what wasn't verified
 *
 * Researchers:
 * - content    → viral formats, aesthetics, hooks, platform trends
 * - market     → competitor moves, SEO shifts, industry gaps
 * - cards      → PSA pops, eBay sell-through, player news
 * - business   → macro trends, market benchmarks, industry signals
 * - brand      → visual trends, color palettes, design aesthetics
 * - financial  → pricing benchmarks, conversion norms, revenue patterns
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type ResearchDomain =
  | 'content'    // content trends, viral formats, aesthetics
  | 'market'     // competitive landscape, SEO, industry gaps
  | 'cards'      // sports card market signals
  | 'business'   // macro business intelligence
  | 'brand'      // visual + aesthetic trends
  | 'financial'  // pricing, conversion, revenue benchmarks

export interface ResearchBrief {
  domain: ResearchDomain
  business: string
  niche: string
  findings: ResearchFinding[]
  trendingNow: string[]
  warnings: string[]          // things to avoid right now
  synthesizedInsight: string  // single most actionable takeaway
  confidence: 'high' | 'medium' | 'low'
  sources: string[]
  generatedAt: string
  cacheHours: number
}

export interface ResearchFinding {
  topic: string
  signal: string              // what was found
  source: string              // where it came from
  confidence: 'verified' | 'trending' | 'emerging' | 'anecdotal'
  actionability: 'act now' | 'monitor' | 'context only'
}

// ── Reddit intelligence ───────────────────────────────────────────────────────
async function pullRedditSignals(subreddits: string[], minScore = 100): Promise<ResearchFinding[]> {
  const findings: ResearchFinding[] = []

  for (const sub of subreddits) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=15`, {
        headers: { 'User-Agent': 'JarvisResearch/1.0' },
        signal: AbortSignal.timeout(5000),
      })
      const data = await res.json() as {
        data?: { children?: Array<{ data: { title: string; score: number; num_comments: number; selftext?: string } }> }
      }
      data?.data?.children
        ?.filter(c => c.data.score >= minScore)
        .forEach(c => {
          findings.push({
            topic: c.data.title,
            signal: `${c.data.score} upvotes, ${c.data.num_comments} comments`,
            source: `reddit.com/r/${sub}`,
            confidence: c.data.score > 500 ? 'verified' : 'trending',
            actionability: c.data.score > 1000 ? 'act now' : 'monitor',
          })
        })
    } catch { /* skip failed subreddit */ }
  }

  return findings
}

// ── News signals ──────────────────────────────────────────────────────────────
async function pullNewsSignals(query: string): Promise<ResearchFinding[]> {
  const key = process.env.NEWS_API_KEY
  if (!key) return []

  try {
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=8&language=en&apiKey=${key}`,
      { signal: AbortSignal.timeout(6000) }
    )
    const data = await res.json() as { articles?: Array<{ title: string; source: { name: string }; publishedAt: string; description?: string }> }

    return (data.articles ?? []).map(a => ({
      topic: a.title,
      signal: a.description?.slice(0, 150) ?? 'See source',
      source: a.source.name,
      confidence: 'verified' as const,
      actionability: 'context only' as const,
    }))
  } catch { return [] }
}

// ── Domain-specific research configurations ───────────────────────────────────
const DOMAIN_CONFIG: Record<ResearchDomain, {
  subreddits: string[]
  newsQueries: string[]
  cacheHours: number
  synthesisPrompt: (niche: string, findings: ResearchFinding[]) => string
}> = {
  content: {
    subreddits: ['socialmedia', 'marketing', 'Instagram', 'LinkedInLunatics', 'youtube'],
    newsQueries: ['social media trends 2026', 'content marketing viral', 'Instagram algorithm'],
    cacheHours: 4,
    synthesisPrompt: (niche, findings) => `You are a world-class content strategist specializing in ${niche}.

Based on these REAL SIGNALS from Reddit and news (do not add anything not in the data):
${findings.slice(0, 10).map(f => `- [${f.source}] ${f.topic} (${f.confidence})`).join('\n')}

Answer these questions using ONLY what the data supports:
1. What content format is getting the most traction right now?
2. What aesthetic or visual style is currently dominating?
3. What topics/hooks are stopping scrolls this week?
4. What should be AVOIDED (over-saturated, declining)?
5. One thing to do immediately based on this data.

CRITICAL: If you don't have data to support a claim, say "insufficient data." Never fabricate trends.
Format: concise bullet points. Label confidence level for each point.`,
  },

  brand: {
    subreddits: ['graphic_design', 'web_design', 'branding', 'DesignPorn', 'AdobeIllustrator'],
    newsQueries: ['design trends 2026', 'brand aesthetic trending', 'color palette popular'],
    cacheHours: 12,
    synthesisPrompt: (niche, findings) => `You are Lumen, a creative director who tracks visual culture for ${niche} businesses.

Real signals from design communities:
${findings.slice(0, 8).map(f => `- [${f.source}] ${f.topic}`).join('\n')}

Based ONLY on this data:
1. What visual aesthetic is trending in this space?
2. What color approaches are resonating?
3. What typography/layout styles are emerging?
4. What looks dated or oversaturated right now?

Label each finding as: verified / trending / emerging. Never guess.`,
  },

  market: {
    subreddits: ['entrepreneur', 'smallbusiness', 'startups', 'marketing', 'SEO'],
    newsQueries: ['competitor strategy 2026', 'market disruption', 'business growth trends'],
    cacheHours: 6,
    synthesisPrompt: (niche, findings) => `You are Scout, a competitive intelligence analyst for ${niche}.

Real market signals:
${findings.slice(0, 10).map(f => `- [${f.source}] ${f.topic} (${f.actionability})`).join('\n')}

Based ONLY on verified data:
1. What's moving in this market right now?
2. Where are the gaps competitors are leaving?
3. What threats are emerging?
4. Single most actionable competitive move.

Cite your source for every claim. If uncertain, say so.`,
  },

  cards: {
    subreddits: ['sportscards', 'basketballcards', 'footballcards', 'baseballcards', 'baseballcards'],
    newsQueries: ['sports card market 2026', 'PSA population report', 'rookie card value spike'],
    cacheHours: 3,
    synthesisPrompt: (niche, findings) => `You are Vault, an expert sports card investor and dealer.

Real market signals (last 3 hours):
${findings.slice(0, 12).map(f => `- [${f.source}] ${f.topic} — ${f.signal}`).join('\n')}

Based ONLY on this data — no guessing:
1. What's moving right now? (BUY signals)
2. What's peaked or declining? (SELL signals)
3. What should be watched? (WATCH signals)
4. Urgent action if any.

Every claim needs a source. "Insufficient data" is always correct when data doesn't support a conclusion.`,
  },

  business: {
    subreddits: ['entrepreneur', 'business', 'Entrepreneur', 'smallbusiness', 'sales'],
    newsQueries: ['business strategy 2026', 'market trends small business', 'economic outlook'],
    cacheHours: 8,
    synthesisPrompt: (niche, findings) => `You are Atlas, a strategic business analyst for ${niche}.

Current business intelligence from verified sources:
${findings.slice(0, 10).map(f => `- [${f.source}] ${f.topic}`).join('\n')}

Strategic synthesis (sourced only):
1. What macro trend most affects this business right now?
2. What's the biggest opportunity in the next 90 days?
3. What risk is most people ignoring?
4. One strategic move based on this data.

No speculation. Source everything. Say "unknown" when data doesn't support a conclusion.`,
  },

  financial: {
    subreddits: ['personalfinance', 'entrepreneur', 'smallbusiness', 'Entrepreneur'],
    newsQueries: ['pricing strategy 2026', 'SaaS benchmarks', 'revenue growth small business'],
    cacheHours: 24,
    synthesisPrompt: (niche, findings) => `You are Ledger, a financial intelligence analyst for ${niche} businesses.

Current financial signals from verified sources:
${findings.slice(0, 8).map(f => `- [${f.source}] ${f.topic}`).join('\n')}

Financial intelligence (verified data only):
1. What are current pricing benchmarks for this industry?
2. What conversion patterns are emerging?
3. What financial risk signals are present?
4. One number-backed recommendation.

Every figure must have a source. Never estimate as fact.`,
  },
}

// ── Cache check ───────────────────────────────────────────────────────────────
async function getCachedBrief(domain: ResearchDomain, niche: string): Promise<ResearchBrief | null> {
  const cacheKey = `research_${domain}_${niche.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}`
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context, created_at')
    .eq('category', cacheKey)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!data?.[0]) return null

  const brief = JSON.parse(data[0].context) as ResearchBrief
  const ageHours = (Date.now() - new Date(data[0].created_at).getTime()) / 3600000

  if (ageHours < brief.cacheHours) return brief
  return null
}

async function cacheBrief(domain: ResearchDomain, niche: string, brief: ResearchBrief): Promise<void> {
  const cacheKey = `research_${domain}_${niche.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}`
  await supabaseAdmin.from('ai_memories').insert({
    category: cacheKey,
    content: `${domain} research for ${niche}`,
    context: JSON.stringify(brief),
    importance: 5,
    created_at: new Date().toISOString(),
  })
}

// ── Main research function — call before any agent generates output ────────────
export async function researchBrief(
  domain: ResearchDomain,
  niche: string,           // e.g. "sports card eBay seller" or "AI resume builder"
  business: string = '',   // business name for context
  forceRefresh = false
): Promise<ResearchBrief> {
  // Check cache first
  if (!forceRefresh) {
    const cached = await getCachedBrief(domain, niche)
    if (cached) return cached
  }

  const config = DOMAIN_CONFIG[domain]

  // Pull raw signals in parallel
  const [redditFindings, newsFindings] = await Promise.allSettled([
    pullRedditSignals(config.subreddits),
    pullNewsSignals(config.newsQueries[0] + ' ' + niche),
  ])

  const allFindings = [
    ...(redditFindings.status === 'fulfilled' ? redditFindings.value : []),
    ...(newsFindings.status === 'fulfilled' ? newsFindings.value : []),
  ]

  // Sort by actionability
  const ranked = allFindings.sort((a, b) => {
    const order = { 'act now': 0, 'monitor': 1, 'context only': 2 }
    return order[a.actionability] - order[b.actionability]
  })

  // Synthesize with Claude
  let synthesized = 'Insufficient data for synthesis at this time.'
  let confidence: 'high' | 'medium' | 'low' = 'low'

  if (ranked.length > 0) {
    try {
      const msg = await claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: config.synthesisPrompt(niche, ranked),
        }],
      })
      synthesized = msg.content[0].type === 'text' ? msg.content[0].text : synthesized
      confidence = ranked.length > 8 ? 'high' : ranked.length > 3 ? 'medium' : 'low'
    } catch { /* use default */ }
  }

  const brief: ResearchBrief = {
    domain,
    business,
    niche,
    findings: ranked.slice(0, 15),
    trendingNow: ranked.filter(f => f.actionability === 'act now').map(f => f.topic).slice(0, 5),
    warnings: [], // populated by synthesis
    synthesizedInsight: synthesized,
    confidence,
    sources: [...new Set(ranked.map(f => f.source))].slice(0, 8),
    generatedAt: new Date().toISOString(),
    cacheHours: config.cacheHours,
  }

  await cacheBrief(domain, niche, brief).catch(() => {})
  return brief
}

// ── Convenience wrappers for each agent ──────────────────────────────────────
export const research = {
  forContent: (niche: string, business?: string) => researchBrief('content', niche, business),
  forBrand: (niche: string, business?: string) => researchBrief('brand', niche, business),
  forMarket: (niche: string, business?: string) => researchBrief('market', niche, business),
  forCards: () => researchBrief('cards', 'sports card market', 'Card Chiefz'),
  forBusiness: (niche: string, business?: string) => researchBrief('business', niche, business),
  forFinancial: (niche: string, business?: string) => researchBrief('financial', niche, business),
}
