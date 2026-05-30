'use client'

import { useState, useEffect } from 'react'
import type { PhantomStats } from '@/lib/agents/phantom'

function DataRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-baseline py-[2px] border-b border-white/4">
      <span className="text-[9px] text-white/40 tracking-wider uppercase">{label}</span>
      <span className="text-[11px] font-mono" style={{ color: valueColor ?? '#cce8ff' }}>{value}</span>
    </div>
  )
}

function SectionHead({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between text-[8px] tracking-widest uppercase font-bold border-b border-cyan-900/30 pb-0.5 mb-1">
      <span className="text-cyan-500/50">{title}</span>
      {badge && <span className="text-[7px] font-normal" style={{ color: badge.includes('LIVE') ? '#00ff88' : '#c9a84c' }}>{badge}</span>}
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
    const load = () => fetch('/api/kalshi').then(r => r.json()).then(d => d?.lastUpdated ? setPhantom(d) : null).catch(() => {})
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  const pnlColor = (v: number) => v > 0 ? '#00ff88' : v < 0 ? '#ff4455' : '#cce8ff'
  const winColor = (v: number) => v >= 65 ? '#00ff88' : v >= 50 ? '#c9a84c' : '#ff4455'

  return (
    <div className="right-panel h-full overflow-y-auto px-3 py-2">
      {/* Clock */}
      <div className="text-right mb-3">
        <div className="text-[24px] font-mono text-cyan-300 leading-none tracking-wider">{time || '——:——:——'}</div>
        <div className="text-[9px] text-cyan-500/50 tracking-widest uppercase mt-0.5">{date}</div>
      </div>

      {/* Kalshi Phantom */}
      <div className="mb-3">
        <SectionHead title="Phantom" badge={phantom?.mode === 'live' ? '● LIVE' : '● PAPER'} />
        {phantom ? (
          <>
            <DataRow label="Balance" value={`$${phantom.balance.toFixed(2)}`} />
            <DataRow
              label="Total P&L"
              value={`${phantom.totalPnl >= 0 ? '+' : ''}$${phantom.totalPnl.toFixed(2)}`}
              valueColor={pnlColor(phantom.totalPnl)}
            />
            <DataRow label="Win Rate" value={`${phantom.winRate}%`} valueColor={winColor(phantom.winRate)} />
            <DataRow label="W / L" value={`${phantom.wins} / ${phantom.losses}`} />
            <DataRow label="Total Orders" value={String(phantom.totalOrders)} />
            <DataRow label="Invested" value={`$${phantom.invested.toFixed(2)}`} />
            <DataRow label="Open Pos." value={String(phantom.openPositions.length)} />
            {/* Open positions detail */}
            {phantom.openPositions.slice(0, 3).map((p, i) => (
              <div key={i} className="flex items-center gap-1 py-[2px] border-b border-white/4">
                <span className="text-[7px] font-mono text-white/30 truncate flex-1">{p.ticker.split('-').slice(0, 2).join('-')}</span>
                <span className="text-[8px] font-bold shrink-0" style={{ color: p.side === 'yes' ? '#00ff88' : '#ff4455' }}>
                  {p.side.toUpperCase()}
                </span>
                <span className="text-[8px] font-mono text-white/50 shrink-0">{p.count}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="text-[9px] text-cyan-700">Connecting...</div>
        )}
      </div>

      {/* Alpaca Portfolio */}
      <div className="mb-3">
        <SectionHead title="Alpaca" badge="PAPER" />
        <DataRow label="Portfolio" value="—" />
        <DataRow label="Day P&L" value="—" />
        <DataRow label="Equity" value="—" />
        <div className="text-[8px] text-white/15 mt-0.5">Go live to unlock real data</div>
      </div>

      {/* RC MRR Progress */}
      <div className="mb-3">
        <SectionHead title="RC Revenue" badge="STRIPE" />
        <DataRow label="MRR" value={`$${mrr.toFixed(0)}`} valueColor={mrr > 0 ? '#00ff88' : '#cce8ff'} />
        <DataRow label="ARR" value={`$${(mrr * 12).toFixed(0)}`} />
        <DataRow label="Valuation" value={mrr > 0 ? `$${(mrr * 36).toFixed(0)}` : '—'} valueColor="#a855f7" />
        <div className="mt-1.5">
          <div className="flex justify-between text-[7px] text-white/20 mb-0.5">
            <span>MRR Target</span><span>${mrr.toFixed(0)} / $10,000</span>
          </div>
          <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, (mrr / 10000) * 100)}%`, background: 'linear-gradient(90deg, #a855f7, #00d4ff)' }}
            />
          </div>
        </div>
      </div>

      {/* Active Agent */}
      <div className="mb-3">
        <SectionHead title="Active Agent" />
        <div className="text-[18px] font-bold tracking-[0.3em] text-center py-2"
          style={{ color: '#00d4ff', textShadow: '0 0 20px #00d4ff60' }}>
          {activeAgent.toUpperCase()}
        </div>
      </div>
    </div>
  )
}
