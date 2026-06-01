'use client'
/**
 * Voice Interrupt — Jarvis speaks proactively without being asked
 * Polls for urgent alerts and speaks them via ElevenLabs
 * Runs in background on both desktop and mobile
 */
import { useEffect, useRef } from 'react'

interface Props {
  onMessage?: (text: string) => void
}

export default function VoiceInterrupt({ onMessage }: Props) {
  const lastAlertRef = useRef<string>('')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const checkForAlerts = async () => {
      try {
        // Check for any new high-priority proactive alerts
        const res = await fetch('/api/proactive', { method: 'POST' })
        const data = await res.json()
        const alerts: string[] = data.alerts ?? []

        for (const alert of alerts) {
          // Don't repeat same alert
          if (alert === lastAlertRef.current) continue
          lastAlertRef.current = alert

          // Show in chat
          onMessage?.(alert)

          // Speak it via ElevenLabs
          const audioRes = await fetch('/api/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: alert.replace(/[*_~`]/g, ''), // strip markdown
              agent: 'jarvis',
            }),
          })

          if (audioRes.ok) {
            const blob = await audioRes.blob()
            const url = URL.createObjectURL(blob)
            const audio = new Audio(url)
            audio.play().catch(() => {})
            audio.onended = () => URL.revokeObjectURL(url)
          }

          // Only speak one alert at a time
          break
        }
      } catch { /* silent */ }
    }

    // Check every 15 minutes
    intervalRef.current = setInterval(checkForAlerts, 15 * 60 * 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [onMessage])

  return null // invisible background component
}
