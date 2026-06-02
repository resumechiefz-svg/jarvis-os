'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import MobileChat from '@/components/mobile/MobileChat'
import AgentBar from '@/components/hud/AgentBar'
import LeftPanel from '@/components/hud/LeftPanel'
import RightPanel from '@/components/hud/RightPanel'
import VoiceInterrupt from '@/components/hud/VoiceInterrupt'
import LiveFeed from '@/components/hud/LiveFeed'
import AgentPanel from '@/components/hud/AgentPanel'
import type { Message, AgentName } from '@/lib/types'

const CommandInterface = dynamic(() => import('@/components/hud/CommandInterface'), { ssr: false })
const JarvisOrb = dynamic(() => import('@/components/orb/JarvisOrb'), { ssr: false })

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff', nova: '#a855f7', sage: '#00ff88', vault: '#c9a84c',
  echo: '#ff6b35', scout: '#ff4455', reel: '#ff69b4', lister: '#fbbf24',
  dex: '#60a5fa', beacon: '#34d399', ledger: '#f87171', atlas: '#e879f9',
}

export default function HUD() {
  const [isMobile, setIsMobile] = useState(false)
  const [isExtended, setIsExtended] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [activeAgent, setActiveAgent] = useState<AgentName>('jarvis')
  const [orbAmplitude, setOrbAmplitude] = useState(0)
  const [mrr, setMrr] = useState(0)
  const [orbSize, setOrbSize] = useState(280)

  useEffect(() => {
    const mobile = window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    setIsMobile(mobile)

    // Orb size = 20vw, clamped 200–340px
    const calcOrb = () => setOrbSize(Math.min(340, Math.max(200, Math.floor(window.innerWidth * 0.20))))
    calcOrb()
    window.addEventListener('resize', calcOrb)

    // Dual monitor detection
    const s = screen as unknown as { isExtended?: boolean; addEventListener?: (e: string, fn: () => void) => void; removeEventListener?: (e: string, fn: () => void) => void }
    if (s.isExtended !== undefined) {
      setIsExtended(s.isExtended)
      const handler = () => setIsExtended(!!s.isExtended)
      s.addEventListener?.('change', handler)
      return () => { window.removeEventListener('resize', calcOrb); s.removeEventListener?.('change', handler) }
    }

    fetch('/api/nova').then(r => r.json()).then(d => { if (d?.mrr !== undefined) setMrr(d.mrr) }).catch(() => {})
    return () => window.removeEventListener('resize', calcOrb)
  }, [])

  const handleAmplitude = useCallback((val: number) => setOrbAmplitude(val), [])
  const handleMessage = useCallback((msg: Message) => setMessages(prev => [...prev, msg]), [])
  const handleAgentChange = useCallback((agent: AgentName) => setActiveAgent(agent), [])
  const agentColor = AGENT_COLORS[activeAgent] ?? '#00d4ff'
  const isActive = messages.some(m => m.role === 'user')

  if (isMobile) return <MobileChat />

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; background: #020810; font-family: 'Courier New', monospace; color: white; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.15); border-radius: 2px; }
        @keyframes voice-dot-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes feedIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes agentIn { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:translateX(0)} }
      `}</style>

      <VoiceInterrupt onMessage={msg => handleMessage({ id: Date.now().toString(), role: 'assistant', agent: 'jarvis', content: msg, timestamp: new Date() })} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'clamp(200px, 21vw, 360px) 1fr clamp(200px, 21vw, 360px)',
        gridTemplateRows: 'clamp(32px, 3.5vh, 42px) 1fr clamp(58px, 8vh, 82px)',
        height: '100vh', width: '100vw', overflow: 'hidden', background: '#020810',
      }}>

        {/* ── Agent bar ── */}
        <div style={{ gridColumn: '1/-1', gridRow: 1, borderBottom: '1px solid rgba(0,212,255,0.08)' }}>
          <AgentBar activeAgent={activeAgent} />
        </div>

        {/* ── Left panel ── */}
        <div style={{ gridColumn: 1, gridRow: 2, borderRight: '1px solid rgba(0,212,255,0.08)', background: 'rgba(0,5,16,0.92)', overflowY: 'auto', overflowX: 'hidden' }}>
          <LeftPanel />
        </div>

        {/* ── CENTER: Jarvis in true center, live feed below ── */}
        <div style={{ gridColumn: 2, gridRow: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: 'rgba(0,2,10,0.95)' }}>

          {/* Jarvis — vertically centered in top 55% of center column */}
          <div style={{
            flex: '0 0 55%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}>
            {/* Subtle corner brackets (Iron Man HUD) */}
            {[['0','0','right','bottom'],['auto','0','left','bottom'],['0','auto','right','top'],['auto','auto','left','top']].map(([b,r,borderR,borderB], i) => (
              <div key={i} style={{
                position: 'absolute',
                bottom: b === '0' ? 0 : undefined, right: r === '0' ? 0 : undefined,
                top: b === 'auto' ? 0 : undefined, left: r === 'auto' ? 0 : undefined,
                width: 20, height: 20,
                borderRight: borderR === 'right' ? '1px solid rgba(0,212,255,0.15)' : 'none',
                borderBottom: borderB === 'bottom' ? '1px solid rgba(0,212,255,0.15)' : 'none',
                borderLeft: borderR === 'left' ? '1px solid rgba(0,212,255,0.15)' : 'none',
                borderTop: borderB === 'top' ? '1px solid rgba(0,212,255,0.15)' : 'none',
              }} />
            ))}

            {/* Agent label */}
            <div style={{ fontSize: 'clamp(8px, 0.65vw, 10px)', letterSpacing: '0.3em', color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', marginBottom: 8 }}>
              JARVIS OS — AB COMMAND CENTER
            </div>

            {/* Orb */}
            <JarvisOrb active={isActive} agentColor={agentColor} amplitude={orbAmplitude} size={orbSize} />

            {/* Active agent name */}
            <div style={{
              marginTop: 10,
              fontSize: 'clamp(10px, 0.9vw, 13px)', fontWeight: 700,
              letterSpacing: '0.45em', textTransform: 'uppercase',
              color: agentColor, textShadow: `0 0 14px ${agentColor}70`,
            }}>
              {activeAgent}
            </div>

            {/* Status line */}
            <div style={{ fontSize: 'clamp(7px, 0.6vw, 9px)', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
              {orbAmplitude > 0.05 ? '● SPEAKING' : isActive ? '● PROCESSING' : '● STANDBY'}
            </div>

            {/* Agent side panel — floats to the right of the orb */}
            <AgentPanel messages={messages} />

            {/* Dual monitor hint */}
            {isExtended && (
              <button
                onClick={() => window.open('/workspace', '_blank')}
                style={{ position: 'absolute', top: 8, right: 8, fontSize: 8, letterSpacing: '0.1em', border: '1px solid rgba(0,212,255,0.2)', padding: '2px 8px', color: 'rgba(0,212,255,0.4)', background: 'transparent', cursor: 'pointer', borderRadius: 2 }}
              >
                WORKSPACE →
              </button>
            )}
          </div>

          {/* Live intelligence feed — bottom 45% of center */}
          <div style={{ flex: '0 0 45%', borderTop: '1px solid rgba(0,212,255,0.06)', overflow: 'hidden' }}>
            <LiveFeed messages={messages} />
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ gridColumn: 3, gridRow: 2, borderLeft: '1px solid rgba(0,212,255,0.08)', background: 'rgba(0,5,16,0.92)', overflowY: 'auto' }}>
          <RightPanel activeAgent={activeAgent} mrr={mrr} />
        </div>

        {/* ── Command bar — full width ── */}
        <div style={{ gridColumn: '1/-1', gridRow: 3, borderTop: '1px solid rgba(0,212,255,0.12)', background: 'rgba(0,2,8,0.98)' }}>
          <CommandInterface messages={messages} onMessage={handleMessage} onAgentChange={handleAgentChange} onAmplitude={handleAmplitude} />
        </div>

      </div>
    </>
  )
}
