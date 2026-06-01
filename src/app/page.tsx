'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import MobileChat from '@/components/mobile/MobileChat'
import AgentBar from '@/components/hud/AgentBar'
import LeftPanel from '@/components/hud/LeftPanel'
import RightPanel from '@/components/hud/RightPanel'
import VoiceInterrupt from '@/components/hud/VoiceInterrupt'
import LiveFeed from '@/components/hud/LiveFeed'
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
  const [isExtended, setIsExtended] = useState(false) // dual monitor detected
  const [messages, setMessages] = useState<Message[]>([])
  const [activeAgent, setActiveAgent] = useState<AgentName>('jarvis')
  const [orbAmplitude, setOrbAmplitude] = useState(0)
  const [mrr, setMrr] = useState(0)

  useEffect(() => {
    const mobile = window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    setIsMobile(mobile)

    // Detect dual/extended displays (Chrome 100+ supports screen.isExtended)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = screen as any
    if (s.isExtended !== undefined) {
      setIsExtended(s.isExtended)
      // Listen for screen changes (plug/unplug monitor)
      if (typeof s.addEventListener === 'function') {
        const handler = () => setIsExtended(s.isExtended)
        s.addEventListener('change', handler)
        return () => s.removeEventListener('change', handler)
      }
    }
    fetch('/api/nova').then(r => r.json()).then(d => { if (d?.mrr !== undefined) setMrr(d.mrr) }).catch(() => {})
  }, [])

  const handleAmplitude = useCallback((val: number) => setOrbAmplitude(val), [])
  const handleMessage = useCallback((msg: Message) => setMessages(prev => [...prev, msg]), [])
  const handleAgentChange = useCallback((agent: AgentName) => setActiveAgent(agent), [])
  const agentColor = AGENT_COLORS[activeAgent] ?? '#00d4ff'

  if (isMobile) return <MobileChat />

  return (
    <>
      <style>{`
        :root {
          --bg: #020810;
          --panel-w: clamp(220px, 22vw, 380px);
          --bar-h: clamp(32px, 3vh, 42px);
          --cmd-h: clamp(56px, 7vh, 80px);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; background: var(--bg); font-family: 'Courier New', monospace; }
        .hud-root {
          display: grid;
          grid-template-columns: var(--panel-w) 1fr var(--panel-w);
          grid-template-rows: var(--bar-h) 1fr var(--cmd-h);
          height: 100vh; width: 100vw;
          background: var(--bg); overflow: hidden;
        }
        /* Fluid scrollbars */
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.15); border-radius: 2px; }
        @keyframes voice-dot-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes feedIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
      `}</style>

      <VoiceInterrupt onMessage={msg => handleMessage({
        id: Date.now().toString(), role: 'assistant', agent: 'jarvis', content: msg, timestamp: new Date()
      })} />

      <div className="hud-root">

        {/* ── Agent bar — full width ── */}
        <div style={{ gridColumn: '1/-1', gridRow: 1, borderBottom: '1px solid rgba(0,212,255,0.08)' }}>
          <AgentBar activeAgent={activeAgent} />
        </div>

        {/* ── Left panel ── */}
        <div style={{
          gridColumn: 1, gridRow: 2,
          borderRight: '1px solid rgba(0,212,255,0.08)',
          background: 'rgba(0,6,18,0.92)', overflowY: 'auto', overflowX: 'hidden',
        }}>
          <LeftPanel />
        </div>

        {/* ── Center: Jarvis + live feed ── */}
        <div style={{
          gridColumn: 2, gridRow: 2,
          display: 'flex', flexDirection: 'column',
          background: 'rgba(0,3,10,0.95)', overflow: 'hidden',
          position: 'relative',
        }}>
          {/* Orb — centered, scales with viewport */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 'clamp(8px,2vh,20px) 0 0',
            flexShrink: 0, position: 'relative',
          }}>
            {/* Agent label above */}
            <div style={{
              fontSize: 'clamp(8px,0.7vw,11px)', letterSpacing: '0.3em',
              color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 6,
            }}>
              JARVIS OS — AB COMMAND CENTER
            </div>

            {/* Orb — size scales with viewport */}
            <div style={{ position: 'relative', lineHeight: 0 }}>
              <JarvisOrb
                active={messages.some(m => m.role === 'user')}
                agentColor={agentColor}
                amplitude={orbAmplitude}
                size={Math.min(Math.floor((typeof window !== 'undefined' ? window.innerWidth : 1400) * 0.16), 300)}
              />
              {/* Agent name below orb */}
              <div style={{
                position: 'absolute', bottom: -20, left: 0, right: 0,
                textAlign: 'center',
                fontSize: 'clamp(9px,0.8vw,12px)', fontWeight: 700,
                letterSpacing: '0.4em', textTransform: 'uppercase',
                color: agentColor, textShadow: `0 0 12px ${agentColor}80`,
              }}>
                {activeAgent}
              </div>
            </div>
          </div>

          {/* Live intelligence feed below orb */}
          <div style={{ flex: 1, overflow: 'hidden', marginTop: 24 }}>
            <LiveFeed messages={messages} />
          </div>

          {/* Dual monitor banner — suggest opening workspace on MacBook */}
          {isExtended && (
            <div style={{
              position: 'absolute', top: 8, right: 8,
              fontSize: 9, letterSpacing: '0.12em',
              border: '1px solid rgba(0,212,255,0.2)',
              padding: '3px 10px', color: 'rgba(0,212,255,0.5)',
              background: 'rgba(0,212,255,0.04)', borderRadius: 2,
              cursor: 'pointer',
            }}
              onClick={() => window.open('/workspace', '_blank')}
            >
              DUAL MONITOR — OPEN WORKSPACE ON MACBOOK →
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div style={{
          gridColumn: 3, gridRow: 2,
          borderLeft: '1px solid rgba(0,212,255,0.08)',
          background: 'rgba(0,6,18,0.92)', overflowY: 'auto',
        }}>
          <RightPanel activeAgent={activeAgent} mrr={mrr} />
        </div>

        {/* ── Command bar — full width ── */}
        <div style={{
          gridColumn: '1/-1', gridRow: 3,
          borderTop: '1px solid rgba(0,212,255,0.12)',
          background: 'rgba(0,2,8,0.98)',
        }}>
          <CommandInterface
            messages={messages}
            onMessage={handleMessage}
            onAgentChange={handleAgentChange}
            onAmplitude={handleAmplitude}
          />
        </div>

      </div>
    </>
  )
}
