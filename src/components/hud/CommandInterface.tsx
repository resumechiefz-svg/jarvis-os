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

  const inputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const micMutedRef = useRef(false)       // true while Jarvis is talking — mic stays off
  const voiceEnabledRef = useRef(true)    // mirror of voiceEnabled state for closures
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
      if (e.error !== 'no-speech' && e.error !== 'aborted') setListening(false)
      if (!micMutedRef.current) {
        restartTimerRef.current = setTimeout(startRecognition, 1000)
      }
    }

    recognitionRef.current = recognition
    try { recognition.start() } catch { recognitionRef.current = null }
  }, []) // stable — reads state via refs

  // Auto-start on mount
  useEffect(() => {
    startRecognition()
    return () => {
      stopRecognition()
      micMutedRef.current = false
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

      // Amplitude analysis for orb animation
      let animFrame = 0
      try {
        const ctx = new AudioContext()
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
        audio.onended = () => { cancelAnimationFrame(animFrame); ctx.close() }
      } catch { /* no amplitude on this browser */ }

      const cleanup = () => {
        cancelAnimationFrame(animFrame)
        onAmplitudeRef.current?.(0)
        URL.revokeObjectURL(url)
        currentAudioRef.current = null
        setSpeaking(false)
        // Unmute mic — wait 800ms for speakers to go quiet before listening again
        restartTimerRef.current = setTimeout(() => {
          micMutedRef.current = false
          startRecognition()
        }, 800)
      }

      audio.onended = cleanup
      audio.onerror = cleanup
      audio.play().catch(cleanup)

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

  const toggleMic = useCallback(() => {
    if (listening) {
      stopRecognition()
      micMutedRef.current = true // manual off
    } else {
      micMutedRef.current = false
      startRecognition()
    }
  }, [listening, startRecognition, stopRecognition])

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="command-interface flex flex-col h-full">
      <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="flex items-center gap-3 py-1 select-none">
            <div className="text-[11px] text-cyan-500/30 tracking-widest uppercase">AB Command Center</div>
            <div className="text-[11px] text-white/10 tracking-widest">NOVA ● SAGE ● VAULT ● ECHO ● ATLAS ● 13 AGENTS ONLINE</div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {msg.role === 'assistant' && (
              <div className="text-[11px] font-bold tracking-wider shrink-0 pt-1" style={{ color: AGENT_COLORS[msg.agent] ?? '#00d4ff' }}>
                [{msg.agent.toUpperCase()}]
              </div>
            )}
            <div
              className={`text-[12px] leading-relaxed max-w-[75%] px-3 py-1.5 rounded ${msg.role === 'user' ? 'bg-cyan-900/30 text-cyan-200 text-right' : 'bg-white/5 text-white/80'}`}
              style={msg.role === 'assistant' ? { borderLeft: `2px solid ${AGENT_COLORS[msg.agent] ?? '#00d4ff'}` } : {}}
            >
              <pre className="whitespace-pre-wrap font-mono text-[12px]">{msg.content}</pre>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="text-[11px] font-bold tracking-wider text-cyan-400">[JARVIS]</div>
            <div className="text-[12px] text-white/40 flex gap-1 pt-1">
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
          <button key={qc.label} onClick={() => send(qc.command)}
            className="text-[10px] tracking-wider px-2 py-0.5 border border-cyan-900/50 text-cyan-500/60 hover:text-cyan-300 hover:border-cyan-600 transition-colors uppercase">
            {qc.label}
          </button>
        ))}
      </div>

      {/* Hidden file input */}
      <input ref={imageInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }} />

      {/* Input row */}
      <div className="px-4 pb-3 flex gap-2 items-stretch">
        <div className="flex-1 flex items-center border border-cyan-800/50 bg-black/40 px-3">
          <span className="text-cyan-500/50 text-[11px] mr-2 font-mono">{'>'}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
            placeholder={listening ? '🎙 Listening for "Hey Jarvis"...' : 'Type or say "Hey Jarvis"...'}
            className="flex-1 bg-transparent text-[13px] text-cyan-200 placeholder:text-cyan-800/60 outline-none font-mono py-2"
            disabled={loading}
            autoFocus
          />
        </div>

        <button onClick={() => imageInputRef.current?.click()} disabled={analyzingImage}
          className={`px-3 border transition-colors flex items-center gap-1.5 ${analyzingImage ? 'border-yellow-500/70 text-yellow-400 bg-yellow-900/20 animate-pulse' : 'border-cyan-700/50 text-cyan-500 hover:border-cyan-500 hover:text-cyan-300 bg-black/40'}`}
          title="Upload photo, PDF, or doc">
          <Camera size={14} />
          <span className="text-[10px] font-mono tracking-wider">FILE</span>
        </button>

        {speaking && (
          <button onClick={() => { currentAudioRef.current?.pause(); currentAudioRef.current = null; setSpeaking(false); micMutedRef.current = false; startRecognition() }}
            className="px-3 border border-red-500/70 text-red-400 bg-red-900/20 animate-pulse transition-colors"
            title="Stop Jarvis">
            <Square size={14} />
          </button>
        )}

        <button onClick={() => { setVoiceEnabled(v => !v); voiceEnabledRef.current = !voiceEnabledRef.current }}
          className={`px-3 border transition-colors ${voiceEnabled ? 'border-cyan-700/50 text-cyan-400 bg-black/40' : 'border-white/10 text-white/20 bg-black/40'}`}
          title={voiceEnabled ? 'Mute Jarvis' : 'Unmute Jarvis'}>
          {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>

        <button onClick={toggleMic}
          className={`px-3 border transition-colors ${triggered ? 'border-cyan-300 text-cyan-200 bg-cyan-900/50 animate-pulse' : listening ? 'border-green-500 text-green-400 bg-green-900/20' : 'border-cyan-700/50 text-cyan-500 hover:border-cyan-500 bg-black/40'}`}
          title={listening ? 'Mic on — say "Hey Jarvis"' : 'Mic off'}>
          {listening ? <Mic size={14} /> : <MicOff size={14} />}
        </button>

        <button onClick={() => send(input)} disabled={loading || !input.trim()}
          className="px-4 text-[12px] font-bold tracking-widest bg-cyan-900/30 border border-cyan-700/50 text-cyan-400 hover:bg-cyan-800/40 disabled:opacity-30 transition-colors uppercase">
          Send
        </button>
      </div>
    </div>
  )
}
