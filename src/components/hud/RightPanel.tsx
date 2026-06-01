'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { VaultStats, SageBrief } from '@/lib/types'
import type { PhantomStats } from '@/lib/agents/phantom'
const FinancialIndependenceDashboard = dynamic(() => import('./FinancialIndependenceDashboard'), { ssr: false })

function Cell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-white/5 px-2 py-1 bg-white/[0.01] overflow-hidden">
      <div className="text-[11px] text-white/30 tracking-wider uppercase mb-0.5 truncate">{label}</div>
      <div className="text-[15px] font-mono font-bold leading-none truncate" style={{ color: color ?? '#cce8ff' }}>{value}</div>
      {sub && <div className="text-[11px] text-white/20 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

function SectionHead({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="col-span-2 flex items-center justify-between text-[11px] tracking-[0.2em] uppercase font-bold border-b border-cyan-900/30 pb-0.5 mb-1 mt-1 overflow-hidden">
      <span className="text-cyan-500/50 truncate">{title}</span>
      {badge && <span className="text-[10px] font-normal shrink-0 ml-1" style={{ color: badge.includes('LIVE') ? '#00ff88' : '#c9a84c' }}>{badge}</span>}
    </div>
  )
}

interface Props {
  activeAgent: string
  mrr?: number
}

export default function RightPanel({ activeAgent, mrr = 0 }: Props) {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')
  const [vault, setVault] = useState<VaultStats | null>(null)
  const [sage, setSage] = useState<SageBrief | null>(null)
  const [phantom, setPhantom] = useState<PhantomStats | null>(null)

  useEffect(() => {
    function tick() {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', { hour12: false }))
      setDate(now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const load = () => {
      fetch('/api/vault').then(r => r.json()).then(d => d?.weeklyRevenue !== undefined ? setVault(d) : null).catch(() => {})
      fetch('/api/sage').then(r => r.json()).then(d => d?.greeting ? setSage(d) : null).catch(() => {})
      fetch('/api/kalshi').then(r => r.json()).then(d => d?.lastUpdated ? setPhantom(d) : null).catch(() => {})
    }
    load()
    const t = setInterval(load, 30000) // 30s — catch sales faster
    return () => clearInterval(t)
  }, [])

  const up = '#00ff88', dn = '#ff4455', gold = '#c9a84c', nu = '#cce8ff'
  const pnlColor = (v: number) => v > 0 ? up : v < 0 ? dn : nu

  return (
    <div className="right-panel h-full overflow-y-auto overflow-x-hidden px-2 py-2">
      <div className="grid grid-cols-2 gap-1 h-full content-start">

        {/* Clock row */}
        <div className="col-span-2 flex items-baseline justify-between mb-1">
          <div className="text-[20px] font-mono text-cyan-300 leading-none tracking-wider">{time || '——:——:——'}</div>
          <div className="text-[9px] text-cyan-500/50 tracking-widest uppercase">{date}</div>
        </div>

        {/* Card Chiefz */}
        <SectionHead title="Card Chiefz" badge="EBAY LIVE" />
        <Cell label="Wkly Rev" value={vault ? `$${vault.weeklyRevenue.toFixed(2)}` : '—'} color={vault?.weeklyRevenue ? gold : nu} />
        <Cell label="Mo Sales" value={vault ? String(vault.monthlySales) : '—'} />
        <Cell label="Feedback" value={vault ? `${vault.feedbackScore}%` : '—'} color={up} />
        <Cell label="All Sales" value={vault ? `${vault.totalSales}+` : '—'} />

        {/* Recent sales feed */}
        {vault?.recentSales && vault.recentSales.length > 0 && (
          <div className="col-span-2 border border-white/5 bg-white/[0.01] px-2 py-1 mb-1">
            <div className="text-[9px] text-cyan-500/40 tracking-widest uppercase mb-1">Recent Sales</div>
            {vault.recentSales.slice(0, 4).map((s, i) => (
              <div key={i} className="flex justify-between items-baseline gap-1 py-0.5 border-b border-white/[0.03] last:border-0">
                <span className="text-[10px] text-white/50 truncate flex-1">{s.item}</span>
                <span className="text-[11px] font-mono shrink-0" style={{ color: gold }}>${s.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Kalshi Phantom */}
        <SectionHead title="Phantom" badge={phantom?.mode === 'live' ? '● LIVE' : '● PAPER'} />
        {phantom ? (
          <>
            <Cell label="Balance" value={`$${phantom.balance.toFixed(2)}`} />
            <Cell label="P&L" value={`${phantom.totalPnl >= 0 ? '+' : ''}$${phantom.totalPnl.toFixed(2)}`} color={pnlColor(phantom.totalPnl)} />
            <Cell label="Win Rate" value={`${phantom.winRate}%`} color={phantom.winRate >= 60 ? up : gold} />
            <Cell label="W / L" value={`${phantom.wins} / ${phantom.losses}`} />
          </>
        ) : (
          <><Cell label="P&L" value="—" /><Cell label="Win Rate" value="—" /></>
        )}

        {/* RC Revenue quick */}
        <SectionHead title="RC Revenue" badge="STRIPE" />
        <Cell label="MRR" value={`$${mrr.toFixed(0)}`} color={mrr > 0 ? up : nu} />
        <Cell label="ARR" value={`$${(mrr * 12).toFixed(0)}`} />
        <div className="col-span-2 mt-0.5 mb-1">
          <div className="flex justify-between text-[10px] text-white/20 mb-0.5 overflow-hidden"><span className="truncate">MRR Goal</span><span className="shrink-0 ml-1">${mrr.toFixed(0)} / $10k</span></div>
          <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (mrr / 10000) * 100)}%`, background: 'linear-gradient(90deg, #a855f7, #00d4ff)' }} />
          </div>
        </div>

        {/* Beckett */}
        <SectionHead title="Beckett" />
        <Cell label="This Week" value={sage ? (sage.beckettWeek ? '✓ YES' : '— NO') : '—'} color={sage?.beckettWeek ? up : nu} />
        <Cell label="Next Switch" value={sage?.nextCustodyDate ?? '—'} />

        {/* Active Agent */}
        <SectionHead title="Active" />
        <div className="col-span-2 text-center py-1 overflow-hidden">
          <div className="text-[15px] font-bold tracking-[0.3em] truncate" style={{ color: '#00d4ff', textShadow: '0 0 16px #00d4ff50' }}>
            {activeAgent.toUpperCase()}
          </div>
        </div>

        {/* Financial Independence Dashboard — fills empty space */}
        <div className="col-span-2 mt-1">
          <FinancialIndependenceDashboard />
        </div>

      </div>
    </div>
  )
}
