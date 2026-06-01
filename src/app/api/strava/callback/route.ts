import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get('code')
  if (!code) return new NextResponse('No code', { status: 400 })
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, code, grant_type: 'authorization_code' }),
  })
  const tokens = await res.json()
  await supabaseAdmin.from('ai_memories').upsert({ category: 'strava_tokens', content: 'strava', context: JSON.stringify(tokens), importance: 10, created_at: new Date().toISOString() })
  return new NextResponse('<!DOCTYPE html><html><body style="background:#020810;color:#00ff88;font-family:monospace;padding:40px;text-align:center"><h1>Strava Connected</h1><p style="color:#cce8ff">SAGE can now track your training automatically.</p><a href="/" style="background:#00d4ff;color:#000;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block;margin-top:24px">Open Jarvis</a></body></html>', { headers: { 'Content-Type': 'text/html' } })
}
