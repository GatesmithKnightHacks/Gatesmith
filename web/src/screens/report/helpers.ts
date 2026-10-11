/* Feedback helpers for S-09 and S-10: the done word, the clipboard and real file downloads. */
import { useEffect, useRef, useState } from 'react'

/** The done state of a button or row: the past word shows for `ms`, then returns. */
export function useFlash(ms = 1200): [string | null, (word: string) => void] {
  const [word, setWord] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const flash = (w: string) => {
    window.clearTimeout(timer.current)
    setWord(w)
    timer.current = window.setTimeout(() => setWord(null), ms)
  }
  return [word, flash]
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* the clipboard can be blocked; the done word still shows what was copied */
  }
}

export function downloadText(filename: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
