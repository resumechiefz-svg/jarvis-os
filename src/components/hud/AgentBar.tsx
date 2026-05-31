'use client'

const AGENTS = [
  { name: 'JARVIS',  color: '#00d4ff', active: true },
  { name: 'NOVA',    color: '#a855f7', active: true },
  { name: 'SAGE',    color: '#00ff88', active: true },
  { name: 'VAULT',   color: '#c9a84c', active: true },
  { name: 'ECHO',    color: '#ff6b35', active: true },
  { name: 'SCOUT',   color: '#ff4455', active: true },
  { name: 'REEL',    color: '#ff69b4', active: true },
  { name: 'LISTER',  color: '#fbbf24', active: true },
  { name: 'DEX',     color: '#60a5fa', active: true },
  { name: 'BEACON',  color: '#34d399', active: true },
  { name: 'LEDGER',  color: '#f87171', active: true },
  { name: 'ATLAS',   color: '#e879f9', active: true },
  { name: 'LUMEN',   color: '#fde68a', active: true },
]

interface Props {
  activeAgent: string
}

export default function AgentBar({ activeAgent }: Props) {
  return (
    <div className="agent-bar flex items-center gap-0 px-4 border-b border-cyan-900/30 bg-black/70 overflow-x-auto">
      {/* Label */}
      <div className="text-[8px] tracking-[0.3em] text-cyan-500/40 uppercase shrink-0 mr-4 font-bold">
        TEAM
      </div>

      {/* All 12 agents */}
      {AGENTS.map(agent => {
        const isActive = agent.name.toLowerCase() === activeAgent.toLowerCase()
        return (
          <div
            key={agent.name}
            className="flex items-center gap-1.5 px-3 shrink-0 h-full border-r border-white/5"
          >
            {/* Status dot */}
            <span
              className={`w-1.5 h-1.5 rounded-full ${isActive ? 'animate-ping' : 'animate-pulse'}`}
              style={{
                backgroundColor: agent.color,
                boxShadow: isActive ? `0 0 8px ${agent.color}` : `0 0 3px ${agent.color}80`,
              }}
            />
            <span
              className="text-[9px] font-mono font-bold tracking-wider"
              style={{
                color: isActive ? agent.color : `${agent.color}90`,
                textShadow: isActive ? `0 0 8px ${agent.color}` : 'none',
              }}
            >
              {agent.name}
            </span>
            <span className="text-[7px] text-white/20 font-mono ml-0.5">
              {isActive ? 'WORKING' : 'ACTIVE'}
            </span>
          </div>
        )
      })}

      {/* System status */}
      <div className="ml-auto shrink-0 flex items-center gap-3 pl-4">
        <span className="text-[8px] text-green-500/60 tracking-widest">13 AGENTS ONLINE</span>
        <span className="text-[8px] text-cyan-500/40 tracking-widest">PHASE 4 COMPLETE</span>
      </div>
    </div>
  )
}
