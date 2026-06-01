import { slack } from '../slack'
/**
 * Whoop Integration — recovery, sleep, strain data
 * Whoop API v1: api.prod.whoop.com/developer/v1
 * Combined with Apple Health for full recovery picture
 */
import { supabaseAdmin } from '../supabase/client'

const TOKEN = process.env.SLACK_BOT_TOKEN
const WHOOP_BASE = 'https://api.prod.whoop.com/developer/v1'
const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const WHOOP_REDIRECT = process.env.WHOOP_REDIRECT_URI ?? 'https://jarvis-os-dusky.vercel.app/api/whoop/callback'


export function getWhoopAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.WHOOP_CLIENT_ID ?? '',
    redirect_uri: WHOOP_REDIRECT,
    response_type: 'code',
    scope: 'offline read:recovery read:sleep read:workout read:body_measurement read:cycles',
  })
  return `${WHOOP_AUTH_URL}?${params}`
}

async function getWhoopTokens(): Promise<{ access_token: string } | null> {
  const { data } = await supabaseAdmin
    .from('ai_memories').select('context').eq('category', 'whoop_tokens').single()
  if (!data?.context) return null
  const tokens = JSON.parse(data.context)

  // Refresh if expired
  if (tokens.expires_at && tokens.expires_at < Date.now() / 1000) {
    const res = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: process.env.WHOOP_CLIENT_ID ?? '',
        client_secret: process.env.WHOOP_CLIENT_SECRET ?? '',
      }),
    })
    const fresh = await res.json()
    await supabaseAdmin.from('ai_memories').upsert({
      category: 'whoop_tokens', content: 'whoop',
      context: JSON.stringify({ ...fresh, expires_at: Date.now() / 1000 + (fresh.expires_in ?? 3600) }),
      importance: 10, created_at: new Date().toISOString(),
    })
    return fresh
  }
  return tokens
}

export interface WhoopRecovery {
  date: string
  recoveryScore: number   // 0-100
  hrv: number             // ms
  restingHR: number       // bpm
  sleepScore: number      // 0-100
  sleepDuration: number   // hours
  strainScore: number     // 0-21
  recommendation: string  // Jarvis interpretation
}

export async function syncWhoopData(): Promise<WhoopRecovery | null> {
  const tokens = await getWhoopTokens()
  if (!tokens) return null

  const headers = { Authorization: `Bearer ${tokens.access_token}` }

  try {
    // Get latest recovery
    const [recoveryRes, sleepRes, cycleRes] = await Promise.all([
      fetch(`${WHOOP_BASE}/recovery?limit=1`, { headers }).then(r => r.json()),
      fetch(`${WHOOP_BASE}/activity/sleep?limit=1`, { headers }).then(r => r.json()),
      fetch(`${WHOOP_BASE}/cycle?limit=1`, { headers }).then(r => r.json()),
    ])

    const recovery = recoveryRes.records?.[0]
    const sleep = sleepRes.records?.[0]
    const cycle = cycleRes.records?.[0]

    if (!recovery) return null

    const recoveryScore = Math.round(recovery.score?.recovery_score ?? 0)
    const hrv = Math.round(recovery.score?.hrv_rmssd_milli ?? 0)
    const restingHR = Math.round(recovery.score?.resting_heart_rate ?? 0)
    const sleepScore = Math.round(sleep?.score?.sleep_performance_percentage ?? 0)
    const sleepHours = Math.round((sleep?.score?.total_in_bed_time_milli ?? 0) / 3600000 * 10) / 10
    const strain = Math.round((cycle?.score?.strain ?? 0) * 10) / 10

    // Jarvis interpretation
    let recommendation = ''
    if (recoveryScore >= 67) recommendation = `Green recovery (${recoveryScore}%) — you're good to push today.`
    else if (recoveryScore >= 34) recommendation = `Yellow recovery (${recoveryScore}%) — moderate effort. Don't bury yourself.`
    else recommendation = `Red recovery (${recoveryScore}%) — rest day or light movement only. Your body needs it.`

    const data: WhoopRecovery = {
      date: new Date().toISOString().split('T')[0],
      recoveryScore, hrv, restingHR, sleepScore,
      sleepDuration: sleepHours, strainScore: strain, recommendation,
    }

    // Save to memory
    await supabaseAdmin.from('ai_memories').upsert({
      category: 'whoop_daily',
      content: data.date,
      context: JSON.stringify(data),
      importance: 7,
      created_at: new Date().toISOString(),
    })

    // Alert if very low recovery
    if (recoveryScore < 34) {
      await slack(`🟡 *SAGE — Whoop Recovery Alert*\n\nRecovery at ${recoveryScore}%, AB. HRV ${hrv}ms, resting HR ${restingHR}bpm, sleep ${sleepHours}h.\n\n${recommendation}`)
    }

    return data
  } catch (err) {
    console.error('[Whoop]', err)
    return null
  }
}

export async function getWhoopContext(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'whoop_daily')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data?.context) return ''
  try {
    const w = JSON.parse(data.context) as WhoopRecovery
    return `[WHOOP: Recovery ${w.recoveryScore}%, HRV ${w.hrv}ms, sleep ${w.sleepDuration}h — ${w.recommendation}]`
  } catch { return '' }
}
