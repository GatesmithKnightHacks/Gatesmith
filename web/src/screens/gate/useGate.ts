/*
 * When the gate shows (rules 2MZG-0): a touch-only pointer (a phone or tablet without a mouse or
 * trackpad), or a window narrower than 1024 CSS px. From 1024 up, a desktop window shows the board
 * scaled to fit (app/fit.ts). Live: it follows resizes and a mouse being plugged in or removed.
 */
import { useSyncExternalStore } from 'react'

const QUERIES = {
  narrow: '(max-width: 1023.98px)',
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
