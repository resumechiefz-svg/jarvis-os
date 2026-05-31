/**
 * Google OAuth — Calendar, Sheets, Drive, Gmail
 * anthonybowles23@gmail.com
 */
import { google } from 'googleapis'
import { supabaseAdmin } from '../supabase/client'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? 'https://jarvis-os.vercel.app/api/google/callback'

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
]

export function getOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
}

export function getAuthUrl(): string {
  const client = getOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}

export async function saveTokens(tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null }) {
  await supabaseAdmin.from('ai_memories').upsert({
    category: 'google_tokens',
    content: 'google_oauth_tokens',
    context: JSON.stringify(tokens),
    importance: 10,
    created_at: new Date().toISOString(),
  })
}

export async function getStoredTokens(): Promise<{ access_token?: string; refresh_token?: string; expiry_date?: number } | null> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'google_tokens')
    .eq('content', 'google_oauth_tokens')
    .single()
  if (!data?.context) return null
  try { return JSON.parse(data.context) } catch { return null }
}

export async function getAuthenticatedClient() {
  const tokens = await getStoredTokens()
  if (!tokens?.refresh_token) return null

  const client = getOAuthClient()
  client.setCredentials(tokens)

  // Auto-refresh if expired
  client.on('tokens', async (newTokens) => {
    const merged = { ...tokens, ...newTokens }
    await saveTokens(merged)
  })

  return client
}

export async function isConnected(): Promise<boolean> {
  const tokens = await getStoredTokens()
  return !!tokens?.refresh_token
}
