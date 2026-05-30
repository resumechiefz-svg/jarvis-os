'use client'

import { useEffect, useState } from 'react'
import type { StockQuote, NovaStats, VaultStats, SageBrief } from '@/lib/types'

function Cell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-white/5 px-2 py-1.5 bg-white/[0.01]">
      <div className="text-[8px] text-white/30 tracking-wider uppercase mb-0.5">{label}</div>
      <div className="text-[13px] font-mono font-bold leading-none" style={{ color: color ?? '#cce8ff' }}>{value}</div>
      {sub && <div className="text-[8px] text-white/20 mt-0.5">{sub}</div>}
    </div>
  )
}

function SectionHead({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="col-span-2 flex items-center justify-between text-[8px] tracking-[0.2em] uppercase font-bold border-b border-cyan-900/30 pb-0.5 mb-1 mt-1.5">
      <span className="text-cyan-500/50">{title}</span>
      {badge && <span className="text-[7px] text-green-500/50 font-normal">{badge}</span>}
    </div>
  )
}

export default function LeftPanel() {
  const [stocks, setStocks] = useState<StockQuote[]>([])
  const [nova, setNova] = useState<NovaStats | null>(null)
  const [vault, setVault] = useState<VaultStats | null>(null)
  const [sage, setSage] = useState<SageBrief | null>(null)

  useEffect(() => {
    const loadFast = () => {
      fetch('/api/stocks').then(r => r.json()).then(d => Array.isArray(d) ? setStocks(d) : null).catch(() => {})
    }
    const loadSlow = () => {
      fetch('/api/nova').then(r => r.json()).then(d => d?.mrr !== undefined ? setNova(d) : null).catch(() => {})
      fetch('/api/vault').then(r => r.json()).then(d => d?.weeklyRevenue !== undefined ? setVault(d) : null).catch(() => {})
      fetch('/api/sage').then(r => r.json()).then(d => d?.greeting ? setSage(d) : null).catch(() => {})
    }
    loadFast(); loadSlow()
    const fast = setInterval(loadFast, 60000)
    const slow = setInterval(loadSlow, 15 * 60 * 1000)
    return () => { clearInterval(fast); clearInterval(slow) }
  }, [])

  const up = '#00ff88', dn = '#ff4455', nu = '#cce8ff', gold = '#c9a84c'
  const chg = (v: number) => v >= 0 ? up : dn

  return (
    <div className="left-panel h-full overflow-hidden px-2 py-2">
      <div className="grid grid-cols-2 gap-1 h-full content-start">

        {/* Markets */}
        <SectionHead title="Markets" badge="ALPACA LIVE" />
        {stocks.slice(0, 4).map(s => (
          <Cell
            key={s.symbol}
            label={s.symbol}
            value={`$${s.price.toFixed(2)}`}
            sub={`${s.change >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`}
            color={chg(s.change)}
          />
        ))}

        {/* ResumeChiefz */}
        <SectionHead title="ResumeChiefz" badge="STRIPE LIVE" />
        <Cell label="MRR" value={nova ? `$${nova.mrr.toFixed(0)}` : '—'} color={nova?.mrr ? up : nu} />
        <Cell label="Users" value={nova ? String(nova.activeUsers) : '—'} />
        <Cell label="New Subs" value={nova ? String(nova.newSubs) : '—'} sub="30 days" color={nova?.newSubs ? up : nu} />
        <Cell label="Churn" value={nova ? String(nova.churn) : '—'} sub="30 days" color={nova?.churn ? dn : nu} />
        <Cell label="Resumes" value={nova ? String(nova.resumesGenerated) : '—'} sub="30 days" />
        <Cell label="Conversion" value={nova && nova.activeUsers > 0 ? `${((nova.newSubs / Math.max(nova.activeUsers, 1)) * 100).toFixed(1)}%` : '—'} />

        {/* Card Chiefz */}
        <SectionHead title="Card Chiefz" badge="EBAY" />
        <Cell label="Wkly Rev" value={vault ? `$${vault.weeklyRevenue.toFixed(0)}` : '—'} color={vault?.weeklyRevenue ? gold : nu} />
        <Cell label="Mo Sales" value={vault ? String(vault.monthlySales) : '—'} />
        <Cell label="Feedback" value={vault ? `${vault.feedbackScore}%` : '—'} color={up} />
        <Cell label="All Sales" value={vault ? `${vault.totalSales}+` : '—'} />

        {/* Beckett */}
        <SectionHead title="Beckett" />
        <Cell
          label="This Week"
          value={sage ? (sage.beckettWeek ? '✓ YES' : '— NO') : '—'}
          color={sage?.beckettWeek ? up : nu}
        />
        <Cell label="Next Switch" value={sage?.nextCustodyDate ?? '—'} />
        <Cell label="Life Mode" value={sage?.lifeMode?.toUpperCase() ?? '—'} color={sage?.beckettWeek ? up : gold} />
        {sage?.bills?.[0] && (
          <Cell
            label={`Bill: ${sage.bills[0].name}`}
            value={`$${sage.bills[0].amount}`}
            sub={sage.bills[0].dueDate}
            color={sage.bills[0].overdue ? dn : nu}
          />
        )}

      </div>
    </div>
  )
}
