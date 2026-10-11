/*
 * Skeleton (DS-08 · Skeleton shimmer): blocks that hold the exact layout of what is coming. Labels,
 * tabs and section titles stay real; only values wait. Blocks are sized to the content's real shape
 * (text line 12, number 16, row 44, a bar its own length). Every block's band runs in phase, so the
 * sweep reads as one pass over the tile. Content arrives with SkSwap's 400 ms crossfade.
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { MOTION_MS } from './motionPreference'
import { usePresence } from './presence'
import './skeleton.css'

/** Negative delay that puts a newly mounted block in phase with every other block on the page. */
function phase(): string {
  return `-${Math.round(performance.now() % MOTION_MS.shimmer)}ms`
}

type SkProps = {
  /** width in px, or any CSS width */
  w: number | string
  /** 12 for a text line (default), 16 for a number, 44 for a row; a bar takes its own height */
  h?: number
  /** Kept for older screens: blocks are #0F1F23 on every surface now. */
  onRaised?: boolean
  /** On a panel-colored (#243237) header strip: block #243237, band #2A383D. */
  strip?: boolean
  radius?: number
  style?: CSSProperties
  className?: string
}

export function Sk({ w, h = 12, strip, radius = 2, style, className = '' }: SkProps) {
  const [at] = useState(phase)
  return (
    <span
      aria-hidden
      className={`sk${strip ? ' sk-strip' : ''} ${className}`}
      style={{ width: w, height: h, borderRadius: radius, ['--sk-phase' as string]: at, ...style }}
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

/**
 * Skeleton → content with the 400 ms crossfade: the blocks fade out while the content fades in, in
 * the same place, then the blocks are dropped. While `loading`, only the skeleton shows.
 */
export function SkSwap({
  loading,
  skeleton,
  children,
  className = '',
  style,
}: {
  loading: boolean
  skeleton: ReactNode
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const { mounted, leaving } = usePresence(loading, MOTION_MS.load)
  const [wasLoading, setWasLoading] = useState(loading)
  if (loading && !wasLoading) setWasLoading(true)
  const arrived = !loading && wasLoading
  return (
    <div className={`sk-swap ${className}`} style={style}>
      {mounted && <div className={leaving ? 'sk-swap-out' : undefined}>{skeleton}</div>}
      {!loading && <div className={arrived ? 'sk-swap-in' : undefined}>{children}</div>}
    </div>
  )
}

/** A finding card while scoring: same padding, rows and button slot as FindingCard. */
export function SkFindingCard({ widths = [112, 236, 148] }: { widths?: [number, number, number] }) {
  return (
    <div className="sk-finding-card" aria-hidden>
      <div className="sk-row">
        <Sk w={16} />
        <Sk w={36} />
        <span style={{ flex: '1 1 0' }} />
        <Sk w={widths[0]} />
      </div>
      <Sk w={widths[1]} h={16} />
      <div className="sk-row sk-row-between">
        <Sk w={widths[2]} />
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
