'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Square, Camera } from 'lucide-react'
import type { Message, AgentName } from '@/lib/types'

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff', nova: '#a855f7', sage: '#00ff88', vault: '#c9a84c',
  echo: '#ff6b35', scout: '#ff4455', reel: '#ff69b4', lister: '#fbbf24',
  dex: '#60a5fa', beacon: '#34d399', ledger: '#f87171', atlas: '#e879f9',
}

interface Props {
  onMessage: (msg: Message) => void
  onAgentChange: (agent: AgentName) => void
  onAmplitude?: (val: number) => void
  messages: Message[]
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

const WAKE_WORDS = ['hey jarvis', 'jarvis', 'hey travis', 'hey garcia', 'hey davis']

export default function CommandInterface({ onMessage, onAgentChange, onAmplitude, messages }: Props) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [listening, setListening] = useState(false)
  const [triggered, setTriggered] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [analyzingImage, setAnalyzingImage] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bargeInRef = useRef<any>(null)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bargeInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)  // shared, resumed on gesture
  const micMutedRef = useRef(false)
  const voiceEnabledRef = useRef(true)
  const onAmplitudeRef = useRef(onAmplitude)
  const historyRef = useRef(history)
  const loadingRef = useRef(loading)

  useEffect(() => { voiceEnabledRef.current = voiceEnabled }, [voiceEnabled])
  useEffect(() => { onAmplitudeRef.current = onAmplitude }, [onAmplitude])
  useEffect(() => { historyRef.current = history }, [history])
  useEffect(() => { loadingRef.current = loading }, [loading])

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // ── Mic control ──────────────────────────────────────────────────────────────

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort()
      recognitionRef.current = null
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    setListening(false)
  }, [])

  const startRecognition = useCallback(() => {
    if (micMutedRef.current) return          // Jarvis is speaking — stay silent
    if (recognitionRef.current) return       // already running

    const w = window as any // eslint-disable-line @typescript-eslint/no-explicit-any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 3
    recognition.continuous = false

    recognition.onstart = () => setListening(true)

    recognition.onresult = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (micMutedRef.current) return        // safety net — discard if Jarvis just started

      let transcript = ''
      for (let i = 0; i < event.results[0].length; i++) {
        const t = event.results[0][i].transcript.toLowerCase().trim()
        if (WAKE_WORDS.some(w => t.includes(w))) { transcript = t; break }
        if (!transcript) transcript = t
      }

      const wakeDetected = WAKE_WORDS.some(w => transcript.includes(w))

      if (wakeDetected) {
        let command = transcript
        for (const w of WAKE_WORDS) command = command.replace(w, '').trim()
        setTriggered(true)
        setTimeout(() => setTriggered(false), 2000)
        sendCommand(command.length > 1 ? command : 'hey')
      } else if (transcript.length > 2) {
        sendCommand(transcript)
      }
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
      if (!micMutedRef.current) {
        restartTimerRef.current = setTimeout(startRecognition, 300)
      }
    }

    recognition.onerror = (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      recognitionRef.current = null
      setListening(false)
      if (e.error === 'not-allowed' || e.error === 'permission-denied') {
        setMicError('Mic blocked — click the 🔒 in Chrome address bar → allow mic')
      } else if (e.error === 'no-speech') {
        // Normal — just restart
        if (!micMutedRef.current) restartTimerRef.current = setTimeout(startRecognition, 300)
      } else if (e.error !== 'aborted') {
        setMicError(`Mic error: ${e.error}`)
        if (!micMutedRef.current) restartTimerRef.current = setTimeout(startRecognition, 1000)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setMicError(null)
    } catch (err) {
      recognitionRef.current = null
      setMicError(`Can't start mic: ${err}`)
    }
  }, []) // stable — reads state via refs

  // Auto-start on mount + unlock AudioContext on first gesture
  useEffect(() => {
    startRecognition()

    // Chrome requires a user gesture before AudioContext works
    // Prime it on the first click or keypress so speak() works immediately
    const unlock = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume()
      }
    }
    window.addEventListener('click', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    return () => {
      stopRecognition()
      micMutedRef.current = false
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [startRecognition, stopRecognition])

  // ── Speech output ─────────────────────────────────────────────────────────────

  const speak = useCallback(async (text: string, agent: string) => {
    if (!voiceEnabledRef.current) return

    // Stop mic immediately — must happen before audio plays
    micMutedRef.current = true
    stopRecognition()

    // Stop any currently playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }

    setSpeaking(true)

    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, agent }),
      })
      if (!res.ok) throw new Error('speak failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      currentAudioRef.current = audio

      // Amplitude analysis — reuse shared AudioContext to avoid Chrome autoplay block
      let animFrame = 0
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
        const ctx = audioCtxRef.current
        if (ctx.state === 'suspended') await ctx.resume()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        const source = ctx.createMediaElementSource(audio)
        source.connect(analyser)
        analyser.connect(ctx.destination)
        const data = new Uint8Array(analyser.frequencyBinCount)
        audio.onplay = () => {
          const tick = () => {
            analyser.getByteFrequencyData(data)
            onAmplitudeRef.current?.(Math.min(1, data.reduce((a, b) => a + b, 0) / data.length / 80))
            animFrame = requestAnimationFrame(tick)
          }
          tick()
        }
      } catch { /* no amplitude */ }

      const stopBargeIn = () => {
        if (bargeInTimerRef.current) { clearTimeout(bargeInTimerRef.current); bargeInTimerRef.current = null }
        if (bargeInRef.current) { try { bargeInRef.current.abort() } catch { /* ok */ } bargeInRef.current = null }
      }

      const cleanup = () => {
        stopBargeIn()
        cancelAnimationFrame(animFrame)
        onAmplitudeRef.current?.(0)
        URL.revokeObjectURL(url)
        currentAudioRef.current = null
        setSpeaking(false)
        restartTimerRef.current = setTimeout(() => {
          micMutedRef.current = false
          startRecognition()
        }, 500)
      }

      audio.onended = cleanup
      audio.onerror = cleanup

      // Barge-in: start a second listener 1.5s into playback
      // If user speaks → cut Jarvis off and process the command
      const startBargeIn = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any
        const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
        if (!SR) return
        const bi = new SR()
        bi.lang = 'en-US'
        bi.interimResults = false
        bi.maxAlternatives = 1
        bi.continuous = false
        bargeInRef.current = bi

        bi.onresult = (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const t = e.results[0][0].transcript.toLowerCase().trim()
          if (t.length < 2) return
          // User interrupted — stop Jarvis immediately
          audio.pause()
          audio.currentTime = 0
          cleanup()
          // Process what they said
          let cmd = t
          for (const w of WAKE_WORDS) cmd = cmd.replace(w, '').trim()
          if (cmd.length > 1) {
            setTriggered(true)
            setTimeout(() => setTriggered(false), 1500)
            sendCommand(cmd)
          } else {
            micMutedRef.current = false
            startRecognition()
          }
        }

        bi.onend = () => {
          bargeInRef.current = null
          // Keep trying while audio still playing
          if (currentAudioRef.current && !currentAudioRef.current.paused) {
            bargeInTimerRef.current = setTimeout(startBargeIn, 200)
          }
        }
        bi.onerror = () => {
          bargeInRef.current = null
          if (currentAudioRef.current && !currentAudioRef.current.paused) {
            bargeInTimerRef.current = setTimeout(startBargeIn, 500)
          }
        }
        try { bi.start() } catch { /* ok */ }
      }

      audio.play().catch(cleanup)
      // 1.5s delay — Jarvis's first words are past the mic by then
      bargeInTimerRef.current = setTimeout(startBargeIn, 1500)

    } catch {
      setSpeaking(false)
      micMutedRef.current = false
      startRecognition()
    }
  }, [startRecognition, stopRecognition])

  // ── Send command ──────────────────────────────────────────────────────────────

  const sendCommand = useCallback(async (text: string) => {
    if (!text.trim() || loadingRef.current) return

    setInput('')
    setLoading(true)

    const userMsg: Message = { id: Date.now().toString(), role: 'user', agent: 'jarvis', content: text, timestamp: new Date() }
    onMessage(userMsg)

    const newHistory = [...historyRef.current, { role: 'user' as const, content: text }]
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
      const reply = data.message ?? data.error ?? 'No response.'
      const botMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', agent, content: reply, timestamp: new Date() }
      onMessage(botMsg)
      setHistory(h => [...h, { role: 'assistant', content: reply }])
      speak(reply, agent)
    } catch {
      onMessage({ id: (Date.now() + 1).toString(), role: 'assistant', agent: 'jarvis', content: 'Connection error.', timestamp: new Date() })
    } finally {
      setLoading(false)
      onAgentChange('jarvis')
    }
  }, [onMessage, onAgentChange, speak])

  // send for text input (goes through same path)
  const send = useCallback((text: string) => sendCommand(text), [sendCommand])

  // ── Image upload ──────────────────────────────────────────────────────────────

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file || analyzingImage) return
    setAnalyzingImage(true)
    onMessage({ id: Date.now().toString(), role: 'user', agent: 'jarvis', content: `[Image: ${file.name}]`, timestamp: new Date() })
    const formData = new FormData()
    formData.append('image', file)
    formData.append('context', input.trim() || '')
    try {
      const res = await fetch('/api/vision', { method: 'POST', body: formData })
      const data = await res.json()
      const reply = data.text ?? 'Could not analyze image.'
      onMessage({ id: (Date.now() + 1).toString(), role: 'assistant', agent: 'vault', content: reply, timestamp: new Date() })
      onAgentChange('vault')
      speak(reply, 'vault')
    } catch {
      onMessage({ id: (Date.now() + 1).toString(), role: 'assistant', agent: 'jarvis', content: 'Vision error.', timestamp: new Date() })
    } finally {
      setAnalyzingImage(false)
      setInput('')
    }
  }, [analyzingImage, input, onMessage, onAgentChange, speak])

  const toggleMic = useCallback(async () => {
    if (listening) {
      stopRecognition()
      micMutedRef.current = true
    } else {
      micMutedRef.current = false
      setMicError(null)
      // Explicitly request mic permission first — this makes Chrome prompt the user
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (err) {
        setMicError('Mic denied — click 🔒 in address bar and allow microphone')
        return
      }
      startRecognition()
    }
  }, [listening, startRecognition, stopRecognition])

  // ── Render — slim command bar ─────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>

      {/* Mic error banner */}
      {micError && (
        <div style={{ padding: '4px 16px', background: 'rgba(255,68,85,0.12)', borderBottom: '1px solid rgba(255,68,85,0.3)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#ff4455' }}>⚠</span>
          <span style={{ fontSize: 10, color: 'rgba(255,68,85,0.8)', flex: 1 }}>{micError}</span>
          <button onClick={() => setMicError(null)} style={{ fontSize: 11, color: 'rgba(255,68,85,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Last response toast — shows most recent agent reply */}
      {messages.length > 0 && (
        <div style={{
          padding: '4px 16px', borderBottom: '1px solid rgba(0,212,255,0.06)',
          display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0,
          background: 'rgba(0,3,10,0.8)', overflow: 'hidden',
        }}>
          {loading ? (
            <span style={{ fontSize: 11, color: 'rgba(0,212,255,0.5)', fontFamily: 'monospace' }}>
              ● processing...
            </span>
          ) : (() => {
            const last = [...messages].reverse().find(m => m.role === 'assistant')
            if (!last) return null
            const color = AGENT_COLORS[last.agent] ?? '#00d4ff'
            return (
              <>
                <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.15em', flexShrink: 0 }}>
                  [{last.agent.toUpperCase()}]
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: 'monospace' }}>
                  {last.content.replace(/\*+/g, '').split('\n')[0].slice(0, 180)}
                </span>
              </>
            )
          })()}
        </div>
      )}

      {/* Quick commands */}
      <div style={{ display: 'flex', gap: 6, padding: '4px 12px', flexWrap: 'wrap', flexShrink: 0, borderBottom: '1px solid rgba(0,212,255,0.04)' }}>
        {QUICK_COMMANDS.map(qc => (
          <button key={qc.label} onClick={() => send(qc.command)} style={{
            fontSize: 9, padding: '2px 8px', border: '1px solid rgba(0,212,255,0.15)',
            background: 'transparent', color: 'rgba(0,212,255,0.4)',
            cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase',
            transition: 'all 0.15s', borderRadius: 2, fontFamily: 'inherit',
          }}>
            {qc.label}
          </button>
        ))}
      </div>

      {/* Hidden file input */}
      <input ref={imageInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.csv" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }} />

      {/* Main input row */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, padding: '6px 12px', flex: 1 }}>
        {/* Status dot */}
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: 4 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: listening ? '#00ff88' : speaking ? '#a855f7' : loading ? '#00d4ff' : 'rgba(255,255,255,0.1)',
            boxShadow: listening ? '0 0 8px #00ff88' : speaking ? '0 0 8px #a855f7' : 'none',
            animation: (listening || speaking || loading) ? 'voice-dot-pulse 1.5s infinite' : 'none',
            transition: 'all 0.3s',
          }} />
        </div>

        {/* Input */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', border: '1px solid rgba(0,212,255,0.2)', background: 'rgba(0,212,255,0.03)', padding: '0 12px', borderRadius: 2 }}>
          <span style={{ fontSize: 11, color: 'rgba(0,212,255,0.3)', marginRight: 8, fontFamily: 'monospace' }}>›</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
            placeholder={listening ? '🎙  Listening... say "Hey Jarvis"' : speaking ? '🔊  Speaking...' : 'Command Jarvis or type anything...'}
            disabled={loading}
            autoFocus
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#cce8ff', fontSize: 13, fontFamily: 'monospace',
              caretColor: '#00d4ff',
            }}
          />
        </div>

        {/* Controls */}
        {[
          {
            show: true,
            onClick: () => imageInputRef.current?.click(),
            disabled: analyzingImage,
            title: 'Upload file',
            content: <Camera size={13} />,
            active: analyzingImage,
            activeColor: '#fbbf24',
          },
          {
            show: speaking,
            onClick: () => { currentAudioRef.current?.pause(); currentAudioRef.current = null; setSpeaking(false); micMutedRef.current = false; startRecognition() },
            disabled: false,
            title: 'Stop Jarvis',
            content: <Square size={13} />,
            active: true,
            activeColor: '#ff4455',
          },
          {
            show: true,
            onClick: () => { setVoiceEnabled(v => !v); voiceEnabledRef.current = !voiceEnabledRef.current },
            disabled: false,
            title: voiceEnabled ? 'Mute' : 'Unmute',
            content: voiceEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />,
            active: voiceEnabled,
            activeColor: '#00d4ff',
          },
          {
            show: true,
            onClick: toggleMic,
            disabled: false,
            title: listening ? 'Mic on' : 'Mic off',
            content: listening ? <Mic size={13} /> : <MicOff size={13} />,
            active: listening || triggered,
            activeColor: triggered ? '#00d4ff' : '#00ff88',
          },
        ].filter(b => b.show).map((btn, i) => (
          <button key={i} onClick={btn.onClick} disabled={btn.disabled} title={btn.title}
            style={{
              padding: '0 10px', border: `1px solid ${btn.active ? btn.activeColor + '50' : 'rgba(0,212,255,0.12)'}`,
              background: btn.active ? `${btn.activeColor}12` : 'transparent',
              color: btn.active ? btn.activeColor : 'rgba(255,255,255,0.3)',
              cursor: 'pointer', borderRadius: 2, display: 'flex', alignItems: 'center',
              transition: 'all 0.2s', animation: btn.active && btn.activeColor === '#ff4455' ? 'voice-dot-pulse 1s infinite' : 'none',
            }}>
            {btn.content}
          </button>
        ))}

        <button onClick={() => send(input)} disabled={loading || !input.trim()}
          style={{
            padding: '0 16px', background: 'rgba(0,212,255,0.1)',
            border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
            cursor: 'pointer', borderRadius: 2, opacity: (loading || !input.trim()) ? 0.3 : 1,
            transition: 'all 0.2s', fontFamily: 'inherit',
          }}>
          Send
        </button>
      </div>
    </div>
  )
}
