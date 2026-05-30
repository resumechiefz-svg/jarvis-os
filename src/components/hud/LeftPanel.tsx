'use client'

import { useEffect, useState } from 'react'
import type { StockQuote, NovaStats, VaultStats, SageBrief } from '@/lib/types'
import type { PhantomStats } from '@/lib/agents/phantom'

function DataRow({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-baseline py-[3px] border-b border-white/5">
      <span className="text-[10px] text-cyan-400/60 tracking-wider uppercase">{label}</span>
      <div className="text-right">
        <span className="text-[12px] font-mono" style={{ color: valueColor ?? '#cce8ff' }}>{value}</span>
        {sub && <span className="text-[9px] text-cyan-500/60 ml-1">{sub}</span>}
      </div>
    </div>
  )
}

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[9px] tracking-widest text-cyan-500/50 mb-1 uppercase font-bold border-b border-cyan-900/40 pb-1 flex items-center justify-between">
        <span>{title}</span>
        {badge && <span className="text-[8px] text-green-500/60 font-normal">{badge}</span>}
      </div>
      {children}
    </div>
  )
}

export default function LeftPanel() {
  const [stocks, setStocks] = useState<StockQuote[]>([])
  const [nova, setNova] = useState<NovaStats | null>(null)
  const [vault, setVault] = useState<VaultStats | null>(null)
  const [sage, setSage] = useState<SageBrief | null>(null)
  const [phantom, setPhantom] = useState<PhantomStats | null>(null)

  useEffect(() => {
    const load = () => {
      fetch('/api/stocks').then(r => r.json()).then(d => Array.isArray(d) ? setStocks(d) : null).catch(() => {})
      fetch('/api/nova').then(r => r.json()).then(d => d?.mrr !== undefined ? setNova(d) : null).catch(() => {})
      fetch('/api/vault').then(r => r.json()).then(d => d?.weeklyRevenue !== undefined ? setVault(d) : null).catch(() => {})
      fetch('/api/sage').then(r => r.json()).then(d => d?.greeting ? setSage(d) : null).catch(() => {})
      fetch('/api/kalshi').then(r => r.json()).then(d => d?.lastUpdated ? setPhantom(d) : null).catch(() => {})
    }
    load()
    // Stocks + Kalshi refresh every 60s, business data every 15 min
    const fastInterval = setInterval(() => {
      fetch('/api/stocks').then(r => r.json()).then(d => Array.isArray(d) ? setStocks(d) : null).catch(() => {})
      fetch('/api/kalshi').then(r => r.json()).then(d => d?.lastUpdated ? setPhantom(d) : null).catch(() => {})
    }, 60 * 1000)
    const slowInterval = setInterval(() => {
      fetch('/api/nova').then(r => r.json()).then(d => d?.mrr !== undefined ? setNova(d) : null).catch(() => {})
      fetch('/api/vault').then(r => r.json()).then(d => d?.weeklyRevenue !== undefined ? setVault(d) : null).catch(() => {})
      fetch('/api/sage').then(r => r.json()).then(d => d?.greeting ? setSage(d) : null).catch(() => {})
    }, 15 * 60 * 1000)
    return () => { clearInterval(fastInterval); clearInterval(slowInterval) }
  }, [])

  const pnlColor = (v: number) => v > 0 ? '#00ff88' : v < 0 ? '#ff4455' : '#cce8ff'
  const changeColor = (v: number) => v >= 0 ? '#00ff88' : '#ff4455'

  return (
    <div className="left-panel h-full overflow-y-auto px-3 py-3 text-xs">

      {/* Markets — Alpaca live */}
      <Section title="Markets" badge="ALPACA LIVE">
        {stocks.length === 0 ? (
          <div className="text-cyan-600/50 text-[10px]">Connecting to Alpaca...</div>
        ) : (
          stocks.map(s => (
            <DataRow
              key={s.symbol}
              label={s.symbol}
              value={`$${s.price.toFixed(2)}`}
              sub={`${s.change >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`}
              valueColor={changeColor(s.change)}
            />
          ))
        )}
      </Section>

      {/* ResumeChiefz — Stripe + Supabase */}
      <Section title="ResumeChiefz" badge="STRIPE LIVE">
        <DataRow label="MRR" value={nova ? `$${nova.mrr.toFixed(0)}` : '—'} valueColor={nova?.mrr ? '#00ff88' : undefined} />
        <DataRow label="New Subs" value={nova ? String(nova.newSubs) : '—'} sub="30d" />
        <DataRow label="Churn" value={nova ? String(nova.churn) : '—'} sub="30d" valueColor={nova?.churn ? '#ff4455' : undefined} />
        <DataRow label="Users" value={nova ? String(nova.activeUsers) : '—'} />
        <DataRow label="Resumes" value={nova ? String(nova.resumesGenerated) : '—'} sub="30d" />
      </Section>

      {/* Card Chiefz — eBay */}
      <Section title="Card Chiefz" badge="EBAY LIVE">
        <DataRow label="Wkly Rev" value={vault ? `$${vault.weeklyRevenue.toFixed(0)}` : '—'} valueColor={vault?.weeklyRevenue ? '#c9a84c' : undefined} />
        <DataRow label="Mo Sales" value={vault ? String(vault.monthlySales) : '—'} />
        <DataRow label="Feedback" value={vault ? `${vault.feedbackScore}%` : '—'} valueColor="#00ff88" />
        <DataRow label="Total" value={vault ? `${vault.totalSales}+` : '—'} />
      </Section>

      {/* Phantom — Kalshi trading */}
      <Section title="Phantom" badge={phantom?.mode === 'live' ? '● LIVE' : '● PAPER'}>
        {phantom ? (
          <>
            <DataRow label="Balance" value={`$${phantom.balance.toFixed(2)}`} />
            <DataRow
              label="P&L"
              value={`${phantom.totalPnl >= 0 ? '+' : ''}$${phantom.totalPnl.toFixed(2)}`}
              valueColor={pnlColor(phantom.totalPnl)}
            />
            <DataRow label="Win Rate" value={`${phantom.winRate}%`} valueColor={phantom.winRate >= 60 ? '#00ff88' : '#c9a84c'} />
            <DataRow label="W/L" value={`${phantom.wins} / ${phantom.losses}`} />
            <DataRow label="Orders" value={String(phantom.totalOrders)} />
            <DataRow label="Open Pos" value={String(phantom.openPositions.length)} />
          </>
        ) : (
          <div className="text-cyan-600/50 text-[10px]">Connecting to Kalshi...</div>
        )}
      </Section>

      {/* Beckett */}
      <Section title="Beckett">
        {sage ? (
          <>
            <DataRow label="This Week" value={sage.beckettWeek ? '✓ YES' : '— NO'} valueColor={sage.beckettWeek ? '#00ff88' : '#ffffff50'} />
            <DataRow label="Next Switch" value={sage.nextCustodyDate} />
            <DataRow label="Mode" value={sage.lifeMode.toUpperCase()} valueColor={sage.beckettWeek ? '#00ff88' : '#c9a84c'} />
          </>
        ) : (
          <div className="text-cyan-600/50 text-[10px]">Loading...</div>
        )}
      </Section>

      {/* Upcoming Bills */}
      {sage?.bills && sage.bills.length > 0 && (
        <Section title="Bills Due">
          {sage.bills.slice(0, 3).map((b, i) => (
            <DataRow key={i} label={b.name} value={`$${b.amount}`} sub={b.dueDate} valueColor={b.overdue ? '#ff4455' : undefined} />
          ))}
        </Section>
      )}
    </div>
  )
}
