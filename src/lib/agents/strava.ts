/**
 * Strava / Apple Health integration — auto-logs training data
 * Strava API: connects via OAuth
 * Apple Health: reads via iOS Shortcuts webhook
 * Both feed into SAGE's training awareness + accountability score
 */
import { supabaseAdmin } from '../supabase/client'

const TOKEN = process.env.SLACK_BOT_TOKEN
const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID ?? ''
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET ?? ''
const STRAVA_REDIRECT = process.env.STRAVA_REDIRECT_URI ?? 'https://jarvis-os-dusky.vercel.app/api/strava/callback'

async function slack(text: string) {
  if (!TOKEN) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#jarvis', text }),
  })
}

export function getStravaAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: STRAVA_REDIRECT,
    response_type: 'code',
    scope: 'activity:read_all',
  })
  return `https://www.strava.com/oauth/authorize?${params}`
}

async function getStravaTokens(): Promise<{ access_token: string; athlete_id: number } | null> {
  const { data } = await supabaseAdmin
    .from('ai_memories').select('context').eq('category', 'strava_tokens').single()
  if (!data?.context) return null
  const tokens = JSON.parse(data.context)

  // Refresh if expired
  if (tokens.expires_at < Date.now() / 1000) {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      }),
    })
    const fresh = await res.json()
    await supabaseAdmin.from('ai_memories').upsert({
      category: 'strava_tokens', content: 'strava',
      context: JSON.stringify(fresh), importance: 10,
      created_at: new Date().toISOString(),
    })
    return fresh
  }
  return tokens
}

export async function syncStravaActivities(): Promise<void> {
  const tokens = await getStravaTokens()
  if (!tokens) return

  const weekAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000)
  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${weekAgo}&per_page=10`,
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  )
  const activities = await res.json() as Array<{
    name: string; type: string; distance: number;
    moving_time: number; total_elevation_gain: number; start_date: string
  }>

  if (!Array.isArray(activities)) return

  for (const act of activities) {
    const miles = (act.distance / 1609.34).toFixed(1)
    const minutes = Math.round(act.moving_time / 60)
    const elev = Math.round(act.total_elevation_gain * 3.28)

    await supabaseAdmin.from('ai_memories').upsert({
      category: 'training_log',
      content: act.start_date.split('T')[0],
      context: JSON.stringify({
        type: act.type, name: act.name, miles, minutes, elevation: elev,
        source: 'strava', date: act.start_date,
      }),
      importance: 7,
      created_at: act.start_date,
    })
  }

  // Weekly training summary
  const runs = activities.filter(a => a.type === 'Run')
  const totalMiles = runs.reduce((s, a) => s + a.distance / 1609.34, 0)
  const whitewater50Target = new Date('2026-10-17')
  const weeksOut = Math.ceil((whitewater50Target.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000))

  if (runs.length > 0) {
    await slack(`🏃 *Training sync — this week*\n${runs.length} run${runs.length > 1 ? 's' : ''} | ${totalMiles.toFixed(1)} miles | ${weeksOut} weeks to Whitewater 50`)
  }
}

// Apple Health webhook — iOS Shortcut sends workout data here
export async function logAppleHealthWorkout(data: {
  type: string; miles?: number; minutes?: number; calories?: number; date?: string
}): Promise<void> {
  const date = data.date ?? new Date().toISOString().split('T')[0]
  await supabaseAdmin.from('ai_memories').upsert({
    category: 'training_log',
    content: date,
    context: JSON.stringify({ ...data, source: 'apple_health' }),
    importance: 7,
    created_at: new Date().toISOString(),
  })
  await slack(`🍎 *Workout logged* — ${data.type} ${data.miles ? `${data.miles} mi` : ''} ${data.minutes ? `${data.minutes} min` : ''}`)
}
