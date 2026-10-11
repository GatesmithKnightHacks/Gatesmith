/*
 * The Rounds tile (S-07, and the lane crop on S-06): transport, time axis with the elapsed fill, one lane
 * per layer with its attempt cards, the primary metric lane as a step line, and the 2 px needle.
 * Geometry is the board's: plot 932 px for 600 s, lanes 100 px, primary plot 170 px.
 */
import type { CSSProperties, ReactNode } from 'react'
import { EditorButton } from '../../ui/parts'
import { Mark, Word, ZoomIn, ZoomOut, ZoomSlider, type MarkKind } from './marks'
import './rounds.css'

/* ── Data ─────────────────────────────────────────────────────────────── */
export type CardData = {
  round: 1 | 2 | 3 | 4
  left: number
  width: number
  strategy: string
  status: MarkKind
  /** mono 11 secondary after the word: "92 s", "QCEC timeout" */
  note?: string
  /** before and candidate bar widths out of 48; 'pending' draws a dashed candidate bar */
  bars?: [number, number | 'pending' | null]
  value?: string
  valueMuted?: boolean
  /** mono 11 tertiary last lines */
  foot?: string[]
  look?: 'default' | 'proposed' | 'queued' | 'bad'
}

export type LaneData = {
  layer: 'reference' | 'local'
  meta: string
  /** replaces the third header item: the GPU-off note */
  extra?: 'gpu-off'
  cards: CardData[]
  tail?: { left: number; text: string }
}

/** A step on the primary lane; `labelX` moves its label clear of the needle. */
export type Step = { x: number; y: number; label: string; labelX?: number }

export type PrimaryData = {
  /** right of the header: "270 now ·" and the bold delta */
  now: string
  delta: string
  /** the step line: baseline first, then accepted rounds */
  steps: Step[]
  end: number
  /** a muted continuation, dashed, for a decision still pending */
  pending?: { from: number; y: number; label: string }
  tail?: { x: number; y: number; label: string }
  legend: { x: number; label: string; ref: MarkKind; refWord: string; local: MarkKind; localWord: string }[]
}

export type AxisData = {
  fill: number
  ticks: { at: number; label: string; right?: boolean; hot?: boolean }[]
  rounds: { at: number; label: string; tone?: 'now' | 'later' }[]
  pipes: number[]
  needle?: { x: number; label?: string }
}

export type TransportState = 'stopped' | 'running' | 'paused' | 'empty'

/* ── Tile ─────────────────────────────────────────────────────────────── */
export function RoundsTile({
  transport,
  readout,
  axis,
  lanes,
  primary,
  banner,
  empty,
  onPlay,
  onRewind,
  onStart,
  compact = false,
}: {
  compact?: boolean
  transport: TransportState
  readout: string
  axis: AxisData
  lanes: LaneData[]
  primary?: PrimaryData
  banner?: ReactNode
  empty?: ReactNode
  onPlay?: () => void
  onRewind?: () => void
  onStart?: () => void
}) {
  return (
    <section className={`tile lp-rounds${compact ? ' is-compact' : ''}`} aria-label="Rounds">
      <div className="lp-rounds-header">
        <div className="lp-rounds-tab">Rounds</div>
        <span className="im-grow" />
        <Transport state={transport} onPlay={onPlay} onRewind={onRewind} onStart={onStart} />
        <span className="lp-rounds-pipe">
          <span />
        </span>
        <span className="lp-rounds-zoom">
          <ZoomOut big />
          <ZoomSlider knob={48} />
          <ZoomIn big />
        </span>
        <span className="mono lp-rounds-readout">{readout}</span>
      </div>
      {banner}
      <div className="lp-rounds-body">
        <TimeAxis axis={axis} />
        {empty ? (
          <div className="lp-empty">
            <GridSvg height={480} />
            <div className="lp-empty-words">{empty}</div>
          </div>
        ) : (
          <>
            {lanes.map((lane, i) => (
              <div key={lane.layer} className="lp-lane-wrap">
                <Lane lane={lane} />
                {(i < lanes.length - 1 || primary) && <div className="lp-sep" />}
              </div>
            ))}
            {primary && <PrimaryLane data={primary} />}
          </>
        )}
        {axis.needle && (
          <>
            <span className="lp-needle" style={{ left: 12 + 44 + axis.needle.x - 1 }} />
            <span className="lp-needle-knob" style={{ left: 12 + 44 + axis.needle.x - 7 }} />
          </>
        )}
      </div>
    </section>
  )
}

