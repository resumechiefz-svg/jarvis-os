import { slack } from '../slack'
/**
 * Card Sell-Through Analytics — turns 1400+ sales into strategy
 * Best categories, price points, days, players, hold vs flip patterns
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN


export async function analyzeSellThrough(): Promise<string> {
  const { data: sales } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context, created_at')
    .eq('category', 'ebay_sale')
    .order('created_at', { ascending: false })
    .limit(100)

  if (!sales?.length) return 'No sales data logged yet.'

  const salesText = sales.map(s => {
    const day = new Date(s.created_at).toLocaleDateString('en-US', { weekday: 'short' })
    return `${day}: ${s.content}`
  }).join('\n')

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Analyze these Card Chiefz eBay sales for patterns. AB has 1400+ sales total.

Recent sales:
${salesText.slice(0, 4000)}

Find:
1. What categories/types sell fastest?
2. What price points move in under 48 hours vs sit?
3. What days of the week perform best?
4. Any players or sets showing strong velocity?
5. Anything to stop listing or start focusing on?

Be specific. Give AB actionable strategy, not generic observations.`,
    }],
  })

  const analysis = msg.content[0].type === 'text' ? msg.content[0].text : ''

  await supabaseAdmin.from('ai_memories').insert({
    category: 'sell_through_report',
    content: new Date().toISOString().split('T')[0],
    context: analysis,
    importance: 7,
    created_at: new Date().toISOString(),
  })

  await slack(`📊 *Card Chiefz Sell-Through Analysis*\n\n${analysis}`)
  return analysis
}
