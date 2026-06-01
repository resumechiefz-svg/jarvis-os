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
        // 1. Get predictive suggestions
        const sugRes = await fetch('/api/predictive')
        const sugData = await sugRes.json()
        setSuggestions(sugData.suggestions ?? [])

        // 2. Get morning brief text
        const briefRes = await fetch('/api/jarvis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Give me a 2-sentence status: portfolio P&L today, and one thing I should know right now. Be direct, no greetings.', history: [] }),
        })
        const briefData = await briefRes.json()
        const briefText = briefData.message ?? ''

        if (!briefText) return

        // 3. Speak it via ElevenLabs
        const greeting = `Good ${getTimeOfDay()}, AB. ${briefText}`
        const audioRes = await fetch('/api/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: greeting, agent: 'jarvis' }),
        })

        if (audioRes.ok) {
          const audioBlob = await audioRes.blob()
          const audioUrl = URL.createObjectURL(audioBlob)
          const audio = new Audio(audioUrl)
          audio.onended = () => URL.revokeObjectURL(audioUrl)
          // Only play if AB isn't already speaking
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
