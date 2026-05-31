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

    // Inverted triangle geometry — tip at bottom center
    const cx = W / 2
    const pad = W * 0.08
    const topY = H * 0.06
    const botY = H * 0.90

    const TL = { x: pad, y: topY }
    const TR = { x: W - pad, y: topY }
    const BOT = { x: cx, y: botY }

    function randomEdgePoint(): { x: number; y: number; nx: number; ny: number } {
      const edge = Math.floor(Math.random() * 3)
      const t = Math.random()
      if (edge === 0) {
        // top edge
        return { x: TL.x + t * (TR.x - TL.x), y: topY, nx: 0, ny: -1 }
      } else if (edge === 1) {
        // left edge
        const dx = BOT.x - TL.x, dy = BOT.y - TL.y
        const len = Math.sqrt(dx * dx + dy * dy)
        return { x: TL.x + t * dx, y: TL.y + t * dy, nx: -dy / len, ny: dx / len }
      } else {
        // right edge
        const dx = BOT.x - TR.x, dy = BOT.y - TR.y
        const len = Math.sqrt(dx * dx + dy * dy)
        return { x: TR.x + t * dx, y: TR.y + t * dy, nx: dy / len, ny: -dx / len }
      }
    }

    function spawnParticle() {
      const { x, y, nx, ny } = randomEdgePoint()
      const speed = (0.3 + Math.random() * 0.9) * (1 + ampRef.current * 3)
      particles.push({
        x, y,
        vx: nx * speed + (Math.random() - 0.5) * 0.3,
        vy: ny * speed + (Math.random() - 0.5) * 0.3,
        life: 0,
        maxLife: 40 + Math.random() * 60,
        size: 0.5 + Math.random() * 1.8,
      })
    }

    const hex = agentColor.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const rgb = `${r},${g},${b}`

    function draw() {
      timeRef.current += 0.016
      const t = timeRef.current
      const pulse = active
        ? 0.6 + 0.4 * Math.sin(t * 3.5) + ampRef.current * 0.5
        : 0.2 + 0.08 * Math.sin(t * 0.8)
      const glowR = active
        ? 30 + 18 * Math.sin(t * 2.5) + ampRef.current * 40
        : 12 + 4 * Math.sin(t * 0.6)

      ctx.clearRect(0, 0, W, H)

      // Ambient center glow
      const midY = (topY + botY) / 2
      const radial = ctx.createRadialGradient(cx, midY, 10, cx, midY, glowR * 5)
      radial.addColorStop(0, `rgba(${rgb},${pulse * 0.12})`)
      radial.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = radial
      ctx.fillRect(0, 0, W, H)

      // Triangle solid fill — very subtle inner glow
      ctx.beginPath()
      ctx.moveTo(TL.x, TL.y)
      ctx.lineTo(TR.x, TR.y)
      ctx.lineTo(BOT.x, BOT.y)
      ctx.closePath()
      const innerGrad = ctx.createLinearGradient(cx, topY, cx, botY)
      innerGrad.addColorStop(0, `rgba(${rgb},${0.12 + pulse * 0.1})`)
      innerGrad.addColorStop(1, `rgba(${rgb},${0.01})`)
      ctx.fillStyle = innerGrad
      ctx.fill()

      // Triangle stroke — the NPA outline
      ctx.beginPath()
      ctx.moveTo(TL.x, TL.y)
      ctx.lineTo(TR.x, TR.y)
      ctx.lineTo(BOT.x, BOT.y)
      ctx.closePath()
      ctx.shadowColor = agentColor
      ctx.shadowBlur = glowR
      ctx.strokeStyle = `rgba(${rgb},${0.55 + pulse * 0.45})`
      ctx.lineWidth = active ? 2 : 1.5
      ctx.stroke()
      ctx.shadowBlur = 0

      // Spawn particles
      const rate = active ? 2 + Math.floor(ampRef.current * 8) : 1
      for (let i = 0; i < rate; i++) if (Math.random() < 0.45) spawnParticle()

      // Draw + update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.vy -= 0.007
        p.life++
        if (p.life >= p.maxLife) { particles.splice(i, 1); continue }
        const alpha = (1 - p.life / p.maxLife) * 0.85
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1 - (p.life / p.maxLife) * 0.4), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb},${alpha})`
        ctx.shadowColor = agentColor
        ctx.shadowBlur = 4
        ctx.fill()
        ctx.shadowBlur = 0
      }

      frameRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(frameRef.current)
  }, [active, agentColor])

  const hex = agentColor.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)

  return (
    <div style={{ position: 'relative', width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Particle + glow canvas */}
      <canvas
        ref={canvasRef}
        width={260}
        height={260}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />

      {/*
        NPA Logo — solid white inverted triangle with 3 black dashes cut into it.
        Uses SVG clipPath so the dashes are holes in the white shape, not separate elements.
      */}
      {/* Clean NPA inverted triangle — solid fill, glow edge, no interior marks */}
      <svg
        viewBox="0 0 260 250"
        width={240}
        height={240}
        style={{
          position: 'relative',
          zIndex: 1,
          filter: active
            ? `drop-shadow(0 0 24px rgba(${r},${g},${b},1)) drop-shadow(0 0 52px rgba(${r},${g},${b},0.45))`
            : `drop-shadow(0 0 10px rgba(${r},${g},${b},0.55))`,
          transition: 'filter 0.4s ease',
        }}
      >
        {/* Solid filled triangle — clean, no marks */}
        <polygon
          points="130,236 8,18 252,18"
          fill={`rgba(${r},${g},${b},${active ? 0.88 : 0.55})`}
          stroke={`rgba(${r},${g},${b},${active ? 1 : 0.7})`}
          strokeWidth="2"
          strokeLinejoin="miter"
        />
      </svg>
    </div>
  )
}
