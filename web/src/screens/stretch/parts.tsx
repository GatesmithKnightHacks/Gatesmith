/*
 * Pieces shared by the two stretch screens (S-15 Candidate screening, S-16 Model bench), drawn as on
 * their Paper boards (1BKI-0, 1CJS-0) and states boards (1LVA-0, 1LWU-0). Local on purpose: the
 * glyphs here are the boards' exact ones, a step finer than the shared status chip.
 */
import type { CSSProperties, ReactNode } from 'react'
import { EditorButton } from '../../ui/parts'
import './stretch.css'

/* ── Top bar, right side: GPU state and the signed-in handle ─────────── */
export function AccountStatus({ gpu = 'online' }: { gpu?: 'online' | 'off' }) {
  return (
    <span className="st-topbar-status">
      <span className="st-gpu">
        <span className={`st-gpu-dot${gpu === 'off' ? ' is-off' : ''}`} />
        {gpu === 'online' ? 'GPU online' : 'GPU off'}
      </span>
      <span className="st-account">
        <span className="st-account-disc">
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
        <span className="mono">qlab-dev</span>
      </span>
    </span>
  )
}

/* ── Status glyph + word ─────────────────────────────────────────────── */
export type Word =
  | 'queued'
  | 'screening'
  | 'verifying'
  | 'failed'
  | 'passed'
  | 'accepted'
  | 'rejected'
  | 'inconclusive'
  | 'proposed'
  | 'unavailable'
  | 'warning'
  | 'running'

const WORD_CLASS: Record<Word, string> = {
  queued: 'is-secondary',
  screening: 'is-secondary',
  verifying: 'is-info',
  running: 'is-info',
  failed: 'is-bad',
  rejected: 'is-bad',
  passed: 'is-good',
  accepted: 'is-good',
  inconclusive: 'is-warn',
  warning: 'is-warn',
  proposed: 'is-ai',
  unavailable: 'is-tertiary',
}

export function Glyph({ word, size = 10 }: { word: Word; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 10 10', 'aria-hidden': true, className: 'st-glyph' } as const
  switch (word) {
    case 'queued':
      return (
        <svg {...s}>
          <circle cx="5" cy="5" r="3.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'unavailable':
      return (
        <svg {...s} width={8} height={8} viewBox="0 0 8 8">
          <circle cx="4" cy="4" r="3.25" fill="none" stroke="var(--color-text-disabled)" strokeWidth="1.5" />
        </svg>
      )
    case 'screening':
      return <Spinner size={14} />
    case 'verifying':
    case 'running':
      return <span className="st-dot6" aria-hidden />
    case 'failed':
    case 'rejected':
      return (
        <svg {...s}>
          <path d="M2 2l6 6M8 2L2 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'passed':
    case 'accepted':
      return (
        <svg {...s}>
          <path d="M1.5 5.2l2.3 2.3L8.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'inconclusive':
      return (
        <svg {...s}>
          <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.6" />
        </svg>
      )
    case 'warning':
      return (
        <svg {...s}>
          <path d="M5 1.2L9.2 8.6H.8z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      )
    case 'proposed':
      return (
        <svg {...s}>
          <path d="M5 1.2l3.8 3.8L5 8.8 1.2 5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      )
  }
}

/** Icon + word in its signal color. `label` replaces the word, `gap` follows the board (4 or 5). */
export function StatusWord({ word, label, gap = 5, className = '' }: { word: Word; label?: ReactNode; gap?: number; className?: string }) {
  return (
    <span className={`st-word ${WORD_CLASS[word]} ${className}`} style={{ gap }}>
      <Glyph word={word} />
      <span>{label ?? word}</span>
    </span>
  )
}

/* ── Loading ─────────────────────────────────────────────────────────── */
/** Spinner ring: 2 px, 270°, one turn per --motion-spin (linear). Always beside a stage word. */
export function Spinner({ size = 14 }: { size?: 14 | 20 | 28 }) {
  const r = size / 2 - 1.5
  const c = 2 * Math.PI * r
  return (
    <svg className="st-spinner" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border-subtle)" strokeWidth="2" />
      <circle
        className="st-spinner-arc"
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

/** A stage word with its spinner: "Loading candidates for finding #3 · about 1 s". */
export function Stage({ children, meta, style }: { children: ReactNode; meta?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="st-stage" role="status" aria-live="polite" style={style}>
      <Spinner />
      <span className="st-stage-word">{children}</span>
      {meta != null && <span className="st-stage-meta mono">{meta}</span>}
    </div>
  )
}

/**
 * Skeleton block sized to the content it stands for. On an inset (#0F1F23) the block steps up to the
 * panel and the band to #2A383D, never brighter (fix round 3, R2). Reduced motion: the opacity pulse.
 */
export function Block({ w, h = 10, style }: { w: number | string; h?: number; style?: CSSProperties }) {
  return <span aria-hidden className="st-block" style={{ width: w, height: h, ...style }} />
}

/* ── Banner: 28 tall, 2 px rail in the signal color, word, message, one editor button ── */
export function Banner({
  word,
  label,
  children,
  action,
  onAction,
  style,
}: {
  word: 'warning' | 'failed' | 'offline' | 'unavailable'
  label?: string
  children: ReactNode
  action?: string
  onAction?: () => void
  style?: CSSProperties
}) {
  return (
    <div className={`st-banner is-${word}`} role={word === 'failed' ? 'alert' : 'status'} style={style}>
      {word === 'offline' ? (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="st-glyph">
          <path d="M1 3.6a6 6 0 018 0M2.6 5.4a3.6 3.6 0 014.8 0M4.3 7.2a1.2 1.2 0 011.4 0M1.2 1.2l7.6 7.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ) : (
        <Glyph word={word === 'unavailable' ? 'warning' : word} />
      )}
      <span className="st-banner-word">{label ?? word}</span>
      <span className="st-banner-text">{children}</span>
      {action && (
        <EditorButton onClick={onAction} style={{ background: 'var(--color-surface-panel)' }}>
          {action}
        </EditorButton>
      )}
    </div>
  )
}

/* ── Fact rows: label left, value + unit right ───────────────────────── */
export function Fact({
  label,
  value,
  unit,
  height = 24,
  last,
  mono = true,
  small,
}: {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  height?: number
  last?: boolean
  mono?: boolean
  /** value at 11 px (ids, short lists) */
  small?: boolean
}) {
  return (
    <div className={`st-fact${last ? ' is-last' : ''}`} style={{ height }}>
      <span className="st-fact-label">{label}</span>
      <span className="st-fact-value">
        <span className={`${mono ? 'mono' : ''}${small ? ' is-small' : ''}`}>{value}</span>
        {unit != null && <span className="mono st-unit">{unit}</span>}
      </span>
    </div>
  )
}

/** Layer dot: blue for the engine, violet for anything a model proposed. */
export function LayerDot({ layer }: { layer: 'engine' | 'model' | 'white' }) {
  return <span className={`st-layer-dot is-${layer}`} aria-hidden />
}

/** 56 × 6 probability bar in the model color (predicted, not verified). */
export function ProbBar({ value, width = 56 }: { value: number; width?: number }) {
  return (
    <span className="st-prob" style={{ width }}>
      <span style={{ width: Math.round(value * width) }} />
    </span>
  )
}
