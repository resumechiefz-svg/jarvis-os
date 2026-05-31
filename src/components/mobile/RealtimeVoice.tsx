'use client'

/**
 * OpenAI Realtime Voice — push-to-talk for mobile Jarvis chat
 * Uses WebRTC + OpenAI Realtime API ephemeral session tokens
 * Jarvis voice: "echo" — deep, professional
 */
import { useState, useRef, useCallback, useEffect } from 'react'

type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'

interface Props {
  onTranscript: (text: string, role: 'user' | 'assistant', agent?: string) => void
  onStateChange?: (state: VoiceState) => void
}

export default function RealtimeVoice({ onTranscript, onStateChange }: Props) {
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState('')
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sessionActiveRef = useRef(false)

  const set = (s: VoiceState) => { setState(s); onStateChange?.(s) }

  const stopSession = useCallback(() => {
    sessionActiveRef.current = false
    dcRef.current?.close()
    pcRef.current?.close()
    streamRef.current?.getTracks().forEach(t => t.stop())
    dcRef.current = null
    pcRef.current = null
    streamRef.current = null
    set('idle')
  }, [])

  // Cleanup on unmount
  useEffect(() => () => stopSession(), [stopSession])

  const startSession = useCallback(async () => {
    if (sessionActiveRef.current) { stopSession(); return }

    try {
      set('connecting')
      setError('')

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

      // Play Jarvis audio responses
      pc.ontrack = e => {
        if (!audioRef.current) {
          audioRef.current = document.createElement('audio')
          audioRef.current.autoplay = true
        }
        audioRef.current.srcObject = e.streams[0]
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
            turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 600 },
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
              set('listening')
              break

            case 'input_audio_buffer.speech_stopped':
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
    idle:       { icon: '🎙️', label: 'Hold to Talk', bg: 'rgba(0,212,255,0.1)', border: '#00d4ff', pulse: false },
    connecting: { icon: '⟳',  label: 'Connecting...', bg: 'rgba(255,200,0,0.1)', border: '#ffc800', pulse: true },
    listening:  { icon: '🎙️', label: 'Listening', bg: 'rgba(0,255,136,0.15)', border: '#00ff88', pulse: true },
    thinking:   { icon: '⟳',  label: 'Thinking...', bg: 'rgba(0,212,255,0.1)', border: '#00d4ff', pulse: true },
    speaking:   { icon: '🔊', label: 'Jarvis Speaking', bg: 'rgba(168,85,247,0.15)', border: '#a855f7', pulse: true },
    error:      { icon: '⚠️', label: error || 'Error', bg: 'rgba(255,68,85,0.1)', border: '#ff4455', pulse: false },
  }

  const cfg = stateConfig[state]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <button
        onClick={state === 'idle' || state === 'error' ? startSession : stopSession}
        style={{
          width: 56, height: 56, borderRadius: '50%',
          background: cfg.bg,
          border: `1.5px solid ${cfg.border}`,
          fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: cfg.pulse ? 'voice-pulse 1.5s ease-in-out infinite' : 'none',
          transition: 'all 0.2s',
          flexShrink: 0,
        }}
        title={cfg.label}
      >
        {cfg.icon === '⟳'
          ? <span style={{ color: cfg.border, fontSize: 20, fontWeight: 700, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          : cfg.icon}
      </button>
      <span style={{ fontSize: 9, color: cfg.border, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {cfg.label}
      </span>
      <style>{`
        @keyframes voice-pulse {
          0%, 100% { box-shadow: 0 0 0 0 ${cfg.border}40; }
          50% { box-shadow: 0 0 0 10px ${cfg.border}00; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
