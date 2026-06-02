'use client'
/**
 * JarvisOrb v4 — Full power
 * Massive triangle with electric arcs, glowing core, particle storm
 * Pulses with speech amplitude in real time
 * Always alive — never static
 */
import { useEffect, useRef } from 'react'

interface Props {
  active: boolean
  agentColor?: string
  amplitude?: number
  size?: number
}

export default function JarvisOrb({ active, agentColor = '#00d4ff', amplitude = 0, size = 420 }: Props) {
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

    const outerR = W * 0.43
    const triR = W * 0.27

    // Triangle vertices — tip down (inverted)
    function verts(scale = 1) {
      return [
        { x: cx, y: cy + triR * scale },
        { x: cx - triR * scale * Math.sin(Math.PI / 3) * 1.18, y: cy - triR * scale * 0.52 },
        { x: cx + triR * scale * Math.sin(Math.PI / 3) * 1.18, y: cy - triR * scale * 0.52 },
      ]
    }

    // Particles inside triangle
    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; sz: number }
    const particles: P[] = []

    function isInTri(px: number, py: number, pts: ReturnType<typeof verts>) {
      const [A, B, C] = pts
      const d1 = (px - B.x) * (A.y - B.y) - (A.x - B.x) * (py - B.y)
      const d2 = (px - C.x) * (B.y - C.y) - (B.x - C.x) * (py - C.y)
      const d3 = (px - A.x) * (C.y - A.y) - (C.x - A.x) * (py - A.y)
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
    }

    function spawnP() {
      const pts = verts(0.82)
      const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x))
      const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y))
      let px = minX + Math.random() * (maxX - minX)
      let py = minY + Math.random() * (maxY - minY)
      if (!isInTri(px, py, pts)) { px = cx; py = cy }
      const spd = (0.3 + Math.random() * 1.2) * (1 + ampRef.current * 2)
      const angle = Math.random() * Math.PI * 2
      particles.push({ x: px, y: py, vx: Math.cos(angle) * spd * 0.25, vy: Math.sin(angle) * spd * 0.25 - spd * 0.15, life: 0, max: 50 + Math.random() * 70, sz: 0.5 + Math.random() * 1.8 })
    }

    // Lightning bolt between two points
    function lightning(x1: number, y1: number, x2: number, y2: number, chaos: number, depth: number) {
      if (depth <= 0) {
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        return
      }
      const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * chaos
      const my = (y1 + y2) / 2 + (Math.random() - 0.5) * chaos
      lightning(x1, y1, mx, my, chaos / 2, depth - 1)
      lightning(mx, my, x2, y2, chaos / 2, depth - 1)
    }

    const TICK_COUNT = 60
    const MAJOR = 8
    let scanAngle = -Math.PI / 2
    let innerScan = Math.PI / 2

    function draw() {
      timeRef.current += 0.016
      const t = timeRef.current
      const amp = ampRef.current

      scanAngle += active ? 0.022 + amp * 0.06 : 0.010
      innerScan -= active ? 0.015 : 0.007

      const breathe = active
        ? 0.65 + 0.35 * Math.sin(t * 5) + amp * 0.7
        : 0.22 + 0.18 * Math.sin(t * 1.1)
      const glow = active ? 50 + amp * 100 : 14

      ctx.clearRect(0, 0, W, H)

      // ── Deep ambient glow ──
      const amb = ctx.createRadialGradient(cx, cy, outerR * 0.1, cx, cy, outerR * 2)
      amb.addColorStop(0, `rgba(${rgb},${breathe * 0.12})`)
      amb.addColorStop(0.5, `rgba(${rgb},${breathe * 0.04})`)
      amb.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = amb; ctx.fillRect(0, 0, W, H)

      // ── Outer ring ──
      ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${rgb},${0.1 + breathe * 0.2})`
      ctx.lineWidth = 1.2; ctx.shadowColor = agentColor; ctx.shadowBlur = glow * 0.5
      ctx.stroke(); ctx.shadowBlur = 0

      // ── Tick marks ──
      for (let i = 0; i < TICK_COUNT; i++) {
        const a = (i / TICK_COUNT) * Math.PI * 2
        const major = i % MAJOR === 0
        const len = major ? 12 : 5
        const alpha = major ? 0.45 : 0.15
        const cos = Math.cos(a), sin = Math.sin(a)
        ctx.beginPath()
        ctx.moveTo(cx + cos * outerR, cy + sin * outerR)
        ctx.lineTo(cx + cos * (outerR - len), cy + sin * (outerR - len))
        ctx.strokeStyle = `rgba(${rgb},${alpha})`
        ctx.lineWidth = major ? 1.5 : 0.8; ctx.stroke()
      }

      // ── Scanner arc ──
      const sweepLen = active ? Math.PI * 0.55 : Math.PI * 0.3
      ctx.beginPath(); ctx.arc(cx, cy, outerR, scanAngle - sweepLen, scanAngle)
      ctx.strokeStyle = `rgba(${rgb},${0.55 + breathe * 0.45})`
      ctx.lineWidth = active ? 3 : 1.8; ctx.shadowColor = agentColor; ctx.shadowBlur = active ? 16 : 6; ctx.stroke(); ctx.shadowBlur = 0
      const sdx = cx + Math.cos(scanAngle) * outerR, sdy = cy + Math.sin(scanAngle) * outerR
      ctx.beginPath(); ctx.arc(sdx, sdy, active ? 5 : 3, 0, Math.PI * 2)
      ctx.fillStyle = agentColor; ctx.shadowColor = agentColor; ctx.shadowBlur = 20; ctx.fill(); ctx.shadowBlur = 0

      // ── Inner rotating segment ──
      ctx.setLineDash([5, 8])
      ctx.beginPath(); ctx.arc(cx, cy, outerR * 0.85, innerScan, innerScan + Math.PI * 0.3)
      ctx.strokeStyle = `rgba(${rgb},${0.2 + breathe * 0.2})`; ctx.lineWidth = 1; ctx.stroke()
      ctx.setLineDash([])

      // ── Triangle fill ──
      const pts = verts()
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y); ctx.closePath()
      const fillGrad = ctx.createLinearGradient(cx, pts[1].y, cx, pts[0].y)
      fillGrad.addColorStop(0, `rgba(${rgb},${0.78 + breathe * 0.2})`)
      fillGrad.addColorStop(0.6, `rgba(${rgb},${0.45 + breathe * 0.15})`)
      fillGrad.addColorStop(1, `rgba(${rgb},${0.2 + breathe * 0.08})`)
      ctx.fillStyle = fillGrad; ctx.shadowColor = agentColor; ctx.shadowBlur = glow; ctx.fill()
      ctx.strokeStyle = `rgba(${rgb},${0.75 + breathe * 0.25})`
      ctx.lineWidth = active ? 2.8 : 2; ctx.shadowBlur = glow * 1.4; ctx.stroke(); ctx.shadowBlur = 0

      // ── Inner core glow ──
      const coreSize = (triR * 0.12) * (1 + breathe * 0.4 + amp * 0.6)
      const coreGrad = ctx.createRadialGradient(cx, cy - triR * 0.08, 0, cx, cy - triR * 0.08, coreSize * 3)
      coreGrad.addColorStop(0, `rgba(255,255,255,${0.7 + amp * 0.3})`)
      coreGrad.addColorStop(0.3, `rgba(${rgb},${0.9 + amp * 0.1})`)
      coreGrad.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = coreGrad; ctx.shadowColor = 'white'; ctx.shadowBlur = 30 + amp * 40
      ctx.beginPath(); ctx.arc(cx, cy - triR * 0.08, coreSize * 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0

      // ── Electric arcs when speaking ──
      if (amp > 0.15 || active) {
        const arcAlpha = Math.min(0.8, 0.2 + amp * 0.8)
        const arcPts = verts(0.95)
        for (let pair = 0; pair < 3; pair++) {
          if (Math.random() < 0.4 + amp * 0.5) {
            const p1 = arcPts[pair], p2 = arcPts[(pair + 1) % 3]
            ctx.beginPath(); ctx.strokeStyle = `rgba(${rgb},${arcAlpha})`; ctx.lineWidth = 0.8
            ctx.shadowColor = agentColor; ctx.shadowBlur = 12
            lightning(p1.x, p1.y, p2.x, p2.y, triR * (0.06 + amp * 0.12), 3)
            ctx.stroke(); ctx.shadowBlur = 0
          }
          // Arcs to core
          if (amp > 0.3 && Math.random() < amp * 0.4) {
            const p = arcPts[pair]
            ctx.beginPath(); ctx.strokeStyle = `rgba(255,255,255,${amp * 0.4})`; ctx.lineWidth = 0.5
            ctx.shadowBlur = 8; ctx.shadowColor = 'white'
            lightning(p.x, p.y, cx, cy - triR * 0.08, triR * 0.04, 2)
            ctx.stroke(); ctx.shadowBlur = 0
          }
        }
      }

      // ── Particles ──
      const rate = active ? 3 + Math.floor(amp * 8) : 2
      for (let i = 0; i < rate; i++) if (Math.random() < 0.7) spawnP()
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx; p.y += p.vy; p.vy -= 0.006; p.life++
        if (p.life >= p.max || !isInTri(p.x, p.y, verts(0.88))) { particles.splice(i, 1); continue }
        const a = (1 - p.life / p.max) * (active ? 0.9 : 0.55)
        ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb},${a})`; ctx.shadowColor = agentColor; ctx.shadowBlur = 4; ctx.fill(); ctx.shadowBlur = 0
      }

      // ── Pulse rings when speaking ──
      if (amp > 0.08 || active) {
        for (let ring = 0; ring < 4; ring++) {
          const phase = ((t * (active ? 1.8 : 0.8) + ring * 0.25) % 1)
          const rSize = outerR * 0.45 + phase * outerR * 1.1
          const alpha = (1 - phase) * (amp > 0.08 ? amp * 0.7 : 0.12)
          if (alpha > 0.01) {
            ctx.beginPath(); ctx.arc(cx, cy, rSize, 0, Math.PI * 2)
            ctx.strokeStyle = `rgba(${rgb},${alpha})`; ctx.lineWidth = 1.5; ctx.stroke()
          }
        }
      }

      // ── HUD corner brackets ──
      const bracketD = outerR * 1.12, bracketL = outerR * 0.22
      const ba = 0.12 + breathe * 0.1
      ;[[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        const bx = cx + sx * bracketD * 0.72, by = cy + sy * bracketD * 0.72
        ctx.strokeStyle = `rgba(${rgb},${ba})`; ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - sx * bracketL, by)
        ctx.moveTo(bx, by); ctx.lineTo(bx, by - sy * bracketL); ctx.stroke()
      })

      // ── Outer data arc labels (just decorative ticks at cardinal points) ──
      ;[0, 90, 180, 270].forEach(deg => {
        const a = (deg * Math.PI) / 180
        const dx = cx + Math.cos(a) * (outerR + 8), dy = cy + Math.sin(a) * (outerR + 8)
        ctx.beginPath(); ctx.arc(dx, dy, 2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb},${0.3 + breathe * 0.2})`; ctx.fill()
      })

      frameRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(frameRef.current)
  }, [active, agentColor])

  return (
    <canvas ref={canvasRef} width={size} height={size}
      style={{ width: size, height: size, display: 'block', filter: `drop-shadow(0 0 ${amplitude > 0.1 ? 40 : 20}px ${agentColor}40)` }} />
  )
}
