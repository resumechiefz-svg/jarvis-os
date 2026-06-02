'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import MobileChat from '@/components/mobile/MobileChat'
import AgentBar from '@/components/hud/AgentBar'
import LeftPanel from '@/components/hud/LeftPanel'
import RightPanel from '@/components/hud/RightPanel'
import VoiceInterrupt from '@/components/hud/VoiceInterrupt'
import AgentPanel from '@/components/hud/AgentPanel'
import FloatingPanel from '@/components/hud/FloatingPanel'
import type { Message, AgentName } from '@/lib/types'
import type { PanelData } from '@/components/hud/FloatingPanel'

const CommandInterface = dynamic(() => import('@/components/hud/CommandInterface'), { ssr: false })
const JarvisOrb = dynamic(() => import('@/components/orb/JarvisOrb'), { ssr: false })

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
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [feedOpen, setFeedOpen] = useState(false)
  const [mrr, setMrr] = useState(0)
  const [orbSize, setOrbSize] = useState(380)
  const [ticker, setTicker] = useState(['JARVIS OS ● ONLINE', 'TRADEPILOT ● ACTIVE', 'CARD CHIEFZ ● LIVE', 'RESUMECHIEFZ ● MONITORING'])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  const [panels, setPanels] = useState<PanelData[]>([])
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

    // Auto-open panel if content suggests data
    const lower = last.content.toLowerCase()
    if ((lower.includes('equity') || lower.includes('portfolio') || lower.includes('tradepilot')) && portfolio) {
      setTimeout(() => openPanel('portfolio'), 400)
    } else if ((lower.includes('mrr') || lower.includes('resumechiefz') || lower.includes('subscribers')) && nova) {
      setTimeout(() => openPanel('rc'), 400)
    } else if ((lower.includes('card chiefz') || lower.includes('ebay') || lower.includes('sales')) && vault) {
      setTimeout(() => openPanel('sales'), 400)
    }
  }, [messages, addFeed, openPanel, portfolio, nova, vault])

  const agentColor = AGENT_COLORS[activeAgent] ?? '#00d4ff'
  const isActive = messages.some(m => m.role === 'user')

  if (isMobile) return <MobileChat />

  const PANEL_W = 300

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; background: #010409; font-family: 'Courier New', monospace; color: white; }
        ::-webkit-scrollbar { width: 2px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.12); }
        @keyframes voice-dot-pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes tickerScroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes feedSlide { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        @keyframes panelIn { from{opacity:0;transform:scale(0.9) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes pulseRing { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(2.5);opacity:0} }
      `}</style>

      <VoiceInterrupt onMessage={msg => setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', agent: 'jarvis', content: msg, timestamp: new Date() }])} />

      {/* Root — full viewport */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 35%, rgba(0,30,55,0.5) 0%, #010409 65%)' }}>

        {/* ── Top bar: agent strip + ticker ── */}
        <div style={{ flexShrink: 0, height: 'clamp(30px,3.2vh,40px)', display: 'flex', borderBottom: '1px solid rgba(0,212,255,0.08)', background: 'rgba(0,0,0,0.7)' }}>
          <AgentBar activeAgent={activeAgent} />
        </div>

        {/* ── Main content row ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

          {/* Left slide panel */}
          <div style={{
            width: leftOpen ? PANEL_W : 38, flexShrink: 0,
            borderRight: '1px solid rgba(0,212,255,0.08)',
            background: 'rgba(0,4,14,0.95)',
            transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1)',
            overflow: 'hidden', position: 'relative', zIndex: 10,
          }}>
            {/* Toggle strip */}
            <div
              onClick={() => setLeftOpen(o => !o)}
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 38, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: 'pointer', zIndex: 11, background: leftOpen ? 'transparent' : 'rgba(0,4,14,0.95)' }}
            >
              {['◈', '◉', '▲', '◆'].map((icon, i) => (
                <div key={i} style={{ fontSize: 11, color: 'rgba(0,212,255,0.25)', transition: 'color 0.2s' }}>{icon}</div>
              ))}
              <div style={{ fontSize: 8, color: 'rgba(0,212,255,0.2)', letterSpacing: '0.1em', marginTop: 4, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                {leftOpen ? 'CLOSE' : 'DATA'}
              </div>
            </div>
            {/* Panel content */}
            <div style={{ marginRight: 38, height: '100%', overflowY: 'auto', opacity: leftOpen ? 1 : 0, transition: 'opacity 0.2s' }}>
              <LeftPanel />
            </div>
          </div>

          {/* ── CENTER: Full Jarvis stage ── */}
          <div ref={centerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

            {/* HUD grid background */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,212,255,0.016) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.016) 1px,transparent 1px)', backgroundSize: '52px 52px' }} />

            {/* Ticker strip */}
            <div style={{ flexShrink: 0, padding: '4px 16px', borderBottom: '1px solid rgba(0,212,255,0.05)', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.4)', zIndex: 2 }}>
              <div style={{ fontSize: 8, color: 'rgba(0,212,255,0.25)', letterSpacing: '0.2em', flexShrink: 0 }}>LIVE</div>
              <Ticker items={ticker} />
              {/* Panel shortcuts */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {[
                  { label: 'TRADE', fn: () => openPanel('portfolio'), color: '#00d4ff' },
                  { label: 'RC', fn: () => openPanel('rc'), color: '#a855f7' },
                  { label: 'CC', fn: () => openPanel('sales'), color: '#c9a84c' },
                ].map(btn => (
                  <button key={btn.label} onClick={btn.fn} style={{ fontSize: 8, letterSpacing: '0.1em', padding: '1px 7px', border: `1px solid ${btn.color}30`, background: 'transparent', color: `${btn.color}70`, cursor: 'pointer', borderRadius: 2, fontFamily: 'inherit', transition: 'all 0.2s' }}>
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Jarvis stage — fills all remaining height ── */}
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>

              {/* Deep radial glow behind orb */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: orbSize * 2.4, height: orbSize * 2.4,
                borderRadius: '50%',
                background: `radial-gradient(ellipse, ${agentColor}06 0%, transparent 65%)`,
                pointerEvents: 'none', zIndex: 0,
                transition: 'background 0.5s',
              }} />

              {/* The orb — true center */}
              <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <JarvisOrb active={isActive} agentColor={agentColor} amplitude={amplitude} size={orbSize} />

                {/* Agent name */}
                <div style={{ marginTop: 12, fontSize: 'clamp(12px,1.1vw,17px)', fontWeight: 700, letterSpacing: '0.6em', textTransform: 'uppercase', color: agentColor, textShadow: `0 0 30px ${agentColor}` }}>
                  {activeAgent}
                </div>

                {/* Status */}
                <div style={{ marginTop: 6, fontSize: 9, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: amplitude > 0.05 ? '#a855f7' : isActive ? agentColor : 'rgba(0,212,255,0.2)', display: 'inline-block', boxShadow: isActive ? `0 0 8px ${agentColor}` : 'none', animation: 'voice-dot-pulse 1.8s infinite' }} />
                  {amplitude > 0.05 ? 'SPEAKING' : isActive ? 'PROCESSING' : 'STANDBY'}
                </div>
              </div>

              {/* Floating panels — appear over orb area */}
              {panels.map((panel, i) => (
                <FloatingPanel key={panel.id} panel={panel} onDismiss={dismissPanel} index={i} />
              ))}

              {/* Agent side panel */}
              <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 15 }}>
                <AgentPanel messages={messages} />
              </div>
            </div>

            {/* ── Live feed strip — collapsible ── */}
            <div style={{ flexShrink: 0, borderTop: '1px solid rgba(0,212,255,0.06)', background: 'rgba(0,0,0,0.7)', zIndex: 2, transition: 'max-height 0.3s ease', maxHeight: feedOpen ? '28%' : '28px', overflow: 'hidden' }}>
              <div
                onClick={() => setFeedOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 5px #00ff88', animation: 'voice-dot-pulse 2s infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(0,212,255,0.4)' }}>LIVE INTELLIGENCE</span>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(0,212,255,0.08), transparent)' }} />
                <span style={{ fontSize: 9, color: 'rgba(0,212,255,0.25)', transition: 'transform 0.3s', transform: feedOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 'calc(28vh - 28px)' }}>
              {feed.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.08)', letterSpacing: '0.15em' }}>AWAITING INTELLIGENCE FEED...</div>
              ) : feed.map(item => {
                const cfg = TYPE_CFG[item.type] ?? TYPE_CFG.news
                const color = item.color ?? cfg.color
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.02)',
                    background: freshIds.has(item.id) ? `${color}04` : 'transparent',
                    animation: freshIds.has(item.id) ? 'feedSlide 0.2s ease' : 'none',
                    transition: 'background 1.5s ease',
                  }}>
                    <span style={{ fontSize: 8, color, flexShrink: 0 }}>{cfg.icon}</span>
                    <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.text}</span>
                    {item.value && <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'monospace', flexShrink: 0 }}>{item.value}</span>}
                    <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace', flexShrink: 0 }}>{new Date(item.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                )
              })}
              </div>
            </div>
          </div>

          {/* Right slide panel */}
          <div style={{
            width: rightOpen ? PANEL_W : 38, flexShrink: 0,
            borderLeft: '1px solid rgba(0,212,255,0.08)',
            background: 'rgba(0,4,14,0.95)',
            transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1)',
            overflow: 'hidden', position: 'relative', zIndex: 10,
          }}>
            <div
              onClick={() => setRightOpen(o => !o)}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 38, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: 'pointer', zIndex: 11 }}
            >
              {['◈', '◆', '▲', '□'].map((icon, i) => (
                <div key={i} style={{ fontSize: 11, color: 'rgba(0,212,255,0.25)' }}>{icon}</div>
              ))}
              <div style={{ fontSize: 8, color: 'rgba(0,212,255,0.2)', letterSpacing: '0.1em', marginTop: 4, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                {rightOpen ? 'CLOSE' : 'INTEL'}
              </div>
            </div>
            <div style={{ marginLeft: 38, height: '100%', overflowY: 'auto', opacity: rightOpen ? 1 : 0, transition: 'opacity 0.2s' }}>
              <RightPanel activeAgent={activeAgent} mrr={mrr} />
            </div>
          </div>
        </div>

        {/* ── Command bar ── */}
        <div style={{ flexShrink: 0, borderTop: '1px solid rgba(0,212,255,0.15)', background: 'rgba(0,1,5,0.99)' }}>
          <CommandInterface
            messages={messages}
            onMessage={msg => setMessages(prev => [...prev, msg])}
            onAgentChange={setActiveAgent}
            onAmplitude={setAmplitude}
          />
        </div>

      </div>
    </>
  )
}
