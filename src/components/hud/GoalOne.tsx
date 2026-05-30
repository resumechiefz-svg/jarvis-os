'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  mrr: number
}

// Goal 1: $1,000 MRR
const GOAL_TARGET = 1000
const GOAL_LABEL = '$1,000 MRR'
const GOAL_DESCRIPTION = 'First $1K Month — ResumeChiefz'

function Particles({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height

    type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }
    const colors = ['#00d4ff', '#00ff88', '#c9a84c', '#a855f7', '#ffffff']
    const particles: Particle[] = Array.from({ length: 80 }, () => ({
      x: W / 2, y: H / 2,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2 + Math.random() * 4,
    }))

    function draw() {
      ctx.clearRect(0, 0, W, H)
      let alive = false
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.15
        p.life -= 0.018
        if (p.life <= 0) continue
        alive = true
        ctx.globalAlpha = p.life
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      if (alive) frameRef.current = requestAnimationFrame(draw)
    }
    frameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameRef.current)
  }, [active])

  if (!active) return null
  return <canvas ref={canvasRef} width={300} height={120} className="absolute inset-0 w-full h-full pointer-events-none" />
}

export default function GoalOne({ mrr }: Props) {
  const [achieved, setAchieved] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [pulseCount, setPulseCount] = useState(0)
  const pct = Math.min(100, (mrr / GOAL_TARGET) * 100)

  useEffect(() => {
    if (mrr >= GOAL_TARGET && !achieved) {
      setAchieved(true)
      setCelebrating(true)
      const t = setTimeout(() => setCelebrating(false), 4000)
      return () => clearTimeout(t)
    }
  }, [mrr, achieved])

  // Pulse effect when close
  useEffect(() => {
    if (pct >= 80 && pct < 100) {
      const t = setInterval(() => setPulseCount(c => c + 1), 2000)
      return () => clearInterval(t)
    }
  }, [pct])

  if (achieved) {
    return (
      <div className="relative w-full mx-auto text-center px-4 py-2 overflow-hidden">
        <Particles active={celebrating} />
        <div className="relative z-10">
          <div
            className="text-[11px] tracking-widest uppercase font-bold mb-1"
            style={{
              color: '#00ff88',
              textShadow: '0 0 20px #00ff88, 0 0 40px #00ff88',
              animation: 'pulse 1s ease-in-out infinite',
            }}
          >
            ✦ GOAL ACHIEVED ✦
          </div>
          <div className="text-[22px] font-bold tracking-wider" style={{ color: '#00ff88', textShadow: '0 0 30px #00ff88' }}>
            {GOAL_LABEL}
          </div>
          <div className="text-[9px] text-white/50 mt-1">{GOAL_DESCRIPTION}</div>
          <div className="text-[9px] text-green-400/60 tracking-widest mt-2">UNLOCKING GOAL 2...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-4 py-2">
      {/* Goal label */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-[8px] tracking-[0.25em] text-cyan-500/40 uppercase">Goal 1</div>
          <div className="text-[12px] font-bold text-cyan-300 tracking-wider">{GOAL_LABEL}</div>
        </div>
        <div className="text-right">
          <div className="text-[18px] font-mono font-bold" style={{ color: pct >= 80 ? '#c9a84c' : '#00d4ff' }}>
            {pct.toFixed(1)}%
          </div>
          <div className="text-[8px] text-white/30">${mrr.toFixed(0)} / ${GOAL_TARGET}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-1">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${pct}%`,
            background: pct >= 80
              ? 'linear-gradient(90deg, #c9a84c, #00ff88)'
              : 'linear-gradient(90deg, #00d4ff, #a855f7)',
            boxShadow: pulseCount % 2 === 0 ? '0 0 8px #00d4ff' : 'none',
          }}
        />
      </div>

      <div className="text-[8px] text-white/20">{GOAL_DESCRIPTION}</div>
    </div>
  )
}
