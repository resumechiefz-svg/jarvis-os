'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import MobileChat from '@/components/mobile/MobileChat'
import AgentBar from '@/components/hud/AgentBar'
import LeftPanel from '@/components/hud/LeftPanel'
import RightPanel from '@/components/hud/RightPanel'
import VoiceInterrupt from '@/components/hud/VoiceInterrupt'
import FloatingPanel from '@/components/hud/FloatingPanel'
import { useAgentTasks } from '@/lib/hooks/useAgentTasks'
const MiniAgentOrb = dynamic(() => import('@/components/orb/MiniAgentOrb'), { ssr: false })
import { useJarvisState } from '@/lib/hooks/useJarvisState'
import HexGrid from '@/components/hud/HexGrid'
import Aurora from '@/components/ui/Aurora'
import type { Message, AgentName } from '@/lib/types'
import type { PanelData } from '@/components/hud/FloatingPanel'

const CommandInterface = dynamic(() => import('@/components/hud/CommandInterface'), { ssr: false })
const JarvisOrb = dynamic(() => import('@/components/orb/JarvisOrb'), { ssr: false })
const DexControlPanel = dynamic(() => import('@/components/hud/DexControlPanel'), { ssr: false })
const InfoCard = dynamic(() => import('@/components/hud/InfoCard'), { ssr: false })

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff', nova: '#a855f7', sage: '#00ff88', vault: '#c9a84c',
  echo: '#ff6b35', scout: '#ff4455', reel: '#ff69b4', lister: '#fbbf24',
  dex: '#60a5fa', beacon: '#34d399', ledger: '#f87171', atlas: '#e879f9',
}

// Ticker items scroll across the top
function Ticker({ items }: { items: string[] }) {
  if (!items.length) return null
  const all = [...items, ...items]
  return (
    <div style={{ overflow: 'hidden', flex: 1 }}>
      <div style={{ display: 'inline-block', whiteSpace: 'nowrap', animation: 'tickerScroll 55s linear infinite', fontSize: 10, color: 'rgba(0,212,255,0.3)', fontFamily: 'monospace', letterSpacing: '0.07em' }}>
        {all.map((item, i) => <span key={i} style={{ marginRight: 52 }}><span style={{ color: 'rgba(0,212,255,0.15)', marginRight: 10 }}>◆</span>{item}</span>)}
      </div>
    </div>
  )
}

// Feed item
interface FeedItem { id: string; type: string; text: string; value?: string; color?: string; ts: number }
const TYPE_CFG: Record<string, { icon: string; color: string }> = {
  news: { icon: '◈', color: '#8ab4cc' }, sale: { icon: '◆', color: '#c9a84c' },
  market: { icon: '▲', color: '#00ff88' }, trade: { icon: '◉', color: '#00d4ff' },
  agent: { icon: '◎', color: '#a855f7' }, alert: { icon: '⚡', color: '#ff6b35' },
}

