import { NextResponse } from 'next/server'
import type { StockQuote } from '@/lib/types'

const WATCHLIST = ['AAPL', 'TSLA', 'NVDA', 'SPY', 'QQQ']

export async function GET() {
  const apiKey = process.env.ALPACA_API_KEY
  const secretKey = process.env.ALPACA_SECRET_KEY
  const dataUrl = process.env.ALPACA_DATA_URL ?? 'https://data.alpaca.markets'

  if (!apiKey || !secretKey) {
    // Mock fallback
    const mock: StockQuote[] = WATCHLIST.map(s => ({
      symbol: s,
      price: Math.random() * 300 + 100,
      change: (Math.random() - 0.5) * 10,
      changePercent: (Math.random() - 0.5) * 3,
    }))
    return NextResponse.json(mock)
  }

  try {
    const symbols = WATCHLIST.join(',')
    const res = await fetch(
      `${dataUrl}/v2/stocks/snapshots?symbols=${symbols}&feed=iex`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': secretKey,
        },
        next: { revalidate: 60 }, // cache 60s
      }
    )

    if (!res.ok) throw new Error(`Alpaca error: ${res.status}`)

    const data = await res.json()

    const quotes: StockQuote[] = WATCHLIST.map(symbol => {
      const snap = data[symbol]
      if (!snap) return { symbol, price: 0, change: 0, changePercent: 0 }

      const price = snap.latestTrade?.p ?? snap.minuteBar?.c ?? 0
      const prevClose = snap.prevDailyBar?.c ?? price
      const change = price - prevClose
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0

      return {
        symbol,
        price: Math.round(price * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
      }
    })

    return NextResponse.json(quotes)
  } catch (err) {
    console.error('[Alpaca stocks]', err)
    return NextResponse.json([])
  }
}
