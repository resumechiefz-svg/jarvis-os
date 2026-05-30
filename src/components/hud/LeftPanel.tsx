'use client'

import { useEffect, useState } from 'react'
import type { StockQuote, NovaStats } from '@/lib/types'
import type { PortfolioSummary } from '@/lib/agents/tradepilot'

function Cell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-white/5 px-2 py-1 bg-white/[0.01]">
      <div className="text-[8px] text-white/30 tracking-wider uppercase mb-0.5">{label}</div>
      <div className="text-[12px] font-mono font-bold leading-none" style={{ color: color ?? '#cce8ff' }}>{value}</div>
      {sub && <div className="text-[8px] text-white/20 mt-0.5">{sub}</div>}
    </div>
  )
}

function SectionHead({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="col-span-2 flex items-center justify-between text-[8px] tracking-[0.2em] uppercase font-bold border-b border-cyan-900/30 pb-0.5 mb-1 mt-1">
      <span className="text-cyan-500/50">{title}</span>
      {badge && <span className="text-[7px] text-green-500/50 font-normal">{badge}</span>}
    </div>
  )
}

export default function LeftPanel() {
  const [stocks, setStocks] = useState<StockQuote[]>([])
  const [nova, setNova] = useState<NovaStats | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)

  useEffect(() => {
    const loadFast = () => {
      fetch('/api/stocks').then(r => r.json()).then(d => Array.isArray(d) ? setStocks(d) : null).catch(() => {})
      fetch('/api/portfolio').then(r => r.json()).then(d => d?.equity !== undefined ? setPortfolio(d) : null).catch(() => {})
    }
    const loadSlow = () => {
      fetch('/api/nova').then(r => r.json()).then(d => d?.mrr !== undefined ? setNova(d) : null).catch(() => {})
    }
    loadFast(); loadSlow()
    const fast = setInterval(loadFast, 60000)
    const slow = setInterval(loadSlow, 15 * 60 * 1000)
    return () => { clearInterval(fast); clearInterval(slow) }
  }, [])

  const up = '#00ff88', dn = '#ff4455', nu = '#cce8ff'
  const chg = (v: number) => v >= 0 ? up : dn

  return (
    <div className="left-panel h-full overflow-hidden px-2 py-2">
      <div className="grid grid-cols-2 gap-1 h-full content-start">

        {/* TradePilot */}
        <SectionHead title="TradePilot" badge={portfolio ? (portfolio.isLive ? '● LIVE' : '● PAPER') : 'ALPACA'} />
        {portfolio ? (
          <>
            <Cell label="Equity" value={`$${portfolio.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} color={up} />
            <Cell label="Day P&L" value={`${portfolio.dayPL >= 0 ? '+' : ''}$${portfolio.dayPL.toFixed(2)}`} sub={`${portfolio.dayPLPct >= 0 ? '+' : ''}${portfolio.dayPLPct.toFixed(2)}%`} color={portfolio.dayPL >= 0 ? up : dn} />
            <Cell label="Cash" value={`$${portfolio.cash.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
            <Cell label="Positions" value={String(portfolio.positions.length)} sub={`${portfolio.openOrders} orders`} />
          </>
        ) : (
          <><Cell label="Equity" value="—" /><Cell label="Day P&L" value="—" /></>
        )}

        {/* Markets */}
        <SectionHead title="Markets" badge="LIVE" />
        {stocks.slice(0, 6).map(s => (
          <Cell key={s.symbol} label={s.symbol} value={`$${s.price.toFixed(2)}`}
            sub={`${s.change >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`} color={chg(s.change)} />
        ))}

        {/* ResumeChiefz */}
        <SectionHead title="ResumeChiefz" badge="STRIPE" />
        <Cell label="MRR" value={nova ? `$${nova.mrr.toFixed(0)}` : '—'} color={nova?.mrr ? up : nu} />
        <Cell label="Users" value={nova ? String(nova.activeUsers) : '—'} />
        <Cell label="New Subs" value={nova ? String(nova.newSubs) : '—'} sub="30d" color={nova?.newSubs ? up : nu} />
        <Cell label="Churn" value={nova ? String(nova.churn) : '—'} sub="30d" color={nova?.churn ? dn : nu} />
        <Cell label="Resumes" value={nova ? String(nova.resumesGenerated) : '—'} sub="30d" />
        <Cell label="Conversion" value={nova && nova.activeUsers > 0 ? `${((nova.newSubs / Math.max(nova.activeUsers, 1)) * 100).toFixed(1)}%` : '—'} />

      </div>
    </div>
  )
}
