'use client'

import { useState, useEffect } from 'react'
import type { BusinessIdea } from '@/lib/agents/ideas'

const STATUS_COLORS: Record<string, string> = {
  new: '#00d4ff',
  reviewing: '#c9a84c',
  approved: '#00ff88',
  rejected: '#ff4455',
  building: '#a855f7',
}

const SCORE_COLOR = (s: number) => s >= 9 ? '#00ff88' : s >= 7 ? '#c9a84c' : '#ff4455'

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<BusinessIdea[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [context, setContext] = useState('')
  const [selected, setSelected] = useState<BusinessIdea | null>(null)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => { loadIdeas() }, [filter])

  async function loadIdeas() {
    setLoading(true)
    const res = await fetch(`/api/ideas${filter !== 'all' ? `?status=${filter}` : ''}`)
    const data = await res.json()
    setIdeas(data.ideas ?? [])
    setLoading(false)
  }

  async function generate() {
    setGenerating(true)
    const res = await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', context }),
    })
    const data = await res.json()
    setIdeas(prev => [...(data.ideas ?? []), ...prev])
    setContext('')
    setGenerating(false)
  }

  async function updateStatus(id: string, status: BusinessIdea['status']) {
    await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id, status }),
    })
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null)
  }

  const filtered = filter === 'all' ? ideas : ideas.filter(i => i.status === filter)

  return (
    <div className="min-h-screen bg-[#020810] text-white font-mono">
      {/* Header */}
      <div className="border-b border-cyan-900/30 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] tracking-[0.3em] text-cyan-500/50 uppercase">ATLAS — IDEA PIPELINE</div>
          <div className="text-[20px] font-bold text-cyan-300 tracking-wider">New Business Opportunities</div>
        </div>
        <a href="/" className="text-[10px] text-cyan-700 hover:text-cyan-400 tracking-wider">← HUD</a>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left: Idea list */}
        <div className="w-[380px] border-r border-cyan-900/20 flex flex-col">
          {/* Generate */}
          <div className="p-4 border-b border-cyan-900/20">
            <div className="text-[9px] tracking-widest text-cyan-500/50 uppercase mb-2">Generate New Ideas</div>
            <input
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Optional context (e.g. 'focus on AI tools')..."
              className="w-full bg-black/40 border border-cyan-900/40 px-3 py-2 text-[11px] text-cyan-200 placeholder:text-cyan-900 outline-none mb-2"
            />
            <button
              onClick={generate}
              disabled={generating}
              className="w-full py-2 text-[10px] font-bold tracking-widest border border-cyan-700/50 text-cyan-400 bg-cyan-900/20 hover:bg-cyan-800/30 disabled:opacity-40 transition-colors"
            >
              {generating ? 'ATLAS IS THINKING...' : '⚡ GENERATE IDEAS'}
            </button>
          </div>

          {/* Filter */}
          <div className="px-4 py-2 flex gap-2 border-b border-cyan-900/20 flex-wrap">
            {['all', 'new', 'reviewing', 'approved', 'building', 'rejected'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-[9px] px-2 py-0.5 uppercase tracking-wider border transition-colors ${filter === f ? 'border-cyan-500 text-cyan-300' : 'border-white/10 text-white/30 hover:border-cyan-800'}`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-cyan-700 text-[11px]">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-center px-4">
                <div className="text-[11px] text-white/20">No ideas yet</div>
                <div className="text-[10px] text-white/10">Click Generate Ideas to let Atlas find opportunities</div>
              </div>
            ) : (
              filtered.map(idea => (
                <div
                  key={idea.id ?? idea.title}
                  onClick={() => setSelected(idea)}
                  className={`p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${selected?.title === idea.title ? 'bg-white/5' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-[12px] font-bold text-white/90 leading-tight">{idea.title}</div>
                    <div className="text-[14px] font-bold shrink-0" style={{ color: SCORE_COLOR(idea.score) }}>
                      {idea.score}/10
                    </div>
                  </div>
                  <div className="text-[10px] text-white/40 mb-2 leading-relaxed">{idea.oneLiner}</div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[8px] px-1.5 py-0.5 border uppercase tracking-wider"
                      style={{ borderColor: STATUS_COLORS[idea.status] + '60', color: STATUS_COLORS[idea.status] }}
                    >
                      {idea.status}
                    </span>
                    <span className="text-[9px] text-white/30">{idea.estimatedMRR}</span>
                    <span className="text-[9px] text-white/30">•</span>
                    <span className="text-[9px] text-white/30">{idea.timeToLaunch}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Idea detail */}
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <div className="p-6 max-w-2xl">
              {/* Score badge */}
              <div className="flex items-center gap-4 mb-6">
                <div className="text-[48px] font-bold leading-none" style={{ color: SCORE_COLOR(selected.score) }}>
                  {selected.score}
                </div>
                <div>
                  <div className="text-[11px] text-white/40">ATLAS SCORE / 10</div>
                  <div className="text-[11px] text-white/60 mt-1">{selected.scoreRationale}</div>
                </div>
              </div>

              <h1 className="text-[24px] font-bold text-white mb-1">{selected.title}</h1>
              <p className="text-[13px] text-cyan-300/70 mb-6">{selected.oneLiner}</p>

              {[
                { label: 'The Problem', value: selected.problem },
                { label: 'The Solution', value: selected.solution },
                { label: 'Target Audience', value: selected.targetAudience },
                { label: 'Revenue Model', value: selected.revenueModel },
                { label: 'Your Competitive Edge', value: selected.competitiveEdge },
              ].map(({ label, value }) => (
                <div key={label} className="mb-5">
                  <div className="text-[9px] tracking-widest text-cyan-500/50 uppercase mb-1">{label}</div>
                  <div className="text-[12px] text-white/80 leading-relaxed">{value}</div>
                </div>
              ))}

              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { label: 'Est. MRR', value: selected.estimatedMRR },
                  { label: 'Time to Launch', value: selected.timeToLaunch },
                  { label: 'Capital Needed', value: selected.capitalRequired },
                ].map(({ label, value }) => (
                  <div key={label} className="border border-cyan-900/30 p-3">
                    <div className="text-[9px] text-cyan-500/50 uppercase tracking-wider mb-1">{label}</div>
                    <div className="text-[13px] font-bold text-cyan-300">{value}</div>
                  </div>
                ))}
              </div>

              <div className="mb-6">
                <div className="text-[9px] tracking-widest text-cyan-500/50 uppercase mb-2">Skills Required</div>
                <div className="flex gap-2 flex-wrap">
                  {selected.skillsRequired.map(s => (
                    <span key={s} className="text-[10px] px-2 py-0.5 border border-cyan-900/40 text-cyan-400/70">{s}</span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 flex-wrap">
                {(['reviewing', 'approved', 'building', 'rejected'] as const).map(status => (
                  <button
                    key={status}
                    onClick={() => selected.id && updateStatus(selected.id, status)}
                    disabled={selected.status === status}
                    className="px-4 py-2 text-[10px] font-bold tracking-wider border transition-colors disabled:opacity-30"
                    style={{
                      borderColor: STATUS_COLORS[status] + '80',
                      color: STATUS_COLORS[status],
                      backgroundColor: selected.status === status ? STATUS_COLORS[status] + '20' : 'transparent',
                    }}
                  >
                    {status.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="text-[32px] font-bold text-cyan-900/30">PIPELINE</div>
              <div className="text-[11px] text-white/20">Select an idea to review it</div>
              <div className="text-[10px] text-white/10 max-w-xs">
                Atlas generates, scores, and tracks business opportunities tailored to your skills and goals.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
