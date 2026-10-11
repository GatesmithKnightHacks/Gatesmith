/* Hooks shared by the account screens. */
import { useEffect, useRef, useState, type RefObject } from 'react'

/** Retry reads "Retrying" with its spinner while the check runs (at least `minMs`), then rests. */
export function useRetry(check: () => void | Promise<void>, minMs = 600) {
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const run = async () => {
    setBusy(true)
    await new Promise((r) => window.setTimeout(r, minMs))
    await check()
    if (alive.current) setBusy(false)
  }
  return { busy, run }
}

/** Focus a field once on mount (states that draw a focused field). */
export function useAutoFocus(ref: RefObject<HTMLInputElement | null>, on: boolean) {
  useEffect(() => {
    if (on) ref.current?.focus({ preventScroll: true })
  }, [ref, on])
}
