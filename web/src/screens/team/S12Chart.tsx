/*
 * S-12 timeline: two_qubit_count per run, as % change vs each circuit's first run. Measured from the
 * board's 974 × 532 inset and laid out from the inset's real size, so states that shorten the tile
 * keep the same margins: plot from x 64, first tick at x 84, +max at y 40, axis at H − 48.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { Label, Series } from './repoData'

export type ChartConfig = {
  ticks: string[]
  /** px from the last tick to the inset's right edge */
  rightPad: number
  yMax: number
  yMin: number
  grid: number[]
  yLabels: number[]
  series: Series[]
  selected: string | null
  needle: { x: number; label: string }
  /** many circuits: thinner others, no dots on them, smaller dots on the selected line */
  dense?: boolean
  onSelect?: (id: string) => void
}

const fmtPct = (v: number) => (v > 0 ? `+${v}%` : v < 0 ? `−${-v}%` : '0%')

export function RunChart(cfg: ChartConfig) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="s12c" role="img" aria-label={`two_qubit_count per run, change vs first run. ${cfg.needle.label}`}>
      {size && size.w > 0 && <ChartBody {...cfg} w={size.w} h={size.h} />}
    </div>
  )
}

function ChartBody({ ticks, rightPad, yMax, yMin, grid, yLabels, series, selected, needle, dense, onSelect, w, h }: ChartConfig & { w: number; h: number }) {
  const x0 = 84
  const step = (w - rightPad - x0) / (ticks.length - 1)
  const X = (x: number) => x0 + x * step
  const axisY = h - 48
  const Y = (v: number) => 40 + ((yMax - v) * (h - 117)) / (yMax - yMin)
  const left = 64
  const right = w - 16
  const nx = X(needle.x)
  const sel = series.find((s) => s.id === selected)
  const others = series.filter((s) => s.id !== selected)
  const line = (s: Series) => s.points.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')

  return (
    <>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="s12c-svg">
        <path className="s12c-grid" d={grid.map((v) => `M${left} ${Y(v)}H${right}`).join('')} />
        <path className="s12c-grid" d={ticks.map((_, i) => `M${X(i)} 36V${axisY}`).join('')} />
        <path className="s12c-zero" d={`M${left} ${Y(0)}H${right}`} />
        <path className="s12c-axis" d={`M${left} ${axisY}H${right}`} />
        <path className="s12c-axis" d={ticks.slice(0, -1).map((_, i) => `M${X(i)} ${axisY}v5`).join('')} />
        {others.map((s) =>
          s.single ? (
            <circle key={s.id} className="s12c-ring" cx={X(s.points[0].x)} cy={Y(s.points[0].y)} r="4" onClick={() => onSelect?.(s.id)} />
          ) : (
            <g key={s.id} className="s12c-other" onClick={() => onSelect?.(s.id)}>
              <polyline className="s12c-hit" points={line(s)} />
              <polyline className={`s12c-other-line${dense ? ' is-dense' : ''}`} points={line(s)} />
              {!dense && s.points.map((p, i) => <circle key={i} className="s12c-other-dot" cx={X(p.x)} cy={Y(p.y)} r="3" />)}
            </g>
          ),
        )}
        {sel && sel.points.length > 1 && <polyline className="s12c-sel-line" points={line(sel)} />}
        <path className="s12c-needle" d={`M${nx} 16V${axisY}`} />
        {sel &&
          sel.points.map((p, i) => {
            const last = i === sel.points.length - 1
            if (sel.single) return <circle key={i} className="s12c-sel-ring" cx={X(p.x)} cy={Y(p.y)} r="4.5" />
            return <circle key={i} className="s12c-sel-dot" cx={X(p.x)} cy={Y(p.y)} r={last ? (dense ? 4 : 4.5) : dense ? 3 : 3.5} />
          })}
        <circle className="s12c-knob" cx={nx} cy={axisY} r="7" />
      </svg>
      <span className="s12c-title">% vs first run</span>
      {yLabels.map((v) => (
        <span key={v} className={`s12c-y${v === 0 ? ' is-zero' : ''}`} style={{ top: Y(v) - 6 }}>
          {fmtPct(v)}
        </span>
      ))}
      {ticks.map((t, i) => (
        <span key={t} className="s12c-x" style={{ left: X(i) - 30, top: axisY + 10 }}>
          {t}
        </span>
      ))}
      <span className="s12c-label is-needle" style={pos({ i: 0, text: '', dx: -8, dy: 0, align: 'end' }, nx, 18)}>
        {needle.label}
      </span>
      {others.map(
        (s) =>
          s.summary && (
            <span key={s.id} className="s12c-label is-other" style={pos(s.summary, X(s.points[s.summary.i].x), Y(s.points[s.summary.i].y) + s.summary.dy)}>
              {s.summary.text}
            </span>
          ),
      )}
      {sel?.labels?.map((l) => (
        <span key={l.i + l.text} className="s12c-label is-sel" style={pos(l, X(sel.points[l.i].x), Y(sel.points[l.i].y) + l.dy)}>
          {l.text}
        </span>
      ))}
    </>
  )
}

/** Absolute position for a label: its start, end or center sits at x + dx; top at y. */
function pos(l: Label, x: number, top: number): CSSProperties {
  const at = x + l.dx
  if (l.align === 'start') return { left: at, top }
  if (l.align === 'end') return { right: `calc(100% - ${at}px)`, top }
  return { left: at - 40, top, width: 80, textAlign: 'center' }
}
