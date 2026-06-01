'use client'
/**
 * AgentTiles — security monitor style grid showing active agents
 * MacBook mode: right half shows what each agent is working on
 * Like a control room — multiple live feeds, approve/dismiss each one
 */
import { useState, useEffect } from 'react'

interface AgentActivity {
  agent: string
  status: 'idle' | 'working' | 'waiting' | 'done'
  task: string
  detail?: string
  result?: string
  timestamp: number
}

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff', nova: '#a855f7', sage: '#00ff88', vault: '#c9a84c',
  echo: '#ff6b35', scout: '#ff4455', reel: '#ff69b4', lister: '#fbbf24',
  dex: '#60a5fa', beacon: '#34d399', ledger: '#f87171', atlas: '#e879f9',
  lumen: '#f0abfc', forge: '#e879f9',
}

const AGENT_ICONS: Record<string, string> = {
  jarvis: '◈', nova: '✦', sage: '⬡', vault: '◆', echo: '◎',
  scout: '◉', reel: '◐', lister: '◑', dex: '◒', beacon: '▲',
  ledger: '□', atlas: '⬟', lumen: '✧', forge: '⚙',
}

function AgentTile({
  activity,
  onApprove,
  onDismiss,
}: {
  activity: AgentActivity
  onApprove?: () => void
  onDismiss?: () => void
}) {
  const color = AGENT_COLORS[activity.agent] ?? '#00d4ff'
  const icon = AGENT_ICONS[activity.agent] ?? '○'
  const isWorking = activity.status === 'working'
  const isDone = activity.status === 'done'
  const isWaiting = activity.status === 'waiting'

  return (
    <div style={{
      border: `1px solid ${color}${isWorking ? '40' : '18'}`,
      background: isWorking ? `${color}06` : 'rgba(0,4,12,0.8)',
      borderRadius: 4,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      transition: 'all 0.3s',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Scan line animation when working */}
      {isWorking && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 1, background: `linear-gradient(90deg, transparent, ${color}60, transparent)`,
          animation: 'scan 2s linear infinite',
        }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, color, lineHeight: 1 }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color, textTransform: 'uppercase' }}>
          {activity.agent}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: isWorking ? color : isDone ? '#00ff88' : isWaiting ? '#c9a84c' : 'rgba(255,255,255,0.2)',
            boxShadow: isWorking ? `0 0 6px ${color}` : 'none',
            animation: isWorking ? 'voice-dot-pulse 1.2s infinite' : 'none',
          }} />
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {activity.status}
          </span>
        </div>
      </div>

      {/* Task */}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
        {activity.task}
      </div>

      {/* Detail / result */}
      {(activity.detail || activity.result) && (
        <div style={{
          fontSize: 10, color: isDone ? '#00ff88' : 'rgba(255,255,255,0.35)',
          lineHeight: 1.4, fontFamily: 'monospace',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          paddingTop: 4, marginTop: 2,
        }}>
          {activity.result ?? activity.detail}
        </div>
      )}

      {/* Approve/dismiss buttons when waiting for approval */}
      {isWaiting && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button onClick={onApprove} style={{
            flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)',
            color: '#00ff88', cursor: 'pointer', borderRadius: 2, fontFamily: 'inherit',
          }}>
            ✓ Approve
          </button>
          <button onClick={onDismiss} style={{
            flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            background: 'rgba(255,68,85,0.08)', border: '1px solid rgba(255,68,85,0.2)',
            color: '#ff4455', cursor: 'pointer', borderRadius: 2, fontFamily: 'inherit',
          }}>
            ✕ Skip
          </button>
        </div>
      )}
    </div>
  )
}

export default function AgentTiles({ messages }: { messages?: Array<{ role: string; agent: string; content: string; timestamp: Date }> }) {
  const [activities, setActivities] = useState<AgentActivity[]>([])

  // Build activity from messages
  useEffect(() => {
    if (!messages?.length) return
    const agentMap: Record<string, AgentActivity> = {}

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      const agent = msg.agent
      const preview = msg.content.replace(/\*+/g, '').split('\n')[0].slice(0, 80)
      agentMap[agent] = {
        agent,
        status: 'done',
        task: preview,
        detail: `${msg.content.split(' ').length} words`,
        timestamp: new Date(msg.timestamp).getTime(),
      }
    }

    // Check for FORGE proposals waiting for approval
    fetch('/api/forge')
      .then(r => r.json())
      .then(d => {
        if (d.active) {
          agentMap['forge'] = {
            agent: 'forge',
            status: 'working',
            task: d.active.idea ?? 'Building...',
            detail: d.active.status,
            timestamp: Date.now(),
          }
        }
        setActivities(Object.values(agentMap).sort((a, b) => b.timestamp - a.timestamp).slice(0, 9))
      })
      .catch(() => {
        setActivities(Object.values(agentMap).sort((a, b) => b.timestamp - a.timestamp).slice(0, 9))
      })
  }, [messages])

  // Seed with known agents when no messages
  useEffect(() => {
    if (activities.length === 0) {
      const seeds: AgentActivity[] = [
        { agent: 'nova',   status: 'idle', task: 'Monitoring RC funnel & Stripe',      timestamp: Date.now() },
        { agent: 'vault',  status: 'idle', task: 'Watching Card Chiefz eBay feed',     timestamp: Date.now() },
        { agent: 'atlas',  status: 'idle', task: 'Scanning for revenue opportunities', timestamp: Date.now() },
        { agent: 'forge',  status: 'idle', task: 'Self-monitoring for issues',         timestamp: Date.now() },
        { agent: 'sage',   status: 'idle', task: 'Tracking goals & training plan',     timestamp: Date.now() },
        { agent: 'beacon', status: 'idle', task: 'Accountability check pending',       timestamp: Date.now() },
      ]
      setActivities(seeds)
    }
  }, [activities.length])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes scan {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid rgba(0,212,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(0,212,255,0.6)', textTransform: 'uppercase' }}>
            Agent Control Room
          </span>
        </div>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
          {activities.filter(a => a.status === 'working').length} active
        </span>
      </div>

      {/* Tiles grid */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: 10,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gridAutoRows: 'min-content',
        gap: 8,
        alignContent: 'start',
      }}>
        {activities.map(activity => (
          <AgentTile
            key={activity.agent}
            activity={activity}
            onApprove={() => {
              // POST to forge to execute if it's a forge proposal
              fetch('/api/forge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan' }) })
            }}
            onDismiss={() => setActivities(prev => prev.filter(a => a.agent !== activity.agent))}
          />
        ))}
      </div>
    </div>
  )
}
