import { slack } from '../slack'
/**
 * News Intelligence — filters financial/market news to only what's relevant to AB
 * Relevant: TradePilot holdings, card market, resume/job market, Charlotte business
 * Irrelevant: everything else
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN
const NEWS_API_KEY = process.env.NEWS_API_KEY ?? ''


async function fetchNews(query: string): Promise<Array<{ title: string; description: string; url: string; source: string }>> {
  if (!NEWS_API_KEY) return []
  try {
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=5&language=en&apiKey=${NEWS_API_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
    const data = await res.json() as { articles?: Array<{ title: string; description: string; url: string; source: { name: string } }> }
    return (data.articles ?? []).map(a => ({
      title: a.title, description: a.description ?? '',
      url: a.url, source: a.source.name,
    }))
  } catch { return [] }
}

// Get current TradePilot positions for relevant news filtering
async function getPortfolioSymbols(): Promise<string[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'}/api/portfolio`)
    const data = await res.json()
    return (data?.positions ?? []).map((p: { symbol: string }) => p.symbol).slice(0, 10)
  } catch { return ['NVDA', 'AAPL', 'TSLA', 'SPY'] }
}

export async function runNewsIntel(): Promise<void> {
  const symbols = await getPortfolioSymbols()

  // Fetch news across AB's relevant domains in parallel
  const [stockNews, cardNews, jobMarketNews] = await Promise.all([
    fetchNews(symbols.slice(0, 3).join(' OR ')),
    fetchNews('sports cards PSA grading Prizm market'),
    fetchNews('AI resume builder job market hiring 2026'),
  ])

  const allNews = [...stockNews, ...cardNews, ...jobMarketNews]
  if (allNews.length === 0) return

  // Claude filters and ranks by relevance to AB
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5', max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Filter these news items for AB. He cares about:
- His stock positions: ${symbols.join(', ')}
- Sports card market (PSA, Prizm, rookie cards)
- Resume/job market (affects ResumeChiefz)
- Nothing else

News:
${allNews.map((n, i) => `${i + 1}. ${n.title} (${n.source})`).join('\n')}

Pick the 3 most relevant. For each: one sentence on why it matters to AB specifically.
Format: "• [Title] — [why it matters to AB]"

If nothing is genuinely relevant, say: "Nothing material today."`,
    }],
  })

  const filtered = msg.content[0].type === 'text' ? msg.content[0].text : 'Nothing material today.'

  if (filtered.toLowerCase().includes('nothing material')) return // No noise

  await slack(`📰 *Morning Intel — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}*\n\n${filtered}`)

  await supabaseAdmin.from('ai_memories').insert({
    category: 'news_intel',
    content: new Date().toISOString().split('T')[0],
    context: filtered,
    importance: 6,
    created_at: new Date().toISOString(),
  })
}
