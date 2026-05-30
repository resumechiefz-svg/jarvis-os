'use client'

import { useState, useEffect } from 'react'
import type { HealthSummary } from '@/lib/agents/health'

export default function HealthPage() {
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState(false)
  const [form, setForm] = useState({
    sleep: 7, energy: 7, mood: 7, stress: 3, workout: false, workoutType: '', steps: 0, notes: '',
  })

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => { setSummary(d.summary); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function logToday() {
    setLogging(true)
    const res = await fetch('/api/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSummary(data.summary)
    setLogging(false)
  }

  const TREND_COLOR = summary?.trend === 'improving' ? '#00ff88' : summary?.trend === 'declining' ? '#ff4455' : '#c9a84c'

  return (
    <div className="min-h-screen bg-[#020810] text-white font-mono">
      <div className="border-b border-cyan-900/30 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] tracking-[0.3em] text-cyan-500/50 uppercase">SAGE — HEALTH ENGINE</div>
          <div className="text-[20px] font-bold text-cyan-300 tracking-wider">Daily Health & Energy Tracking</div>
        </div>
        <a href="/" className="text-[10px] text-cyan-700 hover:text-cyan-400 tracking-wider">← HUD</a>
      </div>

      <div className="grid grid-cols-2 gap-0 h-[calc(100vh-73px)]">
        {/* Left: Log today */}
        <div className="border-r border-cyan-900/20 p-6 overflow-y-auto">
          <div className="text-[9px] tracking-widest text-cyan-500/50 uppercase mb-4">Log Today</div>

          {[
            { key: 'sleep', label: 'Sleep (hours)', min: 0, max: 12, step: 0.5 },
            { key: 'energy', label: 'Energy Level (1-10)', min: 1, max: 10, step: 1 },
            { key: 'mood', label: 'Mood (1-10)', min: 1, max: 10, step: 1 },
            { key: 'stress', label: 'Stress Level (1-10)', min: 1, max: 10, step: 1 },
            { key: 'steps', label: 'Steps', min: 0, max: 30000, step: 500 },
          ].map(({ key, label, min, max, step }) => (
            <div key={key} className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-white/50 uppercase tracking-wider">{label}</label>
                <span className="text-[14px] font-bold text-cyan-300">{form[key as keyof typeof form]}</span>
              </div>
              <input
                type="range"
                min={min} max={max} step={step}
                value={form[key as keyof typeof form] as number}
                onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) }))}
                className="w-full accent-cyan-400"
              />
            </div>
          ))}

          <div className="mb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.workout}
                onChange={e => setForm(f => ({ ...f, workout: e.target.checked }))}
                className="accent-cyan-400 w-4 h-4"
              />
              <span className="text-[11px] text-white/70">Worked out today</span>
            </label>
            {form.workout && (
              <input
                value={form.workoutType}
                onChange={e => setForm(f => ({ ...f, workoutType: e.target.value }))}
                placeholder="Type (e.g. weights, run, KidStrong)"
                className="mt-2 w-full bg-black/40 border border-cyan-900/40 px-3 py-2 text-[11px] text-cyan-200 placeholder:text-cyan-900 outline-none"
              />
            )}
          </div>

          <div className="mb-5">
            <label className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Anything worth logging..."
              className="w-full bg-black/40 border border-cyan-900/40 px-3 py-2 text-[11px] text-cyan-200 placeholder:text-cyan-900 outline-none resize-none h-20"
            />
          </div>

          <button
            onClick={logToday}
            disabled={logging}
            className="w-full py-3 text-[11px] font-bold tracking-widest border border-cyan-700/50 text-cyan-400 bg-cyan-900/20 hover:bg-cyan-800/30 disabled:opacity-40 transition-colors"
          >
            {logging ? 'LOGGING...' : '✓ LOG TODAY'}
          </button>
        </div>

        {/* Right: 7-day summary */}
        <div className="p-6 overflow-y-auto">
          <div className="text-[9px] tracking-widest text-cyan-500/50 uppercase mb-4">7-Day Summary</div>

          {loading ? (
            <div className="text-cyan-700 text-[11px]">Loading...</div>
          ) : summary ? (
            <>
              {/* Trend */}
              <div className="flex items-center gap-3 mb-6 p-4 border border-white/5">
                <div className="text-[28px] font-bold" style={{ color: TREND_COLOR }}>
                  {summary.trend === 'improving' ? '↑' : summary.trend === 'declining' ? '↓' : '→'}
                </div>
                <div>
                  <div className="text-[14px] font-bold uppercase tracking-wider" style={{ color: TREND_COLOR }}>
                    {summary.trend}
                  </div>
                  <div className="text-[10px] text-white/40">7-day energy trend</div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { label: 'Avg Sleep', value: `${summary.avgSleep}h`, color: summary.avgSleep >= 7 ? '#00ff88' : '#ff4455' },
                  { label: 'Avg Energy', value: `${summary.avgEnergy}/10`, color: summary.avgEnergy >= 7 ? '#00ff88' : '#c9a84c' },
                  { label: 'Avg Mood', value: `${summary.avgMood}/10`, color: summary.avgMood >= 7 ? '#00ff88' : '#c9a84c' },
                  { label: 'Avg Stress', value: `${summary.avgStress}/10`, color: summary.avgStress <= 4 ? '#00ff88' : '#ff4455' },
                  { label: 'Workouts', value: `${summary.workoutsThisWeek}/7 days`, color: summary.workoutsThisWeek >= 4 ? '#00ff88' : '#c9a84c' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="border border-white/5 p-3">
                    <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">{label}</div>
                    <div className="text-[18px] font-bold" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* AI Insight */}
              <div className="border border-green-900/30 p-4 mb-4">
                <div className="text-[9px] tracking-widest text-green-500/50 uppercase mb-2">SAGE INSIGHT</div>
                <div className="text-[12px] text-white/80 leading-relaxed">{summary.insight}</div>
              </div>

              {summary.recommendation && (
                <div className="border border-cyan-900/30 p-4">
                  <div className="text-[9px] tracking-widest text-cyan-500/50 uppercase mb-2">RECOMMENDATION</div>
                  <div className="text-[12px] text-cyan-300/80 leading-relaxed">{summary.recommendation}</div>
                </div>
              )}
            </>
          ) : (
            <div className="text-white/20 text-[11px]">No data yet. Log your first day to get started.</div>
          )}
        </div>
      </div>
    </div>
  )
}
