/*
 * Pieces shared by the two stretch screens (S-15, S-16). Local to these screens on purpose;
 * the shared Section does not animate yet, so InspSection adds the collapse motion here.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { GpuStatus } from '../../ui/Shell'
import { Chevron, SelectCaret } from '../../ui/icons'
import './stretch.css'

export function StretchStatus() {
  return (
    <>
      <GpuStatus online />
      <span className="mono">job 7f3a·0412</span>
      <span className="mono stretch-marker">stretch</span>
    </>
  )
}

/** Inspector section with the 40px header; the body opens and closes on height + fade. */
export function InspSection({
  icon,
  title,
  meta,
  defaultOpen = true,
  children,
  bodyStyle,
  inset = false,
  className = '',
}: {
  icon: ReactNode
  title: string
  meta?: ReactNode
  defaultOpen?: boolean
  children?: ReactNode
  bodyStyle?: CSSProperties
  /** header inside the 16px padding (Predictor, Block model): rows run edge to edge of the text lane */
  inset?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`insp-section st-section${inset ? ' is-inset' : ''} ${className}`}>
      <button className="insp-section-header" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span className="insp-section-title">{title}</span>
        {meta != null && <span className="insp-section-meta">{meta}</span>}
        <span className={`st-chevron${open ? '' : ' is-closed'}`}>
          <Chevron open />
        </span>
      </button>
      {children != null && (
        <div className={`st-collapse${open ? '' : ' is-closed'}`} aria-hidden={!open}>
          <div className="st-collapse-inner">
            <div className="st-section-body" style={bodyStyle}>
              {children}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/** label · value rows, 28 tall, 1px rule above each, the last one ruled below too. */
export function KV({ rows, style }: { rows: [ReactNode, ReactNode][]; style?: CSSProperties }) {
  return (
    <div className="st-kv" style={style}>
      {rows.map(([k, v], i) => (
        <div key={i} className={`st-kv-row${i === rows.length - 1 ? ' is-last' : ''}`}>
          <span className="st-kv-label">{k}</span>
          <span className="st-kv-value mono">{v}</span>
        </div>
      ))}
    </div>
  )
}

/** A select that opens a small menu on the popover surface. */
export function SelectField<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  const current = options.find((o) => o.value === value)
  return (
    <div className="st-select" ref={ref}>
      <button
        className="field st-field-btn"
        style={{ width: 180 }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          const i = options.findIndex((o) => o.value === value)
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(options[Math.min(options.length - 1, i + 1)].value)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(options[Math.max(0, i - 1)].value)
          } else if (e.key === 'Escape') setOpen(false)
        }}
      >
        <span className="field-value">{current?.label}</span>
        <SelectCaret />
      </button>
      {open && (
        <ul className="st-menu" role="listbox">
          {options.map((o) => (
            <li key={o.value}>
              <button
                role="option"
                aria-selected={o.value === value}
                className={`st-menu-item${o.value === value ? ' is-current' : ''}`}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Numeric field with its unit in a fixed slot. Arrow keys step it. */
export function NumberField({
  value,
  unit,
  min,
  max,
  onChange,
  label,
}: {
  value: number
  unit: string
  min: number
  max: number
  onChange: (v: number) => void
  label: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = (t: string) => {
    const n = Number(t)
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))))
    else setText(String(value))
  }
  return (
    <span className="field st-number" style={{ width: 180 }}>
      <input
        className="field-value st-number-input"
        inputMode="numeric"
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(text)
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(Math.min(max, value + 1))
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(Math.max(min, value - 1))
          }
        }}
      />
      <span className="field-unit">{unit}</span>
    </span>
  )
}

/** Elapsed seconds while something runs: words and seconds, never a spinner. */
export function useElapsed(running: boolean) {
  const [ms, setMs] = useState(0)
  useEffect(() => {
    if (!running) return
    const start = performance.now()
    setMs(0)
    const id = window.setInterval(() => setMs(performance.now() - start), 100)
    return () => clearInterval(id)
  }, [running])
  return (ms / 1000).toFixed(1)
}

export function useTimers() {
  const ids = useRef<number[]>([])
  useEffect(() => () => ids.current.forEach((t) => clearTimeout(t)), [])
  return {
    after(ms: number, fn: () => void) {
      ids.current.push(window.setTimeout(fn, ms))
    },
    clear() {
      ids.current.forEach((t) => clearTimeout(t))
      ids.current = []
    },
  }
}

/* Exact status glyphs from the S-15 / S-16 boards (14px viewBox, 10–12px). */
export function GlyphAccepted({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M3 7.5l2.6 2.6L11 4.5" fill="none" stroke="#5FEEA3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
export function GlyphRejected({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="#FF3478" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
export function GlyphInconclusive({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="#FF986E" strokeWidth="1.6" strokeDasharray="2 2" />
    </svg>
  )
}
export function GlyphWarning({ size = 12, stroke = 1.5 }: { size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth={stroke} strokeLinejoin="round" />
    </svg>
  )
}
export function GlyphSent() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 5h6M5.5 2.5L8 5 5.5 7.5" fill="none" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconHistory() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        d="M3.5 9a5.5 5.5 0 105.5-5.5A5.5 5.5 0 004.6 5.7M3.5 3v3h3M9 6v3.2l2 1.3"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
