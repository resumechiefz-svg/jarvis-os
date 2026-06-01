'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      window.location.href = '/'
    } else {
      setError('Access denied.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#060d1a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ width: 320, textAlign: 'center' }}>
        {/* Logo */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'radial-gradient(circle, #00d4ff40, transparent)',
            border: '1px solid #00d4ff30',
            margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#00d4ff', boxShadow: '0 0 12px #00d4ff' }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.3em', color: '#00d4ff', textTransform: 'uppercase' }}>
            Jarvis OS
          </div>
          <div style={{ fontSize: 11, color: '#ffffff20', marginTop: 4, letterSpacing: '0.15em' }}>
            AB COMMAND CENTER
          </div>
        </div>

        {/* Form */}
        <form onSubmit={submit}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Access code"
            autoFocus
            style={{
              width: '100%', padding: '13px 16px',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${error ? '#ff4455' : 'rgba(0,212,255,0.2)'}`,
              borderRadius: 8, color: '#fff', fontSize: 15,
              outline: 'none', letterSpacing: '0.1em',
              marginBottom: 12,
            }}
          />
          {error && (
            <div style={{ fontSize: 12, color: '#ff4455', marginBottom: 12 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%', padding: '13px',
              background: loading ? 'rgba(0,212,255,0.1)' : '#00d4ff',
              color: loading ? '#00d4ff' : '#060d1a',
              border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.15em', textTransform: 'uppercase',
              transition: 'all 0.2s',
            }}
          >
            {loading ? 'Authenticating...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
