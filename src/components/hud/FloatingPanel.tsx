'use client'
/**
 * FloatingPanel — holographic data panel that appears on demand
 * Materializes with scale+fade animation, dismissable by click or voice
 * Tony Stark style — translucent, glowing, can be brushed away
 */
import { useEffect, useRef, useState } from 'react'

export interface PanelData {
  id: string
  title: string
  color: string
  icon: string
  rows: Array<{ label: string; value: string; sub?: string; bar?: number; barMax?: number; color?: string }>
}

interface Props {
  panel: PanelData
  onDismiss: (id: string) => void
  index: number
}

export default function FloatingPanel({ panel, onDismiss, index }: Props) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    setClosing(true)
    setTimeout(() => onDismiss(panel.id), 320)
  }

  const { color } = panel

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'absolute',
        bottom: `${20 + index * 20}px`,
        right: `${20 + index * 260}px`,
        width: 240,
        background: `linear-gradient(135deg, rgba(0,8,20,0.92) 0%, rgba(0,4,12,0.96) 100%)`,
        border: `1px solid ${color}35`,
        backdropFilter: 'blur(12px)',
        zIndex: 20 + index,
        cursor: 'pointer',
        opacity: closing ? 0 : visible ? 1 : 0,
        transform: closing ? 'scale(0.92) translateY(8px)' : visible ? 'scale(1) translateY(0)' : 'scale(0.88) translateY(12px)',
        transition: 'opacity 0.32s ease, transform 0.32s ease',
        boxShadow: `0 0 40px ${color}15, 0 0 80px ${color}08, inset 0 0 30px ${color}04`,
      }}
    >
      {/* Top edge glow line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${color}60, ${color}80, ${color}60, transparent)` }} />

      {/* Corner brackets */}
      {[['0,0','right,bottom'],['auto,0','left,bottom'],['0,auto','right,top'],['auto,auto','left,top']].map(([pos, brd], i) => {
        const [t, l] = pos.split(',')
        const [br, bb] = brd.split(',')
        return (
          <div key={i} style={{
            position: 'absolute',
            top: t === '0' ? 0 : undefined, bottom: t === 'auto' ? 0 : undefined,
            left: l === '0' ? 0 : undefined, right: l === 'auto' ? 0 : undefined,
            width: 10, height: 10,
            borderRight: br === 'right' ? `1.5px solid ${color}70` : undefined,
            borderLeft: br === 'left' ? `1.5px solid ${color}70` : undefined,
            borderBottom: bb === 'bottom' ? `1.5px solid ${color}70` : undefined,
            borderTop: bb === 'top' ? `1.5px solid ${color}70` : undefined,
          }} />
        )
      })}

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color }}>{panel.icon}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', color: `${color}cc`, textTransform: 'uppercase' }}>{panel.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88', animation: 'voice-dot-pulse 2s infinite' }} />
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>LIVE</span>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)', cursor: 'pointer', lineHeight: 1, marginLeft: 4 }}>×</span>
        </div>
      </div>

      {/* Data rows */}
      <div style={{ padding: '10px 14px 12px' }}>
        {panel.rows.map((row, i) => (
          <div key={i} style={{ marginBottom: i < panel.rows.length - 1 ? 10 : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 8, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', flexShrink: 0 }}>{row.label}</span>
              <span style={{
                fontSize: 16, fontWeight: 700, fontFamily: 'monospace',
                color: row.color ?? color,
                textShadow: `0 0 12px ${row.color ?? color}60`,
              }}>{row.value}</span>
            </div>
            {row.sub && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{row.sub}</div>}
            {row.bar !== undefined && row.barMax !== undefined && (
              <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, marginTop: 5, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 1, transition: 'width 0.8s ease',
                  width: `${Math.min(100, (row.bar / row.barMax) * 100)}%`,
                  background: `linear-gradient(90deg, ${row.color ?? color}60, ${row.color ?? color})`,
                  boxShadow: `0 0 6px ${row.color ?? color}80`,
                }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dismiss hint */}
      <div style={{ padding: '0 14px 8px', textAlign: 'center' }}>
        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.15em' }}>CLICK TO DISMISS · SAY "JARVIS CLOSE"</span>
      </div>
    </div>
  )
}
