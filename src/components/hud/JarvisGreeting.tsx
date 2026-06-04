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

        // 2. Check timing and morning brief status
        const lastGreeting = sessionStorage.getItem('jarvis_last_greeting')
        const lastGreetingTime = sessionStorage.getItem('jarvis_last_greeting_time')
        const lastMorningBriefDate = sessionStorage.getItem('jarvis_morning_brief_date')
        const minutesSinceLast = lastGreetingTime
          ? Math.floor((Date.now() - parseInt(lastGreetingTime)) / 60000)
          : 9999

        const hour = new Date().getHours()
        const todayDate = new Date().toDateString()
        const isMorning = hour >= 5 && hour < 11
        const morningBriefDoneToday = lastMorningBriefDate === todayDate

        // 3. MORNING BRIEF — auto-plays if it's morning and hasn't fired today
        if (isMorning && !morningBriefDoneToday && minutesSinceLast > 60) {
          sessionStorage.setItem('jarvis_morning_brief_date', todayDate)

          const briefRes = await fetch('/api/morning-brief')
          const briefData = await briefRes.json() as {
            greeting?: string; portfolio?: string; news?: string[]
            rc?: string; cards?: string; training?: string; topPriority?: string
          }

          // Spoken brief — conversational, hits the essentials, under 90 seconds
          const parts = [
            briefData.greeting ?? `Good morning.`,
            briefData.portfolio,
            briefData.rc,
            briefData.cards,
            briefData.news?.[0] ? `Top story: ${briefData.news[0]}` : null,
            briefData.topPriority ? `Today's focus: ${briefData.topPriority}` : null,
          ].filter(Boolean)

          const spoken = parts.join(' ')
          if (spoken.length > 10) {
            // Speak the full morning brief via ElevenLabs
            fetch('/api/speak', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: spoken, agent: 'jarvis', autoPlay: true }),
            }).catch(() => {})
          }

          sessionStorage.setItem('jarvis_last_greeting', spoken.slice(0, 100))
          sessionStorage.setItem('jarvis_last_greeting_time', Date.now().toString())
          setGreeted(true)
          return
        }

        // 4. Regular greeting for non-morning opens
        const prompt = minutesSinceLast < 30
          ? `AB just came back. Last said: "${lastGreeting ?? 'nothing'}". ${minutesSinceLast}min ago. ONE natural sentence. Max 10 words.`
          : `AB opened Jarvis. ${getTimeOfDay()}. ONE warm, varied, human greeting. Not robotic. Max 12 words.`

        const res = await fetch('/api/jarvis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: prompt, history: [] }),
        })
        const data = await res.json() as { message?: string }
        const greetingText = (data.message ?? '').split('.')[0].trim()
        if (!greetingText || greetingText.length < 3) return

        sessionStorage.setItem('jarvis_last_greeting', greetingText)
        sessionStorage.setItem('jarvis_last_greeting_time', Date.now().toString())
        setGreeted(true)
      } catch { /* silent fail */ }
    }

    // 2s delay so UI loads first, then Jarvis speaks
    setTimeout(greetAndBrief, 2000)
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
