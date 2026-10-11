/*
 * Intake kit (S-01, S-02, S-03): the small pieces the three intake screens share, drawn as on the
 * Paper boards and the DS-08 feedback system. Colors come from tokens.css; motion from the
 * --motion-* tokens (fallbacks inline until motion.css carries them).
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import './kit.css'

/* ── Spinner: ring, 2 px stroke, 270° arc, 1000 ms per turn, always beside a stage word ── */
export function Spinner({ size = 14, onAccent }: { size?: 14 | 20 | 28; onAccent?: boolean }) {
  const r = (size - 2) / 2
  const c = 2 * Math.PI * r
  return (
    <svg className={`ink-spinner${onAccent ? ' is-on-accent' : ''}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle className="ink-spinner-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="2" />
      <circle
        className="ink-spinner-arc"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${(c * 0.75).toFixed(2)} ${c.toFixed(2)}`}
      />
    </svg>
  )
}

/* ── Shimmer block: #0F1F23 r2 sized to the content, a #243237 band at 24% sweeps over it ── */
export function Shim({ w, h = 12, onPanelStrip, style }: { w: number | string; h?: number; onPanelStrip?: boolean; style?: CSSProperties }) {
  return <span aria-hidden className={`ink-shim${onPanelStrip ? ' is-strip' : ''}`} style={{ width: w, height: h, ...style }} />
}

/* ── Status glyphs at 10 px, colored by their word ───────────────────── */
type Tone = 'bad' | 'warn' | 'info' | 'good' | 'quiet' | 'plain'
export function Glyph({ kind, size = 10 }: { kind: 'x' | 'warn' | 'info' | 'check' | 'ring' | 'dot'; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 12 12', 'aria-hidden': true } as const
  switch (kind) {
    case 'x':
      return (
        <svg {...s}>
          <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'warn':
      return (
        <svg {...s}>
          <path d="M6 1.8L11 10.2H1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M6 5v2.4M6 8.8v.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'info':
      return (
        <svg {...s}>
          <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6 5.4v3M6 3.6v.1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'check':
      return (
        <svg {...s}>
          <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'ring':
      return (
        <svg {...s}>
          <circle cx="6" cy="6" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )
    case 'dot':
      return (
        <svg {...s}>
          <circle cx="6" cy="6" r="3" fill="currentColor" />
        </svg>
      )
  }
}

/* ── Banner: 28 tall, inset, 2 px rail in the signal color, icon + word + message ── */
export function Banner({
  tone,
  word,
  children,
  meta,
  action,
  className = '',
}: {
  tone: Exclude<Tone, 'quiet' | 'plain'>
  word: string
  children?: ReactNode
  meta?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const glyph = tone === 'bad' ? 'x' : tone === 'warn' ? 'warn' : tone === 'info' ? 'info' : 'check'
  return (
    <div className={`ink-banner is-${tone} ${className}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <span className="ink-banner-word">
        <Glyph kind={glyph} />
        {word}
      </span>
      {children}
      {meta != null && <span className="mono ink-banner-meta">{meta}</span>}
      {action}
    </div>
  )
}

/* ── Group header: 18 tall, Hanken 11 label with tracking, mono 10 note at the right ── */
export function GroupHeader({ label, note, className = '', style }: { label: string; note?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`ink-group ${className}`} style={style}>
      <span className="ink-group-label">{label}</span>
      {note != null && <span className="mono ink-group-note">{note}</span>}
    </div>
  )
}

/* ── Inspector: run block (one line, optional mint, the engine line) ── */
export function RunBlock({ line, children, center }: { line: ReactNode; children?: ReactNode; center?: boolean }) {
  return (
    <div className="ink-run">
      <div className="ink-run-line">{line}</div>
      {children}
      <div className={`ink-powered${center ? ' is-center' : ''}`}>
        <span>Powered by the</span>
        <span className="ink-powered-name">qscore</span>
        <span>engine · qscore-2026.1</span>
      </div>
    </div>
  )
}

/* ── Inspector fact rows: 28 tall, label 12 secondary, value mono 12 white ── */
export function Facts({ rows, labelWidth = 120 }: { rows: [ReactNode, ReactNode][]; labelWidth?: number }) {
  return (
    <div className="ink-facts">
      {rows.map(([label, value], i) => (
        <div key={i} className="ink-fact">
          <span className="ink-fact-label" style={{ width: labelWidth }}>
            {label}
          </span>
          <span className="mono ink-fact-value">{value}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Inspector collapsible section: 44 tall header, chevron turns in 200 ms, body fades ── */
export function InspSection({
  icon,
  title,
  meta,
  children,
  defaultOpen = true,
}: {
  icon: ReactNode
  title: string
  meta?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="ink-sec">
      <button className="ink-sec-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span className="ink-sec-title">{title}</span>
        {meta != null && <span className="mono ink-sec-meta">{meta}</span>}
        <svg className={`ink-chev${open ? '' : ' is-closed'}`} width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M3.5 8.75L7 5.25l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="ink-sec-body">{children}</div>}
    </section>
  )
}

/* ── Top bar right side on intake screens: GPU status + the account handle ── */
export function AccountHandle({ handle = 'qlab-dev' }: { handle?: string }) {
  return (
    <span className="ink-account">
      <span className="ink-account-icon">
        <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
          <path
            d="M7 7.2a2.4 2.4 0 100-4.8a2.4 2.4 0 000 4.8zM2.8 12.2c.6-2 2.2-3.1 4.2-3.1s3.6 1.1 4.2 3.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="mono">{handle}</span>
    </span>
  )
}
