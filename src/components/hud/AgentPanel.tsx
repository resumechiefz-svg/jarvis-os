'use client'
/**
 * AgentPanel — floating agent chat panel
 * Agents pop in with their colored mini-triangle when they have something to say
 * Sits alongside Jarvis, non-intrusive, dismissable
 * Max 3 visible at once — like a team sidebar
 */
import { useState, useEffect, useCallback } from 'react'

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff', nova: '#a855f7', sage: '#00ff88', vault: '#c9a84c',
  echo: '#ff6b35', scout: '#ff4455', reel: '#ff69b4', lister: '#fbbf24',
  dex: '#60a5fa', beacon: '#34d399', ledger: '#f87171', atlas: '#e879f9',
  lumen: '#f0abfc', forge: '#e879f9',
}

interface AgentMessage {
  id: string
  agent: string
  message: string
  timestamp: number
  dismissed: boolean
}

// Mini triangle SVG for each agent
function AgentTriangle({ color, size = 28, active = false }: { color: string; size?: number; active?: boolean }) {
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)

  return (
    <svg width={size} height={size} viewBox="0 0 28 28" style={{ flexShrink: 0 }}>
      <defs>
        <filter id={`glow-${color.slice(1)}`}>
          <feGaussianBlur stdDeviation={active ? 2 : 1} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Triangle tip down */}
      <polygon
        points="14,24 3,6 25,6"
        fill={`rgba(${r},${g},${b},${active ? 0.85 : 0.55})`}
        stroke={color}
        strokeWidth={active ? 1.5 : 1}
        filter={`url(#glow-${color.slice(1)})`}
      />
    </svg>
  )
}

interface Props {
  messages: Array<{ role: string; agent: string; content: string; timestamp: Date }>
}

export default function AgentPanel({ messages }: Props) {
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([])

  // Pick up new assistant messages and surface them as agent pop-ins
  useEffect(() => {
    if (!messages.length) return
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant' || last.agent === 'jarvis') return

    // Only surface non-Jarvis agents — they're "chiming in"
    const newMsg: AgentMessage = {
      id: `${Date.now()}-${last.agent}`,
      agent: last.agent,
      message: last.content.replace(/\*+/g, '').split('\n').slice(0, 3).join(' ').slice(0, 160),
      timestamp: Date.now(),
      dismissed: false,
    }

    setAgentMessages(prev => {
      // Replace existing message from same agent, keep max 4
      const filtered = prev.filter(m => m.agent !== last.agent && !m.dismissed)
      return [newMsg, ...filtered].slice(0, 4)
    })
  }, [messages])

  const dismiss = useCallback((id: string) => {
    setAgentMessages(prev => prev.filter(m => m.id !== id))
  }, [])

  const visible = agentMessages.filter(m => !m.dismissed)
  if (visible.length === 0) return null

  return (
    <div style={{
      position: 'absolute',
      right: 0,
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '0 12px',
      zIndex: 10,
      maxWidth: 240,
    }}>
      {visible.map(msg => {
        const color = AGENT_COLORS[msg.agent] ?? '#00d4ff'
        const time = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        return (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              animation: 'agentIn 0.3s ease',
            }}
          >
            <style>{`
              @keyframes agentIn {
                from { opacity: 0; transform: translateX(20px); }
                to   { opacity: 1; transform: translateX(0); }
              }
            `}</style>

            <AgentTriangle color={color} size={26} active />

            <div style={{
              flex: 1,
              background: `${color}08`,
              border: `1px solid ${color}30`,
              borderRadius: 4,
              padding: '7px 10px',
              position: 'relative',
            }}>
              {/* Agent name */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color, textTransform: 'uppercase' }}>
                  {msg.agent}
                </span>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>{time}</span>
              </div>

              {/* Message */}
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.45, margin: 0 }}>
                {msg.message}
              </p>

              {/* Dismiss */}
              <button
                onClick={() => dismiss(msg.id)}
                style={{
                  position: 'absolute', top: 4, right: 6,
                  background: 'none', border: 'none',
                  color: 'rgba(255,255,255,0.2)', cursor: 'pointer',
                  fontSize: 12, lineHeight: 1, padding: 0,
                }}
              >×</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
