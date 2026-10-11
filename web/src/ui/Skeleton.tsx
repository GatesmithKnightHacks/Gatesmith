/*
 * Skeleton (DS-04 · Skeleton): placeholder bars that hold the exact layout of what is coming.
 * Labels, tabs and section titles stay real; only values wait. One shimmer sweeps every block on
 * the screen together, and only while something is loading.
 */
import type { CSSProperties, ReactNode } from 'react'
import './skeleton.css'

type SkProps = {
  /** width in px, or any CSS width */
  w: number | string
  /** 8 for 11–12px text, 10 for 14px titles; taller for buttons and charts */
  h?: number
  /** on a raised card the bar steps up one surface */
  onRaised?: boolean
  radius?: number
  style?: CSSProperties
  className?: string
}

export function Sk({ w, h = 8, onRaised, radius = 2, style, className = '' }: SkProps) {
  return (
    <span
      aria-hidden
      className={`sk${onRaised ? ' sk-on-raised' : ''} ${className}`}
      style={{ width: w, height: h, borderRadius: radius, ...style }}
    />
  )
}

/** A region that is loading: announces it once for screen readers and holds its skeleton children. */
export function SkRegion({ label, children, style, className = '' }: { label: string; children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className} style={style}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/** A finding card while scoring: same padding, rows and button slot as FindingCard. */
export function SkFindingCard({ widths = [112, 236, 148] }: { widths?: [number, number, number] }) {
  return (
    <div className="sk-finding-card" aria-hidden>
      <div className="sk-row">
        <Sk w={16} onRaised />
        <Sk w={36} onRaised />
        <span style={{ flex: '1 1 0' }} />
        <Sk w={widths[0]} onRaised />
      </div>
      <Sk w={widths[1]} h={10} onRaised />
      <div className="sk-row sk-row-between">
        <Sk w={widths[2]} onRaised />
        <span className="sk-button-slot" />
      </div>
    </div>
  )
}

/** Table rows with fixed lanes: first column left, the rest right-aligned like numbers. */
export function SkTableRows({
  rows = 4,
  lanes,
  height = 36,
  widths,
}: {
  rows?: number
  /** lane widths in px; the first lane flexes when 0 */
  lanes: number[]
  height?: number
  /** per row, per lane bar widths; falls back to a natural rhythm */
  widths?: number[][]
}) {
  const rhythm = [0.86, 0.7, 0.96, 0.6, 0.8, 0.66]
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="sk-table-row" style={{ height }} aria-hidden>
          {lanes.map((lane, i) => {
            const natural = Math.round((lane || 180) * rhythm[(r + i) % rhythm.length] * (i === 0 ? 0.9 : 0.55))
            const w = widths?.[r]?.[i] ?? natural
            return (
              <span key={i} className={`sk-lane${i === 0 ? ' is-first' : ''}`} style={lane ? { width: lane } : undefined}>
                <Sk w={w} />
              </span>
            )
          })}
        </div>
      ))}
    </>
  )
}
