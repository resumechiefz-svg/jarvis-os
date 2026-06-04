'use client'
/**
 * AgentOrb — each agent as a living, breathing orb
 * Color-coded, pulsing when active, dormant when idle
 */

const AGENTS = [
  { id: 'jarvis',  label: 'J',  name: 'Jarvis',  role: 'Command' },
  { id: 'nova',    label: 'N',  name: 'Nova',    role: 'Revenue' },
  { id: 'sage',    label: 'Sa', name: 'Sage',    role: 'Life' },
  { id: 'vault',   label: 'V',  name: 'Vault',   role: 'Cards' },
  { id: 'echo',    label: 'E',  name: 'Echo',    role: 'Content' },
  { id: 'scout',   label: 'Sc', name: 'Scout',   role: 'Growth' },
  { id: 'dex',     label: 'D',  name: 'Dex',     role: 'Tech' },
  { id: 'beacon',  label: 'B',  name: 'Beacon',  role: 'Goals' },
  { id: 'ledger',  label: 'L',  name: 'Ledger',  role: 'Finance' },
  { id: 'atlas',   label: 'At', name: 'Atlas',   role: 'Strategy' },
  { id: 'lumen',   label: 'Lu', name: 'Lumen',   role: 'Creative' },
  { id: 'reel',    label: 'R',  name: 'Reel',    role: 'Social' },
] as const

type AgentId = typeof AGENTS[number]['id']

interface Props {
  activeAgent?: AgentId
  onSelect?: (id: AgentId) => void
  variant?: 'bar' | 'list'
}

export function AgentOrbBar({ activeAgent, onSelect }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {AGENTS.map(agent => (
        <AgentOrbSingle
          key={agent.id}
          agent={agent}
          isActive={activeAgent === agent.id}
          onClick={() => onSelect?.(agent.id)}
        />
      ))}
    </div>
  )
}

export function AgentOrbList({ activeAgent, onSelect }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0' }}>
      {AGENTS.map(agent => (
        <button
          key={agent.id}
          onClick={() => onSelect?.(agent.id)}
          className={`agent-list-item ${activeAgent === agent.id ? 'active' : ''}`}
          style={{ background: 'none', border: 'none', textAlign: 'left', width: '100%' }}
        >
          <AgentOrbSingle agent={agent} isActive={activeAgent === agent.id} size={24} />
          <div>
            <div className="agent-name">{agent.name}</div>
            <div className="agent-role">{agent.role}</div>
          </div>
          {activeAgent === agent.id && (
            <div style={{
              marginLeft: 'auto',
              width: 5, height: 5,
              borderRadius: '50%',
              background: 'var(--cyan)',
              boxShadow: '0 0 8px var(--cyan)',
              flexShrink: 0,
            }} />
          )}
        </button>
      ))}
    </div>
  )
}

function AgentOrbSingle({
  agent,
  isActive,
  onClick,
  size = 28,
}: {
  agent: typeof AGENTS[number]
  isActive: boolean
  onClick?: () => void
  size?: number
}) {
  return (
    <div
      className={`agent-orb orb-${agent.id}`}
      style={{ width: size + 4, height: size + 4 }}
      onClick={onClick}
      title={`${agent.name} — ${agent.role}`}
    >
      <div className="agent-orb-inner" style={{ width: size, height: size, fontSize: size * 0.32 }}>
        {agent.label}
      </div>
      {isActive && <div className="agent-orb-ring" />}
      {isActive && <div className="agent-orb-pulse" />}
    </div>
  )
}

export default AgentOrbBar
