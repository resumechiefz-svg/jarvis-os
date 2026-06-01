'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import MobileChat from '@/components/mobile/MobileChat'
import AgentBar from '@/components/hud/AgentBar'
import NewsTicker from '@/components/hud/NewsTicker'
import ForgeBuildMonitor from '@/components/hud/ForgeBuildMonitor'
import LeftPanel from '@/components/hud/LeftPanel'
import RightPanel from '@/components/hud/RightPanel'
import GoalOne from '@/components/hud/GoalOne'
import CommandInterface from '@/components/hud/CommandInterface'
import PushToggle from '@/components/hud/PushToggle'
import JarvisGreeting from '@/components/hud/JarvisGreeting'
import VoiceInterrupt from '@/components/hud/VoiceInterrupt'
import ScreenAwareness from '@/components/hud/ScreenAwareness'
import type { Message, AgentName } from '@/lib/types'

const JarvisOrb = dynamic(() => import('@/components/orb/JarvisOrb'), { ssr: false })

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff', nova: '#a855f7', sage: '#00ff88', vault: '#c9a84c',
  echo: '#ff6b35', scout: '#ff4455', reel: '#ff69b4', lister: '#fbbf24',
  dex: '#60a5fa', beacon: '#34d399', ledger: '#f87171', atlas: '#e879f9',
}

export default function HUD() {
  // ALL hooks must be at top — before any conditional returns (React rules)
  const [isMobile, setIsMobile] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [activeAgent, setActiveAgent] = useState<AgentName>('jarvis')
  const [orbActive, setOrbActive] = useState(false)
  const [orbAmplitude, setOrbAmplitude] = useState(0)
  const [booting, setBooting] = useState(true)
  const [mrr, setMrr] = useState(0)
  const amplitudeRef = useRef(0)

  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
  }, [])

  const handleAmplitude = useCallback((val: number) => {
    amplitudeRef.current = val
    setOrbAmplitude(val)
  }, [])

  useEffect(() => {
    fetch('/api/nova').then(r => r.json()).then(d => { if (d?.mrr !== undefined) setMrr(d.mrr) }).catch(() => {})
    const timer = setTimeout(() => setBooting(false), 2500)
    return () => clearTimeout(timer)
  }, [])

  const handleMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, msg])
    if (msg.role === 'user') setOrbActive(true)
    else setOrbActive(false)
  }, [])

  const handleAgentChange = useCallback((agent: AgentName) => {
    setActiveAgent(agent)
  }, [])

  const agentColor = AGENT_COLORS[activeAgent] ?? '#00d4ff'

  // Mobile: show clean chat only
  if (isMobile) return <MobileChat />

  return (
    <div className="hud-root">
      {/* Background systems — invisible, always running */}
      <VoiceInterrupt onMessage={msg => handleMessage({ id: Date.now().toString(), role: 'assistant', agent: 'jarvis', content: msg, timestamp: new Date() })} />

      {/* Row 1: Agent status bar */}
      <AgentBar activeAgent={activeAgent} />

      {/* Row 2 Left: Live data panels */}
      <LeftPanel />

      {/* Row 2 Center: Orb + Goal */}
      <div className="center-panel">
        {/* Orb */}
        <div className="relative shrink-0">
          <JarvisOrb active={orbActive} agentColor={agentColor} amplitude={orbAmplitude} />
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center pointer-events-none">
            <div
              className="text-[10px] font-bold tracking-[0.4em] uppercase"
              style={{ color: agentColor, textShadow: `0 0 12px ${agentColor}` }}
            >
              {activeAgent.toUpperCase()}
            </div>
            <div className="text-[7px] tracking-widest text-white/25 mt-0.5">
              {orbActive ? 'PROCESSING' : booting ? 'BOOTING' : 'STANDBY'}
            </div>
          </div>
        </div>

        {/* Goal 1 — directly under the orb */}
        <GoalOne mrr={mrr} />
      </div>

      {/* Row 2 Right: Kalshi + financials */}
      <RightPanel activeAgent={activeAgent} mrr={mrr} />

      {/* Row 3: News ticker (moved from top) */}
      <ForgeBuildMonitor />
      <NewsTicker />

      {/* Jarvis greeting + predictive suggestions */}
      <JarvisGreeting onSuggestionClick={text => handleMessage({ id: Date.now().toString(), role: 'user', agent: 'jarvis', content: text, timestamp: new Date() })} />

      {/* Row 4: Command interface */}
      <CommandInterface
        messages={messages}
        onMessage={handleMessage}
        onAgentChange={handleAgentChange}
        onAmplitude={handleAmplitude}
      />

      {/* Row 5: Footer */}
      <div className="hud-footer flex items-center justify-between px-4">
        <span className="text-[8px] tracking-[0.2em] text-cyan-950 uppercase">
          JARVIS OS v2.0 — AB COMMAND CENTER
        </span>
        <div className="flex items-center gap-3">
          <ScreenAwareness onInsight={text => handleMessage({ id: Date.now().toString(), role: 'assistant', agent: 'jarvis', content: text, timestamp: new Date() })} />
          <PushToggle />
          {[
            { label: 'Workspace', href: '/workspace' },
            { label: 'Ideas', href: '/ideas' },
            { label: 'Acquisition', href: '/acquisition' },
            { label: 'Health', href: '/health' },
          ].map(l => (
            <a key={l.href} href={l.href} className="text-[8px] text-cyan-900 hover:text-cyan-600 uppercase tracking-wider transition-colors">
              {l.label} →
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
