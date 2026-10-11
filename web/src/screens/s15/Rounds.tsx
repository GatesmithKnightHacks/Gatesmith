/*
 * S-15 Rounds tile (Paper 1BOU-0): round 4's queued cards come from the screen above ("screened #1",
 * "screened #2"); the needle sits at 400 of 900 s. Drawn on the master's grammar: time axis 28, lane
 * headers 30, 2 px lane separators, needle 2 px with a 14 px knob. 934 px of track = 600 s.
 */
import { useState, type ReactNode } from 'react'
import { Glyph, type Word } from '../stretch/parts'

const PX_PER_S = 934 / 600
const NOW_S = 400

type Card = {
  left: number
  width: number
  strategy: string
  word: Word | 'queued-dim'
  note?: string
  /** baseline bar and candidate bar widths, of the bar width */
  bars?: [number, number]
  barWidth?: number
  value?: string
  dashed?: 'engine' | 'model'
  foot?: string
}

const ENGINE: Card[] = [
  { left: 0, width: 143, strategy: 'routing_search', word: 'accepted', note: '92 s', bars: [64, 59], barWidth: 64, value: '298 gates' },
  { left: 171, width: 196, strategy: 'block_resynthesis', word: 'inconclusive', note: 'QCEC timeout', bars: [100, 100], barWidth: 100, value: '298 gates' },
  { left: 389, width: 231, strategy: 'layout_search', word: 'verifying', note: '32 seeds', bars: [100, -1], barWidth: 100, value: 'verifying', dashed: 'engine' },
  { left: 638, width: 234, strategy: 'block_resynthesis', word: 'queued-dim', foot: 'round 4 · screened #1' },
]
const MODEL: Card[] = [
  { left: 0, width: 165, strategy: 'commutation_aware_routing', word: 'rejected', note: '2q depth', bars: [79, 84], barWidth: 84, value: '214 layers' },
  { left: 171, width: 199, strategy: 'commutation_aware_routing', word: 'accepted', note: 'block 1 · passed', bars: [100, 94], barWidth: 100, value: '281 gates' },
  { left: 389, width: 231, strategy: 'commutation_aware_routing', word: 'proposed', note: 'block 2 · parse ok', bars: [100, -1], barWidth: 100, value: 'verifying', dashed: 'model' },
  { left: 638, width: 234, strategy: 'commutation_aware_routing', word: 'queued-dim', foot: 'round 4 · screened #2' },
]

