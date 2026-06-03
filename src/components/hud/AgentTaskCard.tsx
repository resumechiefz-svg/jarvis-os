'use client'
/**
 * AgentTaskCard — floating progress card for active agent tasks
 * Appears when Jarvis routes to an agent, tracks elapsed time, dismisses on complete
 */
import { useEffect, useState } from 'react'

export type TaskStatus = 'routing' | 'thinking' | 'working' | 'complete' | 'error'

export interface AgentTask {
  id: string
  agent: string
  color: string
  description: string
  status: TaskStatus
  startedAt: number
  completedAt?: number
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; dotColor: string; animation: string }> = {
  routing:  { label: 'ROUTING',  dotColor: '#c9a84c', animation: 'voice-dot-pulse 1s infinite' },
  thinking: { label: 'THINKING', dotColor: '#00d4ff', animation: 'voice-dot-pulse 0.7s infinite' },
  working:  { label: 'WORKING',  dotColor: '#a855f7', animation: 'voice-dot-pulse 0.5s infinite' },
  complete: { label: 'DONE',     dotColor: '#00ff88', animation: 'none' },
  error:    { label: 'ERROR',    dotColor: '#ff4455', animation: 'none' },
}

function MiniTriangle({ color, size = 16 }: { color: string; size?: number }) {
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <polygon points="8,14 1,3 15,3" fill={`rgba(${r},${g},${b},0.8)`} stroke={color} strokeWidth="1" />
    </svg>
  )
}

function ElapsedTimer({ startedAt, completedAt }: { startedAt: number; completedAt?: number }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (completedAt) { setElapsed(completedAt - startedAt); return }
    const t = setInterval(() => setElapsed(Date.now() - startedAt), 100)
    return () => clearInterval(t)
  }, [startedAt, completedAt])

  const secs = Math.floor(elapsed / 1000)
  const ms = Math.floor((elapsed % 1000) / 10)
  const display = secs >= 60
    ? `${Math.floor(secs / 60)}m ${secs % 60}s`
    : `${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}s`

  return (
    <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
      {display}
    </span>
  )
}

interface Props {
  task: AgentTask
  onDismiss: (id: string) => void
  index: number
}

export default function AgentTaskCard({ task, onDismiss, index }: Props) {
  const [phase, setPhase] = useState<'flicker' | 'visible' | 'scatter'>('flicker')
  const cfg = STATUS_CONFIG[task.status]

  // Mount: flicker in → lock solid
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('flicker'), 20 + index * 50)
    const t2 = setTimeout(() => setPhase('visible'), 20 + index * 50 + 700)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [index])

  // Auto-dismiss 8s after complete
  useEffect(() => {
    if (task.status !== 'complete' && task.status !== 'error') return
    const t = setTimeout(() => {
      setPhase('scatter')
      setTimeout(() => onDismiss(task.id), 460)
    }, 8000)
    return () => clearTimeout(t)
  }, [task.status, task.id, onDismiss])

  const dismiss = () => {
    setPhase('scatter')
    setTimeout(() => onDismiss(task.id), 460)
  }

  const { color } = task
  const isActive = task.status === 'thinking' || task.status === 'working' || task.status === 'routing'
  const animClass = phase === 'flicker' ? 'card-flicker' : phase === 'scatter' ? 'card-scatter' : ''

  return (
    <div
      className={animClass}
      style={{
        position: 'relative',
        width: 200,
        background: 'rgba(0,4,14,0.92)',
        border: `1px solid ${color}${isActive ? '40' : '20'}`,
        backdropFilter: 'blur(8px)',
        flexShrink: 0,
        opacity: phase === 'flicker' || phase === 'visible' ? undefined : 0,
        cursor: 'pointer',
        boxShadow: isActive ? `0 0 24px ${color}15, 0 0 48px ${color}08` : 'none',
      }}
      onClick={dismiss}
    >
      {/* Top edge glow */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${color}${isActive ? '70' : '30'}, transparent)`,
        transition: 'opacity 0.5s',
      }} />

      {/* Scan line when active */}
      {isActive && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent, ${color}60, transparent)`,
          animation: 'scan 2.2s linear infinite',
        }} />
      )}

      {/* Corner brackets */}
      {[
        { top: 0, left: 0, borderRight: 'none', borderBottom: 'none', borderTop: `1.5px solid ${color}60`, borderLeft: `1.5px solid ${color}60` },
        { top: 0, right: 0, borderLeft: 'none', borderBottom: 'none', borderTop: `1.5px solid ${color}60`, borderRight: `1.5px solid ${color}60` },
        { bottom: 0, left: 0, borderRight: 'none', borderTop: 'none', borderBottom: `1.5px solid ${color}60`, borderLeft: `1.5px solid ${color}60` },
        { bottom: 0, right: 0, borderLeft: 'none', borderTop: 'none', borderBottom: `1.5px solid ${color}60`, borderRight: `1.5px solid ${color}60` },
      ].map((style, i) => (
        <div key={i} style={{ position: 'absolute', width: 8, height: 8, ...style }} />
      ))}

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px 5px' }}>
        <MiniTriangle color={color} size={14} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: `${color}cc`, textTransform: 'uppercase', flex: 1 }}>
          {task.agent}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: cfg.dotColor,
            boxShadow: isActive ? `0 0 5px ${cfg.dotColor}` : 'none',
            animation: cfg.animation,
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 7, letterSpacing: '0.15em', color: `${cfg.dotColor}90`, textTransform: 'uppercase' }}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Task description */}
      <div style={{ padding: '0 10px 6px', fontSize: 10, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>
        {task.description}
      </div>

      {/* Progress bar — animates while active, fills on complete */}
      <div style={{ height: 1.5, background: 'rgba(255,255,255,0.04)', margin: '0 10px' }}>
        <div style={{
          height: '100%',
          background: `linear-gradient(90deg, ${color}60, ${color})`,
          boxShadow: `0 0 6px ${color}80`,
          width: task.status === 'complete' ? '100%' : task.status === 'error' ? '30%' : undefined,
          animation: isActive ? `progressPulse 2s ease-in-out infinite` : 'none',
          transition: 'width 0.5s ease',
        }} />
      </div>

      {/* Footer: elapsed time + tap hint */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px 7px' }}>
        <ElapsedTimer startedAt={task.startedAt} completedAt={task.completedAt} />
        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.1)', letterSpacing: '0.1em' }}>TAP TO CLOSE</span>
      </div>
    </div>
  )
}
