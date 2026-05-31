/**
 * LinkedIn Direct Posting — posts approved RC outreach content via LinkedIn API
 * OAuth flow: /api/linkedin/auth → /api/linkedin/callback → posts directly
 */
import { supabaseAdmin } from '../supabase/client'

const LI_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID ?? ''
const LI_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET ?? ''
const LI_REDIRECT = process.env.LINKEDIN_REDIRECT_URI ?? 'http://localhost:3001/api/linkedin/callback'

export function getLinkedInAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LI_CLIENT_ID,
    redirect_uri: LI_REDIRECT,
    scope: 'openid profile email w_member_social',
    state: 'jarvis_linkedin',
  })
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`
}

export async function exchangeLinkedInCode(code: string): Promise<void> {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: LI_REDIRECT,
      client_id: LI_CLIENT_ID,
      client_secret: LI_CLIENT_SECRET,
    }),
  })
  const tokens = await res.json() as { access_token?: string; expires_in?: number }
  if (!tokens.access_token) throw new Error('LinkedIn auth failed')

  // Get profile to store person URN
  const profile = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  }).then(r => r.json()) as { sub?: string; name?: string; email?: string }

  await supabaseAdmin.from('ai_memories').upsert({
    category: 'linkedin_tokens',
    content: profile.email ?? 'linkedin',
    context: JSON.stringify({ ...tokens, personUrn: `urn:li:person:${profile.sub}`, name: profile.name }),
    importance: 10,
    created_at: new Date().toISOString(),
  })
}

async function getLinkedInTokens(): Promise<{ access_token: string; personUrn: string } | null> {
  const { data } = await supabaseAdmin
    .from('ai_memories').select('context').eq('category', 'linkedin_tokens').single()
  if (!data?.context) return null
  return JSON.parse(data.context)
}

export async function postToLinkedIn(text: string): Promise<string> {
  const tokens = await getLinkedInTokens()
  if (!tokens) throw new Error('LinkedIn not connected. Visit /api/linkedin/auth to connect.')

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: tokens.personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  })

  if (!res.ok) throw new Error(`LinkedIn post failed: ${res.status}`)
  const data = await res.json() as { id?: string }

  // Log the post
  await supabaseAdmin.from('ai_memories').insert({
    category: 'linkedin_post',
    content: text.slice(0, 100),
    context: JSON.stringify({ postId: data.id, text, postedAt: new Date().toISOString() }),
    importance: 6,
    created_at: new Date().toISOString(),
  })

  return data.id ?? ''
}

export async function isLinkedInConnected(): Promise<boolean> {
  const tokens = await getLinkedInTokens()
  return !!tokens?.access_token
}
