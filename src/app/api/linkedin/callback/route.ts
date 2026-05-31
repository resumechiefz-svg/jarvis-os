import { NextRequest, NextResponse } from 'next/server'
import { exchangeLinkedInCode } from '@/lib/agents/linkedin'
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get('code')
  if (!code) return new NextResponse('No code', { status: 400 })
  await exchangeLinkedInCode(code)
  return new NextResponse(`<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:sans-serif;background:#020810;color:#00ff88;padding:40px;text-align:center"><h1>LinkedIn Connected</h1><p style="color:#cce8ff">ECHO can now post directly to your LinkedIn.</p><a href="/" style="background:#00d4ff;color:#000;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:24px;display:inline-block">Open Jarvis</a></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
