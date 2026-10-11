/*
 * Fit to window. The workbench is drawn at 1440 × 900 and never reflows: every tile, gap and
 * padding keeps the board's size. A smaller window shows the whole board scaled as one unit
 * (--fit below 1), so nothing overlaps, clips or scrolls sideways; a window at or above the
 * board's size shows it at 100% and lets the main column take the extra width.
 */
import { useLayoutEffect } from 'react'

export const BOARD = { width: 1440, height: 900 } as const
const MIN_FIT = 0.6

export function fitFor(width: number, height: number) {
  const fit = Math.min(width / BOARD.width, height / BOARD.height, 1)
  return Math.max(MIN_FIT, Math.round(fit * 1000) / 1000)
}

function apply() {
  document.documentElement.style.setProperty('--fit', String(fitFor(window.innerWidth, window.innerHeight)))
}

/** Keeps --fit on :root in step with the window. The root's `zoom` reads it (base.css). */
export function useFitToWindow() {
  useLayoutEffect(() => {
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])
}
