import { slack } from '../slack'
/**
 * eBay Auto-Relist — reprices and relists stale cards automatically
 * Cards unsold 30+ days get a 5-10% price drop and fresh listing
 * Runs weekly, posts to #lister for approval before executing
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN
const EBAY_TOKEN = process.env.EBAY_USER_TOKEN ?? ''


async function getActiveListings(): Promise<Array<{ itemId: string; title: string; price: number; daysListed: number }>> {
  if (!EBAY_TOKEN) return []
  try {
    const res = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
        'X-EBAY-API-SITEID': '0',
        'Content-Type': 'text/xml',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${EBAY_TOKEN}</eBayAuthToken></RequesterCredentials>
  <ActiveList><Include>true</Include><Pagination><EntriesPerPage>50</EntriesPerPage></Pagination></ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBaySellingRequest>`,
    })
    const text = await res.text()
    const items: Array<{ itemId: string; title: string; price: number; daysListed: number }> = []
    const blocks = text.match(/<Item>[\s\S]*?<\/Item>/g) ?? []
    for (const block of blocks) {
      const itemId = block.match(/<ItemID>(.*?)<\/ItemID>/)?.[1] ?? ''
      const title = block.match(/<Title>(.*?)<\/Title>/)?.[1] ?? ''
      const price = parseFloat(block.match(/<CurrentPrice.*?>(.*?)<\/CurrentPrice>/)?.[1] ?? '0')
      const startTime = block.match(/<ListingDetails>[\s\S]*?<StartTime>(.*?)<\/StartTime>/)?.[1]
      const daysListed = startTime
        ? Math.floor((Date.now() - new Date(startTime).getTime()) / 86400000)
        : 0
      if (itemId) items.push({ itemId, title, price, daysListed })
    }
    return items
  } catch { return [] }
}

export async function runAutoRelist(): Promise<void> {
  const listings = await getActiveListings()
  const stale = listings.filter(l => l.daysListed >= 30)

  if (stale.length === 0) {
    await slack('✅ *Auto-Relist Check* — No stale listings (all under 30 days). Nothing to action.')
    return
  }

  // Generate repricing suggestions with Claude
  const suggestions = await Promise.all(stale.map(async item => {
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5', max_tokens: 80,
      messages: [{ role: 'user', content: `Card: "${item.title}" listed at $${item.price} for ${item.daysListed} days. Suggest new price (5-10% drop) and one title improvement. JSON: {"newPrice": X, "titleNote": "..."}` }],
    })
    try {
      const t = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
      const m = t.match(/\{[\s\S]*\}/)
      const d = m ? JSON.parse(m[0]) : {}
      return { ...item, newPrice: d.newPrice ?? Math.round(item.price * 0.92 * 100) / 100, titleNote: d.titleNote ?? 'Consider refreshing title' }
    } catch { return { ...item, newPrice: Math.round(item.price * 0.92 * 100) / 100, titleNote: '' } }
  }))

  const report = `📦 *Auto-Relist — ${stale.length} stale listing${stale.length > 1 ? 's' : ''} (30+ days)*

${suggestions.map(s => `• *${s.title.slice(0, 50)}*\n  Currently $${s.price} | ${s.daysListed} days listed\n  → Suggested: $${s.newPrice} | ${s.titleNote}`).join('\n\n')}

_React ✅ to approve all repricing, or reply with specific item IDs to skip_`

  await slack(report)

  await supabaseAdmin.from('ai_memories').insert({
    category: 'ebay_autolist',
    content: new Date().toISOString().split('T')[0],
    context: JSON.stringify(suggestions),
    importance: 7,
    created_at: new Date().toISOString(),
  })
}
