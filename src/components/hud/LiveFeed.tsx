'use client'
/**
 * LiveFeed — center panel vertical intelligence stream
 * Real-time vertical scroll of everything happening:
 * news, eBay sales, RC signups, agent decisions, market moves, trading activity
 */
import { useEffect, useRef, useState, useCallback } from 'react'

interface FeedItem {
  id: string
  type: 'news' | 'sale' | 'rc' | 'trade' | 'agent' | 'market' | 'alert' | 'forge'
  text: string
  sub?: string
  value?: string
  color?: string
  ts: number
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  news:    { icon: '📡', color: '#cce8ff',  label: 'NEWS'    },
  sale:    { icon: '🃏', color: '#c9a84c',  label: 'SOLD'    },
  rc:      { icon: '💼', color: '#a855f7',  label: 'RC'      },
  trade:   { icon: '📈', color: '#00ff88',  label: 'TRADE'   },
  agent:   { icon: '🤖', color: '#00d4ff',  label: 'AGENT'   },
  market:  { icon: '📊', color: '#00d4ff',  label: 'MARKET'  },
  alert:   { icon: '⚡', color: '#ff6b35',  label: 'ALERT'   },
  forge:   { icon: '🛠️', color: '#e879f9',  label: 'FORGE'   },
}

function FeedRow({ item, fresh }: { item: FeedItem; fresh: boolean }) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.news
  const time = new Date(item.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '7px 14px',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
      background: fresh ? `${cfg.color}08` : 'transparent',
      transition: 'background 1s ease',
      animation: fresh ? 'feedIn 0.3s ease' : 'none',
    }}>
      <span style={{ fontSize: 11, flexShrink: 0, marginTop: 1 }}>{cfg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 1 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: cfg.color, opacity: 0.7, flexShrink: 0 }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.3, fontFamily: 'inherit' }}>
            {item.text}
          </span>
        </div>
        {item.sub && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.3 }}>{item.sub}</div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        {item.value && (
          <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color, fontFamily: 'monospace' }}>{item.value}</span>
        )}
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>{time}</span>
      </div>
    </div>
  )
}

export default function LiveFeed({ messages }: { messages?: Array<{ role: string; agent: string; content: string; timestamp: Date }> }) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  const addItem = useCallback((item: Omit<FeedItem, 'id' | 'ts'>) => {
    const full: FeedItem = { ...item, id: `${Date.now()}-${Math.random()}`, ts: Date.now() }
    setItems(prev => [full, ...prev].slice(0, 200))
    setFreshIds(prev => { const n = new Set(prev); n.add(full.id); return n })
    setTimeout(() => setFreshIds(prev => { const n = new Set(prev); n.delete(full.id); return n }), 3000)
  }, [])

  // Feed from agent messages (Jarvis responses appear in the feed)
  useEffect(() => {
    if (!messages?.length) return
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant') {
      const preview = last.content.replace(/\*+/g, '').split('\n')[0].slice(0, 120)
      addItem({ type: 'agent', text: preview, sub: `${last.agent.toUpperCase()} response` })
    }
  }, [messages, addItem])

  // Poll live data sources
  useEffect(() => {
    let alive = true

    const pollNews = async () => {
      try {
        const r = await fetch('/api/news')
        const d = await r.json()
        if (!alive) return
        const headlines: string[] = d.headlines ?? d ?? []
        headlines.slice(0, 3).forEach((h: string) => {
          addItem({ type: 'news', text: h.slice(0, 100) })
        })
      } catch { /* silent */ }
    }

    const pollStocks = async () => {
      try {
        const r = await fetch('/api/stocks')
        const stocks = await r.json()
        if (!alive || !Array.isArray(stocks)) return
        stocks.slice(0, 4).forEach((s: { symbol: string; price: number; changePercent: number; change: number }) => {
          if (Math.abs(s.changePercent) > 0.5) {
            addItem({
              type: 'market',
              text: `${s.symbol} ${s.changePercent >= 0 ? '▲' : '▼'} ${Math.abs(s.changePercent).toFixed(2)}%`,
              value: `$${s.price.toFixed(2)}`,
              color: s.change >= 0 ? '#00ff88' : '#ff4455',
            })
          }
        })
      } catch { /* silent */ }
    }

    const pollVault = async () => {
      try {
        const r = await fetch('/api/vault')
        const d = await r.json()
        if (!alive) return
        const sales: Array<{ item: string; price: number; date: string }> = d.recentSales ?? []
        sales.slice(0, 2).forEach(s => {
          addItem({
            type: 'sale',
            text: s.item,
            value: `$${s.price.toFixed(2)}`,
            sub: `Card Chiefz • ${s.date}`,
          })
        })
      } catch { /* silent */ }
    }

    const pollPortfolio = async () => {
      try {
        const r = await fetch('/api/portfolio')
        const d = await r.json()
        if (!alive || !d?.positions) return
        if (Math.abs(d.dayPLPct) > 0.3) {
          addItem({
            type: 'trade',
            text: `TradePilot ${d.dayPL >= 0 ? 'up' : 'down'} ${Math.abs(d.dayPLPct).toFixed(2)}% today`,
            value: `${d.dayPL >= 0 ? '+' : ''}$${d.dayPL.toFixed(2)}`,
            sub: `${d.positions.length} positions • Equity $${d.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
            color: d.dayPL >= 0 ? '#00ff88' : '#ff4455',
          })
        }
      } catch { /* silent */ }
    }

    const pollForge = async () => {
      try {
        const r = await fetch('/api/forge')
        const d = await r.json()
        if (!alive) return
        const recent: Array<{ title: string; status: string }> = d.recent ?? []
        recent.slice(0, 1).forEach(f => {
          if (f.status === 'live') {
            addItem({ type: 'forge', text: f.title, sub: 'FORGE deployed successfully' })
          }
        })
      } catch { /* silent */ }
    }

    // Initial loads staggered
    setTimeout(pollNews, 500)
    setTimeout(pollStocks, 1000)
    setTimeout(pollVault, 1500)
    setTimeout(pollPortfolio, 2000)
    setTimeout(pollForge, 2500)

    // Recurring polls
    const intervals = [
      setInterval(pollNews, 8 * 60 * 1000),
      setInterval(pollStocks, 60 * 1000),
      setInterval(pollVault, 5 * 60 * 1000),
      setInterval(pollPortfolio, 2 * 60 * 1000),
      setInterval(pollForge, 10 * 60 * 1000),
    ]

    return () => { alive = false; intervals.forEach(clearInterval) }
  }, [addItem])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes feedIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', borderBottom: '1px solid rgba(0,212,255,0.1)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88', animation: 'voice-dot-pulse 2s infinite' }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(0,212,255,0.6)', textTransform: 'uppercase' }}>
            Live Intelligence
          </span>
        </div>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
          {items.length} events
        </span>
      </div>

      {/* Feed — newest at top */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
        onScroll={e => {
          const el = e.currentTarget
          autoScrollRef.current = el.scrollTop < 30
        }}
      >
        {items.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.15)', fontSize: 11, letterSpacing: '0.1em' }}>
            INITIALIZING LIVE FEED...
          </div>
        )}
        {items.map(item => (
          <FeedRow key={item.id} item={item} fresh={freshIds.has(item.id)} />
        ))}
      </div>
    </div>
  )
}