/* ── Transport: five 24 px round buttons, 16 px icons ─────────────────── */
function Transport({
  state,
  onPlay,
  onRewind,
  onStart,
}: {
  state: TransportState
  onPlay?: () => void
  onRewind?: () => void
  onStart?: () => void
}) {
  const off = state === 'empty'
  const live = state === 'running'
  return (
    <span className="lp-transport" role="toolbar" aria-label="Rounds playback">
      <button className="lp-tr" aria-label="First round" disabled={off} onClick={onStart}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M4 3v10M12 3L6 8l6 5z" className={off ? 'mk-dis' : 'mk-white'} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
      <button className="lp-tr" aria-label="Previous round" disabled={off} onClick={onRewind}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M8 3L2.5 8 8 13zM14 3L8.5 8l5.5 5z" className={off ? 'mk-dis' : 'mk-white'} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        className={`lp-tr${off ? '' : ' is-on'}`}
        aria-label={live ? 'Pause' : 'Play'}
        disabled={off}
        onClick={onPlay}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          {live ? (
            <path d="M5 3v10M11 3v10" className="mk-white" strokeWidth="1.6" strokeLinecap="round" />
          ) : (
            <path d="M5 3l8 5-8 5z" className={off ? 'mk-dis' : 'mk-white'} strokeWidth="1.4" strokeLinejoin="round" />
          )}
        </svg>
      </button>
      <button className="lp-tr" aria-label="Next round" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M2 3l5.5 5L2 13zM8 3l5.5 5L8 13z" className="mk-dis" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
      <button className="lp-tr" aria-label="Last round" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M12 3v10M4 3l6 5-6 5z" className="mk-dis" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
    </span>
  )
}

/* ── Time axis ────────────────────────────────────────────────────────── */
function TimeAxis({ axis }: { axis: AxisData }) {
  return (
    <div className="lp-axis">
      <div className="lp-axis-row">
        <div className="mono lp-axis-name">time</div>
        <div className="lp-axis-plot">
          <span className="lp-axis-fill" style={{ width: axis.fill }} />
          {axis.ticks.map((t) => (
            <span
              key={t.label}
              className={`mono lp-axis-tick${t.hot ? ' is-hot' : ''}`}
              style={t.right ? { right: 6 } : { left: t.at }}
            >
              {t.label}
            </span>
          ))}
          {axis.rounds.map((r) => (
            <span key={r.label} className={`lp-axis-round${r.tone ? ` is-${r.tone}` : ''}`} style={{ left: r.at }}>
              {r.label}
            </span>
          ))}
          {axis.pipes.map((p) => (
            <span key={p} className="lp-axis-pipe" style={{ left: p }} />
          ))}
          {axis.needle?.label && (
            <span className="mono lp-axis-tick is-hot" style={{ left: axis.needle.x + 6 }}>
              {axis.needle.label}
            </span>
          )}
        </div>
      </div>
      <div className="lp-rule" />
    </div>
  )
}

/** Grid of the lane plots: light lines every 50 s, ground lines every 100 s. */
function GridSvg({ height }: { height: number }) {
  return (
    <svg width="932" height={height} viewBox={`0 0 932 ${height}`} className="lp-grid" aria-hidden>
      <path d={[78.5, 233.5, 389.5, 545.5, 700.5, 856.5].map((x) => `M${x} 0V${height}`).join('')} className="cv-faint" />
      <path d={[156.5, 311.5, 467.5, 623.5, 778.5].map((x) => `M${x} 0V${height}`).join('')} className="cv-ground" />
    </svg>
  )
}

/* ── Lanes ────────────────────────────────────────────────────────────── */
const LANE = {
  reference: { name: 'reference-qiskit', dot: 'is-engine' },
  local: { name: 'local', dot: 'is-model' },
} as const

