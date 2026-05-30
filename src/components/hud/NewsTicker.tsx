'use client'

import { useEffect, useRef, useState } from 'react'
import type { NewsItem } from '@/lib/types'

export default function NewsTicker() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [offset, setOffset] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const speedRef = useRef(0.6)

  useEffect(() => {
    fetch('/api/news')
      .then(r => r.json())
      .then(setNews)
      .catch(() => {})

    const interval = setInterval(() => {
      fetch('/api/news').then(r => r.json()).then(setNews).catch(() => {})
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el || news.length === 0) return

    const total = el.scrollWidth / 2

    function tick() {
      setOffset(prev => {
        const next = prev + speedRef.current
        return next >= total ? 0 : next
      })
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [news])

  const tickerText = news
    .map(n => `${n.source.toUpperCase()} — ${n.headline}`)
    .join('     ◆     ')

  return (
    <div className="ticker-bar overflow-hidden border-b border-cyan-900/40 bg-black/60 backdrop-blur-sm">
      <div className="flex items-center h-full px-3 gap-3">
        <span className="text-[10px] font-bold text-cyan-400 tracking-widest shrink-0 border-r border-cyan-800 pr-3">
          LIVE
        </span>
        <div className="overflow-hidden flex-1">
          <div
            ref={containerRef}
            className="flex whitespace-nowrap"
            style={{ transform: `translateX(-${offset}px)` }}
          >
            <span className="text-[11px] text-cyan-300/80 tracking-wide pr-16">
              {tickerText}
            </span>
            <span className="text-[11px] text-cyan-300/80 tracking-wide pr-16" aria-hidden>
              {tickerText}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
