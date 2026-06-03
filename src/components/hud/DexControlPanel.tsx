'use client'
/**
 * DexControlPanel — fullscreen overlay when Dex has taken the wheel
 *
 * Shows:
 * - Live screenshot of what Dex is looking at / doing
 * - Stream of actions and thoughts
 * - BIG red ABORT button — gives AB back control instantly
 * - Status bar: current action, turn counter, elapsed time
 */
import { useEffect, useRef, useState, useCallback } from 'react'

interface DexEvent {
  type: 'status' | 'screenshot' | 'action' | 'thought' | 'done' | 'error'
  message?: string
  data?: string    // base64 screenshot
  action?: string
  desc?: string
  text?: string
  summary?: string
}

interface Props {
  task: string
  onDone: (summary: string) => void
  onAbort: () => void
  onAbortRef?: React.MutableRefObject<(() => void) | null>
}

export default function DexControlPanel({ task, onDone, onAbort, onAbortRef }: Props) {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [log, setLog] = useState<Array<{ type: string; text: string; time: string }>>([])
  const [currentAction, setCurrentAction] = useState('Initializing...')
  const [elapsed, setElapsed] = useState(0)
  const [done, setDone] = useState(false)
  const [aborted, setAborted] = useState(false)
  const [visible, setVisible] = useState(false)

  const startTime = useRef(Date.now())
  const logRef = useRef<HTMLDivElement>(null)
  const abortedRef = useRef(false)
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)

  const addLog = useCallback((type: string, text: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLog(prev => [...prev.slice(-60), { type, text, time }])
    setTimeout(() => logRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50)
  }, [])

  // Elapsed timer
  useEffect(() => {
    if (done || aborted) return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [done, aborted])

  // Mount animation
  useEffect(() => { setTimeout(() => setVisible(true), 50) }, [])

  // Start the computer use stream
  useEffect(() => {
    let buf = ''
    let alive = true

    const run = async () => {
      try {
        const res = await fetch('/api/dex/computer-use', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task, aborted: false }),
        })

        if (!res.body) { addLog('error', 'No stream from server'); return }
        const reader = res.body.getReader()
        readerRef.current = reader
        const decoder = new TextDecoder()

        while (alive && !abortedRef.current) {
          const { done: streamDone, value } = await reader.read()
          if (streamDone) break

          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() ?? ''

          for (const part of parts) {
            if (!part.startsWith('data: ')) continue
            try {
              const ev: DexEvent = JSON.parse(part.slice(6))

              switch (ev.type) {
                case 'screenshot':
                  if (ev.data) setScreenshot(ev.data)
                  break

                case 'action':
                  setCurrentAction(ev.desc ?? ev.action ?? '')
                  addLog('action', ev.desc ?? ev.action ?? '')
                  break

                case 'thought':
                  addLog('thought', ev.text ?? '')
                  break

                case 'status':
                  setCurrentAction(ev.message ?? '')
                  addLog('status', ev.message ?? '')
                  break

                case 'done':
                  setCurrentAction('✓ Complete')
                  setDone(true)
                  addLog('done', ev.summary ?? 'Task complete.')
                  onDone(ev.summary ?? 'Task complete.')
                  break

                case 'error':
                  setCurrentAction(`⚠ ${ev.message}`)
                  addLog('error', ev.message ?? 'Error')
                  break
              }
            } catch { /* bad line */ }
          }
        }
      } catch (err) {
        if (!abortedRef.current) {
          addLog('error', `Stream error: ${err instanceof Error ? err.message : 'Unknown'}`)
        }
      }
    }

    run()
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task])

  const abort = useCallback(() => {
    abortedRef.current = true
    setAborted(true)
    setCurrentAction('ABORTED — control returned to AB')
    addLog('abort', 'Dex stopped. AB has control.')
    readerRef.current?.cancel().catch(() => {})
    setTimeout(onAbort, 1200)
  }, [onAbort, addLog])

  // Expose abort to parent so voice commands can trigger it
  useEffect(() => {
    if (onAbortRef) onAbortRef.current = abort
    return () => { if (onAbortRef) onAbortRef.current = null }
  }, [abort, onAbortRef])

  const fmt = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`

  const logColor: Record<string, string> = {
    action:  '#00d4ff',
    thought: 'rgba(255,255,255,0.55)',
    status:  'rgba(0,212,255,0.4)',
    done:    '#00ff88',
    error:   '#ff4455',
    abort:   '#ff6b35',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,2,8,0.97)',
      backdropFilter: 'blur(12px)',
      display: 'flex', flexDirection: 'column',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.4s ease',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px',
        borderBottom: '1px solid rgba(96,165,250,0.2)',
        background: 'rgba(0,4,14,0.9)',
        flexShrink: 0,
      }}>
        {/* Dex triangle */}
        <svg width={22} height={22} viewBox="0 0 22 22">
          <polygon points="11,19 2,5 20,5"
            fill="rgba(96,165,250,0.7)" stroke="#60a5fa" strokeWidth="1.5"
            filter="url(#dex-glow)" />
          <defs><filter id="dex-glow">
            <feGaussianBlur stdDeviation="1.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter></defs>
        </svg>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: '#60a5fa' }}>
            DEX — COMPUTER CONTROL MODE
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Task: {task}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Elapsed */}
        <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(96,165,250,0.6)', letterSpacing: '0.1em' }}>
          {fmt(elapsed)}
        </div>

        {/* Status badge */}
        <div style={{
          padding: '3px 10px', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
          border: `1px solid ${done ? '#00ff88' : aborted ? '#ff6b35' : '#60a5fa'}40`,
          color: done ? '#00ff88' : aborted ? '#ff6b35' : '#60a5fa',
          background: done ? 'rgba(0,255,136,0.06)' : aborted ? 'rgba(255,107,53,0.06)' : 'rgba(96,165,250,0.06)',
        }}>
          {done ? 'COMPLETE' : aborted ? 'ABORTED' : 'ACTIVE'}
        </div>

        {/* ABORT */}
        {!done && !aborted && (
          <button
            onClick={abort}
            style={{
              padding: '6px 18px', fontSize: 11, fontWeight: 900, letterSpacing: '0.2em',
              background: 'rgba(255,68,85,0.12)', border: '1px solid rgba(255,68,85,0.5)',
              color: '#ff4455', cursor: 'pointer', transition: 'all 0.15s',
              animation: 'hudPulse 2s ease-in-out infinite',
            }}
          >
            ■ ABORT — TAKE CONTROL
          </button>
        )}

        {(done || aborted) && (
          <button
            onClick={onAbort}
            style={{
              padding: '6px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em',
              background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)',
              color: '#00d4ff', cursor: 'pointer',
            }}
          >
            CLOSE
          </button>
        )}
      </div>

      {/* ── Main: screenshot left, log right ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Screenshot pane */}
        <div style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          background: 'rgba(0,0,0,0.5)',
          borderRight: '1px solid rgba(96,165,250,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {screenshot ? (
            <img
              src={`data:image/png;base64,${screenshot}`}
              alt="Dex screen view"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
            />
          ) : (
            <div style={{ textAlign: 'center', color: 'rgba(96,165,250,0.3)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⬛</div>
              <div style={{ fontSize: 10, letterSpacing: '0.2em' }}>AWAITING SCREENSHOT</div>
            </div>
          )}

          {/* Corner brackets on screenshot */}
          {[{top:8,left:8},{top:8,right:8},{bottom:8,left:8},{bottom:8,right:8}].map((pos,i) => (
            <div key={i} style={{ position:'absolute', width:16, height:16, ...pos,
              borderTop: i<2 ? '1.5px solid rgba(96,165,250,0.4)' : 'none',
              borderBottom: i>=2 ? '1.5px solid rgba(96,165,250,0.4)' : 'none',
              borderLeft: i%2===0 ? '1.5px solid rgba(96,165,250,0.4)' : 'none',
              borderRight: i%2!==0 ? '1.5px solid rgba(96,165,250,0.4)' : 'none',
            }} />
          ))}

          {/* Current action overlay */}
          <div style={{
            position: 'absolute', bottom: 12, left: 12, right: 12,
            background: 'rgba(0,4,14,0.88)',
            border: '1px solid rgba(96,165,250,0.2)',
            padding: '6px 12px',
            fontSize: 11, color: '#60a5fa', fontFamily: 'monospace',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            › {currentAction}
          </div>
        </div>

        {/* Action log pane */}
        <div style={{ width: 320, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{
            padding: '8px 14px', fontSize: 8, fontWeight: 700, letterSpacing: '0.2em',
            color: 'rgba(96,165,250,0.4)', borderBottom: '1px solid rgba(96,165,250,0.08)',
          }}>
            ACTION LOG
          </div>
          <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {log.map((entry, i) => (
              <div key={i} style={{
                padding: '3px 14px',
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)', flexShrink: 0, fontFamily: 'monospace', marginTop: 1 }}>
                  {entry.time}
                </span>
                <span style={{
                  fontSize: 10, color: logColor[entry.type] ?? 'rgba(255,255,255,0.45)',
                  lineHeight: 1.5, fontFamily: entry.type === 'action' ? 'monospace' : 'inherit',
                }}>
                  {entry.type === 'action' ? `› ${entry.text}` :
                   entry.type === 'thought' ? `💭 ${entry.text}` :
                   entry.type === 'done' ? `✓ ${entry.text}` :
                   entry.type === 'error' ? `⚠ ${entry.text}` :
                   entry.text}
                </span>
              </div>
            ))}
            {log.length === 0 && (
              <div style={{ padding: '20px 14px', fontSize: 10, color: 'rgba(255,255,255,0.15)', textAlign: 'center' }}>
                Waiting for Dex...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
