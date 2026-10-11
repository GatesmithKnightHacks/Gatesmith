import { useSyncExternalStore } from 'react'

/*
 * Reduce motion: follows the system setting, and Settings can force it on for this browser.
 * Applied as :root[data-reduce-motion], which motion.css treats like the media query.
 */
const KEY = 'gatesmith.reduceMotion'
const listeners = new Set<() => void>()
const media = window.matchMedia('(prefers-reduced-motion: reduce)')

function stored(): boolean | null {
  try {
    const v = localStorage.getItem(KEY)
    return v == null ? null : v === '1'
  } catch {
    return null
  }
}

let forced = stored()
const current = () => forced ?? media.matches

function apply() {
  document.documentElement.toggleAttribute('data-reduce-motion', current())
  listeners.forEach((l) => l())
}
media.addEventListener('change', apply)
apply()

export function setReducedMotion(on: boolean) {
  forced = on
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* private mode: keep it for this session only */
  }
  apply()
}

export const isReducedMotion = current

/** The motion tokens in milliseconds, for motion driven from script (same values as motion.css). */
export const MOTION_MS = { hover: 150, tile: 200, load: 400, spin: 1000, shimmer: 1200, done: 1200 } as const

/** Fade an element in where it stands (opacity only, so reduced motion keeps it). */
export function fadeIn(el: Element | null, ms: number = MOTION_MS.tile) {
  el?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease' })
}

export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    current,
  )
}
