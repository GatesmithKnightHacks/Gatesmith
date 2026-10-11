/*
 * Rounds tile (MVN-0 208P-0): the transport and zoom header, the time axis (0–600 s on 932 px) with the
 * elapsed fill up to the needle, one lane per layer with its attempt cards, the primary metric lane with
 * a white step line, and the 2 px yellow needle with its 14 px knob on the axis rule.
 */
import { Fragment, useState, type ReactNode } from 'react'
import { ATTEMPTS, LAYERS, TWO_QUBIT, type Attempt, type AttemptStatus } from '../../data/demo'
import { Sk } from '../../ui/Skeleton'
import { MarkWord, ZoomIcon } from './icons'
import { TransportGlyph, type TransportId } from './glyphs'
import type { Mark } from './data'
import { AXIS_LABELS, CARD_BOX, PLOT_W, ROUND_TICKS, xOf } from './data'

export type Shown = AttemptStatus | 'hidden'
export type RoundsMode = 'empty' | 'scoring' | 'loading' | 'live'

const LANE_COLOR = { reference: 'var(--color-signal-info)', local: 'var(--color-signal-ai)' } as const
/** When each round's decisions land, seconds (the needle stops here when you step back to a round). */
const ROUND_DECIDED = [0, 117, 245, 400, 490]

/* ── Zoom ────────────────────────────────────────────────────────────── */
export function Zoom({ idx, positions, onChange, label }: { idx: number; positions: number[]; onChange: (i: number) => void; label: string }) {
  return (
    <div className="ws-zoom" role="group" aria-label={label}>
      <button className="ws-icon-btn" aria-label="Zoom out" disabled={idx === 0} onClick={() => onChange(Math.max(0, idx - 1))}>
        <ZoomIcon />
      </button>
      <span
        className="ws-zoom-track"
        role="slider"
        tabIndex={0}
        aria-label={`${label} level`}
        aria-valuemin={1}
        aria-valuemax={positions.length}
        aria-valuenow={idx + 1}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(positions.length - 1, idx + 1))
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(0, idx - 1))
        }}
        onClick={(e) => {
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left
          let best = 0
          positions.forEach((p, i) => Math.abs(p + 5 - x) < Math.abs(positions[best] + 5 - x) && (best = i))
          onChange(best)
        }}
      >
        <span className="ws-zoom-rail" />
        <span className="ws-zoom-knob" style={{ left: positions[idx] }} />
      </span>
      <button className="ws-icon-btn" aria-label="Zoom in" disabled={idx === positions.length - 1} onClick={() => onChange(Math.min(positions.length - 1, idx + 1))}>
        <ZoomIcon plus />
      </button>
    </div>
  )
}

const ROUNDS_ZOOM = [0.8, 0.9, 1, 1.15, 1.3]
const ROUNDS_ZOOM_POS = [8, 28, 48, 64, 80]

/* ── Tile ────────────────────────────────────────────────────────────── */
type Props = {
  mode: RoundsMode
  attempts: Record<number, Shown>
  elapsed: number
  round: number
  twoQubit: number
  running: boolean
  gpuOff?: boolean
  highlight?: number | null
  onOpenAttempt?: (n: number) => void
}

