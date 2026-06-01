import { NextRequest, NextResponse } from 'next/server'

const SESSION_SECRET = process.env.JARVIS_SESSION_SECRET ?? ''
const SESSION_COOKIE = 'jarvis_session'
const JARVIS_PASSWORD = process.env.JARVIS_PASSWORD ?? ''

// In-memory rate limiter — max 5 attempts per IP per 15 minutes
// Resets on server restart (acceptable for personal use)
const attempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const LOCKOUT_MS = 60 * 60 * 1000 // 1 hour lockout after max attempts

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const record = attempts.get(ip)

  if (!record || now > record.resetAt) {
    // Fresh window
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, resetIn: WINDOW_MS }
  }

  if (record.count >= MAX_ATTEMPTS) {
    // Locked out — extend lockout on each attempt
    record.resetAt = now + LOCKOUT_MS
    return { allowed: false, remaining: 0, resetIn: record.resetAt - now }
  }

  record.count++
  return { allowed: true, remaining: MAX_ATTEMPTS - record.count, resetIn: record.resetAt - now }
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req)
  const { allowed, remaining, resetIn } = checkRateLimit(ip)

  if (!allowed) {
    const minutes = Math.ceil(resetIn / 60000)
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.` },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(resetIn / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { password } = body

  if (!password || password !== JARVIS_PASSWORD) {
    return NextResponse.json(
      { error: 'Invalid password', remaining },
      { status: 401 }
    )
  }

  // Success — clear rate limit for this IP
  attempts.delete(ip)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, SESSION_SECRET, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('jarvis_session')
  return res
}
