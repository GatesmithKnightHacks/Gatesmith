/*
 * Spinner (DS-08): a 2px ring with a 270° arc, one turn per 1000 ms, linear. Sizes 14 (inline beside
 * a word), 20 (inside a button), 28 (tile center, only where no skeleton shape fits). On panels the
 * arc is #C2DADF on a #354348 track; on the mint button it is #141414 on #141414 at 25%.
 * A spinner never appears alone: Spinner always carries its stage word and, when known, the
 * estimate ("Scoring · measure" "about 40 s left"). Reduced motion stops it as a whole static ring.
 */
import type { CSSProperties, ReactNode } from 'react'
import './feedback.css'

export type SpinnerSize = 14 | 20 | 28
export type SpinnerTone = 'panel' | 'accent'

/** The bare ring, for a button's reserved slot where the label is the stage word. */
export function SpinnerRing({ size = 14, tone = 'panel' }: { size?: SpinnerSize; tone?: SpinnerTone }) {
  const c = size / 2
  const r = c - 1
  return (
    <svg
      className={`spinner-ring is-${tone}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      <circle className="spinner-track" cx={c} cy={c} r={r} fill="none" strokeWidth="2" />
      <path className="spinner-arc" d={`M${c} 1A${r} ${r} 0 1 1 1 ${c}`} fill="none" strokeWidth="2" />
    </svg>
  )
}

/**
 * Ring + stage word (+ estimate). 14 and 20 sit inline (gap 6); 28 stacks in the tile center
 * (ring, gap 10, the stage line, the estimate under it).
 */
export function Spinner({
  stage,
  estimate,
  size = 14,
  tone = 'panel',
  style,
  className = '',
}: {
  /** What is happening now, e.g. "Scoring · measure". Required: the word carries the wait. */
  stage: ReactNode
  /** "about 40 s left", "estimate unknown"; mono, tertiary */
  estimate?: ReactNode
  size?: SpinnerSize
  tone?: SpinnerTone
  style?: CSSProperties
  className?: string
}) {
  const center = size === 28
  return (
    <span
      role="status"
      aria-live="polite"
      className={`spinner${center ? ' is-center' : ''} ${className}`}
      style={style}
    >
      <SpinnerRing size={size} tone={tone} />
      {center ? (
        <span className="spinner-lines">
          <span className="spinner-stage">{stage}</span>
          {estimate != null && <span className="spinner-estimate mono">{estimate}</span>}
        </span>
      ) : (
        <>
          <span className="spinner-stage">{stage}</span>
          {estimate != null && <span className="spinner-estimate mono">{estimate}</span>}
        </>
      )}
    </span>
  )
}
