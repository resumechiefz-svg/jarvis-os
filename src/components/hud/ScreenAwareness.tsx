'use client'
/**
 * Screen Awareness — Jarvis can see what's on your screen
 * Uses browser getDisplayMedia() to capture, Claude Vision to analyze
 * Runs passively, speaks observations when relevant
 */
import { useState, useRef, useCallback } from 'react'

interface Props {
  onInsight: (text: string) => void
}

export default function ScreenAwareness({ onInsight }: Props) {
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState('')
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const captureAndAnalyze = useCallback(async () => {
    if (!streamRef.current) return
    try {
      const track = streamRef.current.getVideoTracks()[0]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const capture = new (window as any).ImageCapture(track)
      const bitmap = await capture.grabFrame()

      // Convert to base64
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(bitmap.width, 1280)
      canvas.height = Math.min(bitmap.height, 720)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]

      // Send to vision API
      const res = await fetch('/api/vision/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      })

      if (res.ok) {
        const { insight } = await res.json()
        if (insight && insight !== 'nothing_notable') {
          onInsight(insight)
          // Speak it
          await fetch('/api/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: insight, agent: 'jarvis' }),
          }).then(r => r.blob()).then(blob => {
            const audio = new Audio(URL.createObjectURL(blob))
            audio.play().catch(() => {})
          }).catch(() => {})
        }
      }
    } catch { /* silent */ }
  }, [onInsight])

  const startScreenWatch = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
      })
      streamRef.current = stream
      setActive(true)
      setStatus('Watching screen')

      // Analyze every 30 seconds
      intervalRef.current = setInterval(captureAndAnalyze, 30000)

      stream.getTracks()[0].onended = () => {
        setActive(false)
        setStatus('')
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    } catch { /* user denied */ }
  }, [captureAndAnalyze])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (intervalRef.current) clearInterval(intervalRef.current)
    setActive(false)
    setStatus('')
  }, [])

  return (
    <button
      onClick={active ? stop : startScreenWatch}
      className={`px-3 border transition-colors text-[9px] font-mono tracking-widest ${
        active
          ? 'border-purple-500/60 text-purple-400 bg-purple-900/10 animate-pulse'
          : 'border-cyan-700/30 text-cyan-700 hover:border-cyan-500 hover:text-cyan-400 bg-black/20'
      }`}
      title={active ? 'Stop screen awareness' : 'Enable screen awareness — Jarvis sees your screen'}
    >
      {active ? '👁 WATCHING' : '👁 SCREEN'}
    </button>
  )
}
