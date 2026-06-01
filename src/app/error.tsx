'use client'
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ minHeight: '100vh', background: '#060d1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', color: '#ff4455', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 12, letterSpacing: '0.2em', color: '#00d4ff' }}>JARVIS OS — ERROR</div>
      <div style={{ fontSize: 11, color: '#ffffff40', maxWidth: 400, textAlign: 'center' }}>{error.message}</div>
      <button onClick={reset} style={{ padding: '8px 20px', background: 'transparent', border: '1px solid #00d4ff40', color: '#00d4ff', cursor: 'pointer', fontSize: 11, letterSpacing: '0.1em' }}>
        RETRY
      </button>
    </div>
  )
}
