/**
 * Revenue Scout — ATLAS scans for profitable opportunities and brings a full plan
 * Monitors trends, AB's data, market signals
 * When it spots something, comes with execution plan not just ideas
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

interface Opportunity {
  title: string
  type: 'card_market' | 'rc_growth' | 'content' | 'product' | 'partnership' | 'trading'
  urgency: 'immediate' | 'this_week' | 'this_month'
  estimatedRevenue: string
  confidence: 'high' | 'medium' | 'low'
  executionPlan: string[]
  timeToRevenue: string
  effortLevel: 'low' | 'medium' | 'high'
}

export async function scanForOpportunities(): Promise<void> {
  // Pull current data to ground the analysis
  const [recentSales, recentConvos, cardData] = await Promise.all([
    supabaseAdmin.from('ai_memories').select('content, context').eq('category', 'ebay_sale').order('created_at', { ascending: false }).limit(20).then(r => r.data ?? []),
    supabaseAdmin.from('ai_memories').select('content').eq('category', 'conversation_summary').order('created_at', { ascending: false }).limit(15).then(r => r.data ?? []),
    supabaseAdmin.from('ai_memories').select('content, context').eq('category', 'psa_pop').order('created_at', { ascending: false }).limit(5).then(r => r.data ?? []),
  ])

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `You are ATLAS — AB's strategic intelligence agent. Scan for real revenue opportunities right now.

AB's businesses:
- Card Chiefz: eBay sports card store, 1400+ sales, 99.5% feedback
- ResumeChiefz: AI resume builder SaaS, $7.99/mo
- TradePilot: ~$98k paper trading portfolio (going live this week)
- Charlotte NC, 34 years old, goal: $1M / financial independence by 40

Recent eBay activity: ${recentSales.slice(0, 5).map(s => s.content).join(', ')}
Recent topics discussed: ${recentConvos.slice(0, 8).map(c => c.content).join(', ')}
Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}

Scan for:
1. Card market timing opportunities (sets peaking, players trending, grading windows)
2. RC growth plays (pricing test, new traffic channel, feature that converts)
3. Content monetization (topic with search demand AB is uniquely positioned for)
4. Partnership or affiliate plays
5. Trading setups worth watching

Return 1-2 REAL opportunities with full execution plans. Not vague ideas — specific moves AB can make this week.

JSON array: [{"title": "...", "type": "...", "urgency": "...", "estimatedRevenue": "$X-Y/mo or one-time", "confidence": "high|medium|low", "executionPlan": ["step 1", "step 2", "step 3"], "timeToRevenue": "...", "effortLevel": "low|medium|high"}]`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
    const match = text.match(/\[[\s\S]*\]/)
    const opportunities: Opportunity[] = match ? JSON.parse(match[0]) : []

    for (const opp of opportunities.slice(0, 2)) {
      // Don't repeat recent opportunities
      const { data: recent } = await supabaseAdmin
        .from('ai_memories')
        .select('content')
        .eq('category', 'revenue_opportunity')
        .ilike('content', `%${opp.title.slice(0, 30)}%`)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .single()

      if (recent) continue

      await supabaseAdmin.from('ai_memories').insert({
        category: 'revenue_opportunity',
        content: opp.title,
        context: JSON.stringify(opp),
        importance: opp.confidence === 'high' ? 9 : 7,
        created_at: new Date().toISOString(),
      })

      const urgencyEmoji = opp.urgency === 'immediate' ? '🔴' : opp.urgency === 'this_week' ? '🟡' : '🟢'
      const confidenceBar = opp.confidence === 'high' ? '████' : opp.confidence === 'medium' ? '██░░' : '█░░░'

      await slack(`${urgencyEmoji} *Revenue Opportunity — ${opp.title}*

*Type:* ${opp.type.replace('_', ' ')} | *Confidence:* ${confidenceBar} ${opp.confidence}
*Estimated:* ${opp.estimatedRevenue} | *Time to revenue:* ${opp.timeToRevenue} | *Effort:* ${opp.effortLevel}

*Execution plan:*
${opp.executionPlan.map((s, i) => `${i + 1}. ${s}`).join('\n')}

_Reply to this thread to have Jarvis start executing_`)
    }
  } catch { /* skip */ }
}
