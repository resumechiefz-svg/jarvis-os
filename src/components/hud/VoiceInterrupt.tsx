'use client'
/**
 * VoiceInterrupt — NO autonomous audio. Ever.
 * Agents only speak when called on or when Jarvis hands off to them.
 * This component just silently polls and shows alerts as text in chat.
 * ALL proactive audio is handled via Slack, not voice.
 */
import { useEffect, useRef } from 'react'

interface Props {
  onMessage?: (text: string) => void
}

export default function VoiceInterrupt({ onMessage }: Props) {
  const lastAlertRef = useRef<string>('')

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/proactive', { method: 'POST' })
        const data = await res.json()
        const alerts: string[] = data.alerts ?? []
        for (const alert of alerts) {
          if (alert === lastAlertRef.current) continue
          lastAlertRef.current = alert
          onMessage?.(alert) // text in chat only — zero audio
          break
        }
      } catch { /* silent */ }
    }

    const t = setInterval(check, 30 * 60 * 1000) // every 30 min, text only
    return () => clearInterval(t)
  }, [onMessage])

  return null
}
