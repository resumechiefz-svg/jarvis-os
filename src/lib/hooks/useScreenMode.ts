/**
 * useScreenMode — detects which monitor setup Jarvis is running on
 * Ultrawide/curved: screen.width > 2000 → full 3-column HUD
 * MacBook only: screen.width <= 2000 → condensed layout with agent tiles
 */
import { useEffect, useState } from 'react'

export type ScreenMode = 'ultrawide' | 'macbook' | 'mobile'

export function useScreenMode(): ScreenMode {
  const [mode, setMode] = useState<ScreenMode>('macbook')

  useEffect(() => {
    function detect() {
      const w = window.screen.width
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768
      if (isMobile) { setMode('mobile'); return }
      if (w > 2000) { setMode('ultrawide'); return }
      setMode('macbook')
    }

    detect()
    window.addEventListener('resize', detect)
    return () => window.removeEventListener('resize', detect)
  }, [])

  return mode
}
