/*
 * Pieces shared by S-06 Fix review and S-07 Loop view, drawn as on their Paper boards.
 * Status marks use the board's exact paths (10px, stroke 1.6).
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { TabStrip } from '../../ui/Shell'
import { RUN } from '../../data/demo'

/* ── Status marks ─────────────────────────────────────────────────────── */
export type Mark =
  | 'check'
  | 'check-muted'
  | 'cross'
  | 'dash'
  | 'info'
  | 'warning'
  | 'inconclusive'
  | 'fired'
  | 'dot-blue'
  | 'dot-violet'
  | 'dot-yellow'
  | 'dot-grey'

const MARK_COLOR: Record<Mark, string> = {
  check: 'var(--color-signal-good)',
  'check-muted': 'var(--color-text-secondary)',
  cross: 'var(--color-signal-bad)',
  dash: 'var(--color-text-disabled)',
  info: 'var(--color-signal-info)',
  warning: 'var(--color-signal-warn)',
  inconclusive: 'var(--color-signal-warn)',
  fired: 'var(--color-text-primary)',
  'dot-blue': 'var(--color-signal-info)',
  'dot-violet': 'var(--color-signal-ai)',
  'dot-yellow': 'var(--color-signal-select)',
  'dot-grey': 'var(--color-text-disabled)',
}

export function MarkIcon({ kind }: { kind: Mark }) {
  const c = MARK_COLOR[kind]
  if (kind.startsWith('dot-'))
    return <span className="im-dot" style={{ background: c }} aria-hidden />
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
      {(kind === 'check' || kind === 'check-muted') && (
        <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {kind === 'cross' && (
        <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {kind === 'dash' && <path d="M4 7h6" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === 'info' && <circle cx="7" cy="7" r="4.5" fill="none" stroke={c} strokeWidth="1.6" />}
      {kind === 'warning' && <path d="M7 2.5l5 9H2z" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />}
      {kind === 'inconclusive' && (
        <circle cx="7" cy="7" r="4.5" fill="none" stroke={c} strokeWidth="1.6" strokeDasharray="2.2 1.8" />
      )}
      {kind === 'fired' && <rect x="3" y="3" width="8" height="8" rx="1" fill={c} />}
    </svg>
  )
}

/** Icon + word. The word takes the mark's color unless `wordColor` says otherwise. */
export function Word({ kind, children, wordColor, gap = 4 }: { kind: Mark; children: ReactNode; wordColor?: string; gap?: number }) {
  return (
    <span className="im-word" style={{ gap, color: wordColor ?? MARK_COLOR[kind] }}>
      <MarkIcon kind={kind} />
      <span>{children}</span>
    </span>
  )
}

/** A pale status chip: 20 tall, 12% tint, 11px word (S-06 Verification, Before and after). */
export function Chip({ kind, children, tint }: { kind?: Mark; children: ReactNode; tint: string }) {
  return (
    <span className="im-chip" style={{ background: `color-mix(in srgb, ${tint} 12%, transparent)`, color: tint }}>
      {kind && <MarkIcon kind={kind} />}
      <span>{children}</span>
    </span>
  )
}

/* ── Rows ─────────────────────────────────────────────────────────────── */
/** 28px rows ruled by 1px ground lines, the last one closed at the bottom. */
export function Rows({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="im-rows" style={style}>
      {children}
    </div>
  )
}

export function Row({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`im-row ${className}`} style={style}>
      {children}
    </div>
  )
}

/** Fixed-width cell. `end` right-aligns. */
export function Cell({
  w,
  end,
  children,
  className = '',
  style,
}: {
  w?: number
  end?: boolean
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`im-cell ${className}`}
      style={{ width: w, flex: w == null ? '1 1 0' : '0 0 auto', justifyContent: end ? 'flex-end' : undefined, ...style }}
    >
      {children}
    </div>
  )
}

/** "44 →" in tertiary then the new value in white. */
export function FromTo({ from, to }: { from: ReactNode; to: ReactNode }) {
  return (
    <>
      <span className="mono im-tertiary">{from} →</span>
      <span className="mono im-primary">{to}</span>
    </>
  )
}

/* ── Inspector section ───────────────────────────────────────────────── */
export function ISection({
  icon,
  title,
  meta,
  border = true,
  children,
}: {
  icon: ReactNode
  title: string
  meta?: ReactNode
  border?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <section className={`im-section${border ? ' has-border' : ''}`}>
      <button className="im-section-header" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span className="im-section-title">{title}</span>
        {meta != null && <span className="im-section-meta mono">{meta}</span>}
        <svg className="im-chevron" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M3.5 8.5L7 5l3.5 3.5" fill="none" stroke="#C2DADF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="im-collapse" data-open={open}>
        <div className="im-collapse-inner">
          <div className="im-section-body">{children}</div>
        </div>
      </div>
    </section>
  )
}

const sec = { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.4 } as const

export const Icons = {
  chat: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 4.5a1.5 1.5 0 011.5-1.5h9A1.5 1.5 0 0115 4.5v6a1.5 1.5 0 01-1.5 1.5H8l-3.5 3v-3h0A1.5 1.5 0 013 10.5z" {...sec} strokeLinejoin="round" />
    </svg>
  ),
  list: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 4.5h12M3 9h12M3 13.5h7" {...sec} strokeLinecap="round" />
    </svg>
  ),
  queue: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 4.5h8M3 9h8M3 13.5h5M13.5 8v6M11 11.5l2.5 2.5 2.5-2.5" {...sec} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  steps: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 5h4v4h4v4h4" {...sec} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M9 2.5l5 2v4.5c0 3.5-2.3 5.6-5 6.5-2.7-.9-5-3-5-6.5V4.5z" {...sec} strokeLinejoin="round" />
    </svg>
  ),
  engine: (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
      <path d="M7 1.5l4.5 2v3.5c0 3-2 4.6-4.5 5.5C4.5 11.6 2.5 10 2.5 7V3.5z" fill="none" stroke="#C2DADF" strokeWidth="1.2" />
    </svg>
  ),
  stop: (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
    </svg>
  ),
}

/* ── Decision block (inspector top) ─────────────────────────────────── */
export function DecisionBlock({ line, children, style }: { line: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="im-decision" style={style}>
      <div className="im-decision-line">{line}</div>
      {children}
    </div>
  )
}

export function Caption({ children }: { children: ReactNode }) {
  return <div className="im-caption">{children}</div>
}

/** Auto mode switch as drawn on S-07: white track when on, never mint (one mint per view). */
export function AutoSwitch({ on, onChange }: { on: boolean; onChange?: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} aria-label="Auto mode" className={`im-switch${on ? ' is-on' : ''}`} onClick={() => onChange?.(!on)}>
      <span className="im-switch-knob" />
    </button>
  )
}

/* ── Tabs on the ground ──────────────────────────────────────────────── */
export function RunTabs() {
  return (
    <TabStrip
      tabs={[
        { id: 'a', label: RUN.file, active: true },
        { id: 'b', label: RUN.other },
      ]}
    />
  )
}

