/**
 * useJarvisState — manages Jarvis OS state machine
 * sleeping → waking → idle → thinking → speaking
 * Sleep after 60s of inactivity. Wake sequence takes 1.5s.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type OrbState = 'sleeping' | 'waking' | 'idle' | 'thinking' | 'speaking'

export function useJarvisState(loading: boolean, speaking: boolean) {
  const [orbState, setOrbState] = useState<OrbState>('idle')
  const lastActivityRef = useRef(Date.now())
  const orbStateRef = useRef<OrbState>('idle')

  const markActive = useCallback(() => {
    lastActivityRef.current = Date.now()
    if (orbStateRef.current === 'sleeping') {
      orbStateRef.current = 'waking'
      setOrbState('waking')
      // Wake sequence completes in 1.5s
      setTimeout(() => {
        if (orbStateRef.current === 'waking') {
          orbStateRef.current = 'idle'
          setOrbState('idle')
        }
      }, 1500)
    }
  }, [])

  // Speaking / thinking overrides (highest priority)
  useEffect(() => {
    if (speaking) {
      orbStateRef.current = 'speaking'
      setOrbState('speaking')
      markActive()
    } else if (loading) {
      orbStateRef.current = 'thinking'
      setOrbState('thinking')
      markActive()
    } else if (orbStateRef.current === 'speaking' || orbStateRef.current === 'thinking') {
      orbStateRef.current = 'idle'
      setOrbState('idle')
    }
  }, [speaking, loading, markActive])

  // 60-second idle → sleep check
  useEffect(() => {
    const interval = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current
      if (idle > 60_000 && orbStateRef.current === 'idle') {
        orbStateRef.current = 'sleeping'
        setOrbState('sleeping')
      }
    }, 5_000)
    return () => clearInterval(interval)
  }, [])

  return { orbState, markActive }
}
