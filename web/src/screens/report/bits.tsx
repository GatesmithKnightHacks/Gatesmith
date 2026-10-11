/*
 * Pieces shared by S-09 and S-10, drawn as their boards draw them: banner (28 tall, 2 px rail in the signal
 * color), spinner ring beside a stage word, shimmer blocks, inspector fact rows, code blocks, status marks.
 * Motion follows DS-08: spinner 1000 ms linear, shimmer 1200 ms linear, everything else eases.
 */
import type { CSSProperties, ReactNode } from 'react'
import { GpuStatus } from '../../ui/Shell'
import { HANDLE, type CodeLine } from './data'
import './bits.css'

/* ── Status marks (icon + word, the engine's vocabulary) ─────────────── */
export type Mark = 'accepted' | 'rejected' | 'inconclusive' | 'high' | 'warning' | 'info' | 'unavailable' | 'done' | 'failed' | 'offline'

const MARK_COLOR: Record<Mark, string> = {
  accepted: 'var(--color-signal-good)',
  done: 'var(--color-text-primary)',
  rejected: 'var(--color-signal-bad)',
  failed: 'var(--color-signal-bad)',
  high: 'var(--color-signal-bad)',
  inconclusive: 'var(--color-signal-warn)',
  warning: 'var(--color-signal-warn)',
  info: 'var(--color-signal-info)',
  unavailable: 'var(--color-text-tertiary)',
  offline: 'var(--color-text-tertiary)',
}

export function MarkIcon({ kind, size = 10, color }: { kind: Mark; size?: number; color?: string }) {
  const c = color ?? MARK_COLOR[kind]
  switch (kind) {
    case 'accepted':
    case 'done':
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
          <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'rejected':
    case 'failed':
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
          <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'inconclusive':
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
          <circle cx="6" cy="6" r="4" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray="2 1.6" />
        </svg>
      )
    case 'high':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
          <path d="M7 2v6M7 11v.5" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'warning':
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
          <path d="M6 1.5l5 9H1z" fill="none" stroke={c} strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M6 5v2.4M6 9v.2" fill="none" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'info':
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke={c} strokeWidth="1.3" />
          <path d="M6 5.5v3M6 3.6v.1" fill="none" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'unavailable':
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
          <circle cx="6" cy="6" r="3.5" fill="none" stroke={c} strokeWidth="1.4" />
        </svg>
      )
    case 'offline':
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke={c} strokeWidth="1.3" />
          <path d="M3 9l6-6" fill="none" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
  }
}

/** Icon + word in the signal color. */
export function MarkWord({ kind, word, size = 11, gap = 4, className = '' }: { kind: Mark; word?: string; size?: 10 | 11 | 12; gap?: number; className?: string }) {
  return (
    <span className={`rp-mark ${className}`} style={{ color: MARK_COLOR[kind], gap, fontSize: size }}>
      <MarkIcon kind={kind} />
      <span>{word ?? kind}</span>
    </span>
  )
}

/* ── Banner ──────────────────────────────────────────────────────────── */
const RAIL: Record<'failed' | 'warning' | 'info' | 'offline', string> = {
  failed: 'var(--color-signal-bad)',
  warning: 'var(--color-signal-warn)',
  info: 'var(--color-signal-info)',
  offline: 'var(--color-text-tertiary)',
}

/** 28 tall on the inset, 2 px rail, icon + status word, the message, one editor button at the right. */
export function Banner({
  kind,
  word,
  children,
  action,
  style,
}: {
  kind: 'failed' | 'warning' | 'info' | 'offline'
  word?: string
  children: ReactNode
  action?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div className={`rp-banner is-${kind}`} role={kind === 'failed' ? 'alert' : 'status'} style={{ borderLeftColor: RAIL[kind], ...style }}>
      <span className="rp-banner-word" style={{ color: kind === 'offline' ? 'var(--color-text-secondary)' : RAIL[kind] }}>
        <MarkIcon kind={kind} color={RAIL[kind]} />
        {word ?? kind}
      </span>
      <span className="rp-banner-text">{children}</span>
      {action}
    </div>
  )
}

