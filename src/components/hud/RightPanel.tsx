'use client'

import { useState, useEffect } from 'react'
import type { Agent } from '@/lib/types'

const AGENT_COLORS: Record<string, string> = {
  jarvis:  '#00d4ff',
  nova:    '#a855f7',
  sage:    '#00ff88',
  vault:   '#c9a84c',
  echo:    '#ff6b35',
  scout:   '#ff4455',
  reel:    '#ff69b4',
  lister:  '#fbbf24',
  dex:     '#60a5fa',
  beacon:  '#34d399',
  ledger:  '#f87171',
  atlas:   '#e879f9',
}

// All 11 agents — all phases complete, all active
const ALL_AGENTS: Agent[] = [
  { name: 'jarvis',  displayName: 'JARVIS',  status: 'active', color: AGENT_COLORS.jarvis },
  { name: 'nova',    displayName: 'NOVA',    status: 'active', color: AGENT_COLORS.nova },
  { name: 'sage',    displayName: 'SAGE',    status: 'active', color: AGENT_COLORS.sage },
  { name: 'vault',   displayName: 'VAULT',   status: 'active', color: AGENT_COLORS.vault },
  { name: 'echo',    displayName: 'ECHO',    status: 'active', color: AGENT_COLORS.echo },
  { name: 'scout',   displayName: 'SCOUT',   status: 'active', color: AGENT_COLORS.scout },
  { name: 'reel',    displayName: 'REEL',    status: 'active', color: AGENT_COLORS.reel },
  { name: 'lister',  displayName: 'LISTER',  status: 'active', color: AGENT_COLORS.lister },
  { name: 'dex',     displayName: 'DEX',     status: 'active', color: AGENT_COLORS.dex },
  { name: 'beacon',  displayName: 'BEACON',  status: 'active', color: AGENT_COLORS.beacon },
  { name: 'ledger',  displayName: 'LEDGER',  status: 'active', color: AGENT_COLORS.ledger },
  { name: 'atlas',   displayName: 'ATLAS',   status: 'active', color: AGENT_COLORS.atlas },
]

const PHASES = [
  { label: 'Phase 1 — Foundation',    complete: true  },
  { label: 'Phase 2 — Automation',    complete: true  },
  { label: 'Phase 3 — Intelligence',  complete: true  },
  { label: 'Phase 4 — Expansion',     complete: true  },
]

function AgentStatusDot({ status, color }: { status: Agent['status']; color: string }) {
  if (status === 'working') return <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: color }} />
  if (status === 'active')  return <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: color, boxShadow: `0 0 5px ${color}` }} />
  return <span className="w-2 h-2 rounded-full bg-white/10" />
}

interface Props {
  activeAgent: string
  mrr?: number
}

export default function RightPanel({ activeAgent, mrr = 0 }: Props) {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    function tick() {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', { hour12: false }))
      setDate(now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  // Dynamic roadmap based on real MRR
  const roadmap = [
    { label: '$1K MRR',       done: mrr >= 1000,  current: mrr > 0 && mrr < 1000 },
    { label: '$5K MRR',       done: mrr >= 5000,  current: mrr >= 1000 && mrr < 5000 },
    { label: '$10K MRR',      done: mrr >= 10000, current: mrr >= 5000 && mrr < 10000 },
    { label: '$50K Net Worth', done: false,         current: false },
    { label: 'FI by 40',      done: false,         current: false },
  ]

  return (
    <div className="right-panel h-full overflow-y-auto px-3 py-3">
      {/* Live clock */}
      <div className="mb-4 text-right">
        <div className="text-[26px] font-mono text-cyan-300 leading-none tracking-wider">{time || '——:——:——'}</div>
        <div className="text-[10px] text-cyan-500/60 tracking-widest uppercase mt-0.5">{date}</div>
      </div>

      {/* Agent Status — all 11 */}
      <div className="mb-4">
        <div className="text-[9px] tracking-widest text-cyan-500/50 mb-2 uppercase font-bold border-b border-cyan-900/40 pb-1">
          Agent Status <span className="text-green-400/60 ml-1">12 ONLINE</span>
        </div>
        <div className="space-y-[4px]">
          {ALL_AGENTS.map(agent => (
            <div key={agent.name} className="flex items-center gap-2">
              <AgentStatusDot
                status={agent.name === activeAgent ? 'working' : agent.status}
                color={agent.color}
              />
              <span className="text-[10px] font-mono tracking-wider" style={{ color: agent.color }}>
                {agent.displayName}
              </span>
              <span className="text-[8px] text-white/20 ml-auto font-mono">
                {agent.name === activeAgent ? 'WORKING' : 'ACTIVE'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* System Phase — all complete */}
      <div className="mb-4">
        <div className="text-[9px] tracking-widest text-cyan-500/50 mb-2 uppercase font-bold border-b border-cyan-900/40 pb-1">
          System Phase
        </div>
        <div className="space-y-1">
          {PHASES.map(p => (
            <div key={p.label} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ boxShadow: '0 0 4px #00ff88' }} />
              <span className="text-[10px] text-green-400/80">{p.label}</span>
              <span className="text-[8px] text-green-600/50 ml-auto">✓</span>
            </div>
          ))}
        </div>
      </div>

      {/* 7-Figure Roadmap — live */}
      <div className="mb-3">
        <div className="text-[9px] tracking-widest text-cyan-500/50 mb-2 uppercase font-bold border-b border-cyan-900/40 pb-1">
          7-Figure Roadmap
        </div>
        <div className="space-y-1.5">
          {roadmap.map(m => (
            <div key={m.label} className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-sm flex-shrink-0 ${
                m.done ? 'bg-green-400' : m.current ? 'bg-cyan-400 animate-pulse' : 'border border-white/15'
              }`} />
              <span className={`text-[10px] ${
                m.done ? 'text-green-400' : m.current ? 'text-cyan-300' : 'text-white/25'
              }`}>
                {m.label}
              </span>
              {m.current && <span className="text-[8px] text-cyan-600 ml-auto">NOW</span>}
              {m.done && <span className="text-[8px] text-green-600 ml-auto">✓</span>}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex justify-between text-[8px] text-white/20 mb-1">
            <span>RC MRR</span>
            <span>${mrr.toFixed(0)} / $10,000</span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${Math.min(100, (mrr / 10000) * 100)}%`,
                background: 'linear-gradient(90deg, #00d4ff, #00ff88)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
