'use client'

import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Square, Camera, Radio } from 'lucide-react'
const RealtimeVoice = lazy(() => import('@/components/mobile/RealtimeVoice'))
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
  onAmplitude?: (val: number) => void
  messages: Message[]
}

const QUICK_COMMANDS = [
  { label: 'Morning Brief', command: 'Hey Jarvis, morning brief' },
  { label: 'RC Stats', command: 'Nova, give me the ResumeChiefz numbers' },
  { label: 'Beckett', command: 'Sage, Beckett status this week' },
  { label: 'CC Sales', command: 'Vault, how did Card Chiefz do this week?' },
  { label: 'Goals', command: 'Beacon, weekly accountability check' },
  { label: 'Money', command: 'Ledger, give me my financial snapshot' },
  { label: 'Strategy', command: 'Atlas, where am I on the 7-figure roadmap?' },
  { label: 'End of Day', command: 'Jarvis, let\'s debrief' },
  { label: 'New Ideas', command: 'Atlas, give me 3 business ideas I should build next' },
  { label: 'RC Acquisition', command: 'Atlas, how close is ResumeChiefz to being acquisition-ready?' },
]

// ElevenLabs voice with real-time amplitude analysis
async function speakElevenLabs(text: string, agent: string, onAmplitude?: (v: number) => void): Promise<() => void> {
  const res = await fetch('/api/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, agent }),
  })
  if (!res.ok) return () => {}

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)

  let animFrame = 0
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null

  if (onAmplitude) {
    audioCtx = new AudioContext()
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    const source = audioCtx.createMediaElementSource(audio)
    source.connect(analyser)
    analyser.connect(audioCtx.destination)

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      analyser!.getByteFrequencyData(dataArray)
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      onAmplitude(Math.min(1, avg / 80))
      animFrame = requestAnimationFrame(tick)
    }
    audio.onplay = () => tick()
  }

  audio.onended = () => {
    cancelAnimationFrame(animFrame)
    onAmplitude?.(0)
    URL.revokeObjectURL(url)
    audioCtx?.close()
  }

  audio.play()

  return () => {
    audio.pause()
    audio.currentTime = 0
    cancelAnimationFrame(animFrame)
    onAmplitude?.(0)
    URL.revokeObjectURL(url)
    audioCtx?.close()
  }
}

