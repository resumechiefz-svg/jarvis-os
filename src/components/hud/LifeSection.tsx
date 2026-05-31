'use client'

import React, { useEffect, useState, useRef } from 'react'

interface DayPlan {
  day: string
  type: string
  details: string
  miles: number
}
interface MealItem {
  time: string
  meal: string
  items: string
  calories: number
}
interface Todo {
  id: number
  text: string
  done: boolean
  week: boolean
  priority: string
}
interface LifeEvent {
  date: string
  type: string
  name: string
  budget: number
  note: string
}
interface LifeData {
  week: number
  todayPlan: DayPlan
  mealPlan: MealItem[]
  todos: Todo[]
  events: LifeEvent[]
  raceName: string
  raceDate: string
}

function SHead({ title, badge }: { title: string; badge?: string | React.ReactNode }) {
  return (
    <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,212,255,0.12)', paddingBottom: 3, marginBottom: 4, marginTop: 8 }}>
      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(0,212,255,0.45)', textTransform: 'uppercase' }}>{title}</span>
      {badge && <span style={{ fontSize: 7, color: 'rgba(0,255,136,0.5)', letterSpacing: '0.1em' }}>{badge}</span>}
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

export default function LifeSection() {
  const [data, setData] = useState<LifeData | null>(null)
  const [newTodo, setNewTodo] = useState('')
  const [todoTab, setTodoTab] = useState<'today' | 'week'>('today')
  const [mealOpen, setMealOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () => fetch('/api/life').then(r => r.json()).then(setData).catch(() => {})

  useEffect(() => {
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

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
      <SHead title="Training" badge={`WK ${data.week} · ${raceCountdown} TO RACE`} />

      {/* Today's workout */}
      {data.todayPlan && (
        <div style={{ gridColumn: '1/-1', background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.1)', borderRadius: 3, padding: '5px 8px', marginBottom: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#00ff88', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{data.todayPlan.day} — {data.todayPlan.type}</span>
            {todayMiles > 0 && <span style={{ fontSize: 8, color: 'rgba(0,255,136,0.6)' }}>{todayMiles} mi</span>}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>{data.todayPlan.details}</div>
        </div>
      )}

      {/* Race countdown chip */}
      <div style={{ gridColumn: '1/-1', display: 'flex', gap: 4, marginBottom: 2 }}>
        <div style={{ flex: 1, background: 'rgba(0,8,20,0.6)', border: '1px solid rgba(0,212,255,0.08)', borderRadius: 3, padding: '4px 6px', textAlign: 'center' }}>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>{data.raceName}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#00d4ff', fontFamily: 'monospace', marginTop: 1 }}>{raceCountdown}</div>
        </div>
        <div style={{ flex: 1, background: 'rgba(0,8,20,0.6)', border: '1px solid rgba(0,212,255,0.08)', borderRadius: 3, padding: '4px 6px', textAlign: 'center' }}>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Week Miles</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', fontFamily: 'monospace', marginTop: 1 }}>
            {data.todayPlan ? `${todayMiles}` : '–'} <span style={{ fontSize: 8, fontWeight: 400 }}>today</span>
          </div>
        </div>
      </div>

      {/* ── MEALS ─────────────────────────────────── */}
      <SHead title="Meal Plan" badge={<span style={{ cursor: 'pointer' }} onClick={() => setMealOpen(!mealOpen)}>{mealOpen ? 'HIDE ▲' : 'SHOW ▼'}</span>} />

      {mealOpen && data.mealPlan?.map((m, i) => {
        const now = new Date()
        const [h, min] = m.time.split(':').map(Number)
        const mealHour = h + (m.time.includes('PM') && h !== 12 ? 12 : 0)
        const isCurrent = now.getHours() >= mealHour && now.getHours() < mealHour + 3
        return (
          <div key={i} style={{ gridColumn: '1/-1', display: 'flex', gap: 6, alignItems: 'flex-start', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
            <span style={{ fontSize: 8, color: isCurrent ? '#00ff88' : 'rgba(255,255,255,0.25)', minWidth: 50, fontFamily: 'monospace', fontWeight: isCurrent ? 700 : 400 }}>{m.time}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, fontWeight: 600, color: isCurrent ? '#cce8ff' : 'rgba(255,255,255,0.5)', letterSpacing: '0.05em' }}>{m.meal}</div>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', lineHeight: 1.4, marginTop: 1 }}>{m.items}</div>
            </div>
            <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>{m.calories}cal</span>
          </div>
        )
      })}

      {/* ── TO-DO ─────────────────────────────────── */}
      <SHead title="To-Do" />

      {/* Tabs */}
      <div style={{ gridColumn: '1/-1', display: 'flex', gap: 4, marginBottom: 6 }}>
        {(['today', 'week'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setTodoTab(tab)}
            style={{ flex: 1, fontSize: 8, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '3px 0', border: '1px solid', cursor: 'pointer', borderRadius: 2, transition: 'all 0.2s', background: todoTab === tab ? 'rgba(0,212,255,0.1)' : 'transparent', borderColor: todoTab === tab ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.06)', color: todoTab === tab ? '#00d4ff' : 'rgba(255,255,255,0.3)' }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Todo items */}
      <div style={{ gridColumn: '1/-1', maxHeight: 120, overflowY: 'auto', marginBottom: 4 }}>
        {filteredTodos.length === 0 && (
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '8px 0' }}>
            No {todoTab} tasks — add one below
          </div>
        )}
        {filteredTodos.map(todo => (
          <div
            key={todo.id}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', borderRadius: 2, cursor: 'pointer', transition: 'background 0.15s' }}
            onClick={() => doneTodo(todo.id)}
          >
            <div style={{ width: 8, height: 8, border: '1px solid rgba(0,212,255,0.35)', borderRadius: 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {todo.done && <div style={{ width: 4, height: 4, background: '#00ff88', borderRadius: 0.5 }} />}
            </div>
            <span style={{ fontSize: 9, color: todo.priority === 'high' ? '#ff6b35' : 'rgba(255,255,255,0.6)', lineHeight: 1.3, flex: 1 }}>
              {todo.text}
            </span>
          </div>
        ))}
      </div>

      {/* Add todo input */}
      <div style={{ gridColumn: '1/-1', display: 'flex', gap: 4, marginBottom: 4 }}>
        <input
          ref={inputRef}
          value={newTodo}
          onChange={e => setNewTodo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTodo()}
          placeholder={`Add ${todoTab} task...`}
          style={{ flex: 1, fontSize: 9, background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.12)', borderRadius: 2, padding: '4px 6px', color: 'rgba(255,255,255,0.7)', outline: 'none', fontFamily: 'inherit' }}
        />
        <button
          onClick={addTodo}
          style={{ fontSize: 9, padding: '4px 8px', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', borderRadius: 2, color: '#00d4ff', cursor: 'pointer', fontWeight: 700 }}
        >
          +
        </button>
      </div>

      {/* ── UPCOMING EVENTS ──────────────────────── */}
      <SHead title="Upcoming" badge="NEXT 30 DAYS" />

      {(data.events ?? []).map((ev, i) => (
        <div key={i} style={{ gridColumn: '1/-1', display: 'flex', gap: 6, alignItems: 'flex-start', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <span style={{ fontSize: 8, color: typeColor(ev.type), minWidth: 52, fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>{daysUntil(ev.date)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.7)', lineHeight: 1.3 }}>{ev.name}</div>
            {ev.note && <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', lineHeight: 1.3, marginTop: 1 }}>{ev.note}</div>}
          </div>
          {ev.budget > 0 && (
            <span style={{ fontSize: 7, color: '#c9a84c', flexShrink: 0, fontFamily: 'monospace' }}>${ev.budget}</span>
          )}
        </div>
      ))}

    </div>
  )
}