export function LaneHeader({ lane }: { lane: Pick<LaneData, 'layer' | 'meta' | 'extra'> }) {
  return (
    <div className="lp-lane-header">
      <span className={`lp-lane-dot ${LANE[lane.layer].dot}`} />
      <span className="lp-lane-name">
        <span className="mono">{LANE[lane.layer].name}</span>
      </span>
      <span className="lp-pipe" />
      {lane.layer === 'reference' ? (
        <>
          <span className="lp-lane-note">engine · deterministic</span>
          <span className="lp-pipe" />
          <span className="mono lp-lane-strategies">layout_search · routing_search · block_resynthesis</span>
        </>
      ) : (
        <>
          <span className="mono lp-lane-model">Qiskit/granite-3.3-8b-qiskit</span>
          <span className="lp-pipe" />
          {lane.extra === 'gpu-off' ? (
            <span className="lp-lane-gpu">
              <Mark kind="queued" />
              <span>GPU machine is off · model proposals wait</span>
            </span>
          ) : (
            <span className="lp-lane-note">proposes, the engine verifies</span>
          )}
        </>
      )}
      <span className="im-grow" />
      <span className="mono lp-lane-meta">{lane.meta}</span>
    </div>
  )
}

function Lane({ lane }: { lane: LaneData }) {
  return (
    <div className="lp-lane">
      <LaneHeader lane={lane} />
      <div className="lp-rule" />
      <div className="lp-lane-row">
        <span className="lp-gutter" />
        <div className="lp-lane-plot">
          <GridSvg height={100} />
          {lane.cards.map((c) => (
            <AttemptCard key={`${c.round}-${c.strategy}`} card={c} layer={lane.layer} />
          ))}
          {lane.tail && (
            <div className="lp-lane-tail" style={{ left: lane.tail.left }}>
              <span className="mono">{lane.tail.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function AttemptCard({ card, layer, style }: { card: CardData; layer: 'reference' | 'local'; style?: CSSProperties }) {
  const look = card.look ?? (card.status === 'queued' ? 'queued' : card.status === 'proposed' ? 'proposed' : 'default')
  const tone = layer === 'reference' ? 'is-engine' : 'is-model'
  return (
    <div className={`lp-card is-${look}`} style={{ left: card.left, width: card.width, ...style }}>
      <span className="mono lp-card-strategy">{card.strategy}</span>
      <span className="lp-card-status">
        <Word kind={card.status} />
        {card.note && <span className="mono lp-card-note">{card.note}</span>}
      </span>
      {card.bars && (
        <span className="lp-card-bars">
          <span className="lp-bars">
            <span className="lp-bar">
              <span className="lp-bar-before" style={{ width: card.bars[0] }} />
            </span>
            {card.bars[1] === 'pending' ? (
              <span className={`lp-bar-pending ${tone}`} />
            ) : (
              <span className="lp-bar">
                {card.bars[1] != null && <span className={`lp-bar-after ${tone}`} style={{ width: card.bars[1] }} />}
              </span>
            )}
          </span>
          {card.value && <span className={`mono lp-card-value${card.valueMuted ? ' is-muted' : ''}`}>{card.value}</span>}
        </span>
      )}
      {card.foot?.map((f) => (
        <span key={f} className="mono lp-card-foot">
          {f}
        </span>
      ))}
    </div>
  )
}

/* ── Primary lane ─────────────────────────────────────────────────────── */
function PrimaryLane({ data }: { data: PrimaryData }) {
  const d = data.steps.reduce((acc, s, i) => (i === 0 ? `M0 ${s.y}H${data.steps[1]?.x ?? data.end}` : `${acc}V${s.y}H${data.steps[i + 1]?.x ?? data.end}`), '')
  return (
    <div className="lp-lane">
      <div className="lp-lane-header">
        <span className="lp-lane-dot is-primary" />
        <span className="lp-lane-name">
          <span className="mono lp-primary-name">two_qubit_count</span>
        </span>
        <span className="lp-pipe" />
        <span className="lp-lane-note">primary · lower is better</span>
        <span className="lp-pipe" />
        <span className="lp-lane-note is-ter">kept only when strictly better and verification passed</span>
        <span className="im-grow" />
        <span className="lp-primary-now">
          <span className="mono">{data.now}</span>
          <span className="mono lp-primary-delta">{data.delta}</span>
        </span>
      </div>
      <div className="lp-rule" />
      <div className="lp-lane-row is-primary">
        <svg width="44" height="170" viewBox="0 0 44 170" aria-hidden className="lp-yaxis">
          <g className="cv-text is-11">
            <text x="10" y="85" transform="rotate(-90 10 85)" textAnchor="middle">
              gates
            </text>
            <text x="40" y="32.6" textAnchor="end">
              320
            </text>
            <text x="40" y="74.4" textAnchor="end">
              300
            </text>
            <text x="40" y="116.3" textAnchor="end">
              280
            </text>
          </g>
        </svg>
        <div className="lp-lane-plot is-primary">
          <svg width="932" height="170" viewBox="0 0 932 170" aria-label="two_qubit_count per round">
            <path
              d={`${[78.5, 233.5, 389.5, 545.5, 700.5, 856.5].map((x) => `M${x} 0V170`).join('')}M0 29.1H932M0 70.9H932M0 112.8H932`}
              className="cv-faint"
            />
            <path d={[156.5, 311.5, 467.5, 623.5, 778.5].map((x) => `M${x} 0V170`).join('')} className="cv-ground" />
            <path d={d} className="cv-white" strokeWidth="1.5" strokeLinejoin="round" />
            {data.pending && (
              <path d={`M${data.pending.from} ${data.pending.y}H932`} className="cv-pending" strokeDasharray="3 3" />
            )}
            {data.steps.slice(1).map((s) => (
              <circle key={s.x} cx={s.x} cy={s.y} r="2.5" className="cv-fill-white" />
            ))}
            {data.legend.map((l) => (
              <g key={l.label}>
                <LegendMark kind={l.ref} x={l.x} row={0} />
                <LegendMark kind={l.local} x={l.x} row={1} />
                <circle cx={l.x + 24} cy="145" r="3" className="cv-fill-info" />
                <circle cx={l.x + 24} cy="160" r="3" className="cv-fill-ai" />
              </g>
            ))}
            <g className="cv-text is-11">
              {data.steps.map((s, i) => (
                <text key={s.label} x={i === 0 ? 6 : (s.labelX ?? s.x + 7)} y={s.y - 6} className="cv-text-white">
                  {s.label}
                </text>
              ))}
              {data.pending && (
                <text x={data.pending.from + 7} y={data.pending.y - 6}>
                  {data.pending.label}
                </text>
              )}
              {data.tail && (
                <text x={data.tail.x} y={data.tail.y}>
                  {data.tail.label}
                </text>
              )}
              {data.legend.map((l) => (
                <g key={l.label} className="cv-text-sec">
                  <text x={l.x} y="149">
                    {l.label}
                  </text>
                  <text x={l.x + 44} y="149">
                    {l.refWord}
                  </text>
                  <text x={l.x + 44} y="164">
                    {l.localWord}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>
    </div>
  )
}

function LegendMark({ kind, x, row }: { kind: MarkKind; x: number; row: 0 | 1 }) {
  const y = row === 0 ? 145 : 160
  if (kind === 'accepted' || kind === 'passed')
    return <path d={`M${x + 31.5} ${y + 0.2}l2.3 2.3 4.7-5`} className="mk-good" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  if (kind === 'rejected' || kind === 'failed')
    return <path d={`M${x + 32} ${y - 3}l6 6M${x + 38} ${y - 3}l-6 6`} className="mk-bad" strokeWidth="1.4" strokeLinecap="round" />
  if (kind === 'inconclusive') return <circle cx={x + 35} cy={y} r="4" className="mk-warn" strokeWidth="1.4" strokeDasharray="2 1.6" />
  if (kind === 'cancelled') return <rect x={x + 31.5} y={y - 3.5} width="7" height="7" rx="1" className="mk-sec" strokeWidth="1.4" />
  return <circle cx={x + 35} cy={y} r="3.5" className="mk-dis" strokeWidth="1.4" />
}

/** The 28 px banner, here inside a tile: 2 px rail in the signal color, word, message, one button. */
export function Banner({
  kind,
  word,
  children,
  action,
  tall,
}: {
  kind: MarkKind
  word: string
  children: ReactNode
  action?: ReactNode
  tall?: boolean
}) {
  return (
    <div className={`im-banner is-${kind}${tall ? ' is-tall' : ''}`} role={kind === 'failed' || kind === 'rejected' ? 'alert' : 'status'}>
      <span className="im-banner-icon">
        <Mark kind={kind} />
      </span>
      <span className="im-banner-word">{word}</span>
      <div className="im-banner-text">{children}</div>
      {action}
    </div>
  )
}

/**
 * GPU off: the shared banner, carried in the top bar where there is room (the main column keeps its
 * tiles whole). Retry checks the GPU machine again.
 */
export function GpuOffBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="im-topbar-banner">
      <Banner kind="queued" word="GPU off" action={<EditorButton onClick={onRetry}>Retry</EditorButton>}>
        GPU machine is off · model proposals wait · the engine keeps running on CPU
      </Banner>
    </div>
  )
}
