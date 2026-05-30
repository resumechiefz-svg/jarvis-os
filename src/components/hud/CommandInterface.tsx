'use client'

import { useState, useRef, useEffect } from 'react'
import type { Message, AgentName } from '@/lib/types'

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff',
  nova: '#a855f7',
  sage: '#00ff88',
  vault: '#c9a84c',
}

interface Props {
  onMessage: (msg: Message) => void
  onAgentChange: (agent: AgentName) => void
  messages: Message[]
}

const QUICK_COMMANDS = [
  { label: 'Morning Brief', command: 'Hey Jarvis, morning brief' },
  { label: 'RC Stats', command: 'Nova, give me the ResumeChiefz numbers' },
  { label: 'Beckett', command: 'Sage, Beckett status this week' },
  { label: 'CC Sales', command: 'Vault, how did Card Chiefz do this week?' },
]

export default function CommandInterface({ onMessage, onAgentChange, messages }: Props) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send(text: string) {
    if (!text.trim() || loading) return
    setInput('')
    setLoading(true)

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      agent: 'jarvis',
      content: text,
      timestamp: new Date(),
    }
    onMessage(userMsg)

    const newHistory = [...history, { role: 'user' as const, content: text }]
    setHistory(newHistory)

    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: newHistory }),
      })
      const data = await res.json()
      const agent: AgentName = data.agent ?? 'jarvis'
      onAgentChange(agent)

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        agent,
        content: data.message ?? data.error ?? 'No response.',
        timestamp: new Date(),
      }
      onMessage(botMsg)
      setHistory(h => [...h, { role: 'assistant', content: data.message }])
    } catch {
      onMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        agent: 'jarvis',
        content: 'Connection error. Check API configuration.',
        timestamp: new Date(),
      })
    } finally {
      setLoading(false)
      onAgentChange('jarvis')
    }
  }

  return (
    <div className="command-interface flex flex-col h-full">
      {/* Message history */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {msg.role === 'assistant' && (
              <div
                className="text-[9px] font-bold tracking-wider shrink-0 pt-1"
                style={{ color: AGENT_COLORS[msg.agent] ?? '#00d4ff' }}
              >
                [{msg.agent.toUpperCase()}]
              </div>
            )}
            <div
              className={`text-[11px] leading-relaxed max-w-[75%] px-3 py-1.5 rounded ${
                msg.role === 'user'
                  ? 'bg-cyan-900/30 text-cyan-200 text-right'
                  : 'bg-white/5 text-white/80'
              }`}
              style={msg.role === 'assistant' ? { borderLeft: `2px solid ${AGENT_COLORS[msg.agent] ?? '#00d4ff'}` } : {}}
            >
              <pre className="whitespace-pre-wrap font-mono text-[11px]">{msg.content}</pre>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="text-[9px] font-bold tracking-wider text-cyan-400">[JARVIS]</div>
            <div className="text-[11px] text-white/40 flex gap-1">
              <span className="animate-bounce">.</span>
              <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
            </div>
          </div>
        )}
      </div>

      {/* Quick commands */}
      <div className="px-4 py-1.5 flex gap-2 flex-wrap">
        {QUICK_COMMANDS.map(qc => (
          <button
            key={qc.label}
            onClick={() => send(qc.command)}
            className="text-[9px] tracking-wider px-2 py-0.5 border border-cyan-900/50 text-cyan-500/60 hover:text-cyan-300 hover:border-cyan-600 transition-colors uppercase"
          >
            {qc.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 pb-3 flex gap-2">
        <div className="flex-1 flex items-center border border-cyan-800/50 bg-black/40 px-3">
          <span className="text-cyan-500/50 text-[10px] mr-2 font-mono">{'>'}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
            placeholder="Say anything to Jarvis..."
            className="flex-1 bg-transparent text-[12px] text-cyan-200 placeholder:text-cyan-800 outline-none font-mono py-2"
            disabled={loading}
            autoFocus
          />
        </div>
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="px-4 text-[10px] font-bold tracking-widest bg-cyan-900/30 border border-cyan-700/50 text-cyan-400 hover:bg-cyan-800/40 disabled:opacity-30 transition-colors uppercase"
        >
          Send
        </button>
      </div>
    </div>
  )
}
