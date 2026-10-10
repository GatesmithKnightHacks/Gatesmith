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

export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    current,
  )
}
