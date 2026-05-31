'use client'

import { useEffect, useState } from 'react'
import type { BuildJob } from '@/lib/agents/forge/builder'

interface ForgeState {
  active: BuildJob | null
  recent: Array<{ idea: string; status: string; deployUrl?: string; title?: string; startedAt: string }>
}

export default function ForgeBuildMonitor() {
  const [forge, setForge] = useState<ForgeState>({ active: null, recent: [] })

  useEffect(() => {
    const load = () => {
      fetch('/api/forge')
        .then(r => r.json())
        .then(setForge)
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 5000) // Poll every 5s during active build
    return () => clearInterval(t)
  }, [])

  const { active, recent } = forge
  if (!active && recent.length === 0) return null

  const statusColor = {
    speccing: '#c9a84c',
    building: '#00d4ff',
    deploying: '#a855f7',
    live: '#00ff88',
    failed: '#ff4455',
  }

  const statusLabel = {
    speccing: 'ATLAS SPECCING',
    building: 'BUILDING',
    deploying: 'DEPLOYING',
    live: 'LIVE',
    failed: 'FAILED',
  }

  return (
    <div style={{
      width: '100%', borderTop: '1px solid rgba(0,212,255,0.08)',
      padding: '6px 16px', background: 'rgba(0,5,15,0.6)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: active ? 6 : 0 }}>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', color: '#00d4ff50', textTransform: 'uppercase' }}>FORGE</span>
        {active && (
          <span style={{
            fontSize: 8, fontWeight: 700, color: statusColor[active.status as keyof typeof statusColor] ?? '#fff',
            letterSpacing: '0.15em',
          }}>
            {statusLabel[active.status as keyof typeof statusLabel] ?? active.status.toUpperCase()}
          </span>
        )}
      </div>

      {/* Active build */}
      {active && (
        <div>
          <div style={{ fontSize: 10, color: '#cce8ff', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {active.spec?.title ?? active.idea}
          </div>
          {/* Progress bar */}
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, marginBottom: 4 }}>
            <div style={{
              height: '100%', borderRadius: 1,
              width: `${active.progress}%`,
              background: `linear-gradient(90deg, #00d4ff, ${statusColor[active.status as keyof typeof statusColor] ?? '#00d4ff'})`,
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#ffffff30' }}>
            <span>{active.filesBuilt}/{active.totalFiles} files</span>
            <span>{active.progress}%</span>
          </div>
          {active.logs.length > 0 && (
            <div style={{ fontSize: 8, color: '#ffffff20', marginTop: 3, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {active.logs[active.logs.length - 1]}
            </div>
          )}
          {active.deployUrl && active.status === 'live' && (
            <div style={{ marginTop: 4, fontSize: 9, color: '#00ff88', fontWeight: 600 }}>
              ✓ {active.deployUrl}
            </div>
          )}
        </div>
      )}

      {/* Recent builds (when no active) */}
      {!active && recent.slice(0, 2).map((b, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: 9, color: '#ffffff30', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
            {b.title ?? b.idea}
          </span>
          <span style={{ fontSize: 8, color: statusColor[b.status as keyof typeof statusColor] ?? '#ffffff20', flexShrink: 0 }}>
            {b.status.toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  )
}
