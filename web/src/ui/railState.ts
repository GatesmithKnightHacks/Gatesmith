import { useSyncExternalStore } from 'react'

/*
 * The rail's remembered width: Expand widens it to 200 with labels, and the choice survives reloads
 * (localStorage, per browser). Every screen mounts its own Shell, so the state lives here.
 */
const KEY = 'gatesmith.railExpanded'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let expanded = read()

export function setRailExpanded(on: boolean) {
  expanded = on
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* private mode: remembered for this session only */
  }
  listeners.forEach((l) => l())
}

export function useRailExpanded() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => expanded,
  )
}

/*
 * Keyboard focus survives a screen change: the next screen's rail is a new element, so a rail that
 * had focus when it navigated hands it to the new rail's current item on mount.
 */
let focusPending = false
export const railFocus = {
  hand: () => {
    focusPending = true
  },
  take: () => {
    const was = focusPending
    focusPending = false
    return was
  },
}

/** True when a key press belongs to a text field, so single-letter shortcuts stay out of the way. */
export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}
