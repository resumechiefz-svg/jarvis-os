'use client'

import type { Agent, TelemetryEntry } from '@/lib/types'

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff',
  nova: '#a855f7',
  sage: '#00ff88',
  vault: '#c9a84c',
  echo: '#ff6b35',
  scout: '#ff4455',
  reel: '#ff69b4',
  lister: '#fbbf24',
  dex: '#60a5fa',
  beacon: '#34d399',
  ledger: '#f87171',
  atlas: '#e879f9',
}

const PHASE1_AGENTS: Agent[] = [
  { name: 'jarvis', displayName: 'JARVIS', status: 'active', color: AGENT_COLORS.jarvis },
  { name: 'nova', displayName: 'NOVA', status: 'active', color: AGENT_COLORS.nova },
  { name: 'sage', displayName: 'SAGE', status: 'active', color: AGENT_COLORS.sage },
  { name: 'vault', displayName: 'VAULT', status: 'active', color: AGENT_COLORS.vault },
  { name: 'echo', displayName: 'ECHO', status: 'standby', color: AGENT_COLORS.echo },
  { name: 'scout', displayName: 'SCOUT', status: 'standby', color: AGENT_COLORS.scout },
  { name: 'reel', displayName: 'REEL', status: 'standby', color: AGENT_COLORS.reel },
  { name: 'dex', displayName: 'DEX', status: 'standby', color: AGENT_COLORS.dex },
]

function AgentStatusDot({ status, color }: { status: Agent['status']; color: string }) {
  if (status === 'active') return <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
  if (status === 'working') return <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: color }} />
  return <span className="w-2 h-2 rounded-full bg-white/10" />
}

interface Props {
  telemetry: TelemetryEntry[]
  activeAgent: string
}

export default function RightPanel({ telemetry, activeAgent }: Props) {
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false })
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="right-panel h-full overflow-y-auto px-3 py-3">
      {/* Clock */}
      <div className="mb-4 text-right" suppressHydrationWarning>
        <div className="text-[28px] font-mono text-cyan-300 leading-none tracking-wider" suppressHydrationWarning>{timeStr}</div>
        <div className="text-[10px] text-cyan-500/60 tracking-widest uppercase" suppressHydrationWarning>{dateStr}</div>
      </div>

      {/* Agent Status */}
      <div className="mb-4">
        <div className="text-[9px] tracking-widest text-cyan-500/50 mb-2 uppercase font-bold border-b border-cyan-900/40 pb-1">
          Agent Status
        </div>
        <div className="space-y-[5px]">
          {PHASE1_AGENTS.map(agent => (
            <div key={agent.name} className="flex items-center gap-2">
              <AgentStatusDot
                status={agent.name === activeAgent ? 'working' : agent.status}
                color={agent.color}
              />
              <span
                className="text-[11px] font-mono tracking-wider"
                style={{ color: agent.status === 'standby' ? '#ffffff30' : agent.color }}
              >
                {agent.displayName}
              </span>
              <span className="text-[9px] text-white/20 ml-auto">
                {agent.name === activeAgent ? 'WORKING' : agent.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Phase indicator */}
      <div className="mb-4">
        <div className="text-[9px] tracking-widest text-cyan-500/50 mb-2 uppercase font-bold border-b border-cyan-900/40 pb-1">
          System Phase
        </div>
        <div className="space-y-1">
          {['Phase 1 — Foundation', 'Phase 2 — Automation', 'Phase 3 — Intelligence', 'Phase 4 — Expansion'].map((p, i) => (
            <div key={p} className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-cyan-400' : 'bg-white/10'}`} />
              <span className={`text-[10px] ${i === 0 ? 'text-cyan-300' : 'text-white/20'}`}>{p}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RC Goal Ladder */}
      <div className="mb-3">
        <div className="text-[9px] tracking-widest text-cyan-500/50 mb-2 uppercase font-bold border-b border-cyan-900/40 pb-1">
          7-Figure Roadmap
        </div>
        <div className="space-y-1">
          {[
            { label: '$1K MRR', done: false },
            { label: '$5K MRR', done: false },
            { label: '$10K MRR', done: false },
            { label: '$50K Net Worth', done: false },
            { label: 'FI by 40', done: false },
          ].map(m => (
            <div key={m.label} className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-sm ${m.done ? 'bg-green-400' : 'border border-white/20'}`} />
              <span className={`text-[10px] ${m.done ? 'text-green-400' : 'text-white/30'}`}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
