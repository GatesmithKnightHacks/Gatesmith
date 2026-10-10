import { useEffect, useState } from 'react'
import { EditorButton } from '../../ui/parts'

/** Copies, then confirms with the word Copied for 2 s. */
export function CopyButton({ text, label }: { text: string | (() => string); label: string }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(false), 2000)
    return () => clearTimeout(t)
  }, [done])
  return (
    <EditorButton
      onClick={() => {
        void navigator.clipboard?.writeText(typeof text === 'function' ? text() : text).catch(() => {})
        setDone(true)
      }}
    >
      {done ? 'Copied' : label}
    </EditorButton>
  )
}
