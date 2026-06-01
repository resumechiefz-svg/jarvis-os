import { slack } from '../slack'
/**
 * SEO Rank Tracker — monitors ResumeChiefz keyword rankings weekly
 * Uses Google Search Console API (free) or scrapes SERPs
 * Posts weekly rank report to #market-intel
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN

const RC_KEYWORDS = [
  'AI resume builder',
  'free resume builder AI',
  'ATS resume builder',
  'AI resume writer',
  'resume builder for free',
  'professional resume builder',
  'resume builder with AI',
  'best resume builder 2026',
]


async function checkGoogleSearchConsole(): Promise<Array<{ keyword: string; position: number; clicks: number; impressions: number }>> {
  // If Google Search Console API is configured
  const gscToken = process.env.GOOGLE_SEARCH_CONSOLE_SITE
  if (!gscToken) return []

  try {
    const { getAuthenticatedClient } = await import('../google/auth')
    const auth = await getAuthenticatedClient()
    if (!auth) return []

    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent('https://resumechiefz.com')}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate, endDate,
          dimensions: ['query'],
          rowLimit: 25,
          dimensionFilterGroups: [{
            filters: [{ dimension: 'country', operator: 'equals', expression: 'usa' }],
          }],
        }),
      }
    )

    const data = await res.json() as { rows?: Array<{ keys: string[]; position: number; clicks: number; impressions: number }> }
    return (data.rows ?? []).map(r => ({
      keyword: r.keys[0],
      position: Math.round(r.position),
      clicks: r.clicks,
      impressions: r.impressions,
    }))
  } catch { return [] }
}

export async function runSEOTracker(): Promise<void> {
  const gscData = await checkGoogleSearchConsole()

  // Get last week's data for comparison
  const { data: lastWeek } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'seo_report')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  let lastPositions: Record<string, number> = {}
  try { lastPositions = JSON.parse(lastWeek?.context ?? '{}').positions ?? {} } catch { /**/ }

  // Build report
  let reportLines: string[] = []

  if (gscData.length > 0) {
    // Real GSC data
    for (const kw of gscData.slice(0, 10)) {
      const prev = lastPositions[kw.keyword]
      const change = prev ? prev - kw.position : 0
      const arrow = change > 0 ? `↑${change}` : change < 0 ? `↓${Math.abs(change)}` : '—'
      reportLines.push(`• *${kw.keyword}*: #${kw.position} ${arrow} (${kw.clicks} clicks, ${kw.impressions} impr.)`)
    }
  } else {
    // Claude analysis fallback — what Claude knows about RC's likely rankings
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Based on your knowledge, estimate where resumechiefz.com likely ranks for these keywords vs major competitors (Kickresume, Zety, Resume.io):

Keywords: ${RC_KEYWORDS.join(', ')}

For each: estimated position range, main competitor ahead of it, and one specific SEO action.
Format as bullet points. Be specific.`,
      }],
    })
    reportLines = (msg.content[0].type === 'text' ? msg.content[0].text : '').split('\n').filter(l => l.trim())
  }

  // Save current positions
  const positions: Record<string, number> = {}
  gscData.forEach(kw => { positions[kw.keyword] = kw.position })

  const report = `📍 *RC SEO RANK REPORT — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}*\n${gscData.length > 0 ? '_Source: Google Search Console_' : '_Source: Estimated (add GSC to env for live data)_'}\n\n${reportLines.join('\n')}`

  await slack(report)

  await supabaseAdmin.from('ai_memories').insert({
    category: 'seo_report',
    content: new Date().toISOString().split('T')[0],
    context: JSON.stringify({ positions, report }),
    importance: 6,
    created_at: new Date().toISOString(),
  })
}
