'use client'

import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react'
const RealtimeVoice = lazy(() => import('./RealtimeVoice'))
const JarvisGreeting = lazy(() => import('@/components/hud/JarvisGreeting'))
const VoiceInterrupt = lazy(() => import('@/components/hud/VoiceInterrupt'))

interface Message {
  role: 'user' | 'assistant'
  content: string
  agent?: string
  ts: Date
}

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff', nova: '#a855f7', sage: '#00ff88', vault: '#c9a84c',
  echo: '#ff6b35', scout: '#ff4455', lumen: '#fde68a', ledger: '#f87171',
  atlas: '#e879f9', beacon: '#34d399',
}

const QUICK = [
  { label: '☀️ Brief', cmd: 'Morning brief' },
  { label: '📈 Portfolio', cmd: 'Portfolio summary' },
  { label: '💳 CC Sales', cmd: 'Card Chiefz sales this week' },
  { label: '💰 Money', cmd: 'Financial snapshot' },
  { label: '🏃 Training', cmd: "What's my training today" },
  { label: '🎯 Goals', cmd: 'Weekly accountability check' },
]

export default function MobileChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Array<{role: 'user'|'assistant'; content: string}>>([])
  const [analyzingFile, setAnalyzingFile] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Always auto-start voice — Jarvis listens the moment you open it
  const [autoVoice] = useState(true)

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: Message = { role: 'user', content: text, ts: new Date() }
    setMessages(m => [...m, userMsg])
    setInput('')
    setLoading(true)

    const newHistory = [...history, { role: 'user' as const, content: text }]
    setHistory(newHistory)

    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: newHistory }),
      })
      const data = await res.json()
      const reply = data.message ?? data.error ?? 'No response.'
      const agent = data.agent ?? 'jarvis'
      setMessages(m => [...m, { role: 'assistant', content: reply, agent, ts: new Date() }])
      setHistory(h => [...h, { role: 'assistant', content: reply }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Connection error.', agent: 'jarvis', ts: new Date() }])
    } finally {
      setLoading(false)
    }
  }, [loading, history])

  const color = (agent?: string) => AGENT_COLORS[agent ?? 'jarvis'] ?? '#00d4ff'

  const handleFile = useCallback(async (file: File) => {
    if (!file || analyzingFile) return
    setAnalyzingFile(true)
    setMessages(m => [...m, { role: 'user', content: `📎 ${file.name}`, ts: new Date() }])
    const formData = new FormData()
    formData.append('image', file)
    formData.append('context', input.trim())
    try {
      const res = await fetch('/api/vision', { method: 'POST', body: formData })
      const data = await res.json()
      const reply = data.text ?? 'Could not analyze file.'
      setMessages(m => [...m, { role: 'assistant', content: reply, agent: 'vault', ts: new Date() }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'File analysis failed.', agent: 'jarvis', ts: new Date() }])
    } finally {
      setAnalyzingFile(false)
      setInput('')
    }
  }, [analyzingFile, input])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      background: '#020810', color: 'white', fontFamily: "'SF Mono', 'Fira Code', monospace",
    }}>

      {/* Header — text only, no triangle */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '14px 16px',
        borderBottom: '1px solid rgba(0,212,255,0.12)',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(20px)',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.15em', color: '#00d4ff' }}>JARVIS</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>AB COMMAND CENTER</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Suspense fallback={<span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffffff22', display: 'inline-block' }}/>}>
            <RealtimeVoice hidden autoStart={autoVoice}
              onTranscript={(text, role, agent) => {
                if (role === 'user') setMessages(m => [...m, { role: 'user', content: text, ts: new Date() }])
                else {
                  setMessages(m => [...m, { role: 'assistant', content: text, agent, ts: new Date() }])
                  if (text.length > 20) fetch('/api/memory/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'conversation_summary', content: `[Voice] ${text.slice(0, 200)}`, context: text.slice(0, 300), importance: 6 }) }).catch(() => {})
                }
              }}
            />
          </Suspense>
          <span style={{ fontSize: 9, color: 'rgba(0,255,136,0.6)', letterSpacing: '0.1em' }}>ONLINE</span>
        </div>
      </div>

      {/* Voice interrupt — speaks proactive alerts out loud */}
      <Suspense fallback={null}>
        <VoiceInterrupt onMessage={text => setMessages(m => [...m, { role: 'assistant', content: text, agent: 'jarvis', ts: new Date() }])} />
      </Suspense>

      {/* Jarvis greeting — speaks first on open, shows predictive chips */}
      <Suspense fallback={null}>
        <JarvisGreeting onSuggestionClick={text => send(text)} />
      </Suspense>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !loading && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <svg width="200" height="188" viewBox="0 0 260 250" style={{ filter: 'drop-shadow(0 0 32px rgba(0,212,255,0.7))' }}>
              <polygon points="130,236 8,18 252,18" fill="rgba(0,212,255,0.88)" stroke="rgba(0,212,255,1)" strokeWidth="2"/>
            </svg>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.25em' }}>SAY ANYTHING</div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {msg.role === 'assistant' && (
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: color(msg.agent), marginBottom: 4 }}>
                [{(msg.agent ?? 'JARVIS').toUpperCase()}]
              </div>
            )}
            <div style={{
              maxWidth: '85%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
              background: msg.role === 'user' ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)',
              borderLeft: msg.role === 'assistant' ? `2px solid ${color(msg.agent)}` : 'none',
              border: msg.role === 'user' ? '1px solid rgba(0,212,255,0.2)' : `none`,
              fontSize: 13, lineHeight: 1.55, color: msg.role === 'user' ? '#cce8ff' : 'rgba(255,255,255,0.85)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: '#00d4ff', marginBottom: 4 }}>[JARVIS]</div>
            <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.04)', borderLeft: '2px solid #00d4ff', borderRadius: '4px 16px 16px 16px' }}>
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {[0,1,2].map(i => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#00d4ff', display: 'inline-block', animation: 'pulse 1s infinite', animationDelay: `${i*0.2}s`, opacity: 0.6 }}/>
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick commands */}
      <div style={{ padding: '8px 16px', display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0, scrollbarWidth: 'none' }}>
        {QUICK.map(q => (
          <button key={q.label} onClick={() => send(q.cmd)}
            style={{ flexShrink: 0, fontSize: 11, padding: '6px 12px', background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)', color: 'rgba(0,212,255,0.7)', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {q.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 16px 20px', display: 'flex', gap: 10, flexShrink: 0,
        borderTop: '1px solid rgba(0,212,255,0.08)',
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)',
      }}>
        {/* Hidden file input — photos, PDFs, docs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.txt"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />

        {/* Paperclip upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={analyzingFile}
          style={{
            width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(0,212,255,0.2)',
            background: analyzingFile ? 'rgba(245,197,24,0.15)' : 'rgba(255,255,255,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer',
          }}
          title="Upload photo or file"
        >
          {analyzingFile
            ? <span style={{ fontSize: 18, animation: 'pulse 1s infinite' }}>⏳</span>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="rgba(0,212,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
          }
        </button>

        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
          placeholder="Ask Jarvis anything..."
          disabled={loading}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 24, padding: '11px 16px', color: 'white', fontSize: 14,
            outline: 'none', fontFamily: 'inherit',
          }}
        />

        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          style={{
            width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: input.trim() ? '#00d4ff' : 'rgba(0,212,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'background 0.2s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" stroke={input.trim() ? '#000' : '#00d4ff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        ::-webkit-scrollbar { display: none; }
        @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
        input::placeholder { color: rgba(255,255,255,0.25); }
      `}</style>
    </div>
  )
}
