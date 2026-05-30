import Anthropic from '@anthropic-ai/sdk'
import { SAGE_SYSTEM } from './prompts'
import { supabaseAdmin } from '../supabase/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface HealthLog {
  date: string
  sleep: number       // hours
  energy: number      // 1-10
  workout: boolean
  workoutType?: string
  steps?: number
  mood: number        // 1-10
  stress: number      // 1-10
  notes?: string
}

export interface HealthSummary {
  avgSleep: number
  avgEnergy: number
  avgMood: number
  avgStress: number
  workoutsThisWeek: number
  trend: 'improving' | 'stable' | 'declining'
  insight: string
  recommendation: string
}

export async function logHealth(data: Omit<HealthLog, 'date'>): Promise<void> {
  await supabaseAdmin.from('health_logs').upsert({
    date: new Date().toISOString().split('T')[0],
    sleep: data.sleep,
    energy: data.energy,
    workout: data.workout,
    workout_type: data.workoutType,
    steps: data.steps,
    mood: data.mood,
    stress: data.stress,
    notes: data.notes,
    created_at: new Date().toISOString(),
  })
}

export async function getHealthSummary(days = 7): Promise<HealthSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data } = await supabaseAdmin
    .from('health_logs')
    .select('*')
    .gte('date', since)
    .order('date', { ascending: false })

  const logs = data ?? []

  if (logs.length === 0) {
    return {
      avgSleep: 0, avgEnergy: 0, avgMood: 0, avgStress: 0,
      workoutsThisWeek: 0, trend: 'stable',
      insight: 'No health data logged yet.',
      recommendation: 'Start logging daily — sleep, energy, and mood take 30 seconds and unlock powerful pattern analysis.',
    }
  }

  const avg = (key: string) => logs.reduce((s, l) => s + (l[key] ?? 0), 0) / logs.length
  const workouts = logs.filter(l => l.workout).length

  // Trend: compare first half vs second half
  const half = Math.floor(logs.length / 2)
  const recentEnergy = logs.slice(0, half).reduce((s, l) => s + l.energy, 0) / half
  const olderEnergy = logs.slice(half).reduce((s, l) => s + l.energy, 0) / half
  const trend = recentEnergy > olderEnergy + 0.5 ? 'improving' : recentEnergy < olderEnergy - 0.5 ? 'declining' : 'stable'

  // AI insight
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: SAGE_SYSTEM,
    messages: [{
      role: 'user',
      content: `AB's health data for the last ${days} days:
Avg sleep: ${avg('sleep').toFixed(1)}h | Avg energy: ${avg('energy').toFixed(1)}/10 | Avg mood: ${avg('mood').toFixed(1)}/10 | Avg stress: ${avg('stress').toFixed(1)}/10 | Workouts: ${workouts}/${days} days | Trend: ${trend}

Give one sharp insight and one concrete recommendation. Be direct. Under 60 words total.`,
    }],
  })

  const insight = response.content[0].type === 'text' ? response.content[0].text : ''

  return {
    avgSleep: Math.round(avg('sleep') * 10) / 10,
    avgEnergy: Math.round(avg('energy') * 10) / 10,
    avgMood: Math.round(avg('mood') * 10) / 10,
    avgStress: Math.round(avg('stress') * 10) / 10,
    workoutsThisWeek: workouts,
    trend,
    insight: insight.split('\n')[0] ?? insight,
    recommendation: insight.split('\n')[1] ?? '',
  }
}
