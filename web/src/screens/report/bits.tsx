/*
 * Inspector pieces shared by S-09 and S-10, measured from their boards:
 * section header 40 tall (18 icon, gap 10, 14/500 title, mono 11 meta, chevron), rows 28 with 1px rules.
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import './bits.css'

export function Collapsible({
  icon,
  title,
  meta,
  children,
  defaultOpen = true,
  borderTop = true,
  borderBottom = false,
  style,
}: {
  icon: ReactNode
  title: string
  meta?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  borderTop?: boolean
  borderBottom?: boolean
  style?: CSSProperties
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`rp-section${borderTop ? ' has-top' : ''}${borderBottom ? ' has-bottom' : ''}`} style={style}>
      <button className="rp-section-header" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span className="rp-section-title">{title}</span>
        {meta != null && <span className="rp-section-meta">{meta}</span>}
        <svg className={`rp-chevron${open ? '' : ' is-closed'}`} width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M3.5 8.5L7 5l3.5 3.5" fill="none" stroke="#C2DADF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={`rp-collapse${open ? '' : ' is-closed'}`}>
        <div className="rp-collapse-inner">{children}</div>
      </div>
    </section>
  )
}

/** label (fixed 120) left, mono value right, 1px rule on top. */
export function FactRow({
  label,
  value,
  last,
  labelWidth = 120,
  mono = true,
}: {
  label: ReactNode
  value: ReactNode
  last?: boolean
  labelWidth?: number | 'auto'
  mono?: boolean
}) {
  return (
    <div className={`rp-fact${last ? ' is-last' : ''}`}>
      <span className="rp-fact-label" style={{ width: labelWidth }}>
        {label}
      </span>
      <span className={`rp-fact-value${mono ? ' mono' : ''}`}>{value}</span>
    </div>
  )
}

export const Icons = {
  doc: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M4 2.5h7l3 3v10H4z" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.5 9h5M6.5 12h5" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  list: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 4.5h12M3 9h12M3 13.5h7" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        d="M9 2.5l5.5 2v4.2c0 3.2-2.3 5.6-5.5 6.8-3.2-1.2-5.5-3.6-5.5-6.8V4.5z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
}

/** Copy to the clipboard and show a confirmation word for a moment. */
export function useFlash(ms = 1600): [string | null, (word: string) => void] {
  const [word, setWord] = useState<string | null>(null)
  const flash = (w: string) => {
    setWord(w)
    window.setTimeout(() => setWord(null), ms)
  }
  return [word, flash]
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* clipboard can be blocked; the confirmation word still shows what was copied */
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
