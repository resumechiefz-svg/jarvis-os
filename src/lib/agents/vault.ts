import type { VaultStats } from '../types'

const EBAY_TOKEN = process.env.EBAY_USER_TOKEN ?? ''
const EBAY_API = 'https://api.ebay.com/ws/api.dll'

async function fetchEbayOrders(fromDate: string): Promise<Array<{ title: string; price: number; date: string }>> {
  if (!EBAY_TOKEN) return []

  try {
    const res = await fetch(EBAY_API, {
      method: 'POST',
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetOrders',
        'X-EBAY-API-SITEID': '0',
        'Content-Type': 'text/xml',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<GetOrdersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${EBAY_TOKEN}</eBayAuthToken>
  </RequesterCredentials>
  <CreateTimeFrom>${fromDate}</CreateTimeFrom>
  <CreateTimeTo>${new Date().toISOString()}</CreateTimeTo>
  <OrderStatus>Completed</OrderStatus>
  <DetailLevel>ReturnAll</DetailLevel>
</GetOrdersRequest>`,
      signal: AbortSignal.timeout(15000),
    })

    const text = await res.text()

    // Check for eBay error
    if (text.includes('<Ack>Failure</Ack>')) {
      console.error('[Vault] eBay API error:', text.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1])
      return []
    }

    const orders: Array<{ title: string; price: number; date: string }> = []
    const orderBlocks = text.match(/<Order>[\s\S]*?<\/Order>/g) ?? []

    for (const block of orderBlocks) {
      // Get the first item title from the transaction
      const title = block.match(/<Title>([^<]*)<\/Title>/)?.[1]
        ?? block.match(/<Item>[\s\S]*?<Title>([^<]*)<\/Title>/)?.[1]
        ?? 'Card'

      // AmountPaid is the total order value
      const priceStr = block.match(/<AmountPaid currencyID="USD">([^<]+)<\/AmountPaid>/)?.[1] ?? '0'
      const price = parseFloat(priceStr)

      const date = block.match(/<CreatedTime>([^<]+)<\/CreatedTime>/)?.[1] ?? ''

      if (price > 0) orders.push({ title: title.slice(0, 60), price, date })
    }

    return orders
  } catch (err) {
    console.error('[Vault] fetchEbayOrders error:', err)
    return []
  }
}

async function fetchTotalSales(): Promise<number> {
  if (!EBAY_TOKEN) return 1400

  try {
    const res = await fetch(EBAY_API, {
      method: 'POST',
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
        'X-EBAY-API-SITEID': '0',
        'Content-Type': 'text/xml',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${EBAY_TOKEN}</eBayAuthToken>
  </RequesterCredentials>
  <SoldList>
    <Include>true</Include>
    <DurationInDays>60</DurationInDays>
    <Pagination>
      <EntriesPerPage>1</EntriesPerPage>
    </Pagination>
  </SoldList>
</GetMyeBaySellingRequest>`,
      signal: AbortSignal.timeout(15000),
    })

    const text = await res.text()
    const totalStr = text.match(/<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/)?.[1]
    // eBay only returns 60-day window — add to known baseline
    const recent = parseInt(totalStr ?? '0')
    return 1400 + recent
  } catch {
    return 1400
  }
}

export async function getVaultStats(): Promise<VaultStats> {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [weekOrders, monthOrders, totalSales] = await Promise.all([
    fetchEbayOrders(weekAgo),
    fetchEbayOrders(monthAgo),
    fetchTotalSales(),
  ])

  const weeklyRevenue = weekOrders.reduce((s, o) => s + o.price, 0)

  const recentSales = weekOrders.slice(0, 5).map(o => ({
    item: o.title,
    price: o.price,
    date: o.date ? new Date(o.date).toLocaleDateString() : '',
  }))

  return {
    weeklyRevenue: Math.round(weeklyRevenue * 100) / 100,
    monthlySales: monthOrders.length,
    feedbackScore: 99.5,
    totalSales,
    recentSales,
  }
}
