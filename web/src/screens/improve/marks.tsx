/*
 * Status marks for S-06 and S-07, drawn with the boards' exact paths (12 px viewBox, shown at 10).
 * A status is always the icon plus its word, in the engine's vocabulary.
 */
import type { CSSProperties, ReactNode } from 'react'
import { WORD, type MarkKind } from './style'

export type { MarkKind }

export function Mark({ kind, size = 10 }: { kind: MarkKind; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 12 12', 'aria-hidden': true, className: 'im-mark' } as const
  switch (kind) {
    case 'accepted':
    case 'passed':
    case 'ok':
      return (
        <svg {...s}>
          <path d="M2.5 6.2l2.3 2.3 4.7-5" className="mk-good" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'rejected':
    case 'failed':
    case 'invalid':
      return (
        <svg {...s}>
          <path d="M3 3l6 6M9 3l-6 6" className="mk-bad" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'high':
      return (
        <svg {...s} viewBox="0 0 14 14">
          <path d="M7 2v6M7 11v.5" className="mk-bad" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'inconclusive':
      return (
        <svg {...s}>
          <circle cx="6" cy="6" r="4" className="mk-warn" strokeWidth="1.5" strokeDasharray="2 1.6" />
        </svg>
      )
    case 'warning':
      return (
        <svg {...s}>
          <path d="M6 1.6L10.9 10.2H1.1z" className="mk-warn" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M6 5v2.4M6 8.8v.1" className="mk-warn" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'queued':
    case 'skipped':
      return (
        <svg {...s}>
          <circle cx="6" cy="6" r="3.5" className="mk-dis" strokeWidth="1.4" />
        </svg>
      )
    case 'running':
    case 'verifying':
      return (
        <svg {...s}>
          <circle cx="6" cy="6" r="3" className="mk-fill-info" />
        </svg>
      )
    case 'done':
      return (
        <svg {...s}>
          <rect x="2.5" y="2.5" width="7" height="7" rx="1" className="mk-fill-info" />
        </svg>
      )
    case 'proposed':
      return (
        <svg {...s}>
          <path d="M6 1.5l4.5 4.5L6 10.5 1.5 6z" className="mk-ai" strokeWidth="1.68" strokeLinejoin="round" />
        </svg>
      )
    case 'cancelled':
      return (
        <svg {...s}>
          <rect x="2.5" y="2.5" width="7" height="7" rx="1" className="mk-sec" strokeWidth="1.4" />
        </svg>
      )
    case 'paused':
      return (
        <svg {...s}>
          <path d="M4 2.5v7M8 2.5v7" className="mk-sec" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
  }
}

/** Icon + word. `size` 12 in cards and rows, 11 in dense ladders. */
export function Word({
  kind,
  children,
  size = 12,
  gap = 4,
  iconSize = 10,
  style,
}: {
  kind: MarkKind
  children?: ReactNode
  size?: 11 | 12 | 14
  gap?: number
  iconSize?: number
  style?: CSSProperties
}) {
  return (
    <span className={`im-word is-${size}`} style={{ gap, color: WORD[kind], ...style }}>
      <Mark kind={kind} size={iconSize} />
      <span>{children ?? kind}</span>
    </span>
  )
}

/** The 14 px stage spinner (ring, 270° arc), always beside a stage word. */
export function Spinner({ size = 14 }: { size?: 14 | 20 | 28 }) {
  const r = size / 2 - 1.5
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="im-spinner" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} className="im-spinner-track" strokeWidth="2" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="im-spinner-arc"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${c * 0.75} ${c}`}
      />
    </svg>
  )
}

/** Info "i" in a ring, 12 px, for footnotes. */
export function InfoMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="im-mark">
      <circle cx="6" cy="6" r="4.75" className="mk-ter" strokeWidth="1.2" />
      <path d="M6 5.4v3M6 3.6v.2" className="mk-ter" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

/* ── Header and section icons ────────────────────────────────────────── */
export function ZoomOut({ big = false }: { big?: boolean }) {
  return big ? (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="im-mark">
      <circle cx="7" cy="7" r="4.8" className="mk-sec" strokeWidth="1.3" />
      <path d="M10.6 10.6L14.2 14.2M4.6 7h4.8" className="mk-sec" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="im-mark">
      <circle cx="6.5" cy="6.5" r="4.8" className="mk-sec" strokeWidth="1.3" />
      <path d="M10.2 10.2L14.5 14.5M4.3 6.5h4.4" className="mk-sec" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function ZoomIn({ big = false }: { big?: boolean }) {
  return big ? (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="im-mark">
      <circle cx="7" cy="7" r="4.8" className="mk-sec" strokeWidth="1.3" />
      <path d="M10.6 10.6L14.2 14.2M4.6 7h4.8M7 4.6v4.8" className="mk-sec" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="im-mark">
      <circle cx="6.5" cy="6.5" r="4.8" className="mk-sec" strokeWidth="1.3" />
      <path d="M10.2 10.2L14.5 14.5M4.3 6.5h4.4M6.5 4.3v4.4" className="mk-sec" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

/** Attempts section icon: three rows with leading dots (18 px, white). */
export function AttemptsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="im-mark">
      <path d="M4 4.5h10M4 9h10M4 13.5h10" className="mk-white" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2 4.5h.01M2 9h.01M2 13.5h.01" className="mk-white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Zoom slider: 90 px track with the 10 px knob. */
export function ZoomSlider({ knob }: { knob: number }) {
  return (
    <span className="im-zoom-track" aria-hidden>
      <span className="im-zoom-rule" />
      <span className="im-zoom-knob" style={{ left: knob }} />
    </span>
  )
}
