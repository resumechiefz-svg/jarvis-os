import { NextRequest, NextResponse } from 'next/server'

const SESSION_SECRET = process.env.JARVIS_SESSION_SECRET ?? ''
const SESSION_COOKIE = 'jarvis_session'
const LOGIN_PAGE = '/login'

// Internal launchd/cron routes — use CRON_SECRET header
const CRON_ROUTES = ['/api/monitor', '/api/analyze', '/api/conversion']

// Mobile iOS shortcut — auth handled inside route
const MOBILE_ROUTES = ['/api/mobile']

// Truly public — OAuth callbacks and non-sensitive endpoints only
// NOTE: /api/watch and /api/strava/health are NOT here — they auth internally
const PUBLIC_ROUTES = [
  '/api/push',
  '/api/auth',
  '/api/speak',   // TTS — called from authenticated browser session
  '/api/jarvis',  // chat — called from authenticated browser session
  '/api/news',
  '/api/stocks',
  '/api/google/auth',
  '/api/google/callback',
  '/api/siri',
  '/api/linkedin/auth',
  '/api/linkedin/callback',
  '/api/strava/callback',
  '/api/watch',        // internally checks x-watch-key
  '/api/strava/health', // internally checks x-health-key
  '/api/webhooks/slack', // Slack events — verified by signing secret internally
  '/review',            // Content review screen — public so it can be opened directly
  '/api/review',        // Review API endpoints
]

// Security headers applied to every response
function addSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')
  res.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' https://api.openai.com https://api.anthropic.com https://slack.com https://*.supabase.co wss://api.openai.com;"
  )
  return res
}

function isAuthenticated(req: NextRequest): boolean {
  if (!SESSION_SECRET) return true
  const session = req.cookies.get(SESSION_COOKIE)?.value
  if (session === SESSION_SECRET) return true
  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${SESSION_SECRET}`) return true
  return false
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public routes — allow but still add security headers
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Login page
  if (pathname === LOGIN_PAGE) {
    if (isAuthenticated(req)) return NextResponse.redirect(new URL('/', req.url))
    return addSecurityHeaders(NextResponse.next())
  }

  // Mobile routes — auth handled inside route handler
  if (MOBILE_ROUTES.some(r => pathname.startsWith(r))) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Cron routes — localhost always allowed, otherwise need CRON_SECRET
  if (CRON_ROUTES.some(r => pathname.startsWith(r))) {
    const host = req.headers.get('host') ?? ''
    if (host.includes('localhost') || host.includes('127.0.0.1')) return addSecurityHeaders(NextResponse.next())
    const cronSecret = req.headers.get('x-cron-secret')
    if (cronSecret === (process.env.CRON_SECRET ?? '')) return addSecurityHeaders(NextResponse.next())
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Everything else — require session
  if (!isAuthenticated(req)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized — Jarvis OS is private.' }, { status: 401 })
    }
    return NextResponse.redirect(new URL(LOGIN_PAGE, req.url))
  }

  return addSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|icons).*)'],
}
