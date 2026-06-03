'use client'
/**
 * MiniAgentOrb — small holographic triangle orb that appears beside Jarvis
 * when an agent is active. Pulses in the agent's color, dissolves when done.
 * Same canvas aesthetic as JarvisOrb, no text.
 */
import { useEffect, useRef, useState } from 'react'

interface Props {
  agent: string
  color: string
  status: 'thinking' | 'working' | 'complete' | 'error'
  startedAt: number
  onDismiss: () => void
}

const SIZE = 110

export default function MiniAgentOrb({ agent, color, status, onDismiss }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)
  const tRef = useRef(Math.random() * 100) // random phase so orbs don't sync
  const [phase, setPhase] = useState<'in' | 'live' | 'out'>('in')

  // Mount → in → live
  useEffect(() => {
    const t = setTimeout(() => setPhase('live'), 50)
    return () => clearTimeout(t)
  }, [])

  // Complete/error → dissolve → dismiss
  useEffect(() => {
    if (status !== 'complete' && status !== 'error') return
    const t = setTimeout(() => {
      setPhase('out')
      setTimeout(onDismiss, 700)
    }, 2500)
    return () => clearTimeout(t)
  }, [status, onDismiss])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2

    const h = color.replace('#', '')
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
    const rgb = `${r},${g},${b}`

    const triR = W * 0.26
    const verts = () => [
      { x:cx, y:cy+triR },
      { x:cx-triR*Math.sin(Math.PI/3)*1.18, y:cy-triR*0.52 },
      { x:cx+triR*Math.sin(Math.PI/3)*1.18, y:cy-triR*0.52 },
    ]

    // Particles
    const N = 8
    const particles = Array.from({length:N}, (_,i) => ({
      angle: (i/N)*Math.PI*2,
      radius: W*0.35,
      speed: (0.02+Math.random()*0.03)*(Math.random()<.5?1:-1),
      size: 1+Math.random(),
      opacity: 0.4+Math.random()*0.4,
    }))

    // Two rings
    const rings = [
      { r:W*.40, speed:.012, dir: 1 },
      { r:W*.30, speed:.022, dir:-1 },
    ]
    const rAngles = [0, 0]
    let scanA = -Math.PI/2

    function draw() {
      tRef.current += 0.016
      const t = tRef.current
      const isActive = status === 'thinking' || status === 'working'
      const breathe = isActive ? 0.4+0.35*Math.sin(t*4) : 0.15+0.1*Math.sin(t*1.5)
      const spd = isActive ? 1.8 : 0.5

      particles.forEach(p => {
        p.radius = W*(isActive?0.33:0.28)
        p.angle += p.speed*spd
      })
      rAngles.forEach((_,i) => { rAngles[i] += rings[i].speed*rings[i].dir*spd })

      ctx.clearRect(0,0,W,H)

      // Ambient
      const amb=ctx.createRadialGradient(cx,cy,0,cx,cy,W*.48)
      amb.addColorStop(0,`rgba(${rgb},${breathe*.25})`)
      amb.addColorStop(1,'rgba(0,0,0,0)')
      ctx.fillStyle=amb; ctx.fillRect(0,0,W,H)

      // Rings
      rings.forEach((ring,ri) => {
        for(let i=0;i<24;i++){
          const ta=(i/24)*Math.PI*2+rAngles[ri]
          ctx.beginPath()
          ctx.moveTo(cx+Math.cos(ta)*ring.r, cy+Math.sin(ta)*ring.r)
          ctx.lineTo(cx+Math.cos(ta)*(ring.r-4), cy+Math.sin(ta)*(ring.r-4))
          ctx.strokeStyle=`rgba(${rgb},${(0.2+breathe*.2)*(ri===0?.8:1)})`
          ctx.lineWidth=0.8; ctx.stroke()
        }
      })

      // Scanner
      scanA += .025*spd
      ctx.beginPath(); ctx.arc(cx,cy,rings[0].r,scanA-Math.PI*.4,scanA)
      ctx.strokeStyle=`rgba(${rgb},.55)`; ctx.lineWidth=1.5
      ctx.shadowColor=color; ctx.shadowBlur=8; ctx.stroke(); ctx.shadowBlur=0

      // Triangle
      const pts=verts()
      ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); ctx.lineTo(pts[1].x,pts[1].y); ctx.lineTo(pts[2].x,pts[2].y); ctx.closePath()
      const fg=ctx.createLinearGradient(cx,pts[1].y,cx,pts[0].y)
      fg.addColorStop(0,`rgba(${rgb},${.7+breathe*.25})`); fg.addColorStop(1,`rgba(${rgb},${.25+breathe*.1})`)
      ctx.fillStyle=fg; ctx.shadowColor=color; ctx.shadowBlur=(12+breathe*30); ctx.fill()
      ctx.strokeStyle=`rgba(${rgb},.8)`; ctx.lineWidth=1.5; ctx.stroke(); ctx.shadowBlur=0

      // Core
      const cG=ctx.createRadialGradient(cx,cy,0,cx,cy,triR*.5)
      cG.addColorStop(0,`rgba(255,255,255,${.7+breathe*.2})`); cG.addColorStop(1,`rgba(${rgb},0)`)
      ctx.fillStyle=cG; ctx.shadowColor='white'; ctx.shadowBlur=15+breathe*20
      ctx.beginPath(); ctx.arc(cx,cy-triR*.05,triR*.25*(1+breathe*.3),0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0

      // Particles
      particles.forEach(p=>{
        ctx.beginPath(); ctx.arc(cx+Math.cos(p.angle)*p.radius,cy+Math.sin(p.angle)*p.radius,p.size,0,Math.PI*2)
        ctx.fillStyle=`rgba(${rgb},${p.opacity})`; ctx.shadowColor=color; ctx.shadowBlur=4; ctx.fill(); ctx.shadowBlur=0
      })

      frameRef.current=requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(frameRef.current)
  }, [color, status])

  const isDone = status === 'complete' || status === 'error'

  return (
    <div
      onClick={isDone ? onDismiss : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        cursor: isDone ? 'pointer' : 'default',
        opacity: phase === 'in' ? 0 : phase === 'out' ? 0 : 1,
        transform: phase === 'in' ? 'scale(0.6) translateY(10px)' : phase === 'out' ? 'scale(0.4) translateY(-10px)' : 'scale(1) translateY(0)',
        filter: phase === 'out' ? 'blur(6px)' : 'none',
        transition: 'opacity 0.5s ease, transform 0.5s ease, filter 0.5s ease',
      }}
    >
      <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ width:SIZE, height:SIZE, display:'block',
        filter:`drop-shadow(0 0 12px ${color}60)` }} />
      <div style={{ fontSize:8, fontWeight:700, letterSpacing:'0.2em', color:`${color}aa`, textTransform:'uppercase', fontFamily:'monospace' }}>
        {agent}{isDone ? ' ✓' : ''}
      </div>
    </div>
  )
}
