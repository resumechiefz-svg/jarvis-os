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
  type: string
  urgency: 'immediate' | 'this_week' | 'this_month' | 'strategic'
  estimatedRevenue: string
  confidence: 'high' | 'medium' | 'low'
  whyNow?: string
  relatedToCurrentBiz?: boolean
  executionPlan: string[]
  resourcesNeeded?: string[]
  timeToRevenue: string
  effortLevel: 'low' | 'medium' | 'high'
  biggestRisk?: string
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
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `You are ATLAS — AB's strategic intelligence agent. Think like a venture scout meets hedge fund analyst meets street-smart entrepreneur.

AB's profile:
- 34, Charlotte NC, goal: $1M / financial independence by 40
- Current businesses: Card Chiefz (eBay cards), ResumeChiefz (AI resume SaaS), TradePilot (~$98k portfolio going live)
- Skills: recruiting, SaaS, eBay selling, AI tools, content creation, trading
- Resources: Claude API, ElevenLabs, Google APIs, Vercel, automation tools, Jarvis OS
- Time: build weeks (no kids) and custody weeks (less available)

Recent activity: ${recentSales.slice(0, 5).map(s => s.content).join(', ')}
Discussions: ${recentConvos.slice(0, 8).map(c => c.content).join(', ')}
Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}

IMPORTANT: Don't limit yourself to what AB is already doing. Look at EVERYTHING:

- What's trending right now that has money in it?
- What arbitrage opportunities exist (buy low, sell high, digital or physical)?
- What new AI tools or products are in demand that don't have good solutions yet?
- What niches are underserved that AB's skills could dominate in 90 days?
- What can be built in a weekend that generates recurring revenue?
- What affiliate programs are paying well right now?
- What YouTube or content angles are getting massive traction with low competition?
- What services could AB offer with existing skills ($2k-10k/client)?
- What's happening in the economy/job market/card market that creates a specific window?
- What has AB mentioned that's actually a business idea hiding in plain sight?

Be a scout, not an advisor. Come back with the specific move, not the general advice.

Return 2 opportunities — one that AB can start this week, one that's bigger and takes longer:

JSON array: [{
  "title": "specific opportunity name",
  "type": "arbitrage|saas|content|service|affiliate|trading|product|new_business",
  "urgency": "immediate|this_week|this_month|strategic",
  "estimatedRevenue": "specific number or range",
  "confidence": "high|medium|low",
  "whyNow": "what makes this the right moment",
  "relatedToCurrentBiz": false,
  "executionPlan": ["step 1 — specific action", "step 2", "step 3", "step 4", "step 5"],
  "resourcesNeeded": ["what it takes"],
  "timeToRevenue": "realistic timeline",
  "effortLevel": "low|medium|high",
  "biggestRisk": "what could go wrong"
}]`,
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
      const isNew = !opp.relatedToCurrentBiz ? ' *(new territory)*' : ''

      await slack(`${urgencyEmoji} *ATLAS — ${opp.title}*${isNew}

*${opp.estimatedRevenue}* | ${opp.timeToRevenue} | Effort: ${opp.effortLevel} | Confidence: ${opp.confidence}

*Why now:* ${opp.whyNow}

*Execution:*
${opp.executionPlan.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}

*What you need:* ${opp.resourcesNeeded?.join(', ')}
*Biggest risk:* ${opp.biggestRisk}

_Reply to this thread to dig deeper or start executing_`)
    }
  } catch { /* skip */ }
}
