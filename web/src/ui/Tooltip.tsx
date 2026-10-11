/*
 * Tooltip (DS-08): waits 400 ms on hover or focus, fades in 200 in place, out 150. Rail labels do not
 * wait (they are the rail's own chip, see Shell).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { usePresence } from './presence'
import './feedback.css'

const WAIT_MS = 400

export function Tooltip({ tip, children }: { tip: ReactNode; children: ReactNode }) {
  const [hover, setHover] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!hover) return
    const t = window.setTimeout(() => setOpen(true), WAIT_MS)
    return () => {
      window.clearTimeout(t)
      setOpen(false)
    }
  }, [hover])
  const { mounted, leaving } = usePresence(open)
  return (
    <span
      className="tooltip-anchor"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      {children}
      {mounted && (
        <span role="tooltip" className={`tooltip${leaving ? ' is-leaving' : ''}`}>
          {tip}
        </span>
      )}
    </span>
  )
}
