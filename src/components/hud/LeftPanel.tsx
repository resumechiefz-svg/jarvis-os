'use client'
import { useEffect, useState } from 'react'
import type { StockQuote, NovaStats } from '@/lib/types'
import type { PortfolioSummary } from '@/lib/agents/tradepilot'
import LifeSection from './LifeSection'
import PlaidSection from './PlaidSection'

const up = '#00ff88', dn = '#ff4455', dim = 'rgba(255,255,255,0.55)'

function Row({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', gap: 6 }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
      <div style={{ textAlign: 'right', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: color ?? dim, whiteSpace: 'nowrap' }}>{value}</div>
        {sub && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>{sub}</div>}
      </div>
    </div>
  )
}

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,212,255,0.1)', paddingBottom: 3, marginBottom: 5 }}>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(0,212,255,0.45)', textTransform: 'uppercase' }}>{title}</span>
        {badge && <span style={{ fontSize: 7, color: '#00ff88', letterSpacing: '0.1em' }}>{badge}</span>}
      </div>
      {children}
    </div>
  )
}

export default function LeftPanel() {
  const [stocks, setStocks] = useState<StockQuote[]>([])
  const [nova, setNova] = useState<NovaStats | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)

  useEffect(() => {
    const fast = () => {
      fetch('/api/stocks').then(r => r.json()).then(d => Array.isArray(d) ? setStocks(d) : null).catch(() => {})
      fetch('/api/portfolio').then(r => r.json()).then(d => d?.equity !== undefined ? setPortfolio(d) : null).catch(() => {})
    }
    const slow = () => {
      fetch('/api/nova').then(r => r.json()).then(d => d?.mrr !== undefined ? setNova(d) : null).catch(() => {})
    }
    fast(); slow()
    const t1 = setInterval(fast, 60000)
    const t2 = setInterval(slow, 15 * 60 * 1000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [])

  const chg = (v: number) => v >= 0 ? up : dn

  return (
    <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', padding: '10px 12px' }}>

      <Section title="TradePilot" badge={portfolio ? (portfolio.isLive ? '● LIVE' : '● PAPER') : 'ALPACA'}>
        <Row label="Equity" value={portfolio ? `$${portfolio.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'} color={up} />
        <Row label="Day P&L" value={portfolio ? `${portfolio.dayPL >= 0 ? '+' : ''}$${portfolio.dayPL.toFixed(2)}` : '—'} sub={portfolio ? `${portfolio.dayPLPct >= 0 ? '+' : ''}${portfolio.dayPLPct.toFixed(2)}%` : undefined} color={portfolio ? chg(portfolio.dayPL) : undefined} />
        <Row label="Cash" value={portfolio ? `$${portfolio.cash.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'} />
        <Row label="Positions" value={portfolio ? String(portfolio.positions.length) : '—'} sub={portfolio ? `${portfolio.openOrders} orders` : undefined} />
      </Section>

      <Section title="Markets" badge="LIVE">
        {stocks.length === 0 ? (
          <Row label="Loading..." value="—" />
        ) : stocks.slice(0, 8).map(s => (
          <Row key={s.symbol} label={s.symbol} value={`$${s.price.toFixed(2)}`} sub={`${s.change >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`} color={chg(s.change)} />
        ))}
      </Section>

      <Section title="ResumeChiefz" badge="STRIPE">
        <Row label="MRR" value={nova ? `$${nova.mrr.toFixed(0)}` : '—'} color={nova?.mrr ? up : dim} />
        <Row label="Users" value={nova ? String(nova.activeUsers) : '—'} />
        <Row label="New Subs" value={nova ? String(nova.newSubs) : '—'} sub="30d" color={nova?.newSubs ? up : dim} />
        <Row label="Churn" value={nova ? String(nova.churn) : '—'} sub="30d" color={nova?.churn ? dn : dim} />
        <Row label="Resumes" value={nova ? String(nova.resumesGenerated) : '—'} sub="30d" />
      </Section>

      <PlaidSection />
      <LifeSection />
    </div>
  )
}
