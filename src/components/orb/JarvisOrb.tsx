'use client'

import { useEffect, useRef } from 'react'

interface Props {
  active: boolean
  agentColor?: string
  amplitude?: number
}

export default function JarvisOrb({ active, agentColor = '#00d4ff', amplitude = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)
  const timeRef = useRef(0)
  const ampRef = useRef(0)

  useEffect(() => { ampRef.current = amplitude }, [amplitude])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height

    type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }
    const particles: Particle[] = []

    // Inverted triangle geometry
    const cx = W / 2
    const topY = H * 0.05
    const scale = W * 0.88
    const botY = topY + H * 0.88

    const TL = { x: cx - scale / 2, y: topY }
    const TR = { x: cx + scale / 2, y: topY }
    const BOT = { x: cx, y: botY }

    function randomEdgePoint(): { x: number; y: number; nx: number; ny: number } {
      const edge = Math.floor(Math.random() * 3)
      const t = Math.random()
      if (edge === 0) { // top
        return { x: TL.x + t * (TR.x - TL.x), y: topY, nx: 0, ny: -1 }
      } else if (edge === 1) { // left
        const dx = BOT.x - TL.x, dy = BOT.y - TL.y, len = Math.sqrt(dx*dx+dy*dy)
        return { x: TL.x + t * dx, y: TL.y + t * dy, nx: -dy/len, ny: dx/len }
      } else { // right
        const dx = TR.x - BOT.x, dy = topY - BOT.y, len = Math.sqrt(dx*dx+dy*dy)
        return { x: BOT.x + t * dx, y: BOT.y + t * dy, nx: dy/len, ny: -dx/len }
      }
    }

    function spawnParticle() {
      const { x, y, nx, ny } = randomEdgePoint()
      const speed = (0.4 + Math.random() * 1.0) * (1 + ampRef.current * 4)
      particles.push({ x, y, vx: nx * speed + (Math.random()-0.5)*0.4, vy: ny * speed + (Math.random()-0.5)*0.4, life: 0, maxLife: 35 + Math.random() * 55, size: 0.6 + Math.random() * 2.2 })
    }

    const hex = agentColor.replace('#','')
    const r = parseInt(hex.slice(0,2),16)
    const g = parseInt(hex.slice(2,4),16)
    const b = parseInt(hex.slice(4,6),16)
    const rgb = `${r},${g},${b}`

    function draw() {
      timeRef.current += 0.016
      const t = timeRef.current
      const pulse = active ? 0.55 + 0.45 * Math.sin(t * 3.5) + ampRef.current * 0.6 : 0.25 + 0.08 * Math.sin(t * 0.9)
      const glowR = active ? 28 + 16 * Math.sin(t * 2.8) + ampRef.current * 35 : 10 + 3 * Math.sin(t * 0.7)

      ctx.clearRect(0, 0, W, H)

      // Ambient glow
      const radial = ctx.createRadialGradient(cx, (topY+botY)/2, 20, cx, (topY+botY)/2, glowR * 4)
      radial.addColorStop(0, `rgba(${rgb},${pulse * 0.1})`)
      radial.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = radial
      ctx.fillRect(0, 0, W, H)

      // Triangle fill (very subtle)
      ctx.beginPath()
      ctx.moveTo(TL.x, TL.y); ctx.lineTo(TR.x, TR.y); ctx.lineTo(BOT.x, BOT.y); ctx.closePath()
      ctx.fillStyle = `rgba(${rgb},${0.03 + pulse * 0.04})`
      ctx.fill()

      // Triangle edge glow
      ctx.beginPath()
      ctx.moveTo(TL.x, TL.y); ctx.lineTo(TR.x, TR.y); ctx.lineTo(BOT.x, BOT.y); ctx.closePath()
      ctx.shadowColor = agentColor
      ctx.shadowBlur = glowR
      ctx.strokeStyle = `rgba(${rgb},${0.35 + pulse * 0.4})`
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.shadowBlur = 0

      // Spawn particles
      const rate = active ? 2 + Math.floor(ampRef.current * 10) : 1
      for (let i = 0; i < rate; i++) if (Math.random() < 0.5) spawnParticle()

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx; p.y += p.vy; p.vy -= 0.008; p.life++
        if (p.life >= p.maxLife) { particles.splice(i, 1); continue }
        const alpha = (1 - p.life / p.maxLife) * 0.9
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1 - p.life / p.maxLife * 0.5), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb},${alpha})`
        ctx.shadowColor = agentColor
        ctx.shadowBlur = 5
        ctx.fill()
        ctx.shadowBlur = 0
      }

      frameRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(frameRef.current)
  }, [active, agentColor])

  const hex = agentColor.replace('#','')
  const r = parseInt(hex.slice(0,2),16)
  const g = parseInt(hex.slice(2,4),16)
  const b = parseInt(hex.slice(4,6),16)

  return (
    <div style={{ position: 'relative', width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        width={300}
        height={300}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />

      {/* SVG Jarvis Logo — NPA triangle adapted, "NEW PURPOSE APPAREL" removed */}
      <svg
        viewBox="0 0 300 280"
        width={260}
        height={260}
        style={{
          position: 'relative', zIndex: 1,
          filter: active
            ? `drop-shadow(0 0 20px rgba(${r},${g},${b},0.9)) drop-shadow(0 0 40px rgba(${r},${g},${b},0.4))`
            : `drop-shadow(0 0 8px rgba(${r},${g},${b},0.4))`,
          transition: 'filter 0.5s ease',
        }}
      >
        {/* Inverted triangle — white fill like the original NPA logo */}
        <polygon
          points="150,8 295,265 5,265"
          fill={`rgba(${r},${g},${b},0.08)`}
          stroke={`rgba(${r},${g},${b},${active ? 0.85 : 0.45})`}
          strokeWidth="1.5"
        />

        {/*
          Interior mark — the NPA "E/lightning" emblem:
          Three stepped horizontal bars forming a downward-pointing lightning shape,
          overlapping the right side of the triangle
        */}
        <g fill={`rgba(${r},${g},${b},${active ? 1 : 0.8})`}>
          {/* Top bar — widest */}
          <rect x="145" y="80" width="82" height="22" rx="2" transform="skewX(-8)" />
          {/* Middle bar — medium */}
          <rect x="135" y="116" width="64" height="20" rx="2" transform="skewX(-8)" />
          {/* Bottom point — narrows into the bolt tip */}
          <polygon points="126,150 183,150 162,200 140,200" transform="skewX(-4)" />
        </g>
      </svg>
    </div>
  )
}
