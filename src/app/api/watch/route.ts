/**
 * Apple Watch endpoint — secured with WATCH_SECRET header
 * Set WATCH_SECRET in env, add to iOS Shortcut as x-watch-key header
 */
import { NextRequest, NextResponse } from 'next/server'

const WATCH_SECRET = process.env.WATCH_SECRET ?? process.env.JARVIS_SESSION_SECRET ?? ''

function isAuthorized(req: NextRequest): boolean {
  const key = req.headers.get('x-watch-key') ?? req.nextUrl.searchParams.get('key') ?? ''
  return key === WATCH_SECRET
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'
  const headers = { Authorization: `Bearer ${WATCH_SECRET}` }

  const [portfolio, nova] = await Promise.all([
    fetch(`${base}/api/portfolio`, { headers }).then(r => r.json()).catch(() => null),
    fetch(`${base}/api/nova`, { headers }).then(r => r.json()).catch(() => null),
  ])

  const equity = portfolio?.equity ? `$${Math.round(portfolio.equity / 1000)}k` : '--'
  const dayPL = portfolio?.dayPL ? `${portfolio.dayPL >= 0 ? '+' : ''}$${Math.round(portfolio.dayPL)}` : '--'
  const mrr = nova?.mrr ? `$${Math.round(nova.mrr)} MRR` : '--'

  return NextResponse.json({
    status: `Portfolio ${equity} ${dayPL} today. RC ${mrr}.`,
    equity: portfolio?.equity,
    dayPL: portfolio?.dayPL,
    mrr: nova?.mrr,
  })
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { command } = await req.json().catch(() => ({ command: 'status' }))
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'

  const res = await fetch(`${base}/api/jarvis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WATCH_SECRET}`,
    },
    body: JSON.stringify({ message: command, history: [] }),
  })

  const data = await res.json()
  const reply = (data.message ?? '').split('.').slice(0, 2).join('. ') + '.'
  return NextResponse.json({ reply, full: data.message })
}