export function Rounds({ mode, attempts, elapsed, round, twoQubit, running, gpuOff, highlight, onOpenAttempt }: Props) {
  const [zoomIdx, setZoomIdx] = useState(2)
  const [viewRound, setViewRound] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const k = ROUNDS_ZOOM[zoomIdx]
  const live = mode === 'live'

  // Stepping back shows the run as it stood when that round decided.
  const now = viewRound != null ? ROUND_DECIDED[viewRound] : elapsed
  const shown: Record<number, Shown> =
    viewRound == null ? attempts : Object.fromEntries(ATTEMPTS.map((a) => [a.n, a.round <= viewRound ? a.final : 'hidden']))
  const count = viewRound != null ? TWO_QUBIT[viewRound] : twoQubit
  const atRound = viewRound ?? round

  const step = (to: number | null) => setViewRound(to == null || to >= round ? null : Math.max(1, to))
  const canBack = live && atRound > 1
  const canForward = live && viewRound != null

  const transport: { id: TransportId; label: string; enabled: boolean; on?: boolean; onClick?: () => void }[] = [
    { id: 'start', label: 'First round', enabled: canBack, onClick: () => step(1) },
    { id: 'back', label: 'Previous round', enabled: canBack, onClick: () => step(atRound - 1) },
    running && live && !paused
      ? { id: 'pause', label: 'Pause the view', enabled: true, on: true, onClick: () => setPaused(true) }
      : { id: 'play', label: 'Play', enabled: live && (paused || viewRound != null), onClick: () => (setPaused(false), step(null)) },
    { id: 'forward', label: 'Next round', enabled: canForward, onClick: () => step((viewRound ?? round) + 1) },
    { id: 'end', label: 'Now', enabled: canForward, onClick: () => step(null) },
  ]

  return (
    <section className="tile ws-rounds" aria-label="Rounds">
      <div className="tile-header">
        <div className="tile-tabs" role="tablist">
          <button role="tab" aria-selected className="tile-tab is-active">
            Rounds
          </button>
        </div>
        <div className="ws-rounds-controls">
          <div className="ws-transport">
            {transport.map((t) => (
              <button
                key={t.id}
                className={`ws-transport-btn${t.on ? ' is-on' : ''}`}
                aria-label={t.label}
                disabled={!t.enabled}
                onClick={t.onClick}
              >
                <TransportGlyph id={t.id} color={t.enabled ? 'var(--color-text-primary)' : 'var(--color-text-disabled)'} />
              </button>
            ))}
          </div>
          <span className="ws-sep" />
          <Zoom idx={zoomIdx} positions={ROUNDS_ZOOM_POS} onChange={setZoomIdx} label="Rounds zoom" />
          <span className="ws-readout">
            {mode === 'loading' ? (
              <Sk w={80} h={12} className="ws-sk-strip" />
            ) : (
              <>
                {viewRound != null ? `R${viewRound} · ` : ''}
                {live ? Math.round(now) : 0} of 900 s{paused && viewRound == null ? ' · paused' : ''}
              </>
            )}
          </span>
        </div>
      </div>

      <div className="ws-rounds-body">
        <Axis k={k} elapsed={live ? now : 0} round={live ? atRound : 0} showRounds={live} />
        {mode === 'live' ? (
          <>
            <Lane layer="reference" k={k} shown={shown} highlight={highlight} gpuOff={gpuOff} onOpen={onOpenAttempt} />
            <div className="ws-lane-sep" />
            <Lane layer="local" k={k} shown={shown} highlight={highlight} gpuOff={gpuOff} onOpen={onOpenAttempt} />
            <div className="ws-lane-sep" />
            <PrimaryLane k={k} now={now} count={count} shown={shown} />
            <div className="ws-needle" style={{ left: 56 + xOf(now, k) }} aria-hidden />
            <div className="ws-needle-knob" style={{ left: 50 + xOf(now, k) }} aria-hidden />
          </>
        ) : mode === 'loading' ? (
          <LoadingLanes />
        ) : (
          <div className="ws-rounds-empty">
            <div className="ws-rounds-empty-box">{mode === 'empty' ? 'No rounds yet' : 'Rounds start after the first score'}</div>
          </div>
        )}
      </div>
    </section>
  )
}