export default function HUD() {
  const [isMobile, setIsMobile] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [activeAgent, setActiveAgent] = useState<AgentName>('jarvis')
  const [amplitude, setAmplitude] = useState(0)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const leftTapRef = useRef(0)    // double-tap detection
  const rightTapRef = useRef(0)
  const [feedOpen, setFeedOpen] = useState(false)
  const [mrr, setMrr] = useState(0)
  const [orbSize, setOrbSize] = useState(380)
  const [ticker, setTicker] = useState(['ASTRO ● ONLINE', 'TRADEPILOT ● ACTIVE', 'CARD CHIEFZ ● LIVE', 'RESUMECHIEFZ ● MONITORING'])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  const [panels, setPanels] = useState<PanelData[]>([])
  const [dexTask, setDexTask] = useState<string | null>(null)
  const dexAbortRef = useRef<(() => void) | null>(null)
  const [infoCard, setInfoCard] = useState<'weather' | 'news' | null>(null)
  const { tasks, startTask, completeTask, errorTask, dismissTask } = useAgentTasks()
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const { orbState, markActive } = useJarvisState(loading, speaking)
  const [portfolio, setPortfolio] = useState<{ equity: number; dayPL: number; dayPLPct: number } | null>(null)
  const [nova, setNova] = useState<{ mrr: number; activeUsers: number; newSubs: number } | null>(null)
  const [vault, setVault] = useState<{ weeklyRevenue: number; monthlySales: number; totalSales: number } | null>(null)
  const centerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mobile = window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    setIsMobile(mobile)
    const calc = () => {
      const w = centerRef.current?.clientWidth ?? window.innerWidth * 0.7
      const h = window.innerHeight * 0.72
      setOrbSize(Math.min(460, Math.max(240, Math.floor(Math.min(w * 0.55, h * 0.72)))))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  const addFeed = useCallback((item: Omit<FeedItem, 'id' | 'ts'>) => {
    const full: FeedItem = { ...item, id: `${Date.now()}-${Math.random()}`, ts: Date.now() }
    setFeed(prev => [full, ...prev].slice(0, 60))
    setFreshIds(prev => { const n = new Set(prev); n.add(full.id); return n })
    setTimeout(() => setFreshIds(prev => { const n = new Set(prev); n.delete(full.id); return n }), 2000)
  }, [])

  // Open a floating panel — called by voice or click
  const openPanel = useCallback((type: string) => {
    const id = `${type}-${Date.now()}`
    if (type === 'portfolio' && portfolio) {
      setPanels(prev => [...prev.filter(p => !p.id.startsWith('portfolio')), {
        id, title: 'TradePilot', color: '#00d4ff', icon: '◉',
        rows: [
          { label: 'Equity', value: `$${portfolio.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: '#00ff88' },
          { label: 'Day P&L', value: `${portfolio.dayPL >= 0 ? '+' : ''}$${portfolio.dayPL.toFixed(2)}`, color: portfolio.dayPL >= 0 ? '#00ff88' : '#ff4455' },
          { label: 'Return', value: `${portfolio.dayPLPct >= 0 ? '+' : ''}${portfolio.dayPLPct.toFixed(2)}%`, color: portfolio.dayPL >= 0 ? '#00ff88' : '#ff4455' },
        ]
      }])
    } else if (type === 'rc' && nova) {
      setPanels(prev => [...prev.filter(p => !p.id.startsWith('rc')), {
        id, title: 'ResumeChiefz', color: '#a855f7', icon: '◈',
        rows: [
          { label: 'MRR', value: `$${nova.mrr.toFixed(0)}`, bar: nova.mrr, barMax: 10000, color: '#a855f7' },
          { label: 'Users', value: String(nova.activeUsers), color: '#a855f7' },
          { label: 'New Subs', value: String(nova.newSubs), sub: '30 days', color: '#00ff88' },
        ]
      }])
    } else if (type === 'sales' && vault) {
      setPanels(prev => [...prev.filter(p => !p.id.startsWith('sales')), {
        id, title: 'Card Chiefz', color: '#c9a84c', icon: '◆',
        rows: [
          { label: 'Weekly Rev', value: `$${vault.weeklyRevenue.toFixed(2)}`, color: '#c9a84c' },
          { label: 'Mo Sales', value: String(vault.monthlySales), color: '#c9a84c' },
          { label: 'All Sales', value: `${vault.totalSales}+`, bar: vault.totalSales, barMax: 2000, color: '#c9a84c' },
        ]
      }])
    }
  }, [portfolio, nova, vault])

  const dismissPanel = useCallback((id: string) => {
    setPanels(prev => prev.filter(p => p.id !== id))
  }, [])

  // Voice-controlled panel visibility + Dex computer mode trigger
  const handleVoicePanel = useCallback((transcript: string) => {
    const t = transcript.toLowerCase()

    // Dex computer control — broad matching for voice recognition variations
    const isDexTrigger =
      (t.includes('dex') || t.includes('decks')) && (
        t.includes('wheel') || t.includes('take control') ||
        t.includes('take over') || t.includes('computer mode') ||
        t.includes('drive') || t.includes('you drive') || t.includes('handle it')
      )
    if (isDexTrigger || t.includes('dex computer mode') || t.includes('dex take over')) {
      const task = transcript
        // Strip any variation of the trigger phrase — "dex", "decks", "deck", etc. + action word
        .replace(/(dex|decks?)[,\s]+(take the wheel|take control|take over|computer mode|drive|you drive|handle it)[,\s]*/gi, '')
        // Also strip if just the action phrase appears alone after stripping
        .replace(/^(take the wheel|take control|take over)[,\s]*/gi, '')
        .trim()
      // If nothing meaningful remains after stripping, use default task
      const finalTask = task.length > 3 ? task : 'Assess the current state of the screen and report what you see.'
      setDexTask(finalTask)
      return true
    }
    // Dex voice abort — "Dex stop", "Dex abort", "Dex I got it", "exit Dex", etc.
    const isDexAbort = dexTask && (
      (t.includes('dex') || t.includes('decks')) && (
        t.includes('stop') || t.includes('abort') || t.includes('exit') ||
        t.includes('done') || t.includes('got it') || t.includes('enough') || t.includes('back')
      )
    )
    if (isDexAbort) {
      dexAbortRef.current?.()  // trigger abort animation then close
      return true
    }

    // Info card voice dismiss
    if (infoCard && (t.includes('close it') || t.includes('got it') || t.includes('dismiss') || t.includes('close card') || t.includes('hide it'))) {
      setInfoCard(null); return true
    }

    if (t.includes('hide left') || t.includes('close left')) { setLeftOpen(false); return true }
    if (t.includes('hide right') || t.includes('close right')) { setRightOpen(false); return true }
    if (t.includes('hide both') || t.includes('close both') || t.includes('hide panels') || t.includes('close panels')) {
      setLeftOpen(false); setRightOpen(false); return true
    }
    if (t.includes('show panels') || t.includes('open panels') || t.includes('show both') || t.includes('expand panels')) {
      setLeftOpen(true); setRightOpen(true); return true
    }
    if (t.includes('show left') || t.includes('open left')) { setLeftOpen(true); return true }
    if (t.includes('show right') || t.includes('open right')) { setRightOpen(true); return true }
    return false
  }, [dexTask, infoCard])

  // Data polling
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [p, n, v] = await Promise.allSettled([
          fetch('/api/portfolio').then(r => r.json()),
          fetch('/api/nova').then(r => r.json()),
          fetch('/api/vault').then(r => r.json()),
        ])
        if (!alive) return
        if (p.status === 'fulfilled' && p.value?.equity) setPortfolio(p.value)
        if (n.status === 'fulfilled' && n.value?.mrr !== undefined) { setNova(n.value); setMrr(n.value.mrr) }
        if (v.status === 'fulfilled' && v.value?.weeklyRevenue !== undefined) {
          setVault(v.value)
          v.value.recentSales?.slice(0, 1).forEach((s: { item: string; price: number }) =>
            addFeed({ type: 'sale', text: s.item, value: `$${s.price.toFixed(2)}`, color: '#c9a84c' })
          )
        }
      } catch { /* silent */ }

      try {
        const news = await fetch('/api/news').then(r => r.json())
        if (!alive) return
        const headlines: string[] = news.headlines ?? []
        if (headlines.length) {
          headlines.slice(0, 2).forEach((h: string) => addFeed({ type: 'news', text: h.slice(0, 90) }))
          setTicker(prev => [...headlines.slice(0, 4).map(h => h.slice(0, 55)), ...prev.slice(0, 2)])
        }
      } catch { /* silent */ }

      try {
        const stocks = await fetch('/api/stocks').then(r => r.json())
        if (!alive || !Array.isArray(stocks)) return
        setTicker(prev => [
          ...stocks.slice(0, 5).map((s: { symbol: string; price: number; changePercent: number }) =>
            `${s.symbol} $${s.price.toFixed(2)} ${s.changePercent >= 0 ? '▲' : '▼'}${Math.abs(s.changePercent).toFixed(2)}%`
          ),
          ...prev.slice(0, 3),
        ])
        stocks.forEach((s: { symbol: string; price: number; changePercent: number; change: number }) => {
          if (Math.abs(s.changePercent) > 1)
            addFeed({ type: 'market', text: `${s.symbol} ${s.changePercent >= 0 ? '▲' : '▼'} ${Math.abs(s.changePercent).toFixed(2)}%`, value: `$${s.price.toFixed(2)}`, color: s.change >= 0 ? '#00ff88' : '#ff4455' })
        })
      } catch { /* silent */ }
    }

    load()
    const t = setInterval(load, 90 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [addFeed])

  // Agent messages → feed + auto-open relevant panel
  useEffect(() => {
    if (!messages.length) return
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant') return
    const preview = last.content.replace(/\*+/g, '').split('\n')[0].slice(0, 100)
    addFeed({ type: 'agent', text: preview, color: AGENT_COLORS[last.agent] })

    // Panels only open when explicitly requested — no auto-triggers
  }, [messages, addFeed, openPanel, portfolio, nova, vault])

  const agentColor = AGENT_COLORS[activeAgent] ?? '#00d4ff'
  const isActive = messages.some(m => m.role === 'user')

  if (isMobile) return <MobileChat />

  // Computed values
  const PANEL_W = 300
  const orbSize = Math.min(Math.floor(Math.min(window.innerWidth * 0.42, window.innerHeight * 0.58)), 520)
  const isSpeaking = amplitude > 0.05
  const isProcessing = loading
  const statusLabel = isSpeaking ? 'SPEAKING' : isProcessing ? 'PROCESSING' : 'STANDBY'

  const AGENTS = [
    { id: 'jarvis', label: 'J', color: '#00d4ff' }, { id: 'nova', label: 'N', color: '#00ff88' },
    { id: 'sage', label: 'Sa', color: '#a855f7' }, { id: 'vault', label: 'V', color: '#c9a84c' },
    { id: 'echo', label: 'E', color: '#ff6b35' }, { id: 'scout', label: 'Sc', color: '#22d3ee' },
    { id: 'dex', label: 'D', color: '#64748b' }, { id: 'beacon', label: 'B', color: '#f472b6' },
    { id: 'ledger', label: 'L', color: '#34d399' }, { id: 'atlas', label: 'At', color: '#818cf8' },
    { id: 'lumen', label: 'Lu', color: '#fb923c' }, { id: 'reel', label: 'R', color: '#e879f9' },
  ]

  return (
    <>
      {/* Aurora — the living background */}
      <Aurora />

      {/* Overlays */}
      {infoCard && <InfoCard type={infoCard} onClose={() => setInfoCard(null)} />}
      {dexTask && (
        <DexControlPanel task={dexTask} onAbortRef={dexAbortRef}
          onDone={summary => { setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', agent: 'dex' as AgentName, content: `Task complete: ${summary}`, timestamp: new Date() }]); setTimeout(() => setDexTask(null), 3000) }}
          onAbort={() => setDexTask(null)} />
      )}

      <VoiceInterrupt onMessage={msg => setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', agent: 'jarvis', content: msg, timestamp: new Date() }])} />

      <style>{`
        @keyframes orb-breathe { 0%,100%{transform:scale(1)} 50%{transform:scale(1.025)} }
        @keyframes orb-active  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
        @keyframes ring-expand { 0%{transform:translate(-50%,-50%) scale(1);opacity:0.5} 100%{transform:translate(-50%,-50%) scale(1.8);opacity:0} }
        @keyframes ring-expand2{ 0%{transform:translate(-50%,-50%) scale(1);opacity:0.3} 100%{transform:translate(-50%,-50%) scale(2.2);opacity:0} }
        @keyframes slide-left  { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        @keyframes slide-right { from{transform:translateX(100%)} to{transform:translateX(0)} }
        @keyframes fade-up     { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse-dot   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(0.7)} }
        @keyframes ticker-run  { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes glow-pulse  { 0%,100%{opacity:0.4} 50%{opacity:1} }
      `}</style>

      {/* ══════════════════════════════════════════════════════
          ROOT — full viewport, layered above aurora
      ══════════════════════════════════════════════════════ */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── TOP BAR — ultra minimal ─────────────────────── */}
        <div style={{
          flexShrink: 0, height: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px',
          background: 'rgba(0,2,10,0.6)',
          backdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(0,212,255,0.07)',
        }}>
          {/* Logo — ASTRO is the personal system. Jarvis is the commercial product. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 800, letterSpacing: '0.22em', color: 'white', textShadow: '0 0 24px rgba(201,168,76,0.7)' }}>
              A<span style={{ color: '#c9a84c' }}>S</span>TRO
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '2px 7px',
              background: 'rgba(201,168,76,0.08)',
              border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: 3,
            }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#c9a84c', boxShadow: '0 0 6px #c9a84c', animation: 'pulse-dot 2.5s ease-in-out infinite' }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, letterSpacing: '0.2em', color: 'rgba(201,168,76,0.6)' }}>PERSONAL</span>
            </div>
          </div>

          {/* Agent constellation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {AGENTS.map(agent => {
              const isActive = activeAgent === agent.id
              return (
                <div key={agent.id} title={agent.id}
                  style={{
                    width: isActive ? 30 : 22, height: isActive ? 30 : 22,
                    borderRadius: '50%',
                    background: isActive ? `${agent.color}20` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isActive ? agent.color : 'rgba(255,255,255,0.08)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isActive ? 9 : 7, fontWeight: 700,
                    color: isActive ? agent.color : 'rgba(255,255,255,0.25)',
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                    boxShadow: isActive ? `0 0 12px ${agent.color}50, 0 0 24px ${agent.color}20` : 'none',
                    animation: isActive ? 'pulse-dot 2s ease-in-out infinite' : 'none',
                  }}
                >
                  {agent.label}
                </div>
              )
            })}
          </div>

          {/* Time + status */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.05em' }}>
              {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: 'rgba(0,212,255,0.4)', letterSpacing: '0.2em' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
            </div>
          </div>
        </div>

        {/* ── MAIN STAGE — full screen, orb centered ──────── */}
        <div ref={centerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

          {/* Deep radial glow that intensifies with activity */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: `${orbSize * 3}px`, height: `${orbSize * 3}px`,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${agentColor}${isSpeaking ? '18' : isProcessing ? '10' : '08'} 0%, transparent 65%)`,
            transition: 'background 0.6s ease, width 0.4s, height 0.4s',
            pointerEvents: 'none',
          }} />

          {/* Pulse rings — animate when active */}
          {(isSpeaking || isProcessing) && (<>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              width: `${orbSize * 1.15}px`, height: `${orbSize * 1.15}px`,
              borderRadius: '50%',
              border: `1px solid ${agentColor}`,
              animation: 'ring-expand 2.4s ease-out infinite',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              width: `${orbSize * 1.05}px`, height: `${orbSize * 1.05}px`,
              borderRadius: '50%',
              border: `1px solid ${agentColor}60`,
              animation: 'ring-expand2 2.4s ease-out 0.8s infinite',
              pointerEvents: 'none',
            }} />
          </>)}

          {/* ── THE ORB — the presence ── */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -54%)',
            animation: isSpeaking ? 'orb-active 1.2s ease-in-out infinite' : 'orb-breathe 4s ease-in-out infinite',
          }}>
            <JarvisOrb active={isActive} agentColor={agentColor} amplitude={amplitude} size={orbSize} orbState={orbState} />
          </div>

          {/* Agent label + status — floats below orb */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: `translate(-50%, ${orbSize * 0.47}px)`,
            textAlign: 'center', animation: 'fade-up 0.5s ease both',
          }}>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 'clamp(13px, 1.2vw, 18px)', fontWeight: 700,
              letterSpacing: '0.5em', textTransform: 'uppercase',
              color: agentColor,
              textShadow: `0 0 30px ${agentColor}`,
              marginBottom: 8,
            }}>
              {activeAgent}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 10px',
              background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
              border: `1px solid ${agentColor}20`,
              borderRadius: 100,
            }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: isSpeaking ? '#a855f7' : isProcessing ? agentColor : `${agentColor}50`,
                boxShadow: isSpeaking ? '0 0 8px #a855f7' : isProcessing ? `0 0 8px ${agentColor}` : 'none',
                animation: (isSpeaking || isProcessing) ? 'pulse-dot 1s ease-in-out infinite' : 'none',
              }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)' }}>
                {statusLabel}
              </span>
            </div>
          </div>

          {/* Agent task orbs */}
          {tasks.length > 0 && (
            <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 20 }}>
              {tasks.map(task => (
                <div key={task.id}>
                  <MiniAgentOrb agent={task.agent} color={task.color} status={task.status as 'thinking' | 'working' | 'complete' | 'error'} startedAt={task.startedAt} onDismiss={() => dismissTask(task.id)} />
                </div>
              ))}
            </div>
          )}

          {/* Floating data panels */}
          {panels.map((panel, i) => <FloatingPanel key={panel.id} panel={panel} onDismiss={dismissPanel} index={i} />)}

          {/* ── LEFT PANEL — slides in from left ── */}
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: leftOpen ? PANEL_W : 0,
            background: 'rgba(0,3,14,0.7)',
            backdropFilter: leftOpen ? 'blur(24px)' : 'none',
            borderRight: leftOpen ? '1px solid rgba(0,212,255,0.08)' : 'none',
            transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)',
            overflow: 'hidden', zIndex: 30,
          }}>
            <div style={{ width: PANEL_W, height: '100%', overflow: 'hidden' }}>
              <LeftPanel />
            </div>
          </div>

          {/* Left panel toggle tab */}
          <div onClick={() => setLeftOpen(o => !o)} style={{
            position: 'absolute', left: leftOpen ? PANEL_W : 0, top: '50%', transform: 'translateY(-50%)',
            width: 20, height: 60, zIndex: 31, cursor: 'pointer',
            background: 'rgba(0,3,14,0.8)', borderRight: '1px solid rgba(0,212,255,0.1)',
            borderTop: '1px solid rgba(0,212,255,0.08)', borderBottom: '1px solid rgba(0,212,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, color: 'rgba(0,212,255,0.3)', letterSpacing: '0.1em',
            writingMode: 'vertical-rl', transition: 'left 0.4s cubic-bezier(0.16,1,0.3,1)',
            borderRadius: '0 4px 4px 0',
          }}>
            {leftOpen ? '◀' : '▶'}
          </div>

          {/* ── RIGHT PANEL — slides in from right ── */}
          <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0,
            width: rightOpen ? PANEL_W : 0,
            background: 'rgba(0,3,14,0.7)',
            backdropFilter: rightOpen ? 'blur(24px)' : 'none',
            borderLeft: rightOpen ? '1px solid rgba(0,212,255,0.08)' : 'none',
            transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)',
            overflow: 'hidden', zIndex: 30,
          }}>
            <div style={{ width: PANEL_W, height: '100%', overflow: 'hidden' }}>
              <RightPanel activeAgent={activeAgent} mrr={mrr} />
            </div>
          </div>

          {/* Right panel toggle tab */}
          <div onClick={() => setRightOpen(o => !o)} style={{
            position: 'absolute', right: rightOpen ? PANEL_W : 0, top: '50%', transform: 'translateY(-50%)',
            width: 20, height: 60, zIndex: 31, cursor: 'pointer',
            background: 'rgba(0,3,14,0.8)', borderLeft: '1px solid rgba(0,212,255,0.1)',
            borderTop: '1px solid rgba(0,212,255,0.08)', borderBottom: '1px solid rgba(0,212,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, color: 'rgba(0,212,255,0.3)',
            writingMode: 'vertical-rl', transition: 'right 0.4s cubic-bezier(0.16,1,0.3,1)',
            borderRadius: '4px 0 0 4px',
          }}>
            {rightOpen ? '▶' : '◀'}
          </div>

          {/* Live ticker — bottom of stage, very subtle */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 26,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
            borderTop: '1px solid rgba(0,212,255,0.04)',
            overflow: 'hidden', display: 'flex', alignItems: 'center',
          }}>
            <div style={{ paddingLeft: 12, paddingRight: 8, fontSize: 8, color: 'rgba(0,212,255,0.3)', letterSpacing: '0.2em', flexShrink: 0, borderRight: '1px solid rgba(0,212,255,0.06)' }}>LIVE</div>
            <div style={{ flex: 1, overflow: 'hidden', padding: '0 12px' }}>
              <div style={{ display: 'inline-block', whiteSpace: 'nowrap', animation: 'ticker-run 55s linear infinite', fontSize: 9, color: 'rgba(255,255,255,0.22)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
                {[...ticker, ...ticker].map((item, i) => <span key={i} style={{ marginRight: 48 }}><span style={{ color: 'rgba(0,212,255,0.2)', marginRight: 8 }}>◆</span>{item}</span>)}
              </div>
            </div>
            {/* Quick panel triggers */}
            <div style={{ display: 'flex', gap: 6, padding: '0 12px', flexShrink: 0 }}>
              {[{l:'TRADE',fn:()=>openPanel('portfolio'),c:'#00d4ff'},{l:'RC',fn:()=>openPanel('rc'),c:'#a855f7'},{l:'CC',fn:()=>openPanel('sales'),c:'#c9a84c'}].map(b => (
                <button key={b.l} onClick={b.fn} style={{ fontSize: 8, letterSpacing: '0.12em', padding: '2px 8px', border: `1px solid ${b.c}25`, background: 'transparent', color: `${b.c}60`, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', borderRadius: 2 }}>
                  {b.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── COMMAND BAR — the single line at the bottom ─ */}
        <div style={{
          flexShrink: 0,
          background: 'rgba(0,1,8,0.88)',
          backdropFilter: 'blur(30px)',
          borderTop: '1px solid rgba(0,212,255,0.08)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
        }}>
          {/* Top accent line — glows with agent color */}
          <div style={{
            height: 1,
            background: `linear-gradient(90deg, transparent, ${agentColor}60, transparent)`,
            animation: 'glow-pulse 3s ease-in-out infinite',
          }} />
          <CommandInterface
            messages={messages}
            onMessage={msg => { setMessages(prev => [...prev, msg]); markActive(); if (msg.card) setInfoCard(msg.card) }}
            onAgentChange={agent => { setActiveAgent(agent); markActive() }}
            onAmplitude={amp => { setAmplitude(amp); if (amp > 0.05) setSpeaking(true); else setSpeaking(false) }}
            onLoadingChange={setLoading}
            onVoicePanel={handleVoicePanel}
            onTaskStart={startTask}
            onTaskComplete={completeTask}
            onTaskError={errorTask}
          />
        </div>

      </div>
    </>
  )
}
