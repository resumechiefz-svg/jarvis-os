import { slack } from '../slack'
/**
 * PSA Population Monitor — tracks grading population changes
 * High pop count = less rare = price pressure
 * Monitors cards Vault is tracking and alerts on significant changes
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN


// Cards to watch — add/remove as inventory changes
const WATCHED_CARDS = [
  { player: 'Victor Wembanyama', year: '2023-24', set: 'Prizm', grade: 'PSA 10' },
  { player: 'Chet Holmgren', year: '2022-23', set: 'Prizm', grade: 'PSA 10' },
  { player: 'Anthony Edwards', year: '2020-21', set: 'Prizm', grade: 'PSA 10' },
  { player: 'Paolo Banchero', year: '2022-23', set: 'Prizm', grade: 'PSA 10' },
]

async function getPSAPopEstimate(card: typeof WATCHED_CARDS[0]): Promise<{ pop: number; trend: string }> {
  // PSA doesn't have a free API — use Claude's knowledge + trend analysis
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `PSA population report estimate for: ${card.year} ${card.set} ${card.player} RC ${card.grade}

Based on your knowledge:
1. Estimated PSA 10 population (rough number)
2. Population trend: growing fast / growing slow / stable / shrinking
3. Price impact: positive / neutral / negative
4. One-line market note

Return JSON: {"pop": number, "trend": "growing_fast|growing_slow|stable", "priceImpact": "positive|neutral|negative", "note": "..."}`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    const data = match ? JSON.parse(match[0]) : {}
    return { pop: data.pop ?? 0, trend: `${data.trend ?? 'unknown'} | ${data.priceImpact ?? 'neutral'} — ${data.note ?? ''}` }
  } catch {
    return { pop: 0, trend: 'unknown' }
  }
}

export async function runPSAMonitor(): Promise<void> {
  const results = []

  for (const card of WATCHED_CARDS) {
    const { pop, trend } = await getPSAPopEstimate(card)

    // Compare to last known pop
    const { data: lastKnown } = await supabaseAdmin
      .from('ai_memories')
      .select('context')
      .eq('category', 'psa_pop')
      .eq('content', `${card.year}_${card.player}_${card.grade}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const lastPop = lastKnown ? JSON.parse(lastKnown.context ?? '{}').pop ?? 0 : 0
    const change = pop - lastPop
    const alert = change > 50 ? '🚨 BIG POP INCREASE' : change > 20 ? '⚠️ Pop growing' : '✅ Stable'

    results.push({ card, pop, trend, change, alert })

    await supabaseAdmin.from('ai_memories').upsert({
      category: 'psa_pop',
      content: `${card.year}_${card.player}_${card.grade}`,
      context: JSON.stringify({ pop, trend, checkedAt: new Date().toISOString() }),
      importance: change > 50 ? 8 : 5,
      created_at: new Date().toISOString(),
    })
  }

  // Only alert on notable changes
  const alerts = results.filter(r => r.change > 20)
  const reportLines = results.map(r =>
    `${r.alert} *${r.card.player}* ${r.card.year} ${r.card.set} ${r.card.grade}\n   Pop ~${r.pop.toLocaleString()} | ${r.trend}`
  )

  const report = `🃏 *PSA POPULATION REPORT — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}*\n\n${reportLines.join('\n\n')}`

  if (alerts.length > 0 || true) { // Always post weekly
    await slack(report)
  }
}
