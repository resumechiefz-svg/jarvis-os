import Anthropic from '@anthropic-ai/sdk'
import { BEACON_SYSTEM } from './prompts'
import { supabaseAdmin } from '../supabase/client'
import { pushNotify } from '../push/notify'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface GoalProgress {
  title: string
  current: number
  target: number
  unit: string
  percentComplete: number
  etaMonths: number | null
  onTrack: boolean
}

export async function getGoalProgress(): Promise<GoalProgress[]> {
  try {
    const { data } = await supabaseAdmin
      .from('goals')
      .select('title, current, target, unit, target_date, active')
      .eq('active', true)
      .eq('completed', false)
      .order('priority')

    return (data ?? []).map(g => {
      const pct = g.target > 0 ? (g.current / g.target) * 100 : 0
      const remaining = g.target - g.current
      const monthlyRate = g.current > 0 ? g.current / 3 : null // rough 3-month estimate
      const etaMonths = monthlyRate && remaining > 0 ? Math.ceil(remaining / monthlyRate) : null

      return {
        title: g.title,
        current: g.current,
        target: g.target,
        unit: g.unit,
        percentComplete: Math.round(pct),
        etaMonths,
        onTrack: pct >= 25,
      }
    })
  } catch {
    return []
  }
}

export async function getWeeklyAccountability(): Promise<string> {
  const goals = await getGoalProgress()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: BEACON_SYSTEM,
    messages: [{
      role: 'user',
      content: `Weekly accountability check-in for AB.

Current goal progress:
${goals.map(g => `- ${g.title}: ${g.current}/${g.target} ${g.unit} (${g.percentComplete}%) — ETA: ${g.etaMonths ? `${g.etaMonths} months` : 'unknown'}`).join('\n')}

Give a direct, honest accountability report. What's on track? What's slipping? What's the one move this week that matters most? No sugarcoating.`,
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

export async function getMilestoneAlerts(): Promise<void> {
  const goals = await getGoalProgress()
  const nearComplete = goals.filter(g => g.percentComplete >= 90)

  for (const goal of nearComplete) {
    await pushNotify(
      '🎯 BEACON — Milestone Alert',
      `${goal.title} is ${goal.percentComplete}% complete. You're almost there, AB.`,
      { tag: 'beacon', url: '/workspace' }
    ).catch(() => {})
  }
}
