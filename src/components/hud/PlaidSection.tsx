'use client'

import { useEffect, useState, useCallback } from 'react'
import type { FinancialSnapshot } from '@/lib/plaid/client'

function fmt$(n: number) {
  return n < 0 ? `-$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function SHead({ title, badge }: { title: string; badge?: string }) {
  return (
    <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,212,255,0.12)', paddingBottom: 3, marginBottom: 4, marginTop: 8 }}>
      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(0,212,255,0.45)', textTransform: 'uppercase' }}>{title}</span>
      {badge && <span style={{ fontSize: 7, color: 'rgba(0,255,136,0.5)', letterSpacing: '0.1em' }}>{badge}</span>}
    </div>
  )
}

export default function PlaidSection() {
  const [snap, setSnap] = useState<FinancialSnapshot | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [showTransactions, setShowTransactions] = useState(false)

  const load = useCallback(() => {
    fetch('/api/plaid/snapshot').then(r => r.json()).then(setSnap).catch(() => {})
  }, [])

  useEffect(() => { load(); const t = setInterval(load, 5 * 60 * 1000); return () => clearInterval(t) }, [load])

  const connectBank = useCallback(async () => {
    if (connecting) return
    setConnecting(true)
    try {
      const res = await fetch('/api/plaid/link-token', { method: 'POST' })
      const { linkToken } = await res.json()

      // Dynamically load Plaid Link
      const script = document.createElement('script')
      script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
      script.onload = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handler = (window as any).Plaid.create({
          token: linkToken,
          onSuccess: async (publicToken: string, metadata: { institution?: { name?: string } }) => {
            await fetch('/api/plaid/exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ publicToken, institutionName: metadata.institution?.name ?? 'My Bank' }),
            })
            load()
          },
          onExit: () => setConnecting(false),
        })
        handler.open()
      }
      document.head.appendChild(script)
    } catch { setConnecting(false) }
  }, [connecting, load])

  if (!snap) return null

  return (
    <div style={{ gridColumn: '1/-1', display: 'contents' }}>
      <SHead
        title="Net Worth"
        badge={snap.connected ? '● LIVE' : undefined}
      />

      {!snap.connected ? (
        <div style={{ gridColumn: '1/-1' }}>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', marginBottom: 6 }}>
            Connect your bank — read-only, zero transactions
          </div>
          <button
            onClick={connectBank}
            disabled={connecting}
            style={{ fontSize: 9, fontWeight: 700, padding: '5px 12px', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff', cursor: 'pointer', borderRadius: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >
            {connecting ? 'Connecting...' : 'Connect Bank →'}
          </button>
        </div>
      ) : (
        <>
          {/* Net worth hero */}
          <div style={{ gridColumn: '1/-1', background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.08)', borderRadius: 3, padding: '8px 10px', marginBottom: 4 }}>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 2 }}>Net Worth</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: snap.netWorth >= 0 ? '#00ff88' : '#ff4455', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
              {fmt$(snap.netWorth)}
            </div>
          </div>

          {/* Accounts grid */}
          {snap.accounts.slice(0, 4).map(acct => (
            <div key={acct.id} style={{ background: 'rgba(0,8,20,0.6)', border: '1px solid rgba(255,255,255,0.04)', padding: '4px 6px' }}>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 1 }}>{acct.subtype || acct.type}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: acct.type === 'credit' ? '#ff4455' : '#cce8ff', fontFamily: 'monospace' }}>{fmt$(acct.balance)}</div>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.2)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acct.name}</div>
            </div>
          ))}

          {/* Monthly spend + top categories */}
          <div style={{ gridColumn: '1/-1', marginTop: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>30-Day Spend</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#ff6b35', fontFamily: 'monospace' }}>{fmt$(snap.monthlySpend)}</span>
            </div>
            {snap.topCategories.map(cat => (
              <div key={cat.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, padding: '2px 0' }}>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>{cat.name}</span>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{fmt$(cat.amount)}</span>
              </div>
            ))}
          </div>

          {/* Recent transactions toggle */}
          <div style={{ gridColumn: '1/-1', marginTop: 4 }}>
            <button
              onClick={() => setShowTransactions(t => !t)}
              style={{ fontSize: 8, color: 'rgba(0,212,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, letterSpacing: '0.1em' }}
            >
              {showTransactions ? '▲ Hide' : '▼ Recent Transactions'}
            </button>
            {showTransactions && snap.recentTransactions.slice(0, 8).map(tx => (
              <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{tx.name}</div>
                  <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.2)' }}>{tx.date}</div>
                </div>
                <span style={{ fontSize: 9, fontFamily: 'monospace', color: tx.amount > 0 ? '#ff4455' : '#00ff88', flexShrink: 0 }}>
                  {tx.amount > 0 ? '-' : '+'}{fmt$(Math.abs(tx.amount))}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
