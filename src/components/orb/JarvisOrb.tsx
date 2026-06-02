'use client'

/**
 * JarvisOrb — always-alive triangle with rotating tick ring and internal particles
 * Inspired by Iron Man HUD — never static, constantly breathing and moving
 */

import { useEffect, useRef } from 'react'

interface Props {
  active: boolean
  agentColor?: string
  amplitude?: number
  size?: number
}

export default function JarvisOrb({ active, agentColor = '#00d4ff', amplitude = 0, size = 300 }: Props) {
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

    const hex = agentColor.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const rgb = `${r},${g},${b}`

    const outerRingR = W * 0.44
    const innerRingR = W * 0.38
    const triR = W * 0.26  // triangle inscribed radius

    // Triangle points — equilateral, tip pointing DOWN
    function triPts(scale = 1) {
      return [
        { x: cx,                                            y: cy + triR * scale },       // bottom
        { x: cx - triR * scale * Math.sin(Math.PI / 3) * 1.15, y: cy - triR * scale * 0.5 }, // top-left
        { x: cx + triR * scale * Math.sin(Math.PI / 3) * 1.15, y: cy - triR * scale * 0.5 }, // top-right
      ]
    }

    // Internal particles — always swirling inside the triangle
    type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; speed: number }
    const particles: Particle[] = []

    function isInsideTriangle(px: number, py: number, pts: ReturnType<typeof triPts>): boolean {
      const [A, B, C] = pts
      const d1 = (px - B.x) * (A.y - B.y) - (A.x - B.x) * (py - B.y)
      const d2 = (px - C.x) * (B.y - C.y) - (B.x - C.x) * (py - C.y)
      const d3 = (px - A.x) * (C.y - A.y) - (C.x - A.x) * (py - A.y)
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0
      return !(hasNeg && hasPos)
    }

    function spawnParticle() {
      // Random point inside triangle bounding box, keep if inside
      const pts = triPts(0.85)
      const minX = Math.min(...pts.map(p => p.x))
      const maxX = Math.max(...pts.map(p => p.x))
      const minY = Math.min(...pts.map(p => p.y))
      const maxY = Math.max(...pts.map(p => p.y))
      let px = minX + Math.random() * (maxX - minX)
      let py = minY + Math.random() * (maxY - minY)
      if (!isInsideTriangle(px, py, pts)) { px = cx; py = cy }

      const speed = 0.2 + Math.random() * 0.8 + ampRef.current * 1.5
      const angle = Math.random() * Math.PI * 2
      particles.push({
        x: px, y: py,
        vx: Math.cos(angle) * speed * 0.3,
        vy: Math.sin(angle) * speed * 0.3 - speed * 0.2, // slight upward drift
        life: 0,
        maxLife: 60 + Math.random() * 80,
        size: 0.6 + Math.random() * 1.4,
        speed,
      })
    }

    // Tick marks config for outer ring
    const TICK_COUNT = 48
    const MAJOR_EVERY = 8

    // Rotating scanner line angle
    let scanAngle = 0
    let innerScanAngle = Math.PI

    function draw() {
      timeRef.current += 0.016
      const t = timeRef.current
      const amp = ampRef.current

      scanAngle += (active ? 0.025 + amp * 0.05 : 0.012)
      innerScanAngle -= (active ? 0.018 : 0.008)

      const breathe = active
        ? 0.6 + 0.4 * Math.sin(t * 4) + amp * 0.6
        : 0.25 + 0.15 * Math.sin(t * 1.2)
      const glowSize = active ? 35 + amp * 55 : 12

      ctx.clearRect(0, 0, W, H)

      // ── Outer ambient glow ──
      const amb = ctx.createRadialGradient(cx, cy, outerRingR * 0.2, cx, cy, outerRingR * 1.7)
      amb.addColorStop(0, `rgba(${rgb},${breathe * 0.07})`)
      amb.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = amb
      ctx.fillRect(0, 0, W, H)

      // ── Outer ring ──
      ctx.beginPath()
      ctx.arc(cx, cy, outerRingR, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${rgb},${0.12 + breathe * 0.18})`
      ctx.lineWidth = 1
      ctx.shadowColor = agentColor
      ctx.shadowBlur = glowSize * 0.35
      ctx.stroke()
      ctx.shadowBlur = 0

      // ── Tick marks on outer ring ──
      for (let i = 0; i < TICK_COUNT; i++) {
        const angle = (i / TICK_COUNT) * Math.PI * 2
        const isMajor = i % MAJOR_EVERY === 0
        const tickLen = isMajor ? 10 : 5
        const tickAlpha = isMajor ? 0.5 : 0.2

        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const x1 = cx + cos * outerRingR
        const y1 = cy + sin * outerRingR
        const x2 = cx + cos * (outerRingR - tickLen)
        const y2 = cy + sin * (outerRingR - tickLen)

        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.strokeStyle = `rgba(${rgb},${tickAlpha})`
        ctx.lineWidth = isMajor ? 1.5 : 0.8
        ctx.stroke()
      }

      // ── Rotating scanner sweep on outer ring ──
      const sweepLen = Math.PI * 0.4
      // Draw arc highlight on outer ring for scanner
      ctx.beginPath()
      ctx.arc(cx, cy, outerRingR, scanAngle - sweepLen, scanAngle)
      ctx.strokeStyle = `rgba(${rgb},${0.6 + breathe * 0.4})`
      ctx.lineWidth = 2
      ctx.shadowColor = agentColor
      ctx.shadowBlur = 8
      ctx.stroke()
      ctx.shadowBlur = 0

      // Scanner dot at head
      const sdx = cx + Math.cos(scanAngle) * outerRingR
      const sdy = cy + Math.sin(scanAngle) * outerRingR
      ctx.beginPath()
      ctx.arc(sdx, sdy, 3, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${rgb},1)`
      ctx.shadowColor = agentColor
      ctx.shadowBlur = 12
      ctx.fill()
      ctx.shadowBlur = 0

      // ── Inner dashed ring ──
      ctx.setLineDash([4, 6])
      ctx.beginPath()
      ctx.arc(cx, cy, innerRingR, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${rgb},${0.08 + breathe * 0.1})`
      ctx.lineWidth = 0.8
      ctx.stroke()
      ctx.setLineDash([])

      // Inner ring rotating segment
      ctx.beginPath()
      ctx.arc(cx, cy, innerRingR, innerScanAngle, innerScanAngle + Math.PI * 0.25)
      ctx.strokeStyle = `rgba(${rgb},${0.3 + breathe * 0.3})`
      ctx.lineWidth = 1.5
      ctx.stroke()

      // ── Triangle — solid fill with internal glow ──
      const pts = triPts()
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      ctx.lineTo(pts[1].x, pts[1].y)
      ctx.lineTo(pts[2].x, pts[2].y)
      ctx.closePath()

      const fillGrad = ctx.createLinearGradient(cx, pts[1].y, cx, pts[0].y)
      fillGrad.addColorStop(0, `rgba(${rgb},${0.72 + breathe * 0.22})`)
      fillGrad.addColorStop(0.5, `rgba(${rgb},${0.45 + breathe * 0.15})`)
      fillGrad.addColorStop(1, `rgba(${rgb},${0.25 + breathe * 0.1})`)
      ctx.fillStyle = fillGrad
      ctx.shadowColor = agentColor
      ctx.shadowBlur = active ? glowSize : glowSize * 0.6
      ctx.fill()

      ctx.strokeStyle = `rgba(${rgb},${0.7 + breathe * 0.3})`
      ctx.lineWidth = active ? 2.5 : 1.8
      ctx.shadowBlur = active ? glowSize * 1.2 : glowSize * 0.4
      ctx.stroke()
      ctx.shadowBlur = 0

      // ── Internal particles (always spawning) ──
      const spawnRate = active ? 3 + Math.floor(amp * 6) : 2
      for (let i = 0; i < spawnRate; i++) {
        if (Math.random() < 0.6) spawnParticle()
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.vy -= 0.005 // subtle upward drift
        p.life++
        if (p.life >= p.maxLife) { particles.splice(i, 1); continue }

        // Bounce off triangle edges (simplified — just fade near edges)
        if (!isInsideTriangle(p.x, p.y, triPts(0.9))) {
          particles.splice(i, 1)
          continue
        }

        const alpha = (1 - p.life / p.maxLife) * (active ? 0.9 : 0.5)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb},${alpha})`
        ctx.shadowColor = agentColor
        ctx.shadowBlur = 3
        ctx.fill()
        ctx.shadowBlur = 0
      }

      // ── Speaking pulse rings ──
      if (amp > 0.08) {
        for (let ring = 0; ring < 3; ring++) {
          const progress = ((t * 1.5 + ring * 0.33) % 1)
          const rSize = outerRingR * 0.5 + progress * outerRingR * 0.8
          const alpha = (1 - progress) * amp * 0.5
          ctx.beginPath()
          ctx.arc(cx, cy, rSize, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(${rgb},${alpha})`
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // ── Corner bracket accents (Iron Man HUD style) ──
      const bracketSize = outerRingR * 0.28
      const bracketDist = outerRingR * 1.08
      const bracketAlpha = 0.15 + breathe * 0.12
      ;[
        [-1, -1], [1, -1], [1, 1], [-1, 1]
      ].forEach(([sx, sy]) => {
        const bx = cx + sx * bracketDist * 0.7
        const by = cy + sy * bracketDist * 0.7
        ctx.strokeStyle = `rgba(${rgb},${bracketAlpha})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(bx + sx * bracketSize * -1, by)
        ctx.moveTo(bx, by)
        ctx.lineTo(bx, by + sy * bracketSize * -1)
        ctx.stroke()
      })

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
