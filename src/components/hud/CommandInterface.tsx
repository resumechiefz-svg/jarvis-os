'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Square, Camera } from 'lucide-react'
import type { Message, AgentName } from '@/lib/types'

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff', nova: '#a855f7', sage: '#00ff88', vault: '#c9a84c',
  echo: '#ff6b35', scout: '#ff4455', reel: '#ff69b4', lister: '#fbbf24',
  dex: '#60a5fa', beacon: '#34d399', ledger: '#f87171', atlas: '#e879f9',
}

const WAKE_WORDS = ['hey jarvis', 'jarvis', 'hey travis', 'hey garcia', 'hey davis']

interface Props {
  onMessage: (msg: Message) => void
  onAgentChange: (agent: AgentName) => void
  onAmplitude?: (val: number) => void
  messages: Message[]
  onTaskStart?: (agent: string, userMessage?: string) => string | undefined
  onTaskComplete?: (agent: string) => void
  onTaskError?: (agent: string) => void
}

const QUICK_COMMANDS = [
  { label: 'Morning Brief', command: 'morning brief' },
  { label: 'RC Stats', command: 'Nova give me the ResumeChiefz numbers' },
  { label: 'CC Sales', command: 'Vault how did Card Chiefz do this week' },
  { label: 'Goals', command: 'Beacon weekly accountability check' },
  { label: 'Money', command: 'Ledger give me my financial snapshot' },
  { label: 'Strategy', command: 'Atlas where am I on the 7-figure roadmap' },
  { label: 'End of Day', command: 'lets debrief' },
  { label: 'Ideas', command: 'Atlas give me 3 business ideas I should build next' },
]

