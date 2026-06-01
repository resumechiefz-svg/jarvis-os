'use client'
/**
 * Jarvis Greeting — speaks first on open, once per day
 * Pulls morning brief and delivers via ElevenLabs voice
 * Also shows predictive suggestions
 */
import { useEffect, useState, useRef } from 'react'
import { voiceState } from '@/lib/voice-state'

interface Suggestion {
  text: string
  action?: string
  priority: 'high' | 'medium' | 'low'
}

interface Props {
  onSuggestionClick: (text: string) => void
}

export default function JarvisGreeting({ onSuggestionClick }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [greeted, setGreeted] = useState(false)
  const hasGreeted = useRef(false)

  useEffect(() => {
    // Only greet once per session (not per day — too annoying)
    if (hasGreeted.current) return
    hasGreeted.current = true

    const greetAndBrief = async () => {
      try {
        // 1. Get predictive suggestions (non-blocking)
        fetch('/api/predictive').then(r => r.json()).then(d => setSuggestions(d.suggestions ?? [])).catch(() => {})

        // 2. Check what's genuinely new since last greeting
        const lastGreeting = sessionStorage.getItem('jarvis_last_greeting')
        const lastGreetingTime = sessionStorage.getItem('jarvis_last_greeting_time')
        const minutesSinceLast = lastGreetingTime
          ? Math.floor((Date.now() - parseInt(lastGreetingTime)) / 60000)
          : 9999

        // Ask Jarvis to be human and contextual — not a robot report
        const prompt = minutesSinceLast < 30
          ? `AB just came back. Last time you said: "${lastGreeting ?? 'nothing'}". That was ${minutesSinceLast} minutes ago. Give a ONE sentence natural acknowledgment — vary it, be human, don't repeat yourself. Only mention something if it genuinely changed. Examples: "Back already?" or "Welcome back." or just nothing notable. Max 10 words. No portfolio recaps unless something actually changed significantly.`
          : `AB just opened Jarvis. Time: ${getTimeOfDay()}. Give a ONE sentence warm, human, varied greeting. Do NOT give a stock/portfolio update unless there's something urgent (>2% move). Do NOT be robotic or repeat a template. Be natural — like a trusted colleague who knows him well. Examples: "Good to see you, AB." or "What are we working on?" or "Morning — anything urgent?" Max 12 words. Vary it every time.`

        const briefRes = await fetch('/api/jarvis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: prompt, history: [] }),
        })
        const briefData = await briefRes.json()
        const greetingText = (briefData.message ?? '').split('.')[0].trim()

        if (!greetingText || greetingText.length < 3) return

        // Save so next greeting knows what was said
        sessionStorage.setItem('jarvis_last_greeting', greetingText)
        sessionStorage.setItem('jarvis_last_greeting_time', Date.now().toString())

        // 3. Speak it
        const audioRes = await fetch('/api/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: greetingText, agent: 'jarvis' }),
        })

        if (audioRes.ok) {
          const audioBlob = await audioRes.blob()
          const audioUrl = URL.createObjectURL(audioBlob)
          const audio = new Audio(audioUrl)
          audio.onended = () => URL.revokeObjectURL(audioUrl)
          await voiceState.playAudio(audio)
        }

        setGreeted(true)
      } catch { /* silent fail */ }
    }

    // Small delay so UI loads first
    setTimeout(greetAndBrief, 1500)
  }, [])

  if (suggestions.length === 0) return null

  return (
    <div className="px-4 py-2 flex gap-2 flex-wrap border-b border-cyan-900/20">
      {suggestions.slice(0, 3).map((s, i) => (
        <button
          key={i}
          onClick={() => onSuggestionClick(s.text)}
          className={`text-[9px] px-3 py-1 border rounded-full font-mono tracking-wide transition-colors hover:text-cyan-200 ${
            s.priority === 'high'
              ? 'border-cyan-500/40 text-cyan-400/70 hover:border-cyan-400'
              : 'border-white/10 text-white/30 hover:border-white/20'
          }`}
        >
          {s.text}
        </button>
      ))}
    </div>
  )
}

function getTimeOfDay(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
