import { useEffect, useState } from 'react'
import { MOTION_MS } from './motionPreference'

/**
 * Keeps something mounted through its exit fade: banners, toasts, menus and tooltips fade in 200 in
 * place and out 150 (DS-08). `leaving` is true during the exit; style it with `.is-leaving`.
 */
export function usePresence(open: boolean, exitMs: number = MOTION_MS.hover) {
  const [rendered, setRendered] = useState(open)
  if (open && !rendered) setRendered(true)
  useEffect(() => {
    if (open || !rendered) return
    const t = window.setTimeout(() => setRendered(false), exitMs)
    return () => window.clearTimeout(t)
  }, [open, rendered, exitMs])
  return { mounted: open || rendered, leaving: !open && rendered }
}
