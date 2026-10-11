/*
 * The backends table: reliability_heuristic as two 6 px bars (final circuit over baseline), QPU time and
 * cost per run with the baseline under each value. The chosen backend is the yellow-outlined row;
 * arrow keys move the 2 px focus ring, Enter or Space chooses.
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Sk, SkRegion } from '../../ui/Skeleton'
import { BACKENDS, CAVEAT, barWidth, sec, usd, type Backend } from './data'
import { Spinner } from './Spinner'

/** How a row looks right now. */
export type RowMode = 'estimated' | 'running' | 'queued' | 'unavailable'

export function BackendTable({
  chosen,
  onChoose,
  modes,
  focusIndex,
}: {
  chosen: number
  onChoose: (i: number) => void
  modes?: RowMode[]
  /** draws the keyboard focus ring on this row (the states board's focus cell) */
  focusIndex?: number
}) {
  const rows = useRef<(HTMLDivElement | null)[]>([])

  const onKey = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(BACKENDS.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))
      rows.current[next]?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if ((modes?.[i] ?? 'estimated') === 'estimated') onChoose(i)
    }
  }

  return (
    <div className="est-table" role="listbox" aria-label="Backends">
      <div className="est-head">
        <div className="est-col-name">
          <span className="est-label">backend</span>
        </div>
        <div className="est-col-qubits">
          <span className="est-label">qubits</span>
        </div>
        <div className="est-col-rel">
          <div className="est-head-rel">
            <span className="est-label">reliability_heuristic (0, 1] · higher is better</span>
            <span className="est-caveat">{CAVEAT}</span>
          </div>
        </div>
        <div className="est-col-num">
          <span className="est-label">QPU time</span>
        </div>
        <div className="est-col-num">
          <span className="est-label">cost per run</span>
        </div>
      </div>
      {BACKENDS.map((b, i) => {
        const mode = modes?.[i] ?? 'estimated'
        const isChosen = i === chosen && mode === 'estimated'
        return (
          <div
            key={b.name}
            ref={(el) => {
              rows.current[i] = el
            }}
            role="option"
            aria-selected={isChosen}
            aria-disabled={mode !== 'estimated'}
            tabIndex={isChosen || (chosen < 0 && i === 0) ? 0 : -1}
            className={`est-row${isChosen ? ' is-chosen' : ''}${focusIndex === i ? ' is-focus' : ''}${i === BACKENDS.length - 1 ? ' is-last' : ''}${
              mode === 'queued' ? ' is-queued' : ''
            }`}
            onClick={() => mode === 'estimated' && onChoose(i)}
            onKeyDown={onKey(i)}
          >
            <div className="est-col-name">
              <span className={`mono est-name${mode === 'queued' ? ' is-dim' : ''}`}>{b.name}</span>
              {isChosen && <span className="mono est-tag">{b.target ? 'target · chosen' : 'chosen'}</span>}
              {!isChosen && b.target && mode === 'estimated' && <span className="mono est-tag">target</span>}
            </div>
            <div className="est-col-qubits">
              <span className="mono est-value">{b.qubits}</span>
              <span className="mono est-unit">q</span>
            </div>
            <RowBody backend={b} mode={mode} />
          </div>
        )
      })}
      <div className="est-foot">
        <div className="est-foot-pad" />
        <div className="est-foot-scale">
          <span className="mono">0</span>
          <span className="mono">0.5</span>
          <span className="mono">1</span>
        </div>
        <div className="est-foot-spacer" />
        <div className="est-legend">
          <span className="est-legend-item">
            <span className="est-swatch is-final" />
            final circuit, white values
          </span>
          <span className="est-legend-item">
            <span className="est-swatch is-baseline" />
            baseline, dim values
          </span>
        </div>
      </div>
    </div>
  )
}

function RowBody({ backend: b, mode }: { backend: Backend; mode: RowMode }) {
  if (mode === 'running')
    return (
      <>
        <div className="est-col-rel est-stage">
          <Spinner size={14} />
          <span className="est-stage-word">running</span>
          <span className="mono est-stage-note">routing · seed 4 of 8</span>
        </div>
        <div className="est-col-wide">
          <span className="mono est-stage-note">about 25 s left</span>
        </div>
      </>
    )
  if (mode === 'queued')
    return (
      <SkRegion label={`Estimating ${b.name}`} className="est-sk-row">
        <div className="est-col-rel">
          <div className="est-bars">
            <Sk w={280} h={6} />
            <Sk w={280} h={6} />
          </div>
          <span className="est-queued">
            <QueuedRing />
            queued
          </span>
        </div>
        <div className="est-col-num">
          <Sk w={40} h={12} />
        </div>
        <div className="est-col-num">
          <Sk w={48} h={12} />
        </div>
      </SkRegion>
    )
  if (mode === 'unavailable')
    return (
      <>
        <div className="est-col-rel est-stage">
          <QueuedRing color="var(--color-text-tertiary)" size={12} r={3.5} />
          <span className="est-unavailable">unavailable</span>
          <span className="mono est-unavailable-note">calibration data unreachable · Q904</span>
        </div>
        <div className="est-col-num">
          <span className="mono est-not">not estimated</span>
        </div>
        <div className="est-col-num">
          <span className="mono est-not">not estimated</span>
        </div>
      </>
    )
  return (
    <>
      <div className="est-col-rel">
        <div className="est-bars" aria-hidden>
          <span className="est-track">
            <span className="est-fill is-final" style={{ width: barWidth(b.rel.final) }} />
          </span>
          <span className="est-track">
            <span className="est-fill is-baseline" style={{ width: barWidth(b.rel.baseline) }} />
          </span>
        </div>
        <Pair now={b.rel.final.toFixed(3)} was={b.rel.baseline.toFixed(3)} width={48} />
      </div>
      <div className="est-col-num">
        <Pair now={sec(b.time.final)} unit="s" was={`${sec(b.time.baseline)} s`} />
      </div>
      <div className="est-col-num">
        <Pair now={usd(b.cost.final)} unit="$" was={`${usd(b.cost.baseline)} $`} />
      </div>
    </>
  )
}

function Pair({ now, unit, was, width }: { now: ReactNode; unit?: string; was: ReactNode; width?: number }) {
  return (
    <div className="est-pair" style={width ? { width } : undefined}>
      <span className="est-pair-now">
        <span className="mono est-value">{now}</span>
        {unit && <span className="mono est-unit">{unit}</span>}
      </span>
      <span className="mono est-was">{was}</span>
    </div>
  )
}

function QueuedRing({ color = 'var(--color-text-disabled)', size = 10, r = 3.5 }: { color?: string; size?: number; r?: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}
