'use client'
/**
 * HexGrid — subtle holographic hex field at 4% opacity, slow upward drift
 * Renders behind everything as the holographic field layer
 */
import { useEffect, useRef } from 'react'

export default function HexGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const R = 30   // hex radius
    const H = R * Math.sqrt(3)
    const W = R * 2
    let offsetY = 0
    let frame: number

    const drawHex = (x: number, y: number) => {
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6
        const px = x + R * Math.cos(a)
        const py = y + R * Math.sin(a)
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.stroke()
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = 'rgba(0,212,255,0.045)'
      ctx.lineWidth = 0.5

      const cols = Math.ceil(canvas.width / (W * 0.75)) + 3
      const rows = Math.ceil(canvas.height / H) + 4

      offsetY = (offsetY + 0.12) % H

      for (let col = -1; col < cols; col++) {
        for (let row = -3; row < rows; row++) {
          const x = col * W * 0.75
          const y = row * H - offsetY + (col % 2 === 0 ? 0 : H / 2)
          drawHex(x, y)
        }
      }

      frame = requestAnimationFrame(animate)
    }

    animate()
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  )
}
