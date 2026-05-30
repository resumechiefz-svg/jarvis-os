import { NextRequest, NextResponse } from 'next/server'

const SESSION_SECRET = process.env.JARVIS_SESSION_SECRET ?? ''
const SESSION_COOKIE = 'jarvis_session'
const JARVIS_PASSWORD = process.env.JARVIS_PASSWORD ?? 'jarvis'

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (!password || password !== JARVIS_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, SESSION_SECRET, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
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
