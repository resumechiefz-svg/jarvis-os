'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'

interface DayPlan { day: string; type: string; details: string; miles: number }
interface MealItem { time: string; meal: string; items: string; calories: number }
interface Todo { id: number; text: string; done: boolean; week: boolean; priority: string }
interface LifeEvent { date: string; type: string; name: string; budget: number; note: string }
interface LifeData { week: number; todayPlan: DayPlan; mealPlan: MealItem[]; todos: Todo[]; events: LifeEvent[]; raceName: string; raceDate: string }

// Collapsible section header — Iron Man style
function CollapseHead({ title, badge, open, onToggle }: { title: string; badge?: string; open: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid rgba(0,212,255,${open ? '0.2' : '0.08'})`, paddingBottom: 4, marginBottom: open ? 6 : 0, marginTop: 10, cursor: 'pointer', userSelect: 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 7, color: open ? 'rgba(0,212,255,0.8)' : 'rgba(0,212,255,0.35)', transition: 'color 0.2s' }}>
          {open ? '▼' : '▶'}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: open ? 'rgba(0,212,255,0.7)' : 'rgba(0,212,255,0.4)', textTransform: 'uppercase', transition: 'color 0.2s' }}>{title}</span>
      </div>
      {badge && <span style={{ fontSize: 9, color: 'rgba(0,255,136,0.55)', letterSpacing: '0.08em', fontWeight: 600 }}>{badge}</span>}
    </div>
  )
}

function daysUntil(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'TODAY'
  if (diff === 1) return 'TOMORROW'
  if (diff < 0) return `${Math.abs(diff)}d ago`
  return `${diff}d`
}

function typeColor(type: string) {
  if (type === 'race') return '#00ff88'
  if (type === 'birthday') return '#a855f7'
  if (type === 'holiday') return '#c9a84c'
  return '#cce8ff'
}

// ── Google Calendar ────────────────────────────────────────
interface GCalEvent { id: string; title: string; start: string; isAllDay: boolean; location?: string }

function GoogleCalendarSection({ open }: { open: boolean }) {
  const [events, setEvents] = useState<GCalEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/google/calendar?type=upcoming&days=7')
      .then(r => r.json())
      .then(d => { setConnected(d.connected); setEvents(d.events ?? []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  if (!loaded || !open) return null

  const fmt = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    const today = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    if (d.toDateString() === today.toDateString())
      return `Today ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    if (d.toDateString() === tomorrow.toDateString())
      return `Tomorrow ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  if (!connected) {
    return (
      <a href="/api/google/auth" style={{ gridColumn: '1/-1', fontSize: 11, color: '#c9a84c', textDecoration: 'none', fontWeight: 700, display: 'block', padding: '4px 0' }}>
        → Connect Google Calendar
      </a>
    )
  }

  if (events.length === 0) {
    return <div style={{ gridColumn: '1/-1', fontSize: 11, color: 'rgba(255,255,255,0.2)', padding: '4px 0' }}>No events in next 7 days</div>
  }

  return (
    <>
      {events.slice(0, 5).map(ev => (
        <div key={ev.id} style={{ gridColumn: '1/-1', display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <span style={{ fontSize: 10, color: '#00d4ff', minWidth: 80, fontFamily: 'monospace', flexShrink: 0, lineHeight: 1.4 }}>{fmt(ev.start)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', lineHeight: 1.3 }}>{ev.title}</div>
            {ev.location && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{ev.location}</div>}
          </div>
        </div>
      ))}
    </>
  )
}

// ── Main ─────────────────────────────────────────────────
export default function LifeSection() {
  const [data, setData] = useState<LifeData | null>(null)
  const [newTodo, setNewTodo] = useState('')
  const [todoTab, setTodoTab] = useState<'today' | 'week'>('today')
  const inputRef = useRef<HTMLInputElement>(null)

  // Collapsible state — training open by default, others closed
  const [openTraining, setOpenTraining] = useState(true)
  const [openMeals, setOpenMeals] = useState(false)
  const [openTodos, setOpenTodos] = useState(true)
  const [openCalendar, setOpenCalendar] = useState(false)
  const [openUpcoming, setOpenUpcoming] = useState(false)

  const load = useCallback(() =>
    fetch('/api/life').then(r => r.json()).then(setData).catch(() => {}), [])

  useEffect(() => {
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [load])

  const addTodo = async () => {
    const text = newTodo.trim()
    if (!text) return
    setNewTodo('')
    await fetch('/api/life', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', text, week: todoTab === 'week' }),
    })
    load()
  }

  const doneTodo = async (id: number) => {
    await fetch('/api/life', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'done', id }),
    })
    load()
  }

  if (!data) return null

  const raceCountdown = daysUntil(data.raceDate)
  const todayMiles = data.todayPlan?.miles ?? 0
  const filteredTodos = data.todos?.filter(t => todoTab === 'week' ? t.week : !t.week) ?? []

  return (
    <div style={{ gridColumn: '1/-1', display: 'contents' }}>

      {/* ── TRAINING ─────────────────────────────── */}
      <CollapseHead
        title="Training"
        badge={`WK ${data.week} · ${raceCountdown} TO RACE`}
        open={openTraining}
        onToggle={() => setOpenTraining(o => !o)}
      />

      {openTraining && (
        <>
          {data.todayPlan && (
            <div style={{ gridColumn: '1/-1', background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.12)', borderRadius: 3, padding: '6px 10px', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#00ff88', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {data.todayPlan.day} — {data.todayPlan.type}
                </span>
                {todayMiles > 0 && <span style={{ fontSize: 11, color: 'rgba(0,255,136,0.7)' }}>{todayMiles} mi</span>}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{data.todayPlan.details}</div>
            </div>
          )}

          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 4, marginBottom: 2 }}>
            <div style={{ flex: 1, background: 'rgba(0,8,20,0.6)', border: '1px solid rgba(0,212,255,0.1)', borderRadius: 3, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{data.raceName}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#00d4ff', fontFamily: 'monospace', marginTop: 2 }}>{raceCountdown}</div>
            </div>
            <div style={{ flex: 1, background: 'rgba(0,8,20,0.6)', border: '1px solid rgba(0,212,255,0.1)', borderRadius: 3, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Today</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#c9a84c', fontFamily: 'monospace', marginTop: 2 }}>{todayMiles > 0 ? `${todayMiles} mi` : '—'}</div>
            </div>
          </div>
        </>
      )}

      {/* ── MEALS ─────────────────────────────────── */}
      <CollapseHead title="Meal Plan" open={openMeals} onToggle={() => setOpenMeals(o => !o)} />

      {openMeals && data.mealPlan?.map((m, i) => {
        const now = new Date()
        const [h] = m.time.split(':').map(Number)
        const mealHour = h + (m.time.includes('PM') && h !== 12 ? 12 : 0)
        const isCurrent = now.getHours() >= mealHour && now.getHours() < mealHour + 3
        return (
          <div key={i} style={{ gridColumn: '1/-1', display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: 11, color: isCurrent ? '#00ff88' : 'rgba(255,255,255,0.3)', minWidth: 56, fontFamily: 'monospace', fontWeight: isCurrent ? 700 : 400 }}>{m.time}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: isCurrent ? '#cce8ff' : 'rgba(255,255,255,0.55)' }}>{m.meal}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', lineHeight: 1.4, marginTop: 1 }}>{m.items}</div>
            </div>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>{m.calories}cal</span>
          </div>
        )
      })}

      {/* ── TO-DO ─────────────────────────────────── */}
      <CollapseHead title="To-Do" open={openTodos} onToggle={() => setOpenTodos(o => !o)} />

      {openTodos && (
        <>
          {/* Tabs */}
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 4, marginBottom: 6 }}>
            {(['today', 'week'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setTodoTab(tab)}
                style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 0', border: '1px solid', cursor: 'pointer', borderRadius: 2, transition: 'all 0.15s', background: todoTab === tab ? 'rgba(0,212,255,0.1)' : 'transparent', borderColor: todoTab === tab ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.07)', color: todoTab === tab ? '#00d4ff' : 'rgba(255,255,255,0.3)' }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Todo items */}
          <div style={{ gridColumn: '1/-1', maxHeight: 160, overflowY: 'auto', marginBottom: 6 }}>
            {filteredTodos.length === 0 && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '10px 0' }}>
                No {todoTab} tasks — add one below
              </div>
            )}
            {filteredTodos.map(todo => (
              <div
                key={todo.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px', borderRadius: 2, cursor: 'pointer' }}
                onClick={() => doneTodo(todo.id)}
              >
                <div style={{ width: 11, height: 11, border: '1px solid rgba(0,212,255,0.4)', borderRadius: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {todo.done && <div style={{ width: 5, height: 5, background: '#00ff88', borderRadius: 1 }} />}
                </div>
                <span style={{ fontSize: 12, color: todo.priority === 'high' ? '#ff6b35' : 'rgba(255,255,255,0.65)', lineHeight: 1.4, flex: 1, textDecoration: todo.done ? 'line-through' : 'none', opacity: todo.done ? 0.4 : 1 }}>
                  {todo.text}
                </span>
              </div>
            ))}
          </div>

          {/* Add todo */}
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 4, marginBottom: 4 }}>
            <input
              ref={inputRef}
              id="todo-input"
              name="todo-input"
              autoComplete="off"
              value={newTodo}
              onChange={e => setNewTodo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTodo()}
              placeholder={`Add ${todoTab} task...`}
              style={{ flex: 1, fontSize: 12, background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.14)', borderRadius: 2, padding: '5px 8px', color: 'rgba(255,255,255,0.75)', outline: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={addTodo}
              style={{ fontSize: 14, padding: '4px 10px', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 2, color: '#00d4ff', cursor: 'pointer', fontWeight: 700 }}
            >+</button>
          </div>
        </>
      )}

      {/* ── GOOGLE CALENDAR ──────────────────────── */}
      <CollapseHead
        title="Calendar"
        badge="7 DAYS"
        open={openCalendar}
        onToggle={() => setOpenCalendar(o => !o)}
      />
      <GoogleCalendarSection open={openCalendar} />

      {/* ── UPCOMING EVENTS ──────────────────────── */}
      <CollapseHead
        title="Upcoming"
        badge="30 DAYS"
        open={openUpcoming}
        onToggle={() => setOpenUpcoming(o => !o)}
      />

      {openUpcoming && (data.events ?? []).map((ev, i) => (
        <div key={i} style={{ gridColumn: '1/-1', display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <span style={{ fontSize: 11, color: typeColor(ev.type), minWidth: 60, fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>{daysUntil(ev.date)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', lineHeight: 1.3 }}>{ev.name}</div>
            {ev.note && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', lineHeight: 1.3, marginTop: 1 }}>{ev.note}</div>}
          </div>
          {ev.budget > 0 && (
            <span style={{ fontSize: 11, color: '#c9a84c', flexShrink: 0, fontFamily: 'monospace' }}>${ev.budget}</span>
          )}
        </div>
      ))}

    </div>
  )
}
