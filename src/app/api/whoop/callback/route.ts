import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get('code')
  if (!code) return new NextResponse('No code', { status: 400 })
  const res = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: process.env.WHOOP_CLIENT_ID ?? '', client_secret: process.env.WHOOP_CLIENT_SECRET ?? '', redirect_uri: process.env.WHOOP_REDIRECT_URI ?? '' }),
  })
  const tokens = await res.json()
  await supabaseAdmin.from('ai_memories').upsert({ category: 'whoop_tokens', content: 'whoop', context: JSON.stringify({ ...tokens, expires_at: Date.now() / 1000 + (tokens.expires_in ?? 3600) }), importance: 10, created_at: new Date().toISOString() })
  return new NextResponse('<!DOCTYPE html><html><body style="background:#020810;color:#00ff88;font-family:monospace;padding:40px;text-align:center"><h1>Whoop Connected</h1><p style="color:#cce8ff">SAGE now tracks your recovery automatically.</p><a href="/" style="background:#00d4ff;color:#000;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block;margin-top:24px">Open Jarvis</a></body></html>', { headers: { 'Content-Type': 'text/html' } })
}
