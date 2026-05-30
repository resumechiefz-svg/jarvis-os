import { supabaseAdmin } from '../supabase/client'
import type { SageBrief } from '../types'
import { differenceInDays, parseISO, format, addDays } from 'date-fns'

function isCustodyWeek(): boolean {
  // Beckett is on biweekly custody. Anchor: custody started a known date.
  // Update CUSTODY_ANCHOR_DATE to a date AB had Beckett.
  const CUSTODY_ANCHOR_DATE = '2026-05-19' // Monday AB had Beckett
  const anchor = parseISO(CUSTODY_ANCHOR_DATE)
  const today = new Date()
  const daysDiff = differenceInDays(today, anchor)
  const weekNum = Math.floor(daysDiff / 7)
  return weekNum % 2 === 0
}

function nextCustodyChange(): string {
  const CUSTODY_ANCHOR_DATE = '2026-05-19'
  const anchor = parseISO(CUSTODY_ANCHOR_DATE)
  const today = new Date()
  const daysDiff = differenceInDays(today, anchor)
  const weekNum = Math.floor(daysDiff / 7)
  const nextSwitch = addDays(anchor, (weekNum + 1) * 7)
  return format(nextSwitch, 'EEEE, MMM d')
}

async function getUpcomingBills(): Promise<SageBrief['bills']> {
  const today = new Date()
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  const { data } = await supabaseAdmin
    .from('calendar_events')
    .select('*')
    .eq('type', 'bill')
    .gte('date', today.toISOString().split('T')[0])
    .lte('date', in30Days.toISOString().split('T')[0])
    .order('date')
    .limit(5)

  return (data ?? []).map(b => ({
    name: b.title,
    amount: b.amount ?? 0,
    dueDate: b.date,
    overdue: new Date(b.date) < today,
  }))
}

async function getTopGoals(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('goals')
    .select('title, current, target, unit')
    .eq('active', true)
    .eq('completed', false)
    .order('priority')
    .limit(3)

  return (data ?? []).map(g => `${g.title}: ${g.current}/${g.target} ${g.unit}`)
}

export async function getSageBrief(): Promise<SageBrief> {
  const hasBeckett = isCustodyWeek()
  const bills = await getUpcomingBills()
  const goals = await getTopGoals()

  const priorities: string[] = []
  if (hasBeckett) {
    priorities.push('Beckett week — plan meals and activities')
  } else {
    priorities.push('Non-custody week — sprint on RC/CC')
  }
  if (bills.length > 0) priorities.push(`Bill due: ${bills[0].name} ($${bills[0].amount})`)
  if (goals.length > 0) priorities.push(`Goal check: ${goals[0]}`)

  const beckettDaysUntil5 = differenceInDays(new Date('2026-06-01'), new Date())

  return {
    greeting: `Good ${getTimeOfDay()}, AB.`,
    beckettWeek: hasBeckett,
    nextCustodyDate: nextCustodyChange(),
    topPriorities: priorities,
    bills,
    lifeMode: hasBeckett ? 'father' : 'build',
    recommendation: hasBeckett
      ? `Beckett turns 5 in ${beckettDaysUntil5} days — great week to make memories and do RC work during nap/bedtime.`
      : `Non-custody window: push hard on RC content pipeline and eBay listings this week.`,
  }
}

function getTimeOfDay(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
