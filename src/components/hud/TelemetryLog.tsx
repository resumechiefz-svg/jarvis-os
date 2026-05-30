'use client'

import { useEffect, useRef } from 'react'
import type { TelemetryEntry } from '@/lib/types'

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff',
  nova: '#a855f7',
  sage: '#00ff88',
  vault: '#c9a84c',
  echo: '#ff6b35',
  scout: '#ff4455',
  dex: '#60a5fa',
}

interface Props {
  entries: TelemetryEntry[]
}

export default function TelemetryLog({ entries }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  return (
    <div className="telemetry-log overflow-x-auto overflow-y-hidden flex items-center gap-4 px-4 h-full">
      {entries.slice(-20).map(entry => (
        <div key={entry.id} className="shrink-0 flex items-center gap-2 text-[10px] font-mono">
          <span className="text-white/30">{entry.timestamp.toLocaleTimeString('en-US', { hour12: false })}</span>
          <span
            className="font-bold tracking-wider"
            style={{ color: AGENT_COLORS[entry.agent] ?? '#00d4ff' }}
          >
            [{entry.agent.toUpperCase()}]
          </span>
          <span className="text-white/60">{entry.action}</span>
          {entry.detail && <span className="text-white/30">— {entry.detail}</span>}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
