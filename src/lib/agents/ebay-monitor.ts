/**
 * eBay Real-Time Sales Monitor — polls every 15 min, Slacks new sales
 * Uses eBay Browse API for sold items from the Card Chiefz store
 */
import { supabaseAdmin } from '../supabase/client'

const EBAY_APP_ID = process.env.EBAY_APP_ID ?? ''
const EBAY_SELLER = 'cardchiefz'

async function slack(msg: string) {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: msg }) })
}

async function getEbayToken(): Promise<string> {
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  })
  const data = await res.json() as { access_token?: string }
  return data.access_token ?? ''
}

export async function checkEbaySales(): Promise<number> {
  if (!EBAY_APP_ID) {
    // No eBay API key yet — check Supabase for manually logged sales
    return checkManualSales()
  }

  try {
    const token = await getEbayToken()
    if (!token) return 0

    // Get last known sale timestamp
    const { data: lastCheck } = await supabaseAdmin
      .from('ai_memories').select('context').eq('category', 'ebay_last_check').single()
    const since = lastCheck?.context ?? new Date(Date.now() - 15 * 60 * 1000).toISOString()

    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=*&filter=sellers:{${EBAY_SELLER}},soldItemsOnly:true&limit=10`,
      { headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } }
    )
    const data = await res.json() as { itemSummaries?: Array<{ title: string; price: { value: string }; itemId: string; itemWebUrl: string }> }
    const items = data.itemSummaries ?? []

    let newSales = 0
    let totalRevenue = 0

    for (const item of items) {
      const { data: existing } = await supabaseAdmin
        .from('ai_memories').select('id').eq('category', 'ebay_sale').eq('content', item.itemId).single()
      if (existing) continue

      const amount = parseFloat(item.price.value)
      totalRevenue += amount
      newSales++

      await supabaseAdmin.from('ai_memories').insert({
        category: 'ebay_sale',
        content: item.itemId,
        context: JSON.stringify({ title: item.title, amount, url: item.itemWebUrl }),
        importance: 7,
        created_at: new Date().toISOString(),
      })
    }

    if (newSales > 0) {
      await slack(`💳 *Card Chiefz Sale${newSales > 1 ? 's' : ''}!*\n${items.slice(0, newSales).map(i => `• ${i.title} — $${i.price.value}`).join('\n')}\n*Total: $${totalRevenue.toFixed(2)}*`)
    }

    // Update last check time
    await supabaseAdmin.from('ai_memories').upsert({
      category: 'ebay_last_check', content: 'last_check',
      context: new Date().toISOString(), importance: 1,
    })

    return newSales
  } catch (err) {
    console.error('[eBay monitor]', err)
    return 0
  }
}

async function checkManualSales(): Promise<number> {
  // Fallback: check Supabase for any manually logged Card Chiefz sales
  const { data } = await supabaseAdmin
    .from('ai_memories').select('context, created_at')
    .eq('category', 'ebay_sale')
    .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
  return data?.length ?? 0
}
