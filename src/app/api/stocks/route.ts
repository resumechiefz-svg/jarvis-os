import { NextResponse } from 'next/server'
import type { StockQuote } from '@/lib/types'

const WATCHLIST = ['AAPL', 'TSLA', 'NVDA', 'BTC-USD', 'ETH-USD']

export async function GET() {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY
  if (!apiKey) {
    // Return mock data when no key configured
    const mock: StockQuote[] = WATCHLIST.map(s => ({
      symbol: s,
      price: Math.random() * 300 + 100,
      change: (Math.random() - 0.5) * 10,
      changePercent: (Math.random() - 0.5) * 3,
    }))
    return NextResponse.json(mock)
  }

  try {
    const quotes = await Promise.all(
      WATCHLIST.slice(0, 3).map(async (symbol) => {
        const res = await fetch(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
        )
        const data = await res.json()
        const q = data['Global Quote']
        return {
          symbol,
          price: parseFloat(q?.['05. price'] ?? '0'),
          change: parseFloat(q?.['09. change'] ?? '0'),
          changePercent: parseFloat(q?.['10. change percent']?.replace('%', '') ?? '0'),
        } as StockQuote
      })
    )
    return NextResponse.json(quotes)
  } catch {
    return NextResponse.json([])
  }
}
