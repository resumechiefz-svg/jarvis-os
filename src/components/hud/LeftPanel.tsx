'use client'

import { useEffect, useState } from 'react'
import type { StockQuote, NovaStats, VaultStats, SageBrief } from '@/lib/types'

function DataRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex justify-between items-baseline py-[3px] border-b border-white/5">
      <span className="text-[10px] text-cyan-400/60 tracking-wider uppercase">{label}</span>
      <div className="text-right">
        <span className="text-[12px] font-mono text-cyan-200">{value}</span>
        {sub && <span className="text-[9px] text-cyan-500/60 ml-1">{sub}</span>}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[9px] tracking-widest text-cyan-500/50 mb-1 uppercase font-bold border-b border-cyan-900/40 pb-1">{title}</div>
      {children}
    </div>
  )
}

export default function LeftPanel() {
  const [stocks, setStocks] = useState<StockQuote[]>([])
  const [nova, setNova] = useState<NovaStats | null>(null)
  const [vault, setVault] = useState<VaultStats | null>(null)
  const [sage, setSage] = useState<SageBrief | null>(null)

  useEffect(() => {
    const load = () => {
      fetch('/api/stocks').then(r => r.json()).then(d => Array.isArray(d) ? setStocks(d) : null).catch(() => {})
      fetch('/api/nova').then(r => r.json()).then(d => d?.mrr !== undefined ? setNova(d) : null).catch(() => {})
      fetch('/api/vault').then(r => r.json()).then(d => d?.weeklyRevenue !== undefined ? setVault(d) : null).catch(() => {})
      fetch('/api/sage').then(r => r.json()).then(d => d?.greeting ? setSage(d) : null).catch(() => {})
    }
    load()
    const interval = setInterval(load, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="left-panel h-full overflow-y-auto px-3 py-3 text-xs">
      <Section title="Markets">
        {stocks.length === 0 ? (
          <div className="text-cyan-600/50 text-[10px]">Loading...</div>
        ) : (
          stocks.map(s => (
            <DataRow
              key={s.symbol}
              label={s.symbol}
              value={`$${s.price.toFixed(2)}`}
              sub={`${s.change >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`}
            />
          ))
        )}
      </Section>

      <Section title="ResumeChiefz">
        <DataRow label="MRR" value={nova ? `$${nova.mrr.toFixed(0)}` : '—'} />
        <DataRow label="New Subs" value={nova ? String(nova.newSubs) : '—'} sub="30d" />
        <DataRow label="Churn" value={nova ? String(nova.churn) : '—'} sub="30d" />
        <DataRow label="Users" value={nova ? String(nova.activeUsers) : '—'} />
        <DataRow label="Resumes" value={nova ? String(nova.resumesGenerated) : '—'} sub="30d" />
      </Section>

      <Section title="Card Chiefz">
        <DataRow label="Wkly Rev" value={vault ? `$${vault.weeklyRevenue.toFixed(0)}` : '—'} />
        <DataRow label="Mo Sales" value={vault ? String(vault.monthlySales) : '—'} />
        <DataRow label="Feedback" value={vault ? `${vault.feedbackScore}%` : '—'} />
        <DataRow label="Total Sales" value={vault ? String(vault.totalSales) : '—'} />
      </Section>

      <Section title="Beckett">
        {sage ? (
          <>
            <DataRow label="This Week" value={sage.beckettWeek ? '✓ YES' : '— NO'} />
            <DataRow label="Next Switch" value={sage.nextCustodyDate} />
            <DataRow label="Mode" value={sage.lifeMode.toUpperCase()} />
          </>
        ) : (
          <div className="text-cyan-600/50 text-[10px]">Loading...</div>
        )}
      </Section>

      {sage?.bills && sage.bills.length > 0 && (
        <Section title="Upcoming Bills">
          {sage.bills.slice(0, 3).map((b, i) => (
            <DataRow key={i} label={b.name} value={`$${b.amount}`} sub={b.dueDate} />
          ))}
        </Section>
      )}
    </div>
  )
}
