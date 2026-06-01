/**
 * Beckett — AB's son, born June 2026, turns 5
 * Biweekly custody schedule wired into SAGE
 * SAGE proactively reminds AB before handoffs, flags milestones
 */
import { supabaseAdmin } from '../supabase/client'

const TOKEN = process.env.SLACK_BOT_TOKEN

async function slack(text: string) {
  if (!TOKEN) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#jarvis', text }),
  })
}

// Beckett's key dates — update as needed
export const BECKETT_DATA = {
  name: 'Beckett',
  birthday: '2021-06-15', // turns 5 June 2026 — update exact date
  age: 5,
  school: 'Pre-K Charlotte',
  // Custody: AB has Beckett every other week
  // Set the start of current custody week — system calculates from there
  custodyStartDate: '2026-06-02', // Monday AB gets Beckett — update to real date
  custodyWeekDays: 7, // 7 days on, 7 days off
}

export function isCurrentlyCustodyWeek(): boolean {
  const start = new Date(BECKETT_DATA.custodyStartDate)
  const now = new Date()
  const daysDiff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const weekNum = Math.floor(daysDiff / 7)
  return weekNum % 2 === 0 // even weeks = custody week
}

export function daysUntilNextHandoff(): number {
  const start = new Date(BECKETT_DATA.custodyStartDate)
  const now = new Date()
  const daysDiff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const dayInCycle = daysDiff % 14
  const isCustodyWeek = Math.floor(daysDiff / 7) % 2 === 0
  return isCustodyWeek ? 14 - dayInCycle : 7 - (dayInCycle - 7)
}

export function daysUntilBirthday(): number {
  const today = new Date()
  const birthday = new Date(BECKETT_DATA.birthday)
  birthday.setFullYear(today.getFullYear())
  if (birthday < today) birthday.setFullYear(today.getFullYear() + 1)
  return Math.ceil((birthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export async function checkBeckettAlerts(): Promise<void> {
  const handoff = daysUntilNextHandoff()
  const birthday = daysUntilBirthday()
  const custodyWeek = isCurrentlyCustodyWeek()

  const alerts: string[] = []

  // Handoff reminder
  if (handoff === 1) {
    const direction = custodyWeek ? 'drops off' : 'picks up'
    alerts.push(`👦 *Beckett handoff tomorrow.* AB ${direction} Beckett. Transition day — adjust schedule accordingly.`)
  }

  if (handoff === 2 && !custodyWeek) {
    alerts.push(`👦 *Beckett arrives in 2 days.* Switch to father mode — prep the place, plan meals, check school schedule.`)
  }

  // Birthday alert
  if (birthday === 14) alerts.push(`🎂 *Beckett's birthday is 2 weeks away.* Time to plan something special.`)
  if (birthday === 7) alerts.push(`🎂 *Beckett's birthday is one week away.* Gift and plans sorted?`)
  if (birthday === 1) alerts.push(`🎂 *Beckett's birthday is TOMORROW.* Happy almost-birthday to the little man.`)

  for (const alert of alerts) await slack(alert)

  // Save mode to memory for SAGE context
  await supabaseAdmin.from('ai_memories').upsert({
    category: 'beckett_status',
    content: 'current_status',
    context: JSON.stringify({
      custodyWeek,
      daysUntilHandoff: handoff,
      daysUntilBirthday: birthday,
      checkedAt: new Date().toISOString(),
    }),
    importance: 10,
    created_at: new Date().toISOString(),
  })
}

export async function getBeckettContext(): Promise<string> {
  const custodyWeek = isCurrentlyCustodyWeek()
  const handoff = daysUntilNextHandoff()
  const birthday = daysUntilBirthday()

  return `[BECKETT STATUS]
Mode: ${custodyWeek ? 'CUSTODY WEEK — Beckett is with AB' : 'BUILD WEEK — AB solo'}
Next handoff: ${handoff} day${handoff !== 1 ? 's' : ''}
Birthday countdown: ${birthday} days
Age: ${BECKETT_DATA.age}`
}
