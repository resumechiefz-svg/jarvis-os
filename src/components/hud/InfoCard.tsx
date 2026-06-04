'use client'
/**
 * InfoCard — floating HUD overlay for weather, news, and quick-pull data
 * Appears when Jarvis responds to "weather", "news", "pull up X" voice commands
 * Auto-dismisses after 12s, or voice "close it" / "got it" / tap to dismiss
 */
import { useEffect, useState, useCallback } from 'react'

interface WeatherData {
  location: string
  temp: number
  feelsLike: number
  condition: string
  emoji: string
  humidity: number
  wind: number
  high: number
  low: number
  tomorrow: { high: number; low: number; condition: string }
}

interface NewsItem {
  id: string
  headline: string
  source: string
  url?: string
}

type CardType = 'weather' | 'news' | null

interface Props {
  type: CardType
  onClose: () => void
}

const cyan = '#00d4ff'
const gold = '#c9a84c'

export default function InfoCard({ type, onClose }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(100)

  const dismiss = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 400)
  }, [onClose])

  // Fade in
  useEffect(() => { setTimeout(() => setVisible(true), 30) }, [])

  // Auto-dismiss after 14s with progress bar
  useEffect(() => {
    const total = 14000
    const tick = 100
    let elapsed = 0
    const t = setInterval(() => {
      elapsed += tick
      setProgress(100 - (elapsed / total) * 100)
      if (elapsed >= total) { clearInterval(t); dismiss() }
    }, tick)
    return () => clearInterval(t)
  }, [dismiss])

  // Fetch data
  useEffect(() => {
    if (type === 'weather') {
      fetch('/api/weather').then(r => r.json()).then(setWeather).catch(() => {})
    } else if (type === 'news') {
      fetch('/api/news').then(r => r.json()).then(d => Array.isArray(d) ? setNews(d.slice(0, 6)) : null).catch(() => {})
    }
  }, [type])

  if (!type) return null

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: `translate(-50%, -50%) scale(${visible ? 1 : 0.9})`,
        opacity: visible ? 1 : 0,
        transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 8888,
        cursor: 'pointer',
        width: type === 'weather' ? 380 : 480,
      }}
    >
      {/* Corner brackets */}
      {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos, i) => (
        <div key={i} style={{
          position: 'absolute', width: 14, height: 14, ...pos, zIndex: 1,
          borderTop: i < 2 ? `1.5px solid ${cyan}80` : 'none',
          borderBottom: i >= 2 ? `1.5px solid ${cyan}80` : 'none',
          borderLeft: i % 2 === 0 ? `1.5px solid ${cyan}80` : 'none',
          borderRight: i % 2 !== 0 ? `1.5px solid ${cyan}80` : 'none',
        }} />
      ))}

      <div style={{
        background: 'rgba(0,4,14,0.96)',
        border: `1px solid ${cyan}25`,
        backdropFilter: 'blur(20px)',
        padding: '18px 22px 14px',
        boxShadow: `0 0 40px ${cyan}10, 0 24px 60px rgba(0,0,0,0.6)`,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.25em', color: `${cyan}60` }}>
            {type === 'weather' ? 'WEATHER INTEL' : 'TOP HEADLINES'}
          </div>
          <div style={{ fontSize: 8, color: `${cyan}30`, letterSpacing: '0.1em' }}>TAP TO CLOSE</div>
        </div>

        {/* ── Weather card ── */}
        {type === 'weather' && (
          weather ? (
            <div>
              {/* Main temp row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 48, lineHeight: 1, filter: 'drop-shadow(0 0 12px rgba(0,212,255,0.3))' }}>
                  {weather.emoji}
                </div>
                <div>
                  <div style={{ fontSize: 42, fontWeight: 700, color: 'white', fontFamily: 'monospace', lineHeight: 1 }}>
                    {weather.temp}°
                  </div>
                  <div style={{ fontSize: 11, color: `rgba(255,255,255,0.5)`, marginTop: 2 }}>
                    {weather.condition}
                  </div>
                  <div style={{ fontSize: 10, color: `${cyan}70`, marginTop: 2 }}>
                    {weather.location}
                  </div>
                </div>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'FEELS', val: `${weather.feelsLike}°` },
                  { label: 'HIGH', val: `${weather.high}°` },
                  { label: 'LOW', val: `${weather.low}°` },
                  { label: 'HUMIDITY', val: `${weather.humidity}%` },
                ].map(({ label, val }) => (
                  <div key={label} style={{
                    background: 'rgba(0,212,255,0.05)',
                    border: `1px solid ${cyan}15`,
                    padding: '8px 6px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 7, color: `${cyan}50`, letterSpacing: '0.15em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Tomorrow */}
              <div style={{
                padding: '8px 12px',
                background: 'rgba(201,168,76,0.05)',
                border: `1px solid ${gold}20`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ fontSize: 8, color: `${gold}70`, letterSpacing: '0.15em' }}>TOMORROW</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{weather.tomorrow.condition}</div>
                <div style={{ fontSize: 11, color: gold, fontFamily: 'monospace', fontWeight: 700 }}>
                  {weather.tomorrow.high}° / {weather.tomorrow.low}°
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0', color: `${cyan}40`, fontSize: 10, letterSpacing: '0.2em' }}>
              LOADING...
            </div>
          )
        )}

        {/* ── News card ── */}
        {type === 'news' && (
          <div>
            {news.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: `${cyan}40`, fontSize: 10, letterSpacing: '0.2em' }}>
                LOADING...
              </div>
            ) : news.map((item, i) => (
              <div key={item.id} style={{
                display: 'flex', gap: 10, padding: '8px 0',
                borderBottom: i < news.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none',
                alignItems: 'flex-start',
              }}>
                <div style={{ fontSize: 9, color: `${cyan}40`, fontFamily: 'monospace', fontWeight: 700, minWidth: 14, paddingTop: 1 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4, marginBottom: 2 }}>
                    {item.headline}
                  </div>
                  <div style={{ fontSize: 8, color: `${cyan}40`, letterSpacing: '0.1em' }}>
                    {item.source}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Progress bar */}
        <div style={{ marginTop: 12, height: 1.5, background: 'rgba(255,255,255,0.04)' }}>
          <div style={{
            height: '100%', background: `linear-gradient(90deg, ${cyan}60, ${cyan})`,
            width: `${progress}%`, transition: 'width 0.1s linear',
            boxShadow: `0 0 6px ${cyan}60`,
          }} />
        </div>
      </div>
    </div>
  )
}
