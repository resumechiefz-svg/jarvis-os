import { NextResponse } from 'next/server'
import type { NewsItem } from '@/lib/types'

const QUERIES = ['resume builder', 'trading cards market', 'SaaS startup', 'job market 2026']

export async function GET() {
  const apiKey = process.env.NEWS_API_KEY
  if (!apiKey) {
    const mock: NewsItem[] = [
      { id: '1', headline: 'AI Resume Tools See Record Adoption in 2026', source: 'TechCrunch', url: '#', publishedAt: new Date().toISOString() },
      { id: '2', headline: 'Sports Card Market Rebounds After Q1 Dip', source: 'Beckett Media', url: '#', publishedAt: new Date().toISOString() },
      { id: '3', headline: 'SaaS Valuations Stabilize Heading Into Summer', source: 'Forbes', url: '#', publishedAt: new Date().toISOString() },
      { id: '4', headline: 'Charlotte Named Top 10 City for Tech Startups', source: 'Business Insider', url: '#', publishedAt: new Date().toISOString() },
    ]
    return NextResponse.json(mock)
  }

  try {
    const query = QUERIES[Math.floor(Date.now() / 60000) % QUERIES.length]
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=10&apiKey=${apiKey}`
    )
    const data = await res.json()
    const items: NewsItem[] = (data.articles ?? []).map((a: Record<string, unknown>, i: number) => ({
      id: String(i),
      headline: String(a.title ?? ''),
      source: typeof a.source === 'object' && a.source !== null ? String((a.source as Record<string, unknown>).name ?? '') : '',
      url: String(a.url ?? '#'),
      publishedAt: String(a.publishedAt ?? ''),
    }))
    return NextResponse.json(items)
  } catch {
    return NextResponse.json([])
  }
}
