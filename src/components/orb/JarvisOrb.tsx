'use client'
/**
 * JarvisOrb v5 — Iron Man holographic aesthetic
 * Three concentric targeting rings, orbital particle system,
 * sleep/wake animation, amplitude-driven pulse, agent color shifts
 */
import { useEffect, useRef } from 'react'
import type { OrbState } from '@/lib/hooks/useJarvisState'

interface Props {
  active: boolean
  agentColor?: string
  amplitude?: number
  size?: number
  orbState?: OrbState
}

interface OParticle {
  angle: number
  radius: number
  targetRadius: number
  speed: number
  size: number
  opacity: number
  trail: Array<{ x: number; y: number }>
}

export default function JarvisOrb({ active, agentColor = '#00d4ff', amplitude = 0, size = 420, orbState = 'idle' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)
  const tRef = useRef(0)
  const ampRef = useRef(0)
  const stateRef = useRef<OrbState>('idle')
  const wakeRef = useRef(0)
  const colorRef = useRef(agentColor)
  const flickRef = useRef(true)

  useEffect(() => { ampRef.current = amplitude }, [amplitude])
  useEffect(() => { stateRef.current = orbState }, [orbState])
  useEffect(() => { colorRef.current = agentColor }, [agentColor])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2

    const hex2rgb = (hex: string) => {
      const h = hex.replace('#', '')
      return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) }
    }
    let cc = hex2rgb(agentColor)
    let rgb = `${cc.r},${cc.g},${cc.b}`
    let curHex = agentColor

    // Three rings: outer slow, middle medium opposite, inner fast
    const RINGS = [
      { r: W*.44, speed:.005, dir: 1, ticks:72, gapDeg:[0,90,180,270],    gapSpan:12, lw:1.5, major:8  },
      { r: W*.36, speed:.011, dir:-1, ticks:48, gapDeg:[60,150,240,330],   gapSpan:10, lw:1.2, major:6  },
      { r: W*.27, speed:.020, dir: 1, ticks:36, gapDeg:[30,210],           gapSpan:8,  lw:0.9, major:4  },
    ]
    const ringAngles = [0, 0, 0]

    const triR = W * 0.20
    const verts = (sc=1) => [
      { x:cx, y:cy+triR*sc },
      { x:cx-triR*sc*Math.sin(Math.PI/3)*1.18, y:cy-triR*sc*0.52 },
      { x:cx+triR*sc*Math.sin(Math.PI/3)*1.18, y:cy-triR*sc*0.52 },
    ]

    const N = 26
    const particles: OParticle[] = Array.from({ length:N }, (_,i) => {
      const br = W*(0.30+Math.random()*0.10)
      return { angle:(i/N)*Math.PI*2+Math.random()*.5, radius:br, targetRadius:br,
               speed:(0.006+Math.random()*.014)*(Math.random()<.5?1:-1),
               size:1+Math.random()*2.5, opacity:.4+Math.random()*.5, trail:[] }
    })

    let scanAngle = -Math.PI/2
    let flickTimer = 0

    function draw() {
      tRef.current += 0.016
      const t = tRef.current, amp = ampRef.current, state = stateRef.current

      // Sync color
      if (colorRef.current !== curHex) {
        cc = hex2rgb(colorRef.current)
        rgb = `${cc.r},${cc.g},${cc.b}`
        curHex = colorRef.current
      }

      // State multipliers
      let sM = 1, gM = 1, nP = N
      if (state === 'sleeping') { sM=.12; gM=.18; nP=6; wakeRef.current=0 }
      else if (state === 'waking') {
        wakeRef.current = Math.min(1, wakeRef.current+.016/1.5)
        const p = wakeRef.current, e = p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2
        sM=.12+e*.88; gM=.18+e*.82; nP=Math.floor(6+e*(N-6))
        flickTimer+=.016; flickRef.current = Math.sin(flickTimer*25)>0
      } else { wakeRef.current=1 }

      const rM = state==='sleeping'?.08:state==='waking'?.3+wakeRef.current*1.2:state==='thinking'?1.8:state==='speaking'?1.2+amp*4:1.0

      // Update particles
      const bR = W*.33
      particles.forEach((p,i) => {
        p.targetRadius = state==='thinking' ? bR*.65+(i/N)*W*.04
                       : state==='speaking' ? bR*1.15+amp*W*.06+(i/N)*W*.05
                       : state==='sleeping' ? bR*.80
                       : bR+(i/N)*W*.07
        p.radius += (p.targetRadius-p.radius)*.025
        p.angle  += p.speed*rM
        const px=cx+Math.cos(p.angle)*p.radius, py=cy+Math.sin(p.angle)*p.radius
        p.trail.unshift({x:px,y:py})
        if(p.trail.length>6) p.trail.pop()
      })

      const breathe = state==='speaking'  ? .55+amp*.9
                    : state==='thinking'  ? .38+.28*Math.sin(t*4.5)
                    : state==='sleeping'  ? .08+.06*Math.sin(t*.6)
                    : state==='waking'    ? wakeRef.current*(.5+.3*Math.sin(t*8))
                    : .22+.14*Math.sin(t*1.2)

      ctx.clearRect(0,0,W,H)

      // Ambient glow
      const amb=ctx.createRadialGradient(cx,cy,0,cx,cy,W*.52)
      amb.addColorStop(0,`rgba(${rgb},${breathe*.20*gM})`)
      amb.addColorStop(.45,`rgba(${rgb},${breathe*.07*gM})`)
      amb.addColorStop(1,'rgba(0,0,0,0)')
      ctx.fillStyle=amb; ctx.fillRect(0,0,W,H)

      // Three rings
      RINGS.forEach((ring,ri) => {
        ringAngles[ri] += ring.speed*ring.dir*rM
        const ang=ringAngles[ri], rA=(ring.gapSpan/2)*Math.PI/180
        const rAlpha=(0.25+breathe*.22)*sM

        // Arc segments between gaps
        const gapRads = ring.gapDeg.map(d=>d*Math.PI/180+ang)
        for(let g=0;g<gapRads.length;g++){
          const start=gapRads[g]+rA*2.5
          const end=(g+1<gapRads.length?gapRads[g+1]:gapRads[0]+Math.PI*2)-rA*2.5
          if(end>start){
            ctx.beginPath(); ctx.arc(cx,cy,ring.r,start,end)
            ctx.strokeStyle=`rgba(${rgb},${rAlpha*.5})`; ctx.lineWidth=ring.lw*.7; ctx.stroke()
          }
        }

        // Tick marks
        for(let i=0;i<ring.ticks;i++){
          const tA=(i/ring.ticks)*Math.PI*2+ang
          const dA=((tA*180/Math.PI)%360+360)%360
          const inGap=ring.gapDeg.some(g=>Math.min(Math.abs(dA-g),360-Math.abs(dA-g))<ring.gapSpan*.8)
          if(inGap)continue
          const isMaj=i%ring.major===0, len=isMaj?12:5
          const cos=Math.cos(tA),sin=Math.sin(tA)
          ctx.beginPath()
          ctx.moveTo(cx+cos*ring.r,cy+sin*ring.r)
          ctx.lineTo(cx+cos*(ring.r-len),cy+sin*(ring.r-len))
          ctx.strokeStyle=`rgba(${rgb},${isMaj?rAlpha*1.6:rAlpha*.8})`
          ctx.lineWidth=isMaj?ring.lw*1.4:ring.lw*.7
          if(isMaj){ctx.shadowColor=curHex;ctx.shadowBlur=4*gM}
          ctx.stroke(); ctx.shadowBlur=0
        }

        // Labels at gaps on outer ring
        if(ri===0){
          const labels=['SYS','NAV','COM','AI']
          ring.gapDeg.forEach((gd,gi)=>{
            const a=gd*Math.PI/180+ang
            ctx.fillStyle=`rgba(${rgb},${.20*sM})`
            ctx.font=`${W*.017}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle'
            ctx.fillText(labels[gi]??'',cx+Math.cos(a)*(ring.r+14),cy+Math.sin(a)*(ring.r+14))
          })
        }
      })

      // Scanner arc on middle ring
      scanAngle+=.018*rM
      ctx.beginPath()
      ctx.arc(cx,cy,RINGS[1].r,scanAngle-(state==='speaking'?Math.PI*.7:Math.PI*.45),scanAngle)
      ctx.strokeStyle=`rgba(${rgb},${.65*sM})`; ctx.lineWidth=2.5
      ctx.shadowColor=curHex; ctx.shadowBlur=14*gM; ctx.stroke(); ctx.shadowBlur=0
      const sdx=cx+Math.cos(scanAngle)*RINGS[1].r, sdy=cy+Math.sin(scanAngle)*RINGS[1].r
      ctx.beginPath(); ctx.arc(sdx,sdy,state==='speaking'?6:4,0,Math.PI*2)
      ctx.fillStyle=curHex; ctx.shadowColor=curHex; ctx.shadowBlur=20*gM; ctx.fill(); ctx.shadowBlur=0

      // Triangle
      const pts=verts()
      ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); ctx.lineTo(pts[1].x,pts[1].y); ctx.lineTo(pts[2].x,pts[2].y); ctx.closePath()
      const tO=gM*(.72+breathe*.24)
      const fg=ctx.createLinearGradient(cx,pts[1].y,cx,pts[0].y)
      fg.addColorStop(0,`rgba(${rgb},${tO})`); fg.addColorStop(.55,`rgba(${rgb},${tO*.65})`); fg.addColorStop(1,`rgba(${rgb},${tO*.22})`)
      ctx.fillStyle=fg; ctx.shadowColor=curHex; ctx.shadowBlur=(22+breathe*50+amp*80)*gM; ctx.fill()
      ctx.strokeStyle=`rgba(${rgb},${.85*gM})`; ctx.lineWidth=active?2.8:2; ctx.shadowBlur=(16+breathe*30)*gM; ctx.stroke(); ctx.shadowBlur=0

      // Edge glow when speaking
      if(amp>.04&&state==='speaking'){
        ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); ctx.lineTo(pts[1].x,pts[1].y); ctx.lineTo(pts[2].x,pts[2].y); ctx.closePath()
        ctx.strokeStyle=`rgba(255,255,255,${amp*.45})`; ctx.lineWidth=1.5; ctx.shadowColor='white'; ctx.shadowBlur=amp*50; ctx.stroke(); ctx.shadowBlur=0
      }

      // Core glow
      const cR=triR*.14*(1+breathe*.4+amp*.8)*gM
      const cG=ctx.createRadialGradient(cx,cy-triR*.08,0,cx,cy-triR*.08,cR*3)
      cG.addColorStop(0,`rgba(255,255,255,${(.85+amp*.15)*gM})`); cG.addColorStop(.35,`rgba(${rgb},${.9*gM})`); cG.addColorStop(1,`rgba(${rgb},0)`)
      ctx.fillStyle=cG; ctx.shadowColor='white'; ctx.shadowBlur=(28+amp*60)*gM
      ctx.beginPath(); ctx.arc(cx,cy-triR*.08,cR*3,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0

      // Pulse rings
      if(state!=='sleeping'&&(amp>.04||state==='speaking'||state==='waking')){
        const pC=state==='waking'?6:3
        for(let ring=0;ring<pC;ring++){
          const spd=state==='waking'?3:state==='speaking'?2:.8
          const phase=((t*spd+ring/pC)%1)
          const rSz=W*.10+phase*W*.42
          const alpha=(1-phase)*(state==='speaking'?Math.max(amp*.7,.1):state==='waking'?.25*(1-wakeRef.current*.5):.08)
          if(alpha>.005){
            ctx.beginPath(); ctx.arc(cx,cy,rSz,0,Math.PI*2)
            ctx.strokeStyle=state==='waking'?`rgba(255,255,255,${alpha})`:`rgba(${rgb},${alpha})`
            ctx.lineWidth=1.5; ctx.stroke()
          }
        }
      }

      // Orbital particles
      particles.slice(0,nP).forEach(p=>{
        const px=cx+Math.cos(p.angle)*p.radius, py=cy+Math.sin(p.angle)*p.radius
        p.trail.forEach((pt,ti)=>{
          ctx.beginPath(); ctx.arc(pt.x,pt.y,p.size*(1-ti/p.trail.length)*.7,0,Math.PI*2)
          ctx.fillStyle=`rgba(${rgb},${p.opacity*(1-ti/p.trail.length)*.3*sM})`; ctx.fill()
        })
        ctx.beginPath(); ctx.arc(px,py,p.size,0,Math.PI*2)
        ctx.fillStyle=`rgba(${rgb},${p.opacity*sM})`; ctx.shadowColor=curHex; ctx.shadowBlur=5*gM; ctx.fill(); ctx.shadowBlur=0
      })

      // HUD corner brackets
      const bD=W*.46,bL=W*.08,bA=.18*sM
      ;[[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx,sy])=>{
        const bx=cx+sx*bD*.72,by=cy+sy*bD*.72
        ctx.strokeStyle=`rgba(${rgb},${bA})`; ctx.lineWidth=1.5
        ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx-sx*bL,by); ctx.moveTo(bx,by); ctx.lineTo(bx,by-sy*bL); ctx.stroke()
      })

      // Status text
      const ST: Record<OrbState,string>={sleeping:'SLEEPING',waking:flickRef.current?'INITIALIZING...':'',idle:'STANDBY',thinking:'PROCESSING',speaking:'RESPONDING'}
      ctx.fillStyle=`rgba(${rgb},${(state==='waking'?.7:.3)*sM})`
      ctx.font=`bold ${W*.022}px monospace`; ctx.textAlign='center'; ctx.textBaseline='alphabetic'; ctx.letterSpacing='0.25em'
      ctx.fillText(ST[state]??'STANDBY',cx,cy+triR+30)
      ctx.fillStyle=`rgba(${rgb},${.18*sM})`; ctx.font=`${W*.016}px monospace`
      ctx.fillText('J A R V I S',cx,cy+triR+48)

      frameRef.current=requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(frameRef.current)
  }, [active, agentColor, size])

  return (
    <canvas ref={canvasRef} width={size} height={size}
      style={{ width:size, height:size, display:'block',
        filter:`drop-shadow(0 0 ${amplitude>.1?48:24}px ${agentColor}50)`,
        transition:'filter 0.3s' }} />
  )
}