export function RoundsTile() {
  const [playing, setPlaying] = useState(true)
  return (
    <section className="tile s15-rounds">
      <div className="tile-header">
        <div className="tile-tabs" role="tablist">
          <button role="tab" aria-selected className="tile-tab is-active">
            Rounds
          </button>
        </div>
        <div className="s15-transport">
          <div className="s15-transport-buttons">
            <TransportButton label="Back to start" d="M4 3v10M12 3L6 8l6 5z" />
            <TransportButton label="Previous round" d="M8 3L2.5 8 8 13zM14 3L8.5 8l5.5 5z" />
            <button className="s15-tbtn is-on" aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                {playing ? (
                  <path d="M5 3v10M11 3v10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                ) : (
                  <path d="M5 3l8 5-8 5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                )}
              </svg>
            </button>
            <TransportButton label="Next round" d="M2 3l5.5 5L2 13zM8 3l5.5 5L8 13z" disabled />
            <TransportButton label="To the end" d="M12 3v10M4 3l6 5-6 5z" disabled />
          </div>
          <span className="s15-tsep" />
          <div className="s15-zoom" aria-label="Zoom">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M10.6 10.6L14.2 14.2M4.6 7h4.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="s15-zoom-track">
              <span className="s15-zoom-knob" />
            </span>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M10.6 10.6L14.2 14.2M4.6 7h4.8M7 4.6v4.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <span className="mono s15-treadout">400 of 900 s</span>
        </div>
      </div>
      <div className="s15-rounds-body">
        <div className="s15-axis-row">
          <span className="s15-lane-label mono">time</span>
          <div className="s15-axis-track">
            <span className="s15-elapsed" style={{ width: Math.round(NOW_S * PX_PER_S) }} />
            {[0, 100, 200, 300, 400, 500].map((t) => (
              <span key={t} className={`mono s15-tick${t === NOW_S ? ' is-now' : ''}`} style={{ left: t === 0 ? 4 : Math.round(t * PX_PER_S) + 4 }}>
                {t === 0 ? '0 s' : t}
              </span>
            ))}
            <span className="mono s15-tick" style={{ right: 4 }}>
              600
            </span>
            <span className="s15-round" style={{ left: 36 }}>
              R1
            </span>
            <span className="s15-round" style={{ left: 191 }}>
              R2
            </span>
            <span className="s15-round is-current" style={{ left: 405 }}>
              R3
            </span>
            <span className="s15-round is-next" style={{ left: 660 }}>
              R4
            </span>
            {[171, 389, 638].map((x) => (
              <span key={x} className="s15-round-pipe" style={{ left: x }} />
            ))}
          </div>
        </div>
        <Lane
          dot="engine"
          name="reference-qiskit"
          notes={[<span key="a">engine · deterministic</span>, <span key="b" className="mono s15-axis">layout_search · routing_search · block_resynthesis</span>]}
          meta="3 attempts · 1 accepted"
          cards={ENGINE}
          color="engine"
        />
        <span className="s15-lane-sep" />
        <Lane
          dot="model"
          name="local"
          notes={[
            <span key="m" className="mono s15-axis is-secondary">
              Qiskit/granite-3.3-8b-qiskit
            </span>,
            <span key="a">proposes, the engine verifies</span>,
            <span key="b" className="mono s15-axis">
              commutation_aware_routing
            </span>,
          ]}
          meta="3 attempts · 1 accepted"
          cards={MODEL}
          color="model"
        />
        <span className="s15-lane-sep" />
        <div className="s15-metric">
          <div className="s15-lane-head">
            <span className="st-layer-dot is-white" />
            <span className="mono s15-lane-name is-medium">two_qubit_count</span>
            <span className="s15-pipe" />
            <span>primary · lower is better</span>
            <span className="s15-pipe" />
            <span className="is-tertiary">kept only when strictly better and verification passed</span>
            <span className="s15-grow" />
            <span className="s15-metric-now">
              <span className="mono">281 now · 321 base ·</span>
              <span className="mono s15-metric-delta">−12.5%</span>
            </span>
          </div>
          <span className="s15-rule" />
          <div className="s15-metric-plot">
            <svg width="44" height="64" viewBox="0 0 44 64" aria-hidden>
              <text x="10" y="32" transform="rotate(-90 10 32)" textAnchor="middle" className="s15-svg-axis">
                gates
              </text>
              <text x="38" y="13" textAnchor="end" className="s15-svg-axis">
                320
              </text>
              <text x="38" y="37" textAnchor="end" className="s15-svg-axis">
                300
              </text>
              <text x="38" y="61" textAnchor="end" className="s15-svg-axis">
                280
              </text>
            </svg>
            <div className="s15-plot">
              <svg width="934" height="64" viewBox="0 0 934 64" aria-label="two_qubit_count: 321 baseline, 298 after R1, 281 after R2, 281 until round 3 decides">
                <path d="M78.5 0V64M233.5 0V64M389.5 0V64M545.5 0V64M700.5 0V64M856.5 0V64M0 9.5H934M0 33.5H934M0 57.5H934" fill="none" className="s15-grid-faint" />
                <path d="M156.5 0V64M311.5 0V64M467.5 0V64M623.5 0V64M778.5 0V64" fill="none" stroke="var(--color-surface-app)" />
                <path d="M0 8.3H143V35.9H374V56.3H623" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M623 56.3H934" fill="none" className="s15-grid-pending" strokeDasharray="3 3" />
                <circle cx="143" cy="35.9" r="2.5" fill="var(--color-text-primary)" />
                <circle cx="374" cy="56.3" r="2.5" fill="var(--color-text-primary)" />
                <text x="6" y="20" className="s15-svg-label">
                  321 baseline
                </text>
                <text x="150" y="30" className="s15-svg-label">
                  298 · R1 accepted
                </text>
                <text x="381" y="50" className="s15-svg-label">
                  281 · R2 accepted
                </text>
                <text x="630" y="50" className="s15-svg-label is-dim">
                  281 until round 3 decides
                </text>
              </svg>
            </div>
          </div>
        </div>
        <span className="s15-needle" style={{ left: 56 + Math.round(NOW_S * PX_PER_S) }} aria-hidden />
        <span className="s15-knob" style={{ left: 50 + Math.round(NOW_S * PX_PER_S) }} aria-hidden />
      </div>
    </section>
  )
}

function TransportButton({ label, d, disabled }: { label: string; d: string; disabled?: boolean }) {
  return (
    <button className="s15-tbtn" aria-label={label} disabled={disabled}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

function Lane({ dot, name, notes, meta, cards, color }: { dot: 'engine' | 'model'; name: string; notes: ReactNode[]; meta: string; cards: Card[]; color: 'engine' | 'model' }) {
  return (
    <div className="s15-lane">
      <div className="s15-lane-head">
        <span className={`st-layer-dot is-${dot}`} />
        <span className="mono s15-lane-name">{name}</span>
        {notes.map((n, i) => (
          <span key={i} className="s15-lane-note">
            <span className="s15-pipe" />
            {n}
          </span>
        ))}
        <span className="s15-grow" />
        <span className="mono s15-axis">{meta}</span>
      </div>
      <span className="s15-rule" />
      <div className="s15-lane-plot">
        <span className="s15-lane-label" />
        <div className="s15-plot">
          <svg width="934" height="70" viewBox="0 0 934 70" aria-hidden>
            <path d="M78.5 0V70M233.5 0V70M389.5 0V70M545.5 0V70M700.5 0V70M856.5 0V70" fill="none" className="s15-grid-faint" />
            <path d="M156.5 0V70M311.5 0V70M467.5 0V70M623.5 0V70M778.5 0V70" fill="none" stroke="var(--color-surface-app)" />
          </svg>
          {cards.map((c) => (
            <AttemptCard key={c.left} c={c} color={color} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AttemptCard({ c, color }: { c: Card; color: 'engine' | 'model' }) {
  const queued = c.word === 'queued-dim'
  return (
    <div className={`s15-card${queued ? ' is-queued' : ''}${c.dashed ? ` is-dashed-${c.dashed}` : ''}`} style={{ left: c.left, width: c.width }}>
      <span className="mono s15-card-strategy">{c.strategy}</span>
      <span className={`s15-card-decision is-${c.word}`}>
        <Glyph word={queued ? 'queued' : (c.word as Word)} />
        <span>{queued ? 'queued' : c.word}</span>
        {c.note && <span className="mono s15-card-note">{c.note}</span>}
      </span>
      {queued ? (
        <span className="mono s15-card-foot">{c.foot}</span>
      ) : (
        <span className="s15-card-bars">
          <span className="s15-bars" style={{ width: c.barWidth }}>
            <span className="s15-bar">
              <span className="is-base" style={{ width: c.bars?.[0] }} />
            </span>
            {c.bars && c.bars[1] < 0 ? (
              <span className={`s15-bar is-pending is-${color}`} />
            ) : (
              <span className="s15-bar">
                <span className={`is-${color}`} style={{ width: c.bars?.[1] }} />
              </span>
            )}
          </span>
          <span className={`mono s15-card-value${c.value === 'verifying' ? ' is-dim' : ''}`}>{c.value}</span>
        </span>
      )}
    </div>
  )
}
