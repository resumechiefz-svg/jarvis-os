/**
 * Apple Watch endpoint — ultra-light response for Watch complications
 * Returns a single-line status for Watch face display
 * Siri Shortcut on Watch → hits this → speaks the response
 */
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'
  const headers = { Authorization: `Bearer ${process.env.JARVIS_SESSION_SECRET ?? ''}` }

  const [portfolio, nova] = await Promise.all([
    fetch(`${base}/api/portfolio`, { headers }).then(r => r.json()).catch(() => null),
    fetch(`${base}/api/nova`, { headers }).then(r => r.json()).catch(() => null),
  ])

  const equity = portfolio?.equity ? `$${Math.round(portfolio.equity / 1000)}k` : '--'
  const dayPL = portfolio?.dayPL ? `${portfolio.dayPL >= 0 ? '+' : ''}$${Math.round(portfolio.dayPL)}` : '--'
  const mrr = nova?.mrr ? `$${Math.round(nova.mrr)} MRR` : '--'

  const status = `Portfolio ${equity} ${dayPL} today. RC ${mrr}.`

  return NextResponse.json({
    status,
    equity: portfolio?.equity,
    dayPL: portfolio?.dayPL,
    mrr: nova?.mrr,
  })
}

// Siri on Watch sends a spoken command, returns spoken response
export async function POST(req: NextRequest) {
  const { command } = await req.json().catch(() => ({ command: 'status' }))
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'

  const res = await fetch(`${base}/api/jarvis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.JARVIS_SESSION_SECRET ?? ''}`,
    },
    body: JSON.stringify({ message: command, history: [] }),
  })

  const data = await res.json()
  // Return short version for Watch TTS
  const reply = (data.message ?? '').split('.').slice(0, 2).join('. ') + '.'
  return NextResponse.json({ reply, full: data.message })
}
