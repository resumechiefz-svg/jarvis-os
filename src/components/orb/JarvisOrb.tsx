'use client'

import { useEffect, useRef } from 'react'

interface Props {
  active: boolean
  agentColor?: string
  amplitude?: number // 0-1, live audio level when speaking
}

export default function JarvisOrb({ active, agentColor, amplitude = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)
  const timeRef = useRef(0)
  const amplitudeRef = useRef(0)

  // Smooth amplitude changes
  useEffect(() => {
    amplitudeRef.current = amplitude
  }, [amplitude])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2
    const R = Math.min(W, H) * 0.38

    const BASE_COLOR = agentColor ?? '#00d4ff'
    const GOLD = '#c9a84c'
    const PARTICLES = 60

    type Particle = { angle: number; radius: number; speed: number; size: number; opacity: number; layer: number }
    const particles: Particle[] = Array.from({ length: PARTICLES }, (_, i) => ({
      angle: (i / PARTICLES) * Math.PI * 2,
      radius: R * (0.6 + Math.random() * 0.6),
      speed: 0.003 + Math.random() * 0.006,
      size: 1 + Math.random() * 2.5,
      opacity: 0.3 + Math.random() * 0.7,
      layer: Math.floor(Math.random() * 3),
    }))

    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return `${r},${g},${b}`
    }

    function draw(t: number) {
      ctx.clearRect(0, 0, W, H)

      // Outer glow rings
      for (let i = 3; i >= 1; i--) {
        const gradient = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * (1 + i * 0.35))
        gradient.addColorStop(0, `rgba(${hexToRgb(BASE_COLOR)},${0.08 / i})`)
        gradient.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(cx, cy, R * (1 + i * 0.35), 0, Math.PI * 2)
        ctx.fill()
      }

      // Sphere gradient
      const sphereGrad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.05, cx, cy, R)
      sphereGrad.addColorStop(0, `rgba(${hexToRgb(BASE_COLOR)},0.25)`)
      sphereGrad.addColorStop(0.5, `rgba(${hexToRgb(BASE_COLOR)},0.08)`)
      sphereGrad.addColorStop(1, `rgba(0,0,0,0.6)`)
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fillStyle = sphereGrad
      ctx.fill()

      // Sphere border
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${hexToRgb(BASE_COLOR)},${active ? 0.8 : 0.4})`
      ctx.lineWidth = active ? 2 : 1
      ctx.stroke()

      // Sweep line
      const sweepAngle = t * 0.8
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, R, sweepAngle, sweepAngle + Math.PI * 0.35)
      ctx.closePath()
      ctx.fillStyle = `rgba(${hexToRgb(BASE_COLOR)},0.12)`
      ctx.fill()
      ctx.restore()

      // Inner rings
      for (let ring = 1; ring <= 3; ring++) {
        const rr = R * (ring / 4)
        ctx.beginPath()
        ctx.arc(cx, cy, rr, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${hexToRgb(BASE_COLOR)},${0.15 - ring * 0.02})`
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      // Grid lines (latitude/longitude feel)
      ctx.save()
      ctx.globalAlpha = 0.1
      for (let angle = 0; angle < Math.PI; angle += Math.PI / 6) {
        ctx.beginPath()
        ctx.ellipse(cx, cy, R, R * Math.abs(Math.cos(angle + t * 0.1)), 0, 0, Math.PI * 2)
        ctx.strokeStyle = BASE_COLOR
        ctx.lineWidth = 0.5
        ctx.stroke()
      }
      ctx.restore()

      // Particles
      particles.forEach(p => {
        p.angle += p.speed * (active ? 1.6 : 1) * (1 + amplitudeRef.current * 3)
        const tilt = Math.PI / 5 * p.layer
        const x = cx + p.radius * Math.cos(p.angle) * Math.cos(tilt)
        const y = cy + p.radius * Math.sin(p.angle)
        const depth = Math.cos(p.angle) * 0.5 + 0.5
        if (depth < 0.1) return
        ctx.beginPath()
        ctx.arc(x, y, p.size * depth, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${hexToRgb(p.layer === 1 ? GOLD : BASE_COLOR)},${p.opacity * depth})`
        ctx.fill()
      })

      // Core pulse — reacts to live audio amplitude
      const amp = amplitudeRef.current
      const pulse = 0.85 + Math.sin(t * (active ? 3 : 1.5)) * 0.15 + amp * 0.4
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.22 * pulse)
      const coreAlpha = Math.min(1, (active ? 0.9 : 0.5) + amp * 0.5)
      coreGrad.addColorStop(0, `rgba(255,255,255,${coreAlpha})`)
      coreGrad.addColorStop(0.3, `rgba(${hexToRgb(BASE_COLOR)},${Math.min(1, (active ? 0.8 : 0.4) + amp * 0.6)})`)
      coreGrad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.beginPath()
      ctx.arc(cx, cy, R * 0.22 * pulse, 0, Math.PI * 2)
      ctx.fillStyle = coreGrad
      ctx.fill()

      // Speaking ring — extra glow ring that pulses with voice
      if (amp > 0.05) {
        const ringR = R * (1.05 + amp * 0.25)
        ctx.beginPath()
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${hexToRgb(BASE_COLOR)},${amp * 0.6})`
        ctx.lineWidth = 2 + amp * 4
        ctx.stroke()
      }
    }

    function animate() {
      timeRef.current += 0.016
      draw(timeRef.current)
      frameRef.current = requestAnimationFrame(animate)
    }

    animate()
    return () => cancelAnimationFrame(frameRef.current)
  }, [active, agentColor])

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={320}
      className="drop-shadow-2xl"
      style={{ filter: `drop-shadow(0 0 24px ${agentColor ?? '#00d4ff'}66)` }}
    />
  )
}
