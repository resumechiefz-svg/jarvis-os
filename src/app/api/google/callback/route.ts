// GET /api/google/callback — handles OAuth redirect, stores tokens
import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient, saveTokens } from '@/lib/google/auth'
import { google } from 'googleapis'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return new NextResponse(`
      <html><body style="font-family:sans-serif;background:#020810;color:#ff4455;padding:40px;text-align:center">
        <h2>❌ Google auth failed: ${error ?? 'No code'}</h2>
        <a href="/" style="color:#00d4ff">← Back to Jarvis</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)

  // Get user info to confirm it's the right account
  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const { data: userInfo } = await oauth2.userinfo.get()

  await saveTokens(tokens)

  return new NextResponse(`
    <html><body style="font-family:sans-serif;background:#020810;color:#00ff88;padding:40px;text-align:center">
      <h1>✅ Google Connected</h1>
      <p style="color:#cce8ff;margin:12px 0">Signed in as <strong>${userInfo.email}</strong></p>
      <p style="color:#666;margin:8px 0">Calendar · Sheets · Drive · Gmail — all linked to Jarvis</p>
      <p style="margin-top:24px">
        <a href="/" style="background:#00d4ff;color:#000;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700">
          Open Jarvis →
        </a>
      </p>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html' } })
}
