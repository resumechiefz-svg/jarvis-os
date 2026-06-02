'use client'
/**
 * CenterHUD — the heart of the screen
 * Jarvis triangle sits at absolute center (50/50)
 * Four data quads float around him: Portfolio | RC | Card Chiefz | Goals
 * Live feed scrolls below
 * HUD grid lines, scanline effects, animated borders
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import AgentPanel from './AgentPanel'
import type { Message, AgentName } from '@/lib/types'

const JarvisOrb = dynamic(() => import('@/components/orb/JarvisOrb'), { ssr: false })

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff', nova: '#a855f7', sage: '#00ff88', vault: '#c9a84c',
  echo: '#ff6b35', scout: '#ff4455', reel: '#ff69b4', lister: '#fbbf24',
  dex: '#60a5fa', beacon: '#34d399', ledger: '#f87171', atlas: '#e879f9',
}

// ── Reusable HUD data card ─────────────────────────────────────
function HUDCard({
  title, badge, color = '#00d4ff', children, position,
}: {
  title: string
  badge?: string
  color?: string
  children: React.ReactNode
  position: 'tl' | 'tr' | 'bl' | 'br'
}) {
  const corners: Record<string, React.CSSProperties> = {
    tl: { top: 0, left: 0 },
    tr: { top: 0, right: 0 },
    bl: { bottom: 0, left: 0 },
    br: { bottom: 0, right: 0 },
  }

  return (
    <div style={{
      position: 'absolute',
      ...corners[position],
      width: 'clamp(180px, 18vw, 260px)',
      background: 'rgba(0,4,14,0.88)',
      border: `1px solid ${color}22`,
      backdropFilter: 'blur(4px)',
      padding: '10px 12px',
    }}>
      {/* Corner accent */}
      <div style={{
        position: 'absolute',
        ...(position.includes('t') ? { top: -1 } : { bottom: -1 }),
        ...(position.includes('l') ? { left: -1 } : { right: -1 }),
        width: 12, height: 12,
        borderTop: position.includes('t') ? `2px solid ${color}` : 'none',
        borderBottom: position.includes('b') ? `2px solid ${color}` : 'none',
        borderLeft: position.includes('l') ? `2px solid ${color}` : 'none',
        borderRight: position.includes('r') ? `2px solid ${color}` : 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${color}15` }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', color: `${color}90`, textTransform: 'uppercase' }}>
          {title}
        </span>
        {badge && (
          <span style={{ fontSize: 7, color: '#00ff88', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 4px #00ff88', display: 'inline-block', animation: 'voice-dot-pulse 2s infinite' }} />
            {badge}
          </span>
        )}
      </div>

      {children}
    </div>
  )
}

function DataRow({ label, value, sub, color = '#cce8ff', bar, barMax }: {
  label: string; value: string; sub?: string; color?: string; bar?: number; barMax?: number
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color, letterSpacing: '0.02em', textShadow: `0 0 8px ${color}50` }}>{value}</span>
      </div>
      {sub && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 1 }}>{sub}</div>}
      {bar !== undefined && barMax !== undefined && (
        <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, marginTop: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 1,
            width: `${Math.min(100, (bar / barMax) * 100)}%`,
            background: `linear-gradient(90deg, ${color}60, ${color})`,
            transition: 'width 1s ease',
            boxShadow: `0 0 4px ${color}80`,
          }} />
        </div>
      )}
    </div>
  )
}

// ── Scrolling ticker strip ─────────────────────────────────────
function TickerStrip({ items }: { items: string[] }) {
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>
      <div
        ref={ref}
        style={{
          display: 'inline-block',
          animation: 'tickerScroll 40s linear infinite',
          fontSize: 10, color: 'rgba(0,212,255,0.4)', letterSpacing: '0.08em', fontFamily: 'monospace',
        }}
      >
        {items.concat(items).map((item, i) => (
          <span key={i} style={{ marginRight: 40 }}>
            <span style={{ color: 'rgba(0,212,255,0.25)', marginRight: 8 }}>◆</span>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Live feed row ──────────────────────────────────────────────
interface FeedItem {
  id: string; type: string; text: string; value?: string; color?: string; ts: number
}
const TYPE_CFG: Record<string, { icon: string; color: string; label: string }> = {
  news:   { icon: '◈', color: '#cce8ff', label: 'NEWS'   },
  sale:   { icon: '◆', color: '#c9a84c', label: 'SOLD'   },
  market: { icon: '▲', color: '#00ff88', label: 'MKT'    },
  trade:  { icon: '◉', color: '#00d4ff', label: 'TRADE'  },
  agent:  { icon: '◎', color: '#a855f7', label: 'AGENT'  },
  alert:  { icon: '⚡', color: '#ff6b35', label: 'ALERT'  },
  forge:  { icon: '⚙', color: '#e879f9', label: 'FORGE'  },
}

// ── Main component ─────────────────────────────────────────────
export default function CenterHUD({
  messages, activeAgent, amplitude, onAgentChange,
}: {
  messages: Message[]
  activeAgent: AgentName
  amplitude: number
  onAgentChange?: (a: AgentName) => void
}) {
  const [portfolio, setPortfolio] = useState<{equity:number;dayPL:number;dayPLPct:number;positions:{length:number}} | null>(null)
  const [nova, setNova] = useState<{mrr:number;activeUsers:number;newSubs:number} | null>(null)
  const [vault, setVault] = useState<{weeklyRevenue:number;monthlySales:number;totalSales:number} | null>(null)
  const [life, setLife] = useState<{raceName:string;raceDate:string;week:number;todayPlan:{type:string;miles:number}} | null>(null)
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [orbSize, setOrbSize] = useState(260)
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  const [tickerItems, setTickerItems] = useState<string[]>([
    'JARVIS OS ONLINE', 'ALL SYSTEMS NOMINAL', 'TradePilot ACTIVE', 'Card Chiefz LIVE', 'ResumeChiefz MONITORING',
  ])

  const agentColor = AGENT_COLORS[activeAgent] ?? '#00d4ff'
  const isActive = messages.some(m => m.role === 'user')

  useEffect(() => {
    const calc = () => setOrbSize(Math.min(300, Math.max(180, Math.floor(window.innerWidth * 0.17))))
    calc(); window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  const addFeed = useCallback((item: Omit<FeedItem, 'id' | 'ts'>) => {
    const full: FeedItem = { ...item, id: `${Date.now()}-${Math.random()}`, ts: Date.now() }
    setFeedItems(prev => [full, ...prev].slice(0, 120))
    setFreshIds(prev => { const n = new Set(prev); n.add(full.id); return n })
    setTimeout(() => setFreshIds(prev => { const n = new Set(prev); n.delete(full.id); return n }), 2500)
  }, [])

  // Agent messages → feed
  useEffect(() => {
    if (!messages.length) return
    const last = messages[messages.length - 1]
    if (last.role === 'assistant') {
      const preview = last.content.replace(/\*+/g, '').split('\n')[0].slice(0, 100)
      addFeed({ type: 'agent', text: preview, color: AGENT_COLORS[last.agent] ?? '#00d4ff' })
    }
  }, [messages, addFeed])

  // Data polling
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

        if (p.status === 'fulfilled' && p.value?.equity) {
          setPortfolio(p.value)
          if (Math.abs(p.value.dayPLPct) > 0.5) {
            addFeed({ type: 'trade', text: `Portfolio ${p.value.dayPL >= 0 ? '▲' : '▼'} ${Math.abs(p.value.dayPLPct).toFixed(2)}%`, value: `$${p.value.dayPL.toFixed(2)}`, color: p.value.dayPL >= 0 ? '#00ff88' : '#ff4455' })
          }
        }
        if (n.status === 'fulfilled' && n.value?.mrr !== undefined) setNova(n.value)
        if (v.status === 'fulfilled' && v.value?.weeklyRevenue !== undefined) {
          setVault(v.value)
          if (v.value.recentSales?.length) {
            v.value.recentSales.slice(0, 2).forEach((s: {item:string;price:number}) => {
              addFeed({ type: 'sale', text: s.item, value: `$${s.price.toFixed(2)}`, color: '#c9a84c' })
            })
          }
        }
        if (l.status === 'fulfilled') setLife(l.value)
      } catch { /* silent */ }

      // News
      try {
        const news = await fetch('/api/news').then(r => r.json())
        if (!alive) return
        const headlines: string[] = news.headlines ?? []
        headlines.slice(0, 3).forEach((h: string) => addFeed({ type: 'news', text: h.slice(0, 90) }))
        setTickerItems(prev => [...headlines.slice(0, 4).map(h => h.slice(0, 60)), ...prev.slice(0, 4)])
      } catch { /* silent */ }

      // Stocks
      try {
        const stocks = await fetch('/api/stocks').then(r => r.json())
        if (!alive || !Array.isArray(stocks)) return
        const tickerStocks = stocks.slice(0, 6).map((s:{symbol:string;price:number;changePercent:number}) =>
          `${s.symbol} $${s.price.toFixed(2)} ${s.changePercent >= 0 ? '▲' : '▼'}${Math.abs(s.changePercent).toFixed(2)}%`
        )
        setTickerItems(prev => [...tickerStocks, ...prev.slice(0, 4)])
        stocks.slice(0, 4).forEach((s:{symbol:string;price:number;changePercent:number;change:number}) => {
          if (Math.abs(s.changePercent) > 0.8) {
            addFeed({ type: 'market', text: `${s.symbol} ${s.changePercent >= 0 ? '▲' : '▼'} ${Math.abs(s.changePercent).toFixed(2)}%`, value: `$${s.price.toFixed(2)}`, color: s.change >= 0 ? '#00ff88' : '#ff4455' })
          }
        })
      } catch { /* silent */ }
    }

    load()
    const t1 = setInterval(load, 2 * 60 * 1000)
    return () => { alive = false; clearInterval(t1) }
  }, [addFeed])

  const daysUntil = (d: string) => {
    const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
    return diff <= 0 ? 'TODAY' : diff === 1 ? 'TOMORROW' : `${diff}D`
  }

  const up = '#00ff88', dn = '#ff4455', gold = '#c9a84c', cyan = '#00d4ff'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: 'rgba(0,2,10,0.97)' }}>
      <style>{`
        @keyframes tickerScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes feedSlide { from { opacity:0; transform: translateX(-12px); } to { opacity:1; transform: translateX(0); } }
        @keyframes borderPulse { 0%,100%{opacity:0.15} 50%{opacity:0.4} }
      `}</style>

      {/* Subtle HUD grid background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,212,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.025) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }} />

      {/* Scrolling ticker strip */}
      <div style={{ flexShrink: 0, padding: '4px 16px', borderBottom: '1px solid rgba(0,212,255,0.06)', background: 'rgba(0,0,0,0.4)', zIndex: 1 }}>
        <TickerStrip items={tickerItems} />
      </div>

      {/* ── Main content: Jarvis centered with data quads ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, zIndex: 1 }}>

        {/* TOP-LEFT quad: TradePilot */}
        <HUDCard title="TradePilot" badge="ALPACA" color={cyan} position="tl">
          <DataRow label="Equity" value={portfolio ? `$${portfolio.equity.toLocaleString('en-US', {maximumFractionDigits:0})}` : '—'} color={up} />
          <DataRow label="Day P&L" value={portfolio ? `${portfolio.dayPL >= 0 ? '+' : ''}$${portfolio.dayPL.toFixed(2)}` : '—'} sub={portfolio ? `${portfolio.dayPLPct.toFixed(2)}%` : undefined} color={portfolio ? (portfolio.dayPL >= 0 ? up : dn) : undefined} bar={portfolio?.equity} barMax={100000} />
          <DataRow label="Positions" value={portfolio ? String(portfolio.positions.length) : '—'} color={cyan} />
        </HUDCard>

        {/* TOP-RIGHT quad: ResumeChiefz */}
        <HUDCard title="ResumeChiefz" badge="STRIPE" color="#a855f7" position="tr">
          <DataRow label="MRR" value={nova ? `$${nova.mrr.toFixed(0)}` : '—'} color={up} bar={nova?.mrr} barMax={10000} />
          <DataRow label="Users" value={nova ? String(nova.activeUsers) : '—'} color="#a855f7" />
          <DataRow label="New Subs" value={nova ? String(nova.newSubs) : '—'} sub="30 days" color={up} />
        </HUDCard>

        {/* BOTTOM-LEFT quad: Card Chiefz */}
        <HUDCard title="Card Chiefz" badge="EBAY" color={gold} position="bl">
          <DataRow label="Wkly Rev" value={vault ? `$${vault.weeklyRevenue.toFixed(2)}` : '—'} color={gold} />
          <DataRow label="Mo Sales" value={vault ? String(vault.monthlySales) : '—'} color={gold} />
          <DataRow label="All Sales" value={vault ? `${vault.totalSales}+` : '—'} color={up} bar={vault?.totalSales} barMax={2000} />
        </HUDCard>

        {/* BOTTOM-RIGHT quad: Training / Goals */}
        <HUDCard title="Training" badge={life ? `WK ${life.week}` : undefined} color={up} position="br">
          {life ? (
            <>
              <DataRow label="Race" value={daysUntil(life.raceDate)} sub={life.raceName} color={cyan} />
              <DataRow label="Today" value={life.todayPlan?.type ?? '—'} sub={life.todayPlan?.miles ? `${life.todayPlan.miles} mi` : undefined} color={up} />
            </>
          ) : (
            <DataRow label="Race" value="—" />
          )}
        </HUDCard>

        {/* Jarvis — absolute center */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          zIndex: 2,
        }}>
          {/* Subtle label above */}
          <div style={{ fontSize: 9, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.15)', textTransform: 'uppercase', marginBottom: 6, textAlign: 'center' }}>
            JARVIS OS
          </div>

          {/* The orb */}
          <JarvisOrb active={isActive} agentColor={agentColor} amplitude={amplitude} size={orbSize} />

          {/* Agent name */}
          <div style={{
            marginTop: 8, fontSize: 'clamp(11px,1vw,15px)', fontWeight: 700,
            letterSpacing: '0.5em', textTransform: 'uppercase',
            color: agentColor, textShadow: `0 0 20px ${agentColor}80`,
            textAlign: 'center',
          }}>
            {activeAgent}
          </div>

          {/* Status */}
          <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: amplitude > 0.05 ? '#a855f7' : isActive ? cyan : 'rgba(0,212,255,0.3)', boxShadow: isActive ? `0 0 6px ${agentColor}` : 'none', animation: 'voice-dot-pulse 2s infinite', flexShrink: 0, display: 'inline-block' }} />
            {amplitude > 0.05 ? 'SPEAKING' : isActive ? 'PROCESSING' : 'STANDBY'}
          </div>
        </div>

        {/* Agent side panel */}
        <AgentPanel messages={messages} />

        {/* Decorative cross-hair lines through center (subtle) */}
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.04), rgba(0,212,255,0.04), transparent)', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'linear-gradient(180deg, transparent, rgba(0,212,255,0.04), rgba(0,212,255,0.04), transparent)', pointerEvents: 'none', zIndex: 0 }} />
      </div>

      {/* ── Live intelligence feed — compact strip at bottom ── */}
      <div style={{ flexShrink: 0, maxHeight: '28%', borderTop: '1px solid rgba(0,212,255,0.08)', background: 'rgba(0,0,0,0.5)', overflowY: 'auto', zIndex: 1 }}>
        {/* Feed header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderBottom: '1px solid rgba(0,212,255,0.05)', position: 'sticky', top: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88', animation: 'voice-dot-pulse 2s infinite', flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(0,212,255,0.5)', textTransform: 'uppercase' }}>LIVE INTELLIGENCE</span>
          <span style={{ marginLeft: 'auto', fontSize: 8, color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace' }}>{feedItems.length} events</span>
        </div>

        {feedItems.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.1)', letterSpacing: '0.15em' }}>INITIALIZING FEED...</div>
        ) : feedItems.map(item => {
          const cfg = TYPE_CFG[item.type] ?? TYPE_CFG.news
          const color = item.color ?? cfg.color
          const time = new Date(item.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.025)',
              background: freshIds.has(item.id) ? `${color}06` : 'transparent',
              transition: 'background 1.5s ease',
              animation: freshIds.has(item.id) ? 'feedSlide 0.25s ease' : 'none',
            }}>
              <span style={{ fontSize: 9, color, flexShrink: 0 }}>{cfg.icon}</span>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.15em', color: `${color}80`, flexShrink: 0, textTransform: 'uppercase', width: 36 }}>{cfg.label}</span>
              <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.65)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.text}</span>
              {item.value && <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'monospace', flexShrink: 0 }}>{item.value}</span>}
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.18)', fontFamily: 'monospace', flexShrink: 0 }}>{time}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
