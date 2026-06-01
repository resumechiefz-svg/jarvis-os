'use client'

/**
 * OpenAI Realtime Voice — push-to-talk for mobile Jarvis chat
 * Uses WebRTC + OpenAI Realtime API ephemeral session tokens
 * Jarvis voice: "echo" — deep, professional
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { voiceState } from '@/lib/voice-state'

type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'

interface Props {
  onTranscript: (text: string, role: 'user' | 'assistant', agent?: string) => void
  onStateChange?: (state: VoiceState) => void
  autoStart?: boolean
  hidden?: boolean
  inlineButton?: boolean  // compact HUD button style instead of full mobile button
}

export default function RealtimeVoice({ onTranscript, onStateChange, autoStart, hidden, inlineButton }: Props) {
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState('')
  const [blockedBy, setBlockedBy] = useState<string | null>(null) // other device holding session
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sessionActiveRef = useRef(false)
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)

  // Stable device ID for this browser session
  const deviceId = useRef(
    typeof window !== 'undefined'
      ? (sessionStorage.getItem('jarvis_device_id') ?? (() => {
          const id = `${/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'}_${Date.now()}`
          sessionStorage.setItem('jarvis_device_id', id)
          return id
        })())
      : 'unknown'
  )
  const deviceType = /iPhone|iPad|iPod|Android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '') ? 'mobile' : 'desktop'

  const set = (s: VoiceState) => { setState(s); onStateChange?.(s) }

  const stopSession = useCallback(() => {
    sessionActiveRef.current = false
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    dcRef.current?.close()
    pcRef.current?.close()
    streamRef.current?.getTracks().forEach(t => t.stop())
    dcRef.current = null
    pcRef.current = null
    streamRef.current = null
    set('idle')
    // Release device session
    fetch('/api/device/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: deviceId.current }) }).catch(() => {})
  }, [])

  // Cleanup on unmount
  useEffect(() => () => stopSession(), [stopSession])

  // Auto-start if launched from Siri shortcut
  useEffect(() => { if (autoStart) startSession() }, [autoStart])

  const startSession = useCallback(async () => {
    if (sessionActiveRef.current) { stopSession(); return }

    try {
      set('connecting')
      setError('')
      setBlockedBy(null)

      // 0. Check device coordination — one active voice session at a time
      const coordRes = await fetch('/api/device/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId.current, deviceType }),
      }).then(r => r.json()).catch(() => ({ claimed: true }))

      if (!coordRes.claimed) {
        const otherType = coordRes.activeDevice?.deviceType ?? 'another device'
        setBlockedBy(otherType)
        set('idle')
        return
      }

      // Start heartbeat to hold session
      heartbeatRef.current = setInterval(() => {
        fetch('/api/device/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: deviceId.current }) })
          .then(r => r.json()).then(d => { if (!d.active) stopSession() }).catch(() => {})
      }, 30000)

      // 1. Get ephemeral session token from our API
      const tokenRes = await fetch('/api/voice/realtime')
      if (!tokenRes.ok) throw new Error('Could not get voice session token')
      const { ephemeralKey, model } = await tokenRes.json() as { ephemeralKey: string; model: string }

      // 2. Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // 3. Set up WebRTC peer connection
      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // Play Jarvis audio responses — registered so speech detection can stop it
      pc.ontrack = e => {
        if (!audioRef.current) {
          audioRef.current = document.createElement('audio')
          audioRef.current.autoplay = true
        }
        audioRef.current.srcObject = e.streams[0]
        voiceState.registerAudio(audioRef.current)
        set('speaking')
      }

      // Add mic track
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      // 4. Data channel for events (transcripts, state changes)
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onopen = () => {
        sessionActiveRef.current = true
        set('listening')

        // Configure the session
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: `You are Jarvis — AB's personal AI assistant and business partner.
AB runs ResumeChiefz (AI resume builder), Card Chiefz (eBay card store, 1400+ sales),
and TradePilot ($98k paper trading portfolio). Goal: financial independence by 40.
Training for Whitewater 50 Mile ultra October 2026.
Be direct, sharp, no fluff. You know his entire business context.
Speak conversationally — short answers unless detail is requested.`,
            voice: 'echo',
            turn_detection: {
              type: 'server_vad',
              threshold: 0.4,           // Sensitive — detects speech quickly
              silence_duration_ms: 1000, // Wait 1 full second of silence before responding
              prefix_padding_ms: 300,    // Capture speech start cleanly
              interrupt_response: true,  // Jarvis stops the moment AB starts talking
            },
            input_audio_transcription: { model: 'whisper-1' },
          },
        }))
      }

      dc.onmessage = e => {
        try {
          const event = JSON.parse(e.data) as {
            type: string
            transcript?: string
            delta?: string
            item?: { role?: string; content?: Array<{ transcript?: string; text?: string }> }
          }

          switch (event.type) {
            case 'input_audio_buffer.speech_started':
              // AB is speaking — kill all Jarvis audio immediately
              voiceState.setUserSpeaking(true)
              set('listening')
              break

            case 'input_audio_buffer.speech_stopped':
              // AB finished — Jarvis can respond
              voiceState.setUserSpeaking(false)
              set('thinking')
              break

            case 'conversation.item.input_audio_transcription.completed':
              if (event.transcript) {
                onTranscript(event.transcript, 'user')
              }
              break

            case 'response.audio_transcript.done':
              if (event.transcript) {
                onTranscript(event.transcript, 'assistant', 'jarvis')
                set('listening')
              }
              break

            case 'response.audio.started':
              set('speaking')
              break

            case 'error':
              console.error('[Realtime] Error:', event)
              set('error')
              setError('Voice error — tap to retry')
              break
          }
        } catch { /* ignore parse errors */ }
      }

      dc.onerror = () => { set('error'); setError('Connection error') }
      dc.onclose = () => { if (sessionActiveRef.current) stopSession() }

      // 5. Create WebRTC offer and connect to OpenAI Realtime
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${model}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })

      if (!sdpRes.ok) throw new Error(`OpenAI Realtime error: ${sdpRes.status}`)

      const answerSdp = await sdpRes.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

    } catch (err) {
      console.error('[Realtime]', err)
      set('error')
      setError(err instanceof Error ? err.message : 'Failed to start voice')
      stopSession()
    }
  }, [stopSession, onTranscript])

  const stateConfig = {
    idle:       { icon: '🎙️', label: 'Tap to Talk', bg: 'rgba(0,212,255,0.1)', border: '#00d4ff', pulse: false },
    connecting: { icon: '⟳',  label: 'Connecting...', bg: 'rgba(255,200,0,0.1)', border: '#ffc800', pulse: true },
    listening:  { icon: '🎙️', label: 'Listening...', bg: 'rgba(0,255,136,0.15)', border: '#00ff88', pulse: true },
    thinking:   { icon: '⟳',  label: 'Thinking...', bg: 'rgba(0,212,255,0.1)', border: '#00d4ff', pulse: true },
    speaking:   { icon: '🔊', label: 'Speaking', bg: 'rgba(168,85,247,0.15)', border: '#a855f7', pulse: true },
    error:      { icon: '⚠️', label: 'Tap to retry', bg: 'rgba(255,68,85,0.1)', border: '#ff4455', pulse: false },
  }

  const cfg = stateConfig[state]

  // Hidden mode — ambient dot in header, no button
  if (hidden) {
    // Blocked by another device — show takeover option
    if (blockedBy) {
      return (
        <span
          onClick={() => {
            fetch('/api/device/takeover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: deviceId.current, deviceType }) })
              .then(() => { setBlockedBy(null); startSession() }).catch(() => {})
          }}
          title={`${blockedBy} is active — tap to take over`}
          style={{ fontSize: 9, color: '#ffc800', cursor: 'pointer', letterSpacing: '0.05em' }}
        >
          TAKE OVER
        </span>
      )
    }

    const dotColor = state === 'listening' ? '#00ff88' : state === 'speaking' ? '#a855f7' : state === 'thinking' ? '#00d4ff' : state === 'error' ? '#ff4455' : '#ffffff22'
    return (
      <span
        onClick={state === 'error' ? startSession : undefined}
        title={cfg.label}
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: dotColor,
          display: 'inline-block', flexShrink: 0,
          boxShadow: state !== 'idle' && state !== 'connecting' ? `0 0 6px ${dotColor}` : 'none',
          animation: cfg.pulse ? 'voice-dot-pulse 1.5s ease-in-out infinite' : 'none',
          cursor: state === 'error' ? 'pointer' : 'default',
          transition: 'all 0.3s',
        }}
      >
        <style>{`
          @keyframes voice-dot-pulse {
            0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
          }
        `}</style>
      </span>
    )
  }

  // Inline HUD button — compact, fits in the input row
  if (inlineButton) {
    const borderColor = state === 'listening' ? '#00ff88' : state === 'speaking' ? '#a855f7' : state === 'thinking' || state === 'connecting' ? '#00d4ff' : state === 'error' ? '#ff4455' : 'rgba(0,212,255,0.3)'
    const textColor = state === 'listening' ? '#00ff88' : state === 'speaking' ? '#a855f7' : state === 'thinking' || state === 'connecting' ? '#00d4ff' : state === 'error' ? '#ff4455' : 'rgba(0,212,255,0.6)'
    const label = state === 'listening' ? 'LIVE' : state === 'speaking' ? 'SPEAKING' : state === 'thinking' ? 'THINKING' : state === 'connecting' ? 'CONNECTING' : state === 'error' ? 'RETRY' : 'MIC'
    return (
      <button
        onClick={state === 'idle' || state === 'error' ? startSession : stopSession}
        style={{
          padding: '0 12px', height: '100%', minHeight: 36,
          border: `1px solid ${borderColor}`,
          background: state !== 'idle' ? `${borderColor}18` : 'rgba(0,0,0,0.4)',
          color: textColor,
          fontSize: 9, letterSpacing: '0.15em', fontFamily: 'monospace',
          cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
          animation: cfg.pulse ? 'mic-pulse 1.5s ease-in-out infinite' : 'none',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
        title={cfg.label}
      >
        <style>{`@keyframes mic-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
        <span style={{ fontSize: 11 }}>{state === 'listening' ? '🎙️' : state === 'speaking' ? '🔊' : state === 'thinking' || state === 'connecting' ? '⟳' : state === 'error' ? '⚠️' : '🎙️'}</span>
        <span>{label}</span>
      </button>
    )
  }

  // Full button mode (mobile)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <button
        onClick={state === 'idle' || state === 'error' ? startSession : stopSession}
        style={{
          width: 56, height: 56, borderRadius: '50%',
          background: cfg.bg, border: `1.5px solid ${cfg.border}`,
          fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: cfg.pulse ? 'voice-pulse 1.5s ease-in-out infinite' : 'none',
          transition: 'all 0.2s', flexShrink: 0,
        }}
        title={cfg.label}
      >
        {cfg.icon === '⟳'
          ? <span style={{ color: cfg.border, fontSize: 20, fontWeight: 700, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          : cfg.icon}
      </button>
      <span style={{ fontSize: 9, color: cfg.border, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{cfg.label}</span>
      <style>{`
        @keyframes voice-pulse { 0%, 100% { box-shadow: 0 0 0 0 ${cfg.border}40; } 50% { box-shadow: 0 0 0 10px ${cfg.border}00; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
