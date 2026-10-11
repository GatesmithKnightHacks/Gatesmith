/*
 * When the gate shows (rules 2MZG-0): a viewport narrower than 1280 CSS px, or a touch-only pointer,
 * on any route. Live: it follows resizes, rotation and a mouse being plugged in.
 */
import { useSyncExternalStore } from 'react'

const QUERIES = {
  narrow: '(max-width: 1279.98px)',
  coarse: '(any-pointer: coarse)',
  fine: '(any-pointer: fine)',
}

const lists = typeof window !== 'undefined' && window.matchMedia ? Object.values(QUERIES).map((q) => window.matchMedia(q)) : []

function gated() {
  if (!lists.length) return false
  const [narrow, coarse, fine] = lists
  return narrow.matches || (coarse.matches && !fine.matches)
}

function subscribe(cb: () => void) {
  lists.forEach((l) => l.addEventListener('change', cb))
  return () => lists.forEach((l) => l.removeEventListener('change', cb))
}

export function useGate(): boolean {
  return useSyncExternalStore(subscribe, gated, () => false)
}