/** Editor button on an inset surface (banners): the panel color, one step lighter on hover. */
export function InsetButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button className="rp-btn-inset" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/* ── Spinner and stage line ──────────────────────────────────────────── */
/** Ring, 2 px stroke, 270° arc. Never alone: always beside a stage word. */
export function Spinner({ size = 14 }: { size?: 14 | 20 | 28 }) {
  const r = (size - 2) / 2
  const c = 2 * Math.PI * r
  return (
    <svg className="rp-spinner" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-selected)" strokeWidth="2" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-text-secondary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${(c * 0.75).toFixed(2)} ${c.toFixed(2)}`}
      />
    </svg>
  )
}

/** Spinner + stage word in blue + the estimate at the right, as the loading cells draw it. */
export function StageLine({ stage, detail, estimate }: { stage: string; detail?: string; estimate?: string }) {
  return (
    <div className="rp-stage" role="status" aria-live="polite">
      <Spinner />
      <span className="rp-stage-word">
        {stage}
        {detail && <span> · {detail}</span>}
      </span>
      {estimate && <span className="rp-stage-estimate mono">{estimate}</span>}
    </div>
  )
}

/* ── Shimmer block ───────────────────────────────────────────────────── */
/** A block where content will be: #0F1F23 r2 sized to the content; on panel strips pass `onPanel`. */
export function Shim({ w, h = 12, onPanel, style }: { w: number | string; h?: number; onPanel?: boolean; style?: CSSProperties }) {
  return <span aria-hidden className={`rp-sk${onPanel ? ' is-on-panel' : ''}`} style={{ width: w, height: h, ...style }} />
}

/* ── Inspector fact rows ─────────────────────────────────────────────── */
export function FactRow({ label, value, labelWidth = 128, loading }: { label: ReactNode; value: ReactNode; labelWidth?: number; loading?: boolean }) {
  return (
    <div className="rp-fact">
      <span className="rp-fact-label" style={{ width: labelWidth }}>
        {label}
      </span>
      {loading ? <Shim w={120} /> : <span className="rp-fact-value mono">{value}</span>}
    </div>
  )
}

/* ── Code block ──────────────────────────────────────────────────────── */
/** 20 px lines, 44 px gutter with a 2 px #243237 rule, a 2 px rail per line, mono 12. */
export function CodeBlock({ lines, start = 1, pending = 0, className = '' }: { lines: CodeLine[]; start?: number; pending?: number; className?: string }) {
  return (
    <div className={`rp-code ${className}`}>
      {lines.map((l, i) => (
        <div key={i} className="rp-code-line">
          <span className="rp-code-n mono">{start + i}</span>
          <span className={`rp-code-rail${l.rail ? ` is-${l.rail}` : ''}`} />
          <span className={`rp-code-text mono${l.comment ? ' is-comment' : ''}`}>{l.text || ' '}</span>
        </div>
      ))}
      {Array.from({ length: pending }, (_, i) => (
        <div key={`p${i}`} className="rp-code-line">
          <span className="rp-code-n mono">{start + lines.length + i}</span>
          <span className="rp-code-rail" />
          <span className="rp-code-text">
            <Shim w={[120, 180, 150, 96][i % 4]} h={10} onPanel />
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── Top bar status for signed-in screens: GPU state + the account handle ── */
export function AccountStatus({ gpu = true }: { gpu?: boolean }) {
  return (
    <>
      <GpuStatus online={gpu} />
      <span className="rp-account">
        <span className="rp-account-icon" aria-hidden>
          <svg width="10" height="10" viewBox="0 0 14 14">
            <path
              d="M7 7.2a2.4 2.4 0 100-4.8a2.4 2.4 0 000 4.8zM2.8 12.2c.6-2 2.2-3.1 4.2-3.1s3.6 1.1 4.2 3.1"
              fill="none"
              stroke="#C2DADF"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="mono">{HANDLE}</span>
      </span>
    </>
  )
}
