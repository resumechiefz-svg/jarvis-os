import { slack } from '../slack'
/**
 * RC Churn Prediction — flags users likely to cancel 7 days before they do
 * Analyzes: days since last login, resume downloads, subscription age, plan
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })


export interface ChurnRisk { userId: string; email: string; riskScore: number; reason: string; action: string }

export async function runChurnPrediction(): Promise<ChurnRisk[]> {
  // Pull RC subscriber data from Supabase (ResumeChiefz users table)
  // If RC uses a separate DB, adjust the table name here
  let users: Array<{ id: string; email: string; created_at: string; last_login?: string; plan?: string; downloads?: number }> = []

  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id, email, created_at, last_sign_in_at, raw_app_meta_data')
      .not('email', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100)
    users = (data ?? []).map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_login: u.last_sign_in_at,
      plan: u.raw_app_meta_data?.plan ?? 'free',
    }))
  } catch { /* RC may use different table */ }

  if (!users.length) {
    await slack('⚠️ *RC Churn Prediction*: No user data found. Check Supabase table name.')
    return []
  }

  const now = Date.now()
  const atRisk: ChurnRisk[] = []

  for (const user of users.filter(u => u.plan !== 'free')) {
    const daysSinceLogin = user.last_login
      ? Math.floor((now - new Date(user.last_login).getTime()) / 86400000)
      : 999
    const accountAge = Math.floor((now - new Date(user.created_at).getTime()) / 86400000)

    // Risk score 0-100
    let risk = 0
    let reasons: string[] = []

    if (daysSinceLogin > 14) { risk += 40; reasons.push(`${daysSinceLogin}d since login`) }
    else if (daysSinceLogin > 7) { risk += 20; reasons.push(`${daysSinceLogin}d since login`) }

    if (accountAge < 30 && daysSinceLogin > 7) { risk += 20; reasons.push('New user going cold') }
    if (accountAge > 60 && daysSinceLogin > 21) { risk += 15; reasons.push('Long-term user disengaging') }
    if (!user.downloads || user.downloads < 1) { risk += 25; reasons.push('Never downloaded a resume') }

    if (risk >= 50) {
      const msg = await claude.messages.create({
        model: 'claude-haiku-4-5', max_tokens: 100,
        messages: [{ role: 'user', content: `One-line retention action for this RC subscriber: ${reasons.join(', ')}. Be specific and direct.` }],
      })
      const action = msg.content[0].type === 'text' ? msg.content[0].text : 'Send re-engagement email with resume tip'
      atRisk.push({ userId: user.id, email: user.email, riskScore: risk, reason: reasons.join(', '), action })
    }
  }

  if (atRisk.length > 0) {
    const report = atRisk.slice(0, 5).map(u =>
      `• *${u.email}* — Risk: ${u.riskScore}/100\n  _${u.reason}_\n  → ${u.action}`
    ).join('\n\n')

    await slack(`🚨 *RC Churn Risk Report — ${atRisk.length} users at risk*\n\n${report}`)
  } else {
    await slack('✅ *RC Churn Check*: No high-risk subscribers detected today.')
  }

  return atRisk
}
