/*
 * When the gate shows (rules 2MZG-0): a touch-only pointer, which is a phone or a tablet without a
 * mouse or trackpad. A desktop browser never sees it: the board scales to fit the window instead
 * (app/fit.ts). Live: it follows a mouse being plugged in or removed.
 */
import { useSyncExternalStore } from 'react'

const QUERIES = {
  coarse: '(any-pointer: coarse)',
  fine: '(any-pointer: fine)',
}

const lists = typeof window !== 'undefined' && window.matchMedia ? Object.values(QUERIES).map((q) => window.matchMedia(q)) : []

function gated() {
  if (!lists.length) return false
  const [coarse, fine] = lists
  return coarse.matches && !fine.matches
}

function subscribe(cb: () => void) {
  lists.forEach((l) => l.addEventListener('change', cb))
  return () => lists.forEach((l) => l.removeEventListener('change', cb))
}

export function useGate(): boolean {
  return useSyncExternalStore(subscribe, gated, () => false)
}
