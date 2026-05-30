'use client'

import { useState, useEffect } from 'react'
import type { AcquisitionScore } from '@/lib/agents/acquisition'

const STATUS_COLORS = { green: '#00ff88', yellow: '#c9a84c', red: '#ff4455' }
const READINESS_COLORS: Record<string, string> = {
  'not ready': '#ff4455',
  'building': '#ff6b35',
  'approaching': '#c9a84c',
  'ready': '#00d4ff',
  'prime': '#00ff88',
}

export default function AcquisitionPage() {
  const [score, setScore] = useState<AcquisitionScore | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/acquisition')
      .then(r => r.json())
      .then(d => { setScore(d.score); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-[#020810] text-white font-mono">
      <div className="border-b border-cyan-900/30 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] tracking-[0.3em] text-cyan-500/50 uppercase">ATLAS — ACQUISITION INTELLIGENCE</div>
          <div className="text-[20px] font-bold text-cyan-300 tracking-wider">ResumeChiefz Acquisition Readiness</div>
        </div>
        <a href="/" className="text-[10px] text-cyan-700 hover:text-cyan-400 tracking-wider">← HUD</a>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-cyan-700 text-[12px] tracking-widest">ATLAS IS ANALYZING...</div>
        ) : score ? (
          <>
            {/* Overall score */}
            <div className="flex items-center gap-8 mb-8 p-6 border border-cyan-900/30">
              <div className="text-center">
                <div className="text-[72px] font-bold leading-none" style={{ color: READINESS_COLORS[score.readinessLevel] }}>
                  {score.overallScore}
                </div>
                <div className="text-[10px] text-white/40 tracking-widest uppercase mt-1">/ 100</div>
              </div>
              <div className="flex-1">
                <div
                  className="text-[18px] font-bold tracking-wider uppercase mb-2"
                  style={{ color: READINESS_COLORS[score.readinessLevel] }}
                >
                  {score.readinessLevel}
                </div>
                <div className="text-[12px] text-white/60 mb-3">Est. Valuation: <span className="text-cyan-300 font-bold">{score.estimatedValuation}</span></div>
                <div className="text-[11px] text-white/70 leading-relaxed">{score.advice}</div>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="mb-8">
              <div className="text-[9px] tracking-widest text-cyan-500/50 uppercase mb-3">Acquisition Metrics</div>
              <div className="grid grid-cols-2 gap-3">
                {score.metrics.map(m => (
                  <div key={m.metric} className="border border-white/5 p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[9px] text-white/40 uppercase tracking-wider">{m.category} — {m.metric}</div>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[m.status] }} />
                    </div>
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-[16px] font-bold" style={{ color: STATUS_COLORS[m.status] }}>{m.current}</span>
                      <span className="text-[10px] text-white/30">target: {m.target}</span>
                    </div>
                    <div className="text-[10px] text-white/50 leading-relaxed">{m.note}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top gaps */}
            <div className="mb-8">
              <div className="text-[9px] tracking-widest text-cyan-500/50 uppercase mb-3">Top Gaps to Close</div>
              <div className="space-y-2">
                {score.topGaps.map((gap, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 border border-red-900/20">
                    <span className="text-red-400 text-[10px] font-bold shrink-0">{i + 1}.</span>
                    <span className="text-[11px] text-white/70">{gap}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Next milestone + acquirer */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-cyan-900/30 p-4">
                <div className="text-[9px] tracking-widest text-cyan-500/50 uppercase mb-2">Next Milestone</div>
                <div className="text-[12px] text-cyan-300 leading-relaxed">{score.nextMilestone}</div>
              </div>
              <div className="border border-purple-900/30 p-4">
                <div className="text-[9px] tracking-widest text-purple-500/50 uppercase mb-2">Likely Acquirer Profile</div>
                <div className="text-[12px] text-purple-300 leading-relaxed">{score.acquirerProfile}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center text-white/30 text-[12px] mt-20">Failed to load acquisition analysis.</div>
        )}
      </div>
    </div>
  )
}
