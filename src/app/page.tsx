'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import MobileChat from '@/components/mobile/MobileChat'
import AgentBar from '@/components/hud/AgentBar'
import LeftPanel from '@/components/hud/LeftPanel'
import RightPanel from '@/components/hud/RightPanel'
import VoiceInterrupt from '@/components/hud/VoiceInterrupt'
import type { Message, AgentName } from '@/lib/types'

const CommandInterface = dynamic(() => import('@/components/hud/CommandInterface'), { ssr: false })
const CenterHUD = dynamic(() => import('@/components/hud/CenterHUD'), { ssr: false })

export default function HUD() {
  const [isMobile, setIsMobile] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [activeAgent, setActiveAgent] = useState<AgentName>('jarvis')
  const [orbAmplitude, setOrbAmplitude] = useState(0)
  const [mrr, setMrr] = useState(0)

  useEffect(() => {
    const mobile = window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    setIsMobile(mobile)
    fetch('/api/nova').then(r => r.json()).then(d => { if (d?.mrr !== undefined) setMrr(d.mrr) }).catch(() => {})
  }, [])

  const handleAmplitude = useCallback((val: number) => setOrbAmplitude(val), [])
  const handleMessage = useCallback((msg: Message) => setMessages(prev => [...prev, msg]), [])
  const handleAgentChange = useCallback((agent: AgentName) => setActiveAgent(agent), [])

  if (isMobile) return <MobileChat />

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; background: #020810; font-family: 'Courier New', monospace; color: white; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.15); border-radius: 2px; }
        @keyframes voice-dot-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes feedSlide { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
        @keyframes scan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes agentIn { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:translateX(0)} }
        @keyframes tickerScroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
      `}</style>

      <VoiceInterrupt onMessage={msg => handleMessage({
        id: Date.now().toString(), role: 'assistant', agent: 'jarvis', content: msg, timestamp: new Date()
      })} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'clamp(190px, 20vw, 340px) 1fr clamp(190px, 20vw, 340px)',
        gridTemplateRows: 'clamp(30px, 3.2vh, 40px) 1fr clamp(56px, 8vh, 80px)',
        height: '100vh', width: '100vw', overflow: 'hidden', background: '#020810',
      }}>

        {/* Agent bar */}
        <div style={{ gridColumn: '1/-1', gridRow: 1, borderBottom: '1px solid rgba(0,212,255,0.1)', background: 'rgba(0,0,0,0.6)' }}>
          <AgentBar activeAgent={activeAgent} />
        </div>

        {/* Left */}
        <div style={{ gridColumn: 1, gridRow: 2, borderRight: '1px solid rgba(0,212,255,0.08)', background: 'rgba(0,4,14,0.94)', overflowY: 'auto', overflowX: 'hidden' }}>
          <LeftPanel />
        </div>

        {/* Center — CenterHUD owns this entirely */}
        <div style={{ gridColumn: 2, gridRow: 2, overflow: 'hidden', position: 'relative' }}>
          <CenterHUD
            messages={messages}
            activeAgent={activeAgent}
            amplitude={orbAmplitude}
          />
        </div>

        {/* Right */}
        <div style={{ gridColumn: 3, gridRow: 2, borderLeft: '1px solid rgba(0,212,255,0.08)', background: 'rgba(0,4,14,0.94)', overflowY: 'auto' }}>
          <RightPanel activeAgent={activeAgent} mrr={mrr} />
        </div>

        {/* Command bar */}
        <div style={{ gridColumn: '1/-1', gridRow: 3, borderTop: '1px solid rgba(0,212,255,0.15)', background: 'rgba(0,1,6,0.99)' }}>
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