export default function CommandInterface({ onMessage, onAgentChange, onAmplitude, messages }: Props) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [listening, setListening] = useState(false)
  const [triggered, setTriggered] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [analyzingImage, setAnalyzingImage] = useState(false)
  const [realtimeOpen, setRealtimeOpen] = useState(true) // always-on by default
  const inputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const stopSpeakRef = useRef<(() => void) | null>(null)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])


  const send = useCallback(async (text: string) => {
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

      const reply = data.message ?? data.error ?? 'No response.'

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        agent,
        content: reply,
        timestamp: new Date(),
      }
      onMessage(botMsg)
      setHistory(h => [...h, { role: 'assistant', content: reply }])

      // Speak the response if voice is enabled
      if (voiceEnabled) {
        setSpeaking(true)
        speakElevenLabs(reply, agent, onAmplitude).then(stopFn => {
          stopSpeakRef.current = stopFn
          const wordCount = reply.split(' ').length
          const estimatedMs = (wordCount / 3) * 1000 + 1500
          setTimeout(() => {
            setSpeaking(false)
            onAmplitude?.(0)
          }, estimatedMs)
        })
      }

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
  }, [loading, history, voiceEnabled, onMessage, onAgentChange])

  const WAKE_WORDS = ['hey jarvis', 'jarvis', 'hey travis', 'hey garcia'] // fallback mishears

  const startWakeWordListener = useCallback(() => {
    if (typeof window === 'undefined') return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition

    if (!SR) return

    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.continuous = false

    recognition.onstart = () => setListening(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim()

      const wakeDetected = WAKE_WORDS.some(w => transcript.includes(w))

      if (wakeDetected) {
        // Strip the wake word and send the rest as the command
        let command = transcript
        for (const w of WAKE_WORDS) {
          command = command.replace(w, '').trim()
        }

        setTriggered(true)
        setTimeout(() => setTriggered(false), 2000)

        if (command.length > 1) {
          // Full command in same utterance e.g. "Hey Jarvis morning brief"
          send(command)
        }
        // If just wake word, do nothing — user will speak next
      } else if (transcript.length > 1) {
        // Regular spoken command (mic was manually triggered)
        send(transcript)
      }
    }

    recognition.onend = () => {
      // Only restart SpeechRecognition if Realtime voice is NOT active
      // Realtime handles all voice I/O when connected — running both causes dual audio
      restartTimerRef.current = setTimeout(() => {
        if (recognitionRef.current && !realtimeOpen) startWakeWordListener()
      }, 300)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setListening(false)
      }
      restartTimerRef.current = setTimeout(() => {
        if (recognitionRef.current && !realtimeOpen) startWakeWordListener()
      }, 1000)
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [send])

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
      onMessage({ id: (Date.now()+1).toString(), role: 'assistant', agent: 'vault', content: reply, timestamp: new Date() })
      onAgentChange('vault')
      if (voiceEnabled) {
        setSpeaking(true)
        speakElevenLabs(reply, 'vault', onAmplitude).then(stop => {
          stopSpeakRef.current = stop
          setTimeout(() => { setSpeaking(false); onAmplitude?.(0) }, (reply.split(' ').length / 3) * 1000 + 1500)
        })
      }
    } catch {
      onMessage({ id: (Date.now()+1).toString(), role: 'assistant', agent: 'jarvis', content: 'Vision error — check API.', timestamp: new Date() })
    } finally {
      setAnalyzingImage(false)
      setInput('')
    }
  }, [analyzingImage, input, onMessage, onAgentChange, voiceEnabled, onAmplitude])

  const toggleMic = useCallback(() => {
    if (listening) {
      recognitionRef.current = null
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      setListening(false)
    } else {
      // Don't start SpeechRecognition when Realtime is active — causes dual voice
      if (realtimeOpen) return
      startWakeWordListener()
    }
  }, [listening, realtimeOpen, startWakeWordListener])

  return (
    <div className="command-interface flex flex-col h-full">
      {/* Message history */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="flex items-center gap-3 py-1 select-none">
            <div className="text-[11px] text-cyan-500/30 tracking-widest uppercase">AB Command Center</div>
            <div className="text-[11px] text-white/10 tracking-widest">NOVA ● SAGE ● VAULT ● ECHO ● ATLAS ● 12 AGENTS ONLINE</div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {msg.role === 'assistant' && (
              <div
                className="text-[11px] font-bold tracking-wider shrink-0 pt-1"
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
          <button
            key={qc.label}
            onClick={() => send(qc.command)}
            className="text-[11px] tracking-wider px-2 py-0.5 border border-cyan-900/50 text-cyan-500/60 hover:text-cyan-300 hover:border-cyan-600 transition-colors uppercase"
          >
            {qc.label}
          </button>
        ))}
      </div>

      {/* Hidden file input — images, PDFs, docs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.txt,.csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }}
      />

      {/* Input row */}
      <div className="px-4 pb-3 flex gap-2 items-stretch">
        <div className="flex-1 flex items-center border border-cyan-800/50 bg-black/40 px-3">
          <span className="text-cyan-500/50 text-[12px] mr-2 font-mono">{'>'}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
            placeholder={listening ? 'Listening...' : 'Say anything to Jarvis...'}
            className="flex-1 bg-transparent text-[13px] text-cyan-200 placeholder:text-cyan-800 outline-none font-mono py-2"
            disabled={loading}
            autoFocus
          />
        </div>

        {/* File / photo upload */}
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={analyzingImage}
          className={`px-3 border transition-colors flex items-center gap-1.5 ${
            analyzingImage
              ? 'border-yellow-500/70 text-yellow-400 bg-yellow-900/20 animate-pulse'
              : 'border-cyan-700/50 text-cyan-500 hover:border-cyan-500 hover:text-cyan-300 bg-black/40'
          }`}
          title="Upload photo, PDF, or doc — card pricing, chart analysis, resume review"
        >
          <Camera size={14} />
          <span className="text-[11px] font-mono tracking-wider">FILE</span>
        </button>

        {/* Stop speaking button — only shows when Jarvis is talking */}
        {speaking && (
          <button
            onClick={() => {
              stopSpeakRef.current?.()
              stopSpeakRef.current = null
              setSpeaking(false)
            }}
            className="px-3 border border-red-500/70 text-red-400 bg-red-900/20 animate-pulse transition-colors hover:bg-red-900/40"
            title="Stop Jarvis"
          >
            <Square size={14} />
          </button>
        )}

        {/* Voice output toggle */}
        <button
          onClick={() => {
            setVoiceEnabled(v => !v)
            stopSpeakRef.current?.()
            stopSpeakRef.current = null
            setSpeaking(false)
          }}
          className={`px-3 border transition-colors ${
            voiceEnabled
              ? 'border-cyan-700/50 text-cyan-400 bg-black/40 hover:border-cyan-500'
              : 'border-white/10 text-white/20 bg-black/40'
          }`}
          title={voiceEnabled ? 'Mute Jarvis' : 'Unmute Jarvis'}
        >
          {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>

        {/* Realtime mic button — last in the row */}
        <Suspense fallback={null}>
          <RealtimeVoice
            hidden={false}
            inlineButton
            onTranscript={(text, role, agent) => {
              const msg = { id: Date.now().toString(), role, agent: (agent ?? 'jarvis') as import('@/lib/types').AgentName, content: text, timestamp: new Date() }
              onMessage(msg)
              if (agent) onAgentChange(agent as import('@/lib/types').AgentName)
            }}
          />
        </Suspense>

        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="px-4 text-[12px] font-bold tracking-widest bg-cyan-900/30 border border-cyan-700/50 text-cyan-400 hover:bg-cyan-800/40 disabled:opacity-30 transition-colors uppercase"
        >
          Send
        </button>
      </div>
    </div>
  )
}