export default function CommandInterface({
  onMessage, onAgentChange, onAmplitude, messages,
  onTaskStart, onTaskComplete, onTaskError,
}: Props) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [micOn, setMicOn] = useState(true)         // user-controlled toggle
  const [triggered, setTriggered] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)      // TTS on/off
  const [speaking, setSpeaking] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [streamText, setStreamText] = useState('')
  const [streamAgent, setStreamAgent] = useState('jarvis')

  // Stable refs — no stale closures
  const inputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<any>(null)          // SpeechRecognition instance
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const historyRef = useRef(history)
  const loadingRef = useRef(false)
  const micOnRef = useRef(true)             // mirror of micOn for use inside callbacks
  const speakingRef = useRef(false)
  const voiceOnRef = useRef(true)
  const onAmplitudeRef = useRef(onAmplitude)

  // Keep refs in sync
  useEffect(() => { historyRef.current = history }, [history])
  useEffect(() => { onAmplitudeRef.current = onAmplitude }, [onAmplitude])
  useEffect(() => { voiceOnRef.current = voiceOn }, [voiceOn])

  // ── sendCommand — defined early, stable via ref ────────────────────────────
  // We expose it via sendRef so recognition callbacks always call the latest version
  const sendRef = useRef<(text: string) => void>(() => {})

  const sendCommand = useCallback(async (text: string) => {
    if (!text.trim() || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setInput('')
    setStreamText('')

    const userMsg: Message = { id: Date.now().toString(), role: 'user', agent: 'jarvis', content: text, timestamp: new Date() }
    onMessage(userMsg)

    const newHistory = [...historyRef.current, { role: 'user' as const, content: text }]
    setHistory(newHistory)

    let currentAgent: AgentName = 'jarvis'
    let fullText = ''

    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: newHistory }),
      })

      if (!res.body) throw new Error('no body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(part.slice(6))
            if (ev.type === 'agent') {
              currentAgent = ev.agent
              setStreamAgent(ev.agent)
              onAgentChange(ev.agent)
              if (ev.agent !== 'jarvis') onTaskStart?.(ev.agent, text)
            } else if (ev.type === 'delta') {
              fullText += ev.text
              setStreamText(fullText)
            } else if (ev.type === 'done') {
              const final = ev.fullText ?? fullText
              setStreamText('')
              onMessage({ id: (Date.now() + 1).toString(), role: 'assistant', agent: currentAgent, content: final, timestamp: new Date() })
              setHistory(h => [...h, { role: 'assistant', content: final }])
              onTaskComplete?.(currentAgent)
              speakText(final, currentAgent)
            } else if (ev.type === 'error') {
              setStreamText('')
              onTaskError?.(currentAgent)
              onMessage({ id: (Date.now() + 1).toString(), role: 'assistant', agent: 'jarvis', content: ev.message ?? 'Error.', timestamp: new Date() })
            }
          } catch { /* bad line */ }
        }
      }
    } catch {
      setStreamText('')
      onTaskError?.(currentAgent)
      onMessage({ id: (Date.now() + 1).toString(), role: 'assistant', agent: 'jarvis', content: 'Connection error — check server.', timestamp: new Date() })
    } finally {
      loadingRef.current = false
      setLoading(false)
      onAgentChange('jarvis')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, onAgentChange, onTaskStart, onTaskComplete, onTaskError])

  // Keep sendRef current
  useEffect(() => { sendRef.current = sendCommand }, [sendCommand])

  // ── SpeechRecognition ──────────────────────────────────────────────────────
  const stopMic = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.abort() } catch { /* ok */ }
      recRef.current = null
    }
  }, [])

  const startMic = useCallback(() => {
    if (!micOnRef.current) return
    if (recRef.current) return  // already running
    if (speakingRef.current) return  // Jarvis is talking

    const w = window as any // eslint-disable-line @typescript-eslint/no-explicit-any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) { setMicError('Voice requires Chrome'); return }

    const r = new SR()
    r.lang = 'en-US'
    r.continuous = false
    r.interimResults = false
    r.maxAlternatives = 3
    recRef.current = r

    r.onresult = (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (speakingRef.current) return
      let transcript = ''
      for (let i = 0; i < e.results[0].length; i++) {
        const t = e.results[0][i].transcript.toLowerCase().trim()
        if (WAKE_WORDS.some(w => t.includes(w))) { transcript = t; break }
        if (!transcript) transcript = t
      }
      if (!transcript || transcript.length < 2) return

      const hasWake = WAKE_WORDS.some(w => transcript.includes(w))
      let cmd = transcript
      for (const w of WAKE_WORDS) cmd = cmd.replace(w, '').trim()

      if (hasWake || transcript.length > 4) {
        setTriggered(true)
        setTimeout(() => setTriggered(false), 2000)
        sendRef.current(cmd.length > 1 ? cmd : 'hey')
      }
    }

    r.onend = () => {
      recRef.current = null
      // Auto-restart if mic is still on and Jarvis isn't speaking
      if (micOnRef.current && !speakingRef.current) {
        setTimeout(startMic, 300)
      }
    }

    r.onerror = (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      recRef.current = null
      if (e.error === 'not-allowed') {
        micOnRef.current = false
        setMicOn(false)
        setMicError('Mic blocked — click 🔒 in address bar → Microphone → Allow → refresh')
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setMicError(`Mic: ${e.error}`)
      }
      if (micOnRef.current && !speakingRef.current && e.error !== 'not-allowed') {
        setTimeout(startMic, 1000)
      }
    }

    try { r.start(); setMicError(null) } catch { recRef.current = null }
  }, [])

  // Mic toggle
  const toggleMic = useCallback(() => {
    const next = !micOnRef.current
    micOnRef.current = next
    setMicOn(next)
    setMicError(null)
    if (next) {
      startMic()
    } else {
      stopMic()
    }
  }, [startMic, stopMic])

  // Mount — start mic + unlock AudioContext on first gesture
  useEffect(() => {
    micOnRef.current = true
    startMic()

    const unlock = () => {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
    }
    window.addEventListener('click', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    return () => {
      micOnRef.current = false
      stopMic()
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [startMic, stopMic])

  // ── TTS ────────────────────────────────────────────────────────────────────
  const speakText = useCallback(async (text: string, agent: string) => {
    if (!voiceOnRef.current || !text.trim()) return

    // Stop mic while speaking
    speakingRef.current = true
    stopMic()

    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setSpeaking(true)

    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, agent }),
      })
      if (!res.ok) throw new Error('speak API failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      // Amplitude for orb animation
      let frame = 0
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
        const ctx = audioCtxRef.current
        if (ctx.state === 'suspended') await ctx.resume()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        ctx.createMediaElementSource(audio).connect(analyser)
        analyser.connect(ctx.destination)
        const data = new Uint8Array(analyser.frequencyBinCount)
        audio.onplay = () => {
          const tick = () => {
            analyser.getByteFrequencyData(data)
            onAmplitudeRef.current?.(Math.min(1, data.reduce((a, b) => a + b, 0) / data.length / 80))
            frame = requestAnimationFrame(tick)
          }
          tick()
        }
      } catch { /* no amplitude fallback */ }

      const done = () => {
        cancelAnimationFrame(frame)
        onAmplitudeRef.current?.(0)
        URL.revokeObjectURL(url)
        audioRef.current = null
        setSpeaking(false)
        speakingRef.current = false
        // Resume mic after speaking
        setTimeout(startMic, 400)
      }
      audio.onended = done
      audio.onerror = done
      audio.play().catch(done)
    } catch {
      setSpeaking(false)
      speakingRef.current = false
      setTimeout(startMic, 400)
    }
  }, [stopMic, startMic])

  // ── Image upload ───────────────────────────────────────────────────────────
  const handleImageUpload = useCallback(async (file: File) => {
    if (!file || analyzing) return
    setAnalyzing(true)
    onMessage({ id: Date.now().toString(), role: 'user', agent: 'jarvis', content: `[Image: ${file.name}]`, timestamp: new Date() })
    const fd = new FormData(); fd.append('image', file)
    try {
      const res = await fetch('/api/vision', { method: 'POST', body: fd })
      const data = await res.json()
      const reply = data.text ?? 'Could not analyze.'
      onMessage({ id: (Date.now() + 1).toString(), role: 'assistant', agent: 'vault', content: reply, timestamp: new Date() })
      onAgentChange('vault')
      speakText(reply, 'vault')
    } catch {
      onMessage({ id: (Date.now() + 1).toString(), role: 'assistant', agent: 'jarvis', content: 'Vision error.', timestamp: new Date() })
    } finally { setAnalyzing(false); setInput('') }
  }, [analyzing, onMessage, onAgentChange, speakText])

  const send = (text: string) => sendCommand(text)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>

      {micError && (
        <div style={{ padding: '4px 16px', background: 'rgba(255,68,85,0.1)', borderBottom: '1px solid rgba(255,68,85,0.25)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#ff4455' }}>⚠</span>
          <span style={{ fontSize: 10, color: 'rgba(255,100,100,0.8)', flex: 1 }}>{micError}</span>
          <button onClick={() => setMicError(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,68,85,0.4)', cursor: 'pointer', fontSize: 13 }}>×</button>
        </div>
      )}

      {/* Response bar — streaming or last reply */}
      {(streamText || messages.length > 0) && (
        <div style={{ padding: '5px 16px', borderBottom: '1px solid rgba(0,212,255,0.06)', display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0, background: 'rgba(0,3,10,0.85)', overflow: 'hidden', minHeight: 28 }}>
          {streamText ? (
            <>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', flexShrink: 0, color: AGENT_COLORS[streamAgent] ?? '#00d4ff' }}>[{streamAgent.toUpperCase()}]</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: 'monospace', flex: 1 }}>
                {streamText.replace(/\*+/g, '').split('\n')[0]}
                <span style={{ animation: 'voice-dot-pulse 0.8s infinite', color: AGENT_COLORS[streamAgent] ?? '#00d4ff' }}>▋</span>
              </span>
            </>
          ) : loading ? (
            <span style={{ fontSize: 11, color: 'rgba(0,212,255,0.4)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00d4ff', display: 'inline-block', animation: 'voice-dot-pulse 0.8s infinite' }} />
              thinking...
            </span>
          ) : (() => {
            const last = [...messages].reverse().find(m => m.role === 'assistant')
            if (!last) return null
            const c = AGENT_COLORS[last.agent] ?? '#00d4ff'
            return (
              <>
                <span style={{ fontSize: 10, fontWeight: 700, color: c, letterSpacing: '0.15em', flexShrink: 0 }}>[{last.agent.toUpperCase()}]</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: 'monospace' }}>{last.content.replace(/\*+/g, '').split('\n')[0].slice(0, 200)}</span>
              </>
            )
          })()}
        </div>
      )}

      {/* Quick commands */}
      <div style={{ display: 'flex', gap: 6, padding: '4px 12px', flexWrap: 'wrap', flexShrink: 0, borderBottom: '1px solid rgba(0,212,255,0.04)' }}>
        {QUICK_COMMANDS.map(qc => (
          <button key={qc.label} onClick={() => send(qc.command)} style={{ fontSize: 9, padding: '2px 8px', border: '1px solid rgba(0,212,255,0.15)', background: 'transparent', color: 'rgba(0,212,255,0.4)', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', borderRadius: 2, fontFamily: 'inherit' }}>
            {qc.label}
          </button>
        ))}
      </div>

      <input ref={imageInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.csv" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }} />

      {/* Input row */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, padding: '6px 12px', flex: 1 }}>
        {/* Status dot */}
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: 4 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: micOn && !speaking && !loading ? '#00ff88' : speaking ? '#a855f7' : loading ? '#00d4ff' : 'rgba(255,255,255,0.1)',
            boxShadow: micOn && !speaking ? '0 0 8px #00ff88' : speaking ? '0 0 8px #a855f7' : 'none',
            animation: (micOn || speaking || loading) ? 'voice-dot-pulse 1.5s infinite' : 'none',
            transition: 'all 0.3s',
          }} />
        </div>

        {/* Text input */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', border: '1px solid rgba(0,212,255,0.2)', background: 'rgba(0,212,255,0.03)', padding: '0 12px', borderRadius: 2 }}>
          <span style={{ fontSize: 11, color: 'rgba(0,212,255,0.3)', marginRight: 8, fontFamily: 'monospace' }}>›</span>
          <input
            ref={inputRef}
            id="jarvis-command"
            name="jarvis-command"
            autoComplete="off"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && send(input)}
            placeholder={speaking ? '🔊  Jarvis speaking...' : micOn ? '🎙  Say "Hey Jarvis" or type...' : 'Type a command...'}
            disabled={loading}
            autoFocus
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#cce8ff', fontSize: 13, fontFamily: 'monospace', caretColor: '#00d4ff' }}
          />
        </div>

        {/* Buttons */}
        {([
          { show: true, onClick: () => imageInputRef.current?.click(), title: 'Upload', icon: <Camera size={13} />, active: analyzing, color: '#fbbf24' },
          { show: speaking, onClick: () => { audioRef.current?.pause(); audioRef.current = null; setSpeaking(false); speakingRef.current = false; setTimeout(startMic, 200) }, title: 'Stop', icon: <Square size={13} />, active: true, color: '#ff4455' },
          { show: true, onClick: () => { setVoiceOn(v => !v); voiceOnRef.current = !voiceOnRef.current }, title: voiceOn ? 'Mute TTS' : 'Unmute TTS', icon: voiceOn ? <Volume2 size={13} /> : <VolumeX size={13} />, active: voiceOn, color: '#00d4ff' },
          { show: true, onClick: toggleMic, title: micOn ? 'Mic on — click to mute' : 'Mic off — click to enable', icon: micOn ? <Mic size={13} /> : <MicOff size={13} />, active: micOn || triggered, color: triggered ? '#00d4ff' : '#00ff88' },
        ] as Array<{ show: boolean; onClick: () => void; title: string; icon: React.ReactNode; active: boolean; color: string }>)
          .filter(b => b.show)
          .map((btn, i) => (
            <button key={i} onClick={btn.onClick} title={btn.title} style={{
              padding: '0 10px',
              border: `1px solid ${btn.active ? btn.color + '50' : 'rgba(0,212,255,0.12)'}`,
              background: btn.active ? `${btn.color}12` : 'transparent',
              color: btn.active ? btn.color : 'rgba(255,255,255,0.3)',
              cursor: 'pointer', borderRadius: 2, display: 'flex', alignItems: 'center',
              transition: 'all 0.2s',
            }}>
              {btn.icon}
            </button>
          ))}

        <button onClick={() => send(input)} disabled={loading || !input.trim()} style={{
          padding: '0 16px', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)',
          color: '#00d4ff', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
          cursor: 'pointer', borderRadius: 2, opacity: (loading || !input.trim()) ? 0.3 : 1, transition: 'all 0.2s', fontFamily: 'inherit',
        }}>
          Send
        </button>
      </div>
    </div>
  )
}
