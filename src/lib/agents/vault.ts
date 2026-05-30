import type { VaultStats } from '../types'

// eBay API integration — uses Finding API + Trading API
// Requires EBAY_USER_TOKEN for Trading API access to order history
async function fetchEbayOrders(days: number): Promise<Array<{ title: string; price: number; date: string }>> {
  const token = process.env.EBAY_USER_TOKEN
  if (!token) return []

  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  try {
    const res = await fetch('https://api.ebay.com/ws/api.dll', {
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
    <eBayAuthToken>${token}</eBayAuthToken>
  </RequesterCredentials>
  <CreateTimeFrom>${fromDate}</CreateTimeFrom>
  <CreateTimeTo>${new Date().toISOString()}</CreateTimeTo>
  <OrderStatus>Completed</OrderStatus>
  <DetailLevel>ReturnAll</DetailLevel>
</GetOrdersRequest>`,
    })

    const text = await res.text()
    const orders: Array<{ title: string; price: number; date: string }> = []

    const orderMatches = text.matchAll(/<Order>([\s\S]*?)<\/Order>/g)
    for (const match of orderMatches) {
      const block = match[1]
      const title = block.match(/<Title>(.*?)<\/Title>/)?.[1] ?? 'Unknown Item'
      const price = parseFloat(block.match(/<AmountPaid currencyID="USD">(.*?)<\/AmountPaid>/)?.[1] ?? '0')
      const date = block.match(/<CreatedTime>(.*?)<\/CreatedTime>/)?.[1] ?? ''
      orders.push({ title, price, date })
    }

    return orders
  } catch {
    return []
  }
}

export async function getVaultStats(): Promise<VaultStats> {
  const [weekOrders, monthOrders] = await Promise.all([
    fetchEbayOrders(7),
    fetchEbayOrders(30),
  ])

  const weeklyRevenue = weekOrders.reduce((s, o) => s + o.price, 0)
  const recentSales = weekOrders.slice(0, 5).map(o => ({
    item: o.title.slice(0, 40),
    price: o.price,
    date: o.date ? new Date(o.date).toLocaleDateString() : '',
  }))

  return {
    weeklyRevenue: Math.round(weeklyRevenue * 100) / 100,
    monthlySales: monthOrders.length,
    feedbackScore: 99.5,
    totalSales: 1400,
    recentSales,
  }
}
