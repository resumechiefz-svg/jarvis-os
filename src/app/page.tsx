'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import NewsTicker from '@/components/hud/NewsTicker'
import LeftPanel from '@/components/hud/LeftPanel'
import RightPanel from '@/components/hud/RightPanel'
import TelemetryLog from '@/components/hud/TelemetryLog'
import CommandInterface from '@/components/hud/CommandInterface'
import PushToggle from '@/components/hud/PushToggle'
import type { Message, TelemetryEntry, AgentName } from '@/lib/types'

const JarvisOrb = dynamic(() => import('@/components/orb/JarvisOrb'), { ssr: false })

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff',
  nova: '#a855f7',
  sage: '#00ff88',
  vault: '#c9a84c',
}

const BOOT_LINES = [
  { agent: 'jarvis' as AgentName, action: 'Initializing AB Command Center...' },
  { agent: 'jarvis' as AgentName, action: 'Loading agent roster...' },
  { agent: 'nova' as AgentName, action: 'ResumeChiefz data pipeline connected.' },
  { agent: 'sage' as AgentName, action: 'LifeOS engines online.' },
  { agent: 'vault' as AgentName, action: 'Card Chiefz feed active.' },
  { agent: 'jarvis' as AgentName, action: 'All Phase 1 agents online. Standing by.' },
  { agent: 'jarvis' as AgentName, action: 'Type a command or click "Morning Brief" to begin.' },
]

function makeTelemetry(agent: AgentName, action: string, detail?: string): TelemetryEntry {
  return { id: Date.now().toString() + Math.random(), timestamp: new Date(), agent, action, detail }
}

export default function HUD() {
  const [messages, setMessages] = useState<Message[]>([])
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([])
  const [activeAgent, setActiveAgent] = useState<AgentName>('jarvis')
  const [orbActive, setOrbActive] = useState(false)
  const [orbAmplitude, setOrbAmplitude] = useState(0)
  const [bootLine, setBootLine] = useState(0)
  const [booting, setBooting] = useState(true)
  const [, setTick] = useState(0)
  const amplitudeRef = useRef(0)

  const handleAmplitude = useCallback((val: number) => {
    amplitudeRef.current = val
    setOrbAmplitude(val)
  }, [])

  useEffect(() => {
    if (bootLine < BOOT_LINES.length) {
      const timer = setTimeout(() => {
        const line = BOOT_LINES[bootLine]
        setTelemetry(prev => [...prev.slice(-49), makeTelemetry(line.agent, line.action)])
        setBootLine(b => b + 1)
      }, 350 + Math.random() * 250)
      return () => clearTimeout(timer)
    } else {
      setBooting(false)
    }
  }, [bootLine])

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const handleMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, msg])
    if (msg.role === 'user') {
      setOrbActive(true)
      setTelemetry(prev => [...prev.slice(-49), makeTelemetry('jarvis', 'Received command', msg.content.slice(0, 50))])
    } else {
      setOrbActive(false)
      setTelemetry(prev => [...prev.slice(-49), makeTelemetry(msg.agent, 'Response delivered', `${msg.content.length} chars`)])
    }
  }, [])

  const handleAgentChange = useCallback((agent: AgentName) => {
    setActiveAgent(agent)
    if (agent !== 'jarvis') {
      setTelemetry(prev => [...prev.slice(-49), makeTelemetry(agent, 'Agent activated', 'Processing')])
    }
  }, [])

  const agentColor = AGENT_COLORS[activeAgent] ?? '#00d4ff'

  return (
    <div className="hud-root">
      <NewsTicker />

      <LeftPanel />

      <div className="center-panel">
        <div className="w-full text-center mb-1">
          <div className="text-[9px] tracking-[0.3em] text-cyan-500/40 uppercase">Primary Objective</div>
          <div className="text-[10px] tracking-widest mt-0.5" style={{ color: agentColor }}>
            7-FIGURE PORTFOLIO — FINANCIAL INDEPENDENCE BY 40
          </div>
        </div>

        <div className="relative">
          <JarvisOrb active={orbActive} agentColor={agentColor} amplitude={orbAmplitude} />
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center pointer-events-none">
            <div
              className="text-[11px] font-bold tracking-[0.4em] uppercase"
              style={{ color: agentColor, textShadow: `0 0 12px ${agentColor}` }}
            >
              {activeAgent.toUpperCase()}
            </div>
            <div className="text-[8px] tracking-widest text-white/30 mt-0.5">
              {orbActive ? 'PROCESSING' : booting ? 'BOOTING' : 'STANDBY'}
            </div>
          </div>
        </div>

        <div className="flex gap-8 text-center">
          {[
            { label: 'AGENTS', value: '4' },
            { label: 'PHASE', value: '1' },
            { label: 'STATUS', value: 'LIVE' },
          ].map(s => (
            <div key={s.label}>
              <div className="text-[22px] font-mono leading-none" style={{ color: agentColor }}>{s.value}</div>
              <div className="text-[8px] tracking-widest text-white/30 uppercase mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <RightPanel telemetry={telemetry} activeAgent={activeAgent} />

      <TelemetryLog entries={telemetry} />

      <CommandInterface
        messages={messages}
        onMessage={handleMessage}
        onAgentChange={handleAgentChange}
        onAmplitude={handleAmplitude}
      />

      <div className="hud-footer flex items-center justify-between px-4">
        <span className="text-[9px] tracking-[0.2em] text-cyan-950 uppercase">
          JARVIS OS v2.0 — AB COMMAND CENTER — &quot;WE DO NOT PLAY GAMES HERE&quot;
        </span>
        <div className="flex items-center gap-4">
          <PushToggle />
          <a href="/workspace" className="text-[9px] text-cyan-900 hover:text-cyan-600 uppercase tracking-wider transition-colors">
            Workspace →
          </a>
          {['NOVA', 'SAGE', 'VAULT', 'JARVIS'].map(a => (
            <span key={a} className="text-[9px] text-cyan-950">● {a}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
