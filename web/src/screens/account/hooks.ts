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

/**
 * Copy text to the clipboard. The async clipboard needs a secure context, so plain http (a phone on
 * the local network) falls back to a hidden textarea and execCommand.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the textarea */
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}

/** The DS-08 done state: true for `ms` (1200) after `flash()`, then false again. */
export function useDone(ms = 1200) {
  const [done, setDone] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const flash = () => {
    window.clearTimeout(timer.current)
    setDone(true)
    timer.current = window.setTimeout(() => setDone(false), ms)
  }
  return { done, flash }
}

/** Re-render every `ms` so relative times ("synced 12 s ago") stay true. */
export function useNow(ms = 5000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}
