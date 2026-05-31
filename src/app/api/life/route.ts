/**
 * Life API — training schedule, to-dos, meals, events
 * Backed by Supabase ai_memories with category='life_*'
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'

// Whitewater 50 Mile Race Training Plan (ChatGPT generated, adapted)
// Race date target: October 2026
const TRAINING_PLAN = {
  raceName: 'Whitewater 50 Mile',
  raceDate: '2026-10-17',
  currentWeek: () => {
    const start = new Date('2026-05-26') // Week 1 start
    const now = new Date()
    return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)))
  },
  phases: [
    { name: 'Base Building', weeks: '1-8', miles: '30-40/wk', focus: 'Aerobic base, long runs, easy effort' },
    { name: 'Build Phase', weeks: '9-16', miles: '40-55/wk', focus: 'Tempo runs, back-to-back longs, trail miles' },
    { name: 'Peak Phase', weeks: '17-20', miles: '55-65/wk', focus: 'Race-specific workouts, elevation gain' },
    { name: 'Taper', weeks: '21-22', miles: '30-20/wk', focus: 'Freshen up, race-pace tune-ups' },
  ],
  weekly: [
    { day: 'Mon', type: 'Rest / Cross-Train', details: 'Active recovery — swim, bike, yoga, or full rest', miles: 0 },
    { day: 'Tue', type: 'Easy Run', details: '45–60 min easy effort (Z2), flat terrain', miles: 6 },
    { day: 'Wed', type: 'Quality Run', details: 'Intervals or tempo — 6×800m @ 5K effort / 4 mile tempo', miles: 8 },
    { day: 'Thu', type: 'Easy Run', details: '45–60 min easy, focus on form and cadence', miles: 6 },
    { day: 'Fri', type: 'Rest or Shakeout', details: '20–30 min very easy, or full rest before long run', miles: 3 },
    { day: 'Sat', type: 'Long Run', details: 'Trail run — build to 20+ miles peak; terrain practice', miles: 14 },
    { day: 'Sun', type: 'Back-to-Back Medium', details: '8–12 miles easy on tired legs — key for ultra prep', miles: 10 },
  ],
  mealPlan: [
    { time: '6:00 AM', meal: 'Pre-run fuel', items: 'Banana + almond butter + black coffee', calories: 280 },
    { time: '8:30 AM', meal: 'Post-run recovery', items: 'Protein shake + oats + blueberries + honey', calories: 520 },
    { time: '12:00 PM', meal: 'Lunch', items: 'Grilled chicken or salmon, rice, mixed greens, avocado', calories: 650 },
    { time: '3:30 PM', meal: 'Afternoon snack', items: 'Greek yogurt + granola + fruit, or apple + nut butter', calories: 300 },
    { time: '7:00 PM', meal: 'Dinner', items: 'Sweet potato + lean protein + roasted veggies, olive oil', calories: 700 },
    { time: '9:00 PM', meal: 'Recovery snack (if needed)', items: 'Cottage cheese + berries, or protein shake', calories: 200 },
  ],
}

// Upcoming events — holidays + birthdays relevant to AB's budget
const UPCOMING_EVENTS = [
  { date: '2026-06-15', type: 'birthday', name: 'Mother\'s Day passed — schedule dinner', budget: 80, note: 'If not done yet, plan makeup dinner' },
  { date: '2026-06-19', type: 'holiday', name: 'Juneteenth', budget: 0, note: 'Federal holiday — markets closed' },
  { date: '2026-07-04', type: 'holiday', name: 'Independence Day', budget: 120, note: 'BBQ/fireworks budget — markets closed' },
  { date: '2026-09-07', type: 'holiday', name: 'Labor Day', budget: 0, note: 'Markets closed — 3-day weekend' },
  { date: '2026-10-12', type: 'holiday', name: 'Columbus Day', budget: 0, note: 'Markets open — bond markets close' },
  { date: '2026-10-17', type: 'race', name: 'Whitewater 50 Mile Race Day', budget: 250, note: 'Travel + gear + race entry — GOAL EVENT' },
  { date: '2026-11-11', type: 'holiday', name: 'Veterans Day', budget: 0, note: 'Markets open — some closures' },
  { date: '2026-11-26', type: 'holiday', name: 'Thanksgiving', budget: 200, note: 'Family dinner budget — markets closed' },
  { date: '2026-12-25', type: 'holiday', name: 'Christmas', budget: 400, note: 'Gift + travel budget — plan ahead with deposits' },
]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'all'

  if (type === 'training') {
    const week = TRAINING_PLAN.currentWeek()
    const today = new Date().getDay() // 0=Sun
    const dayMap = [6, 0, 1, 2, 3, 4, 5] // JS day → plan index
    const todayPlan = TRAINING_PLAN.weekly[dayMap[today]]
    return NextResponse.json({ week, todayPlan, plan: TRAINING_PLAN, mealPlan: TRAINING_PLAN.mealPlan })
  }

  if (type === 'todos') {
    const { data } = await supabaseAdmin
      .from('ai_memories')
      .select('id, content, context, created_at')
      .eq('category', 'life_todo')
      .order('created_at', { ascending: false })
      .limit(50)

    const todos = (data ?? []).map(d => {
      try {
        const ctx = JSON.parse(d.context ?? '{}')
        return { id: d.id, text: d.content, done: ctx.done ?? false, week: ctx.week ?? false, priority: ctx.priority ?? 'normal', created: d.created_at }
      } catch { return { id: d.id, text: d.content, done: false, week: false, priority: 'normal', created: d.created_at } }
    })
    return NextResponse.json(todos)
  }

  if (type === 'events') {
    const today = new Date()
    const upcoming = UPCOMING_EVENTS.filter(e => {
      const diff = (new Date(e.date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      return diff >= -1 && diff <= 60 // next 60 days
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    return NextResponse.json(upcoming)
  }

  // All
  const week = TRAINING_PLAN.currentWeek()
  const today = new Date().getDay()
  const dayMap = [6, 0, 1, 2, 3, 4, 5]
  const todayPlan = TRAINING_PLAN.weekly[dayMap[today]]

  const [todoRes] = await Promise.all([
    supabaseAdmin.from('ai_memories').select('id, content, context, created_at').eq('category', 'life_todo').order('created_at', { ascending: false }).limit(30),
  ])

  const todos = ((todoRes.data) ?? []).map(d => {
    try { const ctx = JSON.parse(d.context ?? '{}'); return { id: d.id, text: d.content, done: ctx.done ?? false, week: ctx.week ?? false, priority: ctx.priority ?? 'normal' } }
    catch { return { id: d.id, text: d.content, done: false, week: false, priority: 'normal' } }
  }).filter((t: { done: boolean }) => !t.done).slice(0, 10)

  const nowDate = new Date()
  const events = UPCOMING_EVENTS.filter(e => {
    const diff = (new Date(e.date).getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24)
    return diff >= -1 && diff <= 30
  }).slice(0, 4)

  return NextResponse.json({ week, todayPlan, mealPlan: TRAINING_PLAN.mealPlan, todos, events, raceName: TRAINING_PLAN.raceName, raceDate: TRAINING_PLAN.raceDate })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, text, id, week, priority } = body

  if (action === 'add') {
    await supabaseAdmin.from('ai_memories').insert({
      category: 'life_todo',
      content: text,
      context: JSON.stringify({ done: false, week: week ?? false, priority: priority ?? 'normal' }),
      importance: 6,
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'done') {
    const { data } = await supabaseAdmin.from('ai_memories').select('context').eq('id', id).single()
    const ctx = JSON.parse(data?.context ?? '{}')
    await supabaseAdmin.from('ai_memories').update({ context: JSON.stringify({ ...ctx, done: true }) }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    await supabaseAdmin.from('ai_memories').delete().eq('id', id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
