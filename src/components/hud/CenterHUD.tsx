'use client'
/**
 * CenterHUD v3 — One unified canvas
 * Jarvis LARGE at dead center, decorative HUD rings, key stats on the arcs
 * Data floats in space — no rectangular boxes
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import AgentPanel from './AgentPanel'
import type { Message, AgentName } from '@/lib/types'

const JarvisOrb = dynamic(() => import('@/components/orb/JarvisOrb'), { ssr: false })

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff', nova: '#a855f7', sage: '#00ff88', vault: '#c9a84c',
  echo: '#ff6b35', scout: '#ff4455', reel: '#ff69b4', atlas: '#e879f9',
}

// Floating stat label — no box, just number + label in space
function FloatStat({ label, value, sub, color = '#00d4ff', align = 'left', size = 'md' }: {
  label: string; value: string; sub?: string; color?: string; align?: 'left' | 'right' | 'center'; size?: 'sm' | 'md' | 'lg'
}) {
  const fontSize = size === 'lg' ? 28 : size === 'md' ? 20 : 15
  return (
    <div style={{ textAlign: align, lineHeight: 1 }}>
      <div style={{ fontSize: 8, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize, fontWeight: 700, fontFamily: 'monospace', color, textShadow: `0 0 20px ${color}60`, letterSpacing: '0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3, letterSpacing: '0.08em' }}>{sub}</div>}
    </div>
  )
}

// Ticker strip
function Ticker({ items }: { items: string[] }) {
  if (!items.length) return null
  const doubled = [...items, ...items]
  return (
    <div style={{ overflow: 'hidden', width: '100%' }}>
      <div style={{ display: 'inline-block', whiteSpace: 'nowrap', animation: 'tickerScroll 50s linear infinite', fontSize: 10, color: 'rgba(0,212,255,0.35)', letterSpacing: '0.08em', fontFamily: 'monospace' }}>
        {doubled.map((item, i) => (
          <span key={i} style={{ marginRight: 48 }}>
            <span style={{ color: 'rgba(0,212,255,0.18)', marginRight: 10 }}>◆</span>{item}
          </span>
        ))}
      </div>
    </div>
  )
}

// Feed row — compact, no borders
function FeedRow({ type, text, value, color, fresh }: {
  type: string; text: string; value?: string; color?: string; fresh: boolean
}) {
  const ICONS: Record<string, string> = { news: '◈', sale: '◆', market: '▲', trade: '◉', agent: '◎', alert: '⚡', forge: '⚙' }
  const LABELS: Record<string, string> = { news: 'NEWS', sale: 'SOLD', market: 'MKT', trade: 'TRADE', agent: 'AGENT', alert: 'ALERT', forge: 'FORGE' }
  const c = color ?? '#cce8ff'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 16px',
      background: fresh ? `${c}05` : 'transparent',
      transition: 'background 1.5s ease',
      animation: fresh ? 'feedSlide 0.2s ease' : 'none',
      borderBottom: '1px solid rgba(255,255,255,0.02)',
    }}>
      <span style={{ fontSize: 9, color: c, flexShrink: 0 }}>{ICONS[type] ?? '◈'}</span>
      <span style={{ fontSize: 8, fontWeight: 700, color: `${c}70`, width: 34, flexShrink: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{LABELS[type] ?? 'LOG'}</span>
      <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{text}</span>
      {value && <span style={{ fontSize: 12, fontWeight: 700, color: c, fontFamily: 'monospace', flexShrink: 0 }}>{value}</span>}
    </div>
  )
}

// ── Decorative HUD arc with stat labels ──────────────────────────────────────
function HUDArc({ cx, cy, radius, color, stats }: {
  cx: number; cy: number; radius: number; color: string
  stats: Array<{ angle: number; label: string; value: string; sub?: string }>
}) {
  // Render using absolute positioning + calculated positions
  return (
    <>
      {stats.map((s, i) => {
        const rad = (s.angle * Math.PI) / 180
        const dist = radius + 32
        const x = cx + Math.cos(rad) * dist
        const y = cy + Math.sin(rad) * dist
        const isRight = Math.cos(rad) > 0.1
        const isLeft = Math.cos(rad) < -0.1
        return (
          <div key={i} style={{
            position: 'absolute',
            left: x, top: y,
            transform: `translate(${isRight ? '4px' : isLeft ? 'calc(-100% - 4px)' : '-50%'}, -50%)`,
            lineHeight: 1, textAlign: isRight ? 'left' : isLeft ? 'right' : 'center',
          }}>
            <div style={{ fontSize: 7, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color, textShadow: `0 0 12px ${color}50` }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{s.sub}</div>}
          </div>
        )
      })}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface FeedItem { id: string; type: string; text: string; value?: string; color?: string; ts: number }

export default function CenterHUD({ messages, activeAgent, amplitude }: {
  messages: Message[]; activeAgent: AgentName; amplitude: number
}) {
  const [portfolio, setPortfolio] = useState<{ equity: number; dayPL: number; dayPLPct: number } | null>(null)
  const [nova, setNova] = useState<{ mrr: number; activeUsers: number } | null>(null)
  const [vault, setVault] = useState<{ weeklyRevenue: number; totalSales: number } | null>(null)
  const [life, setLife] = useState<{ raceName: string; raceDate: string; todayPlan: { type: string } } | null>(null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  const [ticker, setTicker] = useState<string[]>(['JARVIS OS ● ALL SYSTEMS ONLINE', 'TRADEPILOT ● ACTIVE', 'CARD CHIEFZ ● LIVE', 'RESUMECHIEFZ ● MONITORING', 'FORGE ● READY'])
  const [orbSize, setOrbSize] = useState(340)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 })

  const agentColor = AGENT_COLORS[activeAgent] ?? '#00d4ff'
  const isActive = messages.some(m => m.role === 'user')

  useEffect(() => {
    const calc = () => {
      const w = containerRef.current?.clientWidth ?? 800
      const h = containerRef.current?.clientHeight ?? 600
      setContainerSize({ w, h })
      setOrbSize(Math.min(360, Math.max(220, Math.floor(Math.min(w * 0.36, h * 0.5)))))
    }
    calc()
    const ro = new ResizeObserver(calc)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const addFeed = useCallback((item: Omit<FeedItem, 'id' | 'ts'>) => {
    const full: FeedItem = { ...item, id: `${Date.now()}-${Math.random()}`, ts: Date.now() }
    setFeed(prev => [full, ...prev].slice(0, 80))
    setFreshIds(prev => { const n = new Set(prev); n.add(full.id); return n })
    setTimeout(() => setFreshIds(prev => { const n = new Set(prev); n.delete(full.id); return n }), 2000)
  }, [])

  useEffect(() => {
    if (!messages.length) return
    const last = messages[messages.length - 1]
    if (last.role === 'assistant') {
      const preview = last.content.replace(/\*+/g, '').split('\n')[0].slice(0, 100)
      addFeed({ type: 'agent', text: preview, color: AGENT_COLORS[last.agent] })
    }
  }, [messages, addFeed])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [p, n, v, l] = await Promise.allSettled([
          fetch('/api/portfolio').then(r => r.json()),
          fetch('/api/nova').then(r => r.json()),
          fetch('/api/vault').then(r => r.json()),
          fetch('/api/life').then(r => r.json()),
        ])
        if (!alive) return
        if (p.status === 'fulfilled' && p.value?.equity) setPortfolio(p.value)
        if (n.status === 'fulfilled' && n.value?.mrr !== undefined) setNova(n.value)
        if (v.status === 'fulfilled' && v.value?.weeklyRevenue !== undefined) {
          setVault(v.value)
          const sales: Array<{ item: string; price: number }> = v.value.recentSales ?? []
          sales.slice(0, 2).forEach(s => addFeed({ type: 'sale', text: s.item, value: `$${s.price.toFixed(2)}`, color: '#c9a84c' }))
        }
        if (l.status === 'fulfilled') setLife(l.value)
      } catch { /* silent */ }

      try {
        const news = await fetch('/api/news').then(r => r.json())
        if (!alive) return
        const headlines: string[] = news.headlines ?? []
        headlines.slice(0, 4).forEach((h: string) => addFeed({ type: 'news', text: h.slice(0, 90) }))
        setTicker(prev => [...headlines.slice(0, 5).map(h => h.slice(0, 55)), ...prev.slice(0, 3)])
      } catch { /* silent */ }

      try {
        const stocks = await fetch('/api/stocks').then(r => r.json())
        if (!alive || !Array.isArray(stocks)) return
        const t = stocks.slice(0, 6).map((s: { symbol: string; price: number; changePercent: number }) =>
          `${s.symbol}  $${s.price.toFixed(2)}  ${s.changePercent >= 0 ? '▲' : '▼'}${Math.abs(s.changePercent).toFixed(2)}%`
        )
        setTicker(prev => [...t, ...prev.slice(0, 3)])
        stocks.slice(0, 3).forEach((s: { symbol: string; price: number; changePercent: number; change: number }) => {
          if (Math.abs(s.changePercent) > 1) {
            addFeed({ type: 'market', text: `${s.symbol} ${s.changePercent >= 0 ? '▲' : '▼'} ${Math.abs(s.changePercent).toFixed(2)}%`, value: `$${s.price.toFixed(2)}`, color: s.change >= 0 ? '#00ff88' : '#ff4455' })
          }
        })
      } catch { /* silent */ }
    }

    load()
    const t = setInterval(load, 3 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [addFeed])

  const daysUntil = (d: string) => {
    const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
    return diff <= 0 ? 'TODAY' : diff === 1 ? '1 DAY' : `${diff}D`
  }

  // Center of the orb area within the container
  const centerX = containerSize.w / 2
  const centerY = containerSize.h * 0.44  // slightly above true center
  const arcRadius = orbSize / 2 + 16       // tight to the orb

  return (
    <div ref={containerRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: 'radial-gradient(ellipse at 50% 40%, rgba(0,20,40,0.6) 0%, #010409 70%)' }}>
      <style>{`
        @keyframes tickerScroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes feedSlide { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
        @keyframes breatheGlow { 0%,100%{opacity:0.15} 50%{opacity:0.35} }
        @keyframes rotateSlow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* HUD grid — very subtle */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, backgroundImage: `linear-gradient(rgba(0,212,255,0.018) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.018) 1px,transparent 1px)`, backgroundSize: '48px 48px' }} />

      {/* Scrolling ticker */}
      <div style={{ flexShrink: 0, padding: '5px 20px', borderBottom: '1px solid rgba(0,212,255,0.07)', zIndex: 2, background: 'rgba(0,0,0,0.5)' }}>
        <Ticker items={ticker} />
      </div>

      {/* ── Main canvas — Jarvis + floating stats ── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden', zIndex: 1 }}>

        {/* Jarvis — absolute center of canvas */}
        <div style={{
          position: 'absolute',
          left: centerX, top: centerY,
          transform: 'translate(-50%, -50%)',
          zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <JarvisOrb active={isActive} agentColor={agentColor} amplitude={amplitude} size={orbSize} />
          <div style={{ marginTop: 10, fontSize: 'clamp(10px,1vw,14px)', fontWeight: 700, letterSpacing: '0.55em', color: agentColor, textShadow: `0 0 24px ${agentColor}`, textTransform: 'uppercase' }}>
            {activeAgent}
          </div>
          <div style={{ marginTop: 4, fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: amplitude > 0.05 ? '#a855f7' : isActive ? agentColor : 'rgba(0,212,255,0.25)', display: 'inline-block', boxShadow: isActive ? `0 0 6px ${agentColor}` : 'none', animation: 'voice-dot-pulse 1.8s infinite' }} />
            {amplitude > 0.05 ? 'SPEAKING' : isActive ? 'PROCESSING' : 'STANDBY'}
          </div>
        </div>

        {/* ── Floating stats positioned around Jarvis ── */}
        {/* TOP — center above orb */}
        <div style={{ position: 'absolute', left: centerX, top: centerY - arcRadius - orbSize * 0.5 - 50, transform: 'translateX(-50%)', textAlign: 'center', zIndex: 4 }}>
          <div style={{ fontSize: 8, letterSpacing: '0.25em', color: 'rgba(0,212,255,0.3)', textTransform: 'uppercase', marginBottom: 2 }}>JARVIS OS — AB COMMAND CENTER</div>
        </div>

        {/* LEFT — TradePilot */}
        <div style={{ position: 'absolute', left: centerX - arcRadius - orbSize * 0.5 - 20, top: centerY - 60, transform: 'translateY(-50%)', textAlign: 'right', zIndex: 4 }}>
          <div style={{ fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,212,255,0.3)', textTransform: 'uppercase', marginBottom: 6 }}>TRADEPILOT</div>
          {portfolio ? (
            <>
              <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'monospace', color: '#00ff88', textShadow: '0 0 20px rgba(0,255,136,0.5)', lineHeight: 1 }}>
                ${portfolio.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: 13, fontFamily: 'monospace', color: portfolio.dayPL >= 0 ? '#00ff88' : '#ff4455', marginTop: 4 }}>
                {portfolio.dayPL >= 0 ? '+' : ''}{portfolio.dayPL.toFixed(2)} ({portfolio.dayPLPct.toFixed(2)}%)
              </div>
            </>
          ) : (
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'monospace', color: 'rgba(0,212,255,0.3)' }}>—</div>
          )}
        </div>

        {/* RIGHT — ResumeChiefz */}
        <div style={{ position: 'absolute', left: centerX + arcRadius + orbSize * 0.5 + 20, top: centerY - 60, transform: 'translateY(-50%)', textAlign: 'left', zIndex: 4 }}>
          <div style={{ fontSize: 8, letterSpacing: '0.2em', color: 'rgba(168,85,247,0.4)', textTransform: 'uppercase', marginBottom: 6 }}>RESUMECHIEFZ</div>
          {nova ? (
            <>
              <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'monospace', color: '#a855f7', textShadow: '0 0 20px rgba(168,85,247,0.5)', lineHeight: 1 }}>
                ${nova.mrr.toFixed(0)} <span style={{ fontSize: 13, opacity: 0.6 }}>MRR</span>
              </div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                {nova.activeUsers} USERS
              </div>
              {/* MRR progress */}
              <div style={{ width: 120, height: 2, background: 'rgba(168,85,247,0.15)', borderRadius: 1, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, #a855f780, #a855f7)', width: `${Math.min(100, (nova.mrr / 10000) * 100)}%`, borderRadius: 1, boxShadow: '0 0 6px rgba(168,85,247,0.6)', transition: 'width 1s ease' }} />
              </div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', marginTop: 2, letterSpacing: '0.1em' }}>
                ${nova.mrr.toFixed(0)} / $10,000 GOAL
              </div>
            </>
          ) : (
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'monospace', color: 'rgba(168,85,247,0.3)' }}>—</div>
          )}
        </div>

        {/* BOTTOM-LEFT — Card Chiefz */}
        <div style={{ position: 'absolute', left: centerX - arcRadius - orbSize * 0.45, top: centerY + arcRadius + orbSize * 0.2, textAlign: 'right', zIndex: 4 }}>
          <div style={{ fontSize: 8, letterSpacing: '0.2em', color: 'rgba(201,168,76,0.5)', textTransform: 'uppercase', marginBottom: 5 }}>CARD CHIEFZ</div>
          {vault ? (
            <>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace', color: '#c9a84c', textShadow: '0 0 16px rgba(201,168,76,0.5)', lineHeight: 1 }}>
                ${vault.weeklyRevenue.toFixed(2)} <span style={{ fontSize: 11, opacity: 0.6 }}>WK</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3, fontFamily: 'monospace' }}>{vault.totalSales}+ TOTAL SALES</div>
            </>
          ) : (
            <div style={{ fontSize: 20, color: 'rgba(201,168,76,0.3)', fontFamily: 'monospace' }}>—</div>
          )}
        </div>

        {/* BOTTOM-RIGHT — Training */}
        <div style={{ position: 'absolute', left: centerX + arcRadius + orbSize * 0.1, top: centerY + arcRadius + orbSize * 0.2, textAlign: 'left', zIndex: 4 }}>
          <div style={{ fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,255,136,0.4)', textTransform: 'uppercase', marginBottom: 5 }}>TRAINING</div>
          {life ? (
            <>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace', color: '#00d4ff', textShadow: '0 0 16px rgba(0,212,255,0.5)', lineHeight: 1 }}>
                {daysUntil(life.raceDate)} <span style={{ fontSize: 11, opacity: 0.5 }}>TO RACE</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{life.todayPlan?.type ?? 'REST'}</div>
            </>
          ) : (
            <div style={{ fontSize: 20, color: 'rgba(0,212,255,0.3)', fontFamily: 'monospace' }}>—</div>
          )}
        </div>

        {/* Decorative connector lines from stats to orb area */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }} overflow="visible">
          {/* Left connector */}
          {portfolio && (
            <line
              x1={centerX - arcRadius - orbSize * 0.5 + 10} y1={centerY - 20}
              x2={centerX - orbSize * 0.58} y2={centerY - 20}
              stroke="rgba(0,255,136,0.12)" strokeWidth="1" strokeDasharray="4,6"
            />
          )}
          {/* Right connector */}
          {nova && (
            <line
              x1={centerX + orbSize * 0.58} y1={centerY - 20}
              x2={centerX + arcRadius + orbSize * 0.5 - 10} y2={centerY - 20}
              stroke="rgba(168,85,247,0.12)" strokeWidth="1" strokeDasharray="4,6"
            />
          )}
        </svg>

        {/* Agent panel */}
        <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}>
          <AgentPanel messages={messages} />
        </div>
      </div>

      {/* ── Live feed — compact bottom strip ── */}
      <div style={{ flexShrink: 0, maxHeight: '26%', borderTop: '1px solid rgba(0,212,255,0.07)', background: 'rgba(0,0,0,0.65)', overflowY: 'auto', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 16px', borderBottom: '1px solid rgba(0,212,255,0.04)', position: 'sticky', top: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88', animation: 'voice-dot-pulse 2s infinite', flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(0,212,255,0.4)', textTransform: 'uppercase' }}>LIVE INTELLIGENCE</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(0,212,255,0.1), transparent)' }} />
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.12)', fontFamily: 'monospace' }}>{feed.length} EVENTS</span>
        </div>
        {feed.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.08)', letterSpacing: '0.15em' }}>INITIALIZING INTELLIGENCE FEED...</div>
        ) : feed.map(item => (
          <FeedRow key={item.id} type={item.type} text={item.text} value={item.value} color={item.color} fresh={freshIds.has(item.id)} />
        ))}
      </div>
    </div>
  )
}
