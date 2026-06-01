import { NextRequest, NextResponse } from 'next/server'
import { logHabit, runHabitCheckin, getDailyHabitStatus } from '@/lib/agents/habit-tracker'

export async function GET() {
  const status = await getDailyHabitStatus()
  return NextResponse.json(status)
}

export async function POST(req: NextRequest) {
  const { habitId, action } = await req.json()
  if (action === 'checkin') {
    await runHabitCheckin()
    return NextResponse.json({ ok: true })
  }
  if (habitId) {
    await logHabit(habitId)
    return NextResponse.json({ ok: true, logged: habitId })
  }
  return NextResponse.json({ error: 'habitId required' }, { status: 400 })
}