/* ── Axis ────────────────────────────────────────────────────────────── */
function Axis({ k, elapsed, round, showRounds }: { k: number; elapsed: number; round: number; showRounds: boolean }) {
  const needleLabel = showRounds ? Math.round(elapsed / 100) * 100 : -1
  return (
    <div className="ws-axis">
      <div className="ws-axis-row">
        <span className="ws-axis-time">time</span>
        <div className="ws-axis-plot">
          {showRounds && <span className="ws-axis-fill" style={{ width: xOf(elapsed, k) }} />}
          {AXIS_LABELS.map((l) => (
            <span
              key={l.label}
              className="ws-axis-label"
              style={{ left: l.x * k, color: Math.abs(Number(l.label) - elapsed) < 6 && Number(l.label) === needleLabel ? 'var(--color-signal-select)' : undefined }}
            >
              {l.label}
            </span>
          ))}
          {k === 1 && (
            <span className="ws-axis-label" style={{ right: 6 }}>
              600
            </span>
          )}
          {showRounds &&
            ROUND_TICKS.map((t, i) => (
              <Fragment key={t.label}>
                {t.tick != null && <span className="ws-axis-pipe" style={{ left: t.tick * k }} />}
                <span
                  className="ws-axis-round"
                  style={{ left: t.x * k, color: i + 1 < round ? 'var(--color-text-secondary)' : i + 1 === round ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}
                >
                  {t.label}
                </span>
              </Fragment>
            ))}
        </div>
      </div>
      <div className="ws-rule" />
    </div>
  )
}

/* ── Lanes ───────────────────────────────────────────────────────────── */
function Pipe() {
  return <span className="ws-pipe" />
}

function laneMeta(layer: 'reference' | 'local', shown: Record<number, Shown>) {
  const mine = ATTEMPTS.filter((a) => a.layer === layer)
  const made = mine.filter((a) => shown[a.n] !== 'hidden' && shown[a.n] !== 'queued' && shown[a.n] != null).length
  const accepted = mine.filter((a) => shown[a.n] === 'accepted').length
  return `${made} attempt${made === 1 ? '' : 's'} · ${accepted} accepted`
}

function Lane({
  layer,
  k,
  shown,
  highlight,
  gpuOff,
  onOpen,
}: {
  layer: 'reference' | 'local'
  k: number
  shown: Record<number, Shown>
  highlight?: number | null
  gpuOff?: boolean
  onOpen?: (n: number) => void
}) {
  const L = LAYERS[layer]
  return (
    <div className="ws-lane">
      <div className="ws-lane-head">
        <span className="ws-lane-dot" style={{ background: LANE_COLOR[layer] }} />
        <span className="ws-lane-name">{L.name}</span>
        <Pipe />
        {layer === 'reference' ? (
          <>
            <span className="ws-lane-note">
              {L.role} · {L.note}
            </span>
            <Pipe />
            <span className="ws-lane-strategies">{L.strategies}</span>
          </>
        ) : (
          <>
            <span className="ws-lane-model">{L.role}</span>
            <Pipe />
            <span className="ws-lane-note">
              {L.note}
              {gpuOff ? ' · waiting for GPU' : ''}
            </span>
          </>
        )}
        <span className="ws-grow" />
        <span className="ws-lane-meta">{laneMeta(layer, shown)}</span>
      </div>
      <div className="ws-rule" />
      <div className="ws-lane-row">
        <span className="ws-lane-gutter" />
        <div className="ws-lane-plot">
          <Grid k={k} height={70} />
          {ATTEMPTS.filter((a) => a.layer === layer).map((a) => {
            const s = shown[a.n]
            if (!s || s === 'hidden') return null
            return <AttemptCard key={a.n} a={a} status={s} k={k} gpuOff={gpuOff} selected={highlight === a.n} onOpen={onOpen} />
          })}
        </div>
      </div>
    </div>
  )
}

function Grid({ k, height }: { k: number; height: number }) {
  const minor = [78.5, 233.5, 389.5, 545.5, 700.5, 856.5].map((x) => x * k)
  const major = [156.5, 311.5, 467.5, 623.5, 778.5].map((x) => x * k)
  return (
    <svg className="ws-grid" width={PLOT_W} height={height} viewBox={`0 0 ${PLOT_W} ${height}`} aria-hidden>
      <path d={minor.map((x) => `M${x} 0V${height}`).join('')} fill="none" stroke="rgb(255 255 255 / 4%)" />
      <path d={major.map((x) => `M${x} 0V${height}`).join('')} fill="none" stroke="var(--color-surface-app)" />
    </svg>
  )
}

const DECISION_MARK: Record<AttemptStatus, Mark> = {
  accepted: 'accepted',
  rejected: 'rejected',
  inconclusive: 'inconclusive',
  verifying: 'verifying',
  proposed: 'proposed',
  queued: 'queued',
}

function AttemptCard({ a, status, k, gpuOff, selected, onOpen }: { a: Attempt; status: AttemptStatus; k: number; gpuOff?: boolean; selected?: boolean; onOpen?: (n: number) => void }) {
  const [left, width] = CARD_BOX[a.n]
  const open = status === 'verifying' || status === 'proposed' || status === 'queued'
  const copy = open ? (a.at400 ?? { value: status === 'queued' ? `round ${a.round}` : 'pending' }) : a.decided
  const queued = status === 'queued'
  const color = LANE_COLOR[a.layer]
  let value: ReactNode = copy.value
  if (queued && gpuOff && a.layer === 'local') value = `round ${a.round} · waiting for GPU`
  const before = status === 'rejected' ? 45 : 48
  const cand = status === 'accepted' ? Math.round(48 * (a.decided.bar ?? 1)) : 48
  return (
    <button
      className={`ws-card${queued ? ' is-queued' : ''}${status === 'proposed' ? ' is-proposed' : ''}${selected ? ' is-selected' : ''}`}
      style={{ left: left * k, width: width * k }}
      onClick={() => onOpen?.(a.n)}
      aria-label={`Attempt ${a.n} · round ${a.round} · ${a.strategy} · ${status}`}
    >
      <span className="ws-card-strategy">{a.strategy}</span>
      <span className="ws-card-decision">
        <MarkWord kind={DECISION_MARK[status]} label={status} tone={queued ? 'var(--color-text-tertiary)' : undefined} />
        {copy.note && <span className="ws-card-note">{copy.note}</span>}
      </span>
      {queued ? (
        <span className="ws-card-value is-muted">{value}</span>
      ) : (
        <span className="ws-card-values">
          <span className="ws-card-bars">
            <span className="ws-card-bar">
              <span style={{ width: before, background: 'var(--color-border-control)' }} />
            </span>
            {open ? (
              <span className="ws-card-bar is-pending" style={{ borderColor: color }} />
            ) : (
              <span className="ws-card-bar">
                <span style={{ width: cand, background: color }} />
              </span>
            )}
          </span>
          <span className={`ws-card-value${open ? ' is-muted' : ''}`}>{value}</span>
        </span>
      )}
    </button>
  )
}

/* ── Primary lane ────────────────────────────────────────────────────── */
function PrimaryLane({ k, now, count, shown }: { k: number; now: number; count: number; shown: Record<number, Shown> }) {
  const base: number = TWO_QUBIT[0]
  const pct = ((count - base) / base) * 100
  const low = count < 280
  // 320 / 300 / 280 on the board's 66 px plot; a wider range once the count drops under 280.
  const top = 320
  const per = low ? 0.96 : 1.2
  const y = (v: number) => 10.5 + (top - v) * per
  const ticks = low ? [320, 300, 280] : [320, 300, 280]
  const decided = [
    { n: 1, at: 92, v: TWO_QUBIT[1], label: `${TWO_QUBIT[1]} · −23 · R1 accepted` },
    { n: 4, at: 247, v: TWO_QUBIT[2], label: `${TWO_QUBIT[2]} · −17 · R2 accepted` },
    { n: 6, at: 405, v: TWO_QUBIT[3], label: `${TWO_QUBIT[3]} · −11 · R3 accepted` },
  ].filter((d) => shown[d.n] === 'accepted' && d.at <= now + 6)
  const xNow = xOf(Math.min(now, 600), k)
  let d = `M0 ${y(base).toFixed(1)}`
  let last: number = base
  for (const s of decided) {
    const x = xOf(s.at, k)
    d += `H${x.toFixed(0)}V${y(s.v).toFixed(1)}`
    last = s.v
  }
  d += `H${xNow.toFixed(0)}`
  const pending = shown[6] === 'proposed' || shown[5] === 'verifying'
  return (
    <div className="ws-primary">
      <div className="ws-lane-head">
        <span className="ws-lane-dot" style={{ background: 'var(--color-text-primary)' }} />
        <span className="ws-lane-name is-strong">two_qubit_count</span>
        <Pipe />
        <span className="ws-lane-note">primary · lower is better</span>
        <Pipe />
        <span className="ws-lane-note is-tertiary">kept only when strictly better and verification passed</span>
        <span className="ws-grow" />
        <span className="ws-primary-readout">
          <span className="ws-primary-now">
            {count} now · {base} base ·
          </span>
          <span className="ws-primary-pct">{count === base ? '0%' : `${pct < 0 ? '−' : '+'}${Math.abs(pct).toFixed(1)}%`}</span>
        </span>
      </div>
      <div className="ws-rule" />
      <div className="ws-primary-row">
        <svg width="44" height="66" viewBox="0 0 44 66" aria-hidden className="ws-primary-axis">
          <text x="10" y="33" transform="rotate(-90 10 33)" textAnchor="middle" className="ws-svg-mono" fontSize="10" fill="var(--color-text-tertiary)">
            gates
          </text>
          {ticks.map((t) => (
            <text key={t} x="38" y={y(t) + 3.5} textAnchor="end" className="ws-svg-mono" fontSize="10" fill="var(--color-text-tertiary)">
              {t}
            </text>
          ))}
        </svg>
        <div className="ws-primary-plot">
          <svg width={PLOT_W} height="66" viewBox={`0 0 ${PLOT_W} 66`} aria-label={`two_qubit_count ${count} now, ${base} at baseline`}>
            <path
              d={[78.5, 233.5, 389.5, 545.5, 700.5, 856.5].map((x) => `M${x * k} 0V66`).join('') + ticks.map((t) => `M0 ${y(t)}H${PLOT_W}`).join('')}
              fill="none"
              stroke="rgb(255 255 255 / 4%)"
            />
            <path d={[156.5, 311.5, 467.5, 623.5, 778.5].map((x) => `M${x * k} 0V66`).join('')} fill="none" stroke="var(--color-surface-app)" />
            <path d={d} fill="none" stroke="var(--color-text-primary)" strokeWidth="1.5" strokeLinejoin="round" />
            <path d={`M${xNow.toFixed(0)} ${y(last).toFixed(1)}H${PLOT_W}`} fill="none" stroke="rgb(255 255 255 / 35%)" strokeDasharray="3 3" />
            {decided.map((s) => (
              <circle key={s.n} cx={xOf(s.at, k)} cy={y(s.v)} r="2.5" fill="var(--color-text-primary)" />
            ))}
            <text x="6" y="22" className="ws-svg-mono" fontSize="11" fill="var(--color-text-primary)">
              {base} baseline
            </text>
            {decided.map((s) => (
              <text key={s.n} x={xOf(s.at, k) + 7} y={Math.min(62, y(s.v) - 5)} className="ws-svg-mono" fontSize="11" fill="var(--color-text-primary)">
                {s.label}
              </text>
            ))}
            {pending && (
              <text x={xNow + 7} y={Math.min(62, y(last) - 5)} className="ws-svg-mono" fontSize="11" fill="var(--color-text-tertiary)">
                {last} until round 3 decides
              </text>
            )}
          </svg>
        </div>
      </div>
    </div>
  )
}

/* ── Loading lanes: the shimmer in the lanes' real shape (DS-06 loading frame) ── */
function LoadingLanes() {
  const head = (widths: number[], meta: number, metaH = 12) => (
    <div className="ws-lane-head">
      <Sk w={8} h={8} />
      <span className="ws-lane-name">
        <Sk w={widths[0]} h={12} />
      </span>
      {widths.slice(1).map((w, i) => (
        <Sk key={i} w={w} h={12} />
      ))}
      <span className="ws-grow" />
      <Sk w={meta} h={metaH} />
    </div>
  )
  const cards = (spec: [number, number][]) => (
    <div className="ws-lane-skrow">
      {spec.map(([gap, w], i) => (
        <span key={i} style={{ display: 'flex' }}>
          <span style={{ width: gap, flexShrink: 0 }} />
          <Sk w={w} h={56} />
        </span>
      ))}
    </div>
  )
  return (
    <div className="ws-loading-lanes" aria-hidden>
      <div className="ws-lane">
        {head([104, 132, 300], 140)}
        <div className="ws-rule" />
        {cards([
          [48, 152],
          [33, 195],
          [10, 225],
        ])}
      </div>
      <div className="ws-lane-sep" />
      <div className="ws-lane">
        {head([40, 196, 180], 140)}
        <div className="ws-rule" />
        {cards([
          [48, 177],
          [8, 192],
          [13, 226],
        ])}
      </div>
      <div className="ws-lane-sep" />
      <div className="ws-lane">
        {head([100, 150, 300], 180, 16)}
        <div className="ws-rule" />
        <div className="ws-lane-skprimary">
          <span className="ws-lane-skaxis">
            <Sk w={22} h={12} />
            <Sk w={22} h={12} />
            <Sk w={22} h={12} />
          </span>
          <span style={{ padding: '6px 4px' }}>
            <Sk w={84} h={12} />
          </span>
        </div>
      </div>
    </div>
  )
}
