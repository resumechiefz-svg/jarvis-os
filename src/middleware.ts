import { NextRequest, NextResponse } from 'next/server'

const SESSION_SECRET = process.env.JARVIS_SESSION_SECRET ?? ''
const SESSION_COOKIE = 'jarvis_session'
const LOGIN_PAGE = '/login'

// Internal launchd/cron routes — use CRON_SECRET header
const CRON_ROUTES = ['/api/monitor', '/api/analyze', '/api/conversion']

// Mobile iOS shortcut — uses x-jarvis-key (handled inside route)
const MOBILE_ROUTES = ['/api/mobile']

// Always public — push subscriptions, auth endpoint itself
const PUBLIC_ROUTES = ['/api/push', '/api/auth']

function isAuthenticated(req: NextRequest): boolean {
  if (!SESSION_SECRET) return true // Dev: skip if no secret configured
  const session = req.cookies.get(SESSION_COOKIE)?.value
  if (session === SESSION_SECRET) return true
  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${SESSION_SECRET}`) return true
  return false
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public routes — always allow
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) return NextResponse.next()

  // Login page — allow if not already authenticated
  if (pathname === LOGIN_PAGE) {
    if (isAuthenticated(req)) return NextResponse.redirect(new URL('/', req.url))
    return NextResponse.next()
  }

  // Mobile routes — auth handled inside the route handler
  if (MOBILE_ROUTES.some(r => pathname.startsWith(r))) return NextResponse.next()

  // Cron routes — localhost always allowed, otherwise need CRON_SECRET
  if (CRON_ROUTES.some(r => pathname.startsWith(r))) {
    const host = req.headers.get('host') ?? ''
    if (host.includes('localhost') || host.includes('127.0.0.1')) return NextResponse.next()
    const cronSecret = req.headers.get('x-cron-secret')
    if (cronSecret === (process.env.CRON_SECRET ?? '')) return NextResponse.next()
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Everything else (HUD pages + all other API routes) — require session
  if (!isAuthenticated(req)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized — Jarvis OS is private.' }, { status: 401 })
    }
    // HUD pages — redirect to login
    return NextResponse.redirect(new URL(LOGIN_PAGE, req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|icons).*)'],
}
