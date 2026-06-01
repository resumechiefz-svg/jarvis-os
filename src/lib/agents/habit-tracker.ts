import { slack } from '../slack'
/**
 * Habit Tracker — granular daily habits beyond workouts
 * Reading, cold plunge, study, meditation, anything AB wants to build
 * SAGE tracks streaks, flags breaks, celebrates consistency
 */
import { supabaseAdmin } from '../supabase/client'

const TOKEN = process.env.SLACK_BOT_TOKEN


export interface Habit {
  id: string
  name: string
  description?: string
  targetDays: number[]   // 0=Sun, 1=Mon... empty = every day
  streak: number
  longestStreak: number
  lastCompleted?: string
  createdAt: string
}

// Default habits — AB can add/remove
const DEFAULT_HABITS = [
  { id: 'reading', name: 'Reading', description: '20+ min' },
  { id: 'cold_plunge', name: 'Cold Plunge / Cold Shower', description: 'Recovery' },
  { id: 'no_phone_morning', name: 'No Phone First 30 Min', description: 'Mental clarity' },
  { id: 'study', name: 'Cert Study', description: 'Career advancement' },
  { id: 'gratitude', name: 'Gratitude / Journaling', description: '5 min' },
]

export async function logHabit(habitId: string, date?: string): Promise<void> {
  const today = date ?? new Date().toISOString().split('T')[0]

  // Get existing habit data
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('id, context')
    .eq('category', 'habit')
    .eq('content', habitId)
    .single()

  const habit: Habit = data?.context
    ? JSON.parse(data.context)
    : { id: habitId, name: habitId, streak: 0, longestStreak: 0, createdAt: today }

  // Calculate new streak
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const newStreak = habit.lastCompleted === yesterday ? habit.streak + 1 : 1
  const longestStreak = Math.max(newStreak, habit.longestStreak)

  habit.streak = newStreak
  habit.longestStreak = longestStreak
  habit.lastCompleted = today

  await supabaseAdmin.from('ai_memories').upsert({
    category: 'habit',
    content: habitId,
    context: JSON.stringify(habit),
    importance: 7,
    created_at: new Date().toISOString(),
  })

  // Log the completion
  await supabaseAdmin.from('ai_memories').insert({
    category: 'habit_log',
    content: `${habitId}_${today}`,
    context: JSON.stringify({ habitId, date: today, streak: newStreak }),
    importance: 5,
    created_at: new Date().toISOString(),
  })

  // Celebrate milestones
  if ([7, 14, 21, 30, 60, 100].includes(newStreak)) {
    await slack(`🔥 *${habit.name} — ${newStreak} day streak!*\nAB is ${newStreak} days straight. That's not discipline, that's identity.`)
  }
}

export async function getDailyHabitStatus(): Promise<{ completed: string[]; missing: string[]; streaks: Record<string, number> }> {
  const today = new Date().toISOString().split('T')[0]

  const { data: logs } = await supabaseAdmin
    .from('ai_memories')
    .select('content')
    .eq('category', 'habit_log')
    .like('content', `%_${today}`)

  const completed = (logs ?? []).map(l => l.content.replace(`_${today}`, ''))

  const { data: habits } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context')
    .eq('category', 'habit')

  const streaks: Record<string, number> = {}
  const allHabitIds = habits?.map(h => {
    try {
      const habit = JSON.parse(h.context ?? '{}') as Habit
      streaks[h.content] = habit.streak
      return h.content
    } catch { return h.content }
  }) ?? DEFAULT_HABITS.map(h => h.id)

  const missing = allHabitIds.filter(id => !completed.includes(id))

  return { completed, missing, streaks }
}

// Evening check-in — what did you do today?
export async function runHabitCheckin(): Promise<void> {
  const { completed, missing, streaks } = await getDailyHabitStatus()

  if (missing.length === 0) {
    await slack(`✅ *Habit Check — All done today*\nEvery habit logged, AB. Clean sweep.`)
    return
  }

  const streakInfo = Object.entries(streaks)
    .filter(([id]) => completed.includes(id) && streaks[id] > 2)
    .map(([id, s]) => `${id}: ${s} days`)
    .join(', ')

  await slack(`📋 *Daily Habits — ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}*

✅ Done (${completed.length}): ${completed.join(', ') || 'none yet'}
⬜ Remaining (${missing.length}): ${missing.join(', ')}
${streakInfo ? `\n🔥 Active streaks: ${streakInfo}` : ''}

_Log a habit: tell Jarvis "logged [habit name]" or "mark [habit] done"_`)
}

export async function getHabitContext(): Promise<string> {
  const { completed, missing, streaks } = await getDailyHabitStatus()
  const topStreak = Object.entries(streaks).sort(([,a],[,b]) => b - a)[0]
  return `[HABITS TODAY: ${completed.length} done, ${missing.length} remaining${topStreak ? `, longest streak: ${topStreak[0]} ${topStreak[1]} days` : ''}]`
}
