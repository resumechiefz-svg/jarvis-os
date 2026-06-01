'use client'

/**
 * JarvisOrb — clean solid triangle with circle ring
 * Active: ring pulses, dots orbit, glow intensifies
 * Idle: slow breathe, minimal glow
 */

import { useEffect, useRef } from 'react'

interface Props {
  active: boolean
  agentColor?: string
  amplitude?: number
  size?: number
}

export default function JarvisOrb({ active, agentColor = '#00d4ff', amplitude = 0, size = 320 }: Props) {
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
    const cx = W / 2
    const cy = H / 2

    // Parse color
    const hex = agentColor.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const rgb = `${r},${g},${b}`

    const circleR = W * 0.42       // ring radius
    const triSize = W * 0.30       // triangle inscribed size

    // Triangle points — tip pointing DOWN (inverted, like the logo)
    // Equilateral triangle inscribed in a circle of radius triSize
    const triPoints = [
      { x: cx, y: cy + triSize },                                           // bottom tip
      { x: cx - triSize * Math.sin(Math.PI / 3) * 1.15, y: cy - triSize * 0.5 },  // top-left
      { x: cx + triSize * Math.sin(Math.PI / 3) * 1.15, y: cy - triSize * 0.5 },  // top-right
    ]

    // Orbiting dots config
    const NUM_DOTS = 6
    const dots = Array.from({ length: NUM_DOTS }, (_, i) => ({
      angle: (i / NUM_DOTS) * Math.PI * 2,
      speed: 0.008 + i * 0.001,
      radius: circleR,
      size: i % 2 === 0 ? 3 : 2,
    }))

    function draw() {
      timeRef.current += 0.016
      const t = timeRef.current
      const amp = ampRef.current

      // Pulse values
      const breathe = active
        ? 0.7 + 0.3 * Math.sin(t * 4) + amp * 0.5
        : 0.3 + 0.12 * Math.sin(t * 0.9)
      const glowSize = active ? 40 + amp * 60 : 15

      ctx.clearRect(0, 0, W, H)

      // ── Outer ambient glow ──
      const ambient = ctx.createRadialGradient(cx, cy, circleR * 0.3, cx, cy, circleR * 1.8)
      ambient.addColorStop(0, `rgba(${rgb},${breathe * 0.08})`)
      ambient.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = ambient
      ctx.fillRect(0, 0, W, H)

      // ── Circle ring ──
      ctx.beginPath()
      ctx.arc(cx, cy, circleR, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${rgb},${0.15 + breathe * 0.25})`
      ctx.lineWidth = 1
      ctx.shadowColor = agentColor
      ctx.shadowBlur = glowSize * 0.4
      ctx.stroke()
      ctx.shadowBlur = 0

      // ── Inner ring (tighter) ──
      ctx.beginPath()
      ctx.arc(cx, cy, circleR * 0.88, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${rgb},${0.06 + breathe * 0.08})`
      ctx.lineWidth = 0.5
      ctx.stroke()

      // ── Triangle — solid fill ──
      ctx.beginPath()
      ctx.moveTo(triPoints[0].x, triPoints[0].y)
      ctx.lineTo(triPoints[1].x, triPoints[1].y)
      ctx.lineTo(triPoints[2].x, triPoints[2].y)
      ctx.closePath()

      // Fill gradient — top brighter, fades to tip
      const fillGrad = ctx.createLinearGradient(cx, triPoints[1].y, cx, triPoints[0].y)
      fillGrad.addColorStop(0, `rgba(${rgb},${0.75 + breathe * 0.2})`)
      fillGrad.addColorStop(1, `rgba(${rgb},${0.35 + breathe * 0.1})`)
      ctx.fillStyle = fillGrad
      ctx.shadowColor = agentColor
      ctx.shadowBlur = active ? glowSize : glowSize * 0.5
      ctx.fill()

      // Triangle stroke
      ctx.strokeStyle = `rgba(${rgb},${0.6 + breathe * 0.4})`
      ctx.lineWidth = active ? 2.5 : 1.5
      ctx.shadowBlur = active ? glowSize * 1.2 : glowSize * 0.3
      ctx.stroke()
      ctx.shadowBlur = 0

      // ── Orbiting dots (only when active or speaking) ──
      if (active || amp > 0.05) {
        dots.forEach((dot, i) => {
          dot.angle += dot.speed * (1 + amp * 3)
          const dotR = dot.radius + Math.sin(t * 2 + i) * 4
          const dx = cx + Math.cos(dot.angle) * dotR
          const dy = cy + Math.sin(dot.angle) * dotR
          const alpha = 0.4 + 0.6 * Math.abs(Math.sin(dot.angle + t))

          ctx.beginPath()
          ctx.arc(dx, dy, dot.size * (1 + amp * 0.5), 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${rgb},${alpha})`
          ctx.shadowColor = agentColor
          ctx.shadowBlur = 8
          ctx.fill()
          ctx.shadowBlur = 0
        })
      } else {
        // Idle: just two slow dots at top-left and top-right of ring
        ;[Math.PI * 1.2, Math.PI * 1.8].forEach((angle, i) => {
          const a = angle + t * 0.15
          const dx = cx + Math.cos(a) * circleR
          const dy = cy + Math.sin(a) * circleR
          ctx.beginPath()
          ctx.arc(dx, dy, 2, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${rgb},${0.2 + 0.1 * Math.sin(t + i)})`
          ctx.fill()
        })
      }

      // ── Speaking pulse rings ──
      if (amp > 0.1) {
        for (let ring = 0; ring < 2; ring++) {
          const rSize = circleR + ring * 18 + (t * 40 + ring * 20) % 60
          const alpha = Math.max(0, 0.4 - (rSize - circleR) / 80) * amp
          ctx.beginPath()
          ctx.arc(cx, cy, rSize, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(${rgb},${alpha})`
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      frameRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(frameRef.current)
  }, [active, agentColor])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'block' }}
    />
  )
}
