'use client'
/**
 * Financial Independence Dashboard
 * Visual trajectory: current → $1M target
 * Updates daily from portfolio + RC MRR data
 */
import { useEffect, useState } from 'react'

interface FIData {
  currentEquity: number
  currentMRR: number
  targetEquity: number
  projectedAge: number
  currentAge: number
  monthlyContribution: number
  monthlyGrowthRate: number
  confidencePercent: number
  trajectoryPoints: Array<{ month: number; value: number }>
  yearsToGo: number
  onTrack: boolean
}

export default function FinancialIndependenceDashboard() {
  const [data, setData] = useState<FIData | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetch('/api/fi-dashboard')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  if (!data) return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(0,212,255,0.08)', fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
      Loading FI trajectory...
    </div>
  )

  const progress = Math.min((data.currentEquity / data.targetEquity) * 100, 100)
  const barColor = data.onTrack ? '#00ff88' : '#ffc800'
  const WIDTH = 200

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{ padding: '8px 12px', borderTop: '1px solid rgba(0,212,255,0.08)', cursor: 'pointer' }}
    >
      {/* Compact view */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>FI BY 40</span>
        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 1s ease' }} />
        </div>
        <span style={{ fontSize: 9, color: barColor, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {progress.toFixed(1)}%
        </span>
        <span style={{ fontSize: 9, color: data.onTrack ? '#00ff88' : '#ffc800' }}>
          {data.onTrack ? '✓' : '⚡'}
        </span>
      </div>

      {/* Expanded view */}
      {expanded && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Key numbers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {[
              { label: 'EQUITY', value: `$${(data.currentEquity / 1000).toFixed(0)}k` },
              { label: 'RC MRR', value: `$${data.currentMRR.toFixed(0)}` },
              { label: 'TARGET', value: '$1M' },
            ].map(item => (
              <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: 4 }}>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>{item.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#00d4ff', marginTop: 2 }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Trajectory bar chart — simplified */}
          <div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', marginBottom: 6, letterSpacing: '0.1em' }}>TRAJECTORY (MONTHLY)</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
              {data.trajectoryPoints.slice(0, 24).map((point, i) => {
                const height = Math.max(2, (point.value / data.targetEquity) * 40)
                const isPast = point.value <= data.currentEquity
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${height}px`,
                      background: isPast ? '#00d4ff' : 'rgba(0,212,255,0.15)',
                      borderRadius: 1,
                      border: i === 0 ? '1px solid #00d4ff' : 'none',
                    }}
                  />
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>Now</span>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>24 months</span>
            </div>
          </div>

          {/* Projection */}
          <div style={{ background: data.onTrack ? 'rgba(0,255,136,0.05)' : 'rgba(255,200,0,0.05)', border: `1px solid ${data.onTrack ? 'rgba(0,255,136,0.15)' : 'rgba(255,200,0,0.15)'}`, padding: '6px 10px', borderRadius: 4 }}>
            <div style={{ fontSize: 9, color: data.onTrack ? '#00ff88' : '#ffc800' }}>
              {data.onTrack
                ? `✓ On track — projected $1M at age ${data.projectedAge}`
                : `⚡ Projecting $1M at age ${data.projectedAge} — ${data.projectedAge - 40} year${Math.abs(data.projectedAge - 40) !== 1 ? 's' : ''} behind target`
              }
            </div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
              Monthly contribution: ${data.monthlyContribution.toFixed(0)} | Growth rate: {(data.monthlyGrowthRate * 100).toFixed(1)}%/mo
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
