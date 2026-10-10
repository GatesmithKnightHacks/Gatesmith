/*
 * Scorecard tile body: four groups, numbers right-aligned in a fixed lane, units in their own lane,
 * status in a trailing slot (S-04 · Scorecard). Also the scoring, empty, partial and Seeds variants
 * from the states board.
 */
import { Status } from '../../ui/status'
import { SBOX_SCORECARD, SCORECARD, SEEDS, type ScoreRow } from './data'

export function ScorecardRows({ rows = SCORECARD }: { rows?: ScoreRow[] }) {
  return (
    <div className="sc-rows">
      {rows.map((r) => {
        if (r.kind === 'group')
          return (
            <div key={r.label} className="sc-group">
              {r.label}
            </div>
          )
        if (r.kind === 'skipped')
          return (
            <div key={r.id} className="sc-row-wrap">
              <div className="sc-row is-skipped">
                <span className="sc-label">{r.id}</span>
                <span className="sc-skip">{r.reason}</span>
              </div>
            </div>
          )
        return (
          <div key={r.id} className="sc-row-wrap">
            <div className="sc-row">
              <span className="sc-label">{r.id}</span>
              {r.bar && (
                <span className="sc-bar">
                  <span className="sc-bar-fill" style={{ width: r.bar.fill }} />
                  <span className="sc-bar-marker" style={{ left: r.bar.marker }} />
                </span>
              )}
              <span className="sc-value">
                <span className="sc-num">{r.value}</span>
                {r.unit && <span className="sc-unit">{r.unit}</span>}
              </span>
              <span className="sc-status">
                {r.status && <Status kind={r.status} />}
                {r.aside && <span className="sc-aside">{r.aside}</span>}
              </span>
            </div>
            {r.note && <div className="sc-note">{r.note}</div>}
          </div>
        )
      })}
    </div>
  )
}

const STAGES = ['validate', 'confirm', 'compile', 'measure', 'diagnose'] as const

/** Loading · scoring: stage, seed, time left, a 4px blue bar and the stage list. */
export function ScorecardScoring({ progress, stage }: { progress: number; stage: string }) {
  const at = STAGES.indexOf(stage as (typeof STAGES)[number])
  const current = at === -1 ? STAGES.length : at
  const seed = Math.min(8, Math.max(1, Math.round(progress * 8)))
  const left = Math.max(1, Math.round((1 - progress) * 37))
  const name = stage === 'done' ? 'Diagnose' : stage.charAt(0).toUpperCase() + stage.slice(1)
  return (
    <div className="sc-scoring">
      <div className="sc-scoring-head">
        <span>
          {name} · seed {seed} of 8
        </span>
        <span className="mono sc-scoring-left">about {left} s left</span>
      </div>
      <div className="sc-scoring-bar">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="sc-stages">
        {STAGES.map((s, i) => (
          <span key={s} className={i < current ? 'is-done' : i === current ? 'is-now' : 'is-next'}>
            {i < current ? '✓' : i === current ? '●' : '○'} {s}
          </span>
        ))}
      </div>
      <div className="sc-scoring-note">
        {current > 2 ? 'Resources ready: width 12 q, depth 58 layers.' : 'Compiling on FakeTorino across 8 seeds.'}
        <br />
        {current > 3 ? 'Hardware metrics ready. Ranking findings next.' : 'Hardware metrics arrive after measure.'}
      </div>
    </div>
  )
}

export function ScorecardEmpty() {
  return (
    <div className="sc-empty">
      <div>Run the engine to see the scorecard</div>
      <div className="mono sc-empty-sub">about 40 s on this machine</div>
    </div>
  )
}

/** Partial · metrics skipped (states board, 20-qubit circuit). */
export function ScorecardPartial() {
  return (
    <>
      <div className="sc-banner">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <span className="sc-banner-text">2 metrics skipped, unaffordable at 20 qubits</span>
        <button className="sc-banner-link">Details</button>
      </div>
      <ScorecardRows rows={SBOX_SCORECARD} />
    </>
  )
}

/** Seeds tab: two-qubit count per seed, the chosen seed outlined in yellow. */
export function SeedsChart() {
  const base = 120
  const scale = 110 / 110
  const bw = 26
  const step = 33
  const x0 = 40
  return (
    <div className="sc-seeds">
      <svg width="306" height="150" viewBox="0 0 306 150" aria-label="two_qubit_count per seed">
        <path d={`M30 10V${base}M30 ${base}H300`} fill="none" stroke="#354348" />
        <text x="24" y="24" textAnchor="end" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
          52
        </text>
        <text x="24" y={base + 2} textAnchor="end" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
          0
        </text>
        {SEEDS.map((s, i) => {
          const bx = x0 + i * step
          const h = s.h * scale
          return (
            <g key={s.seed}>
              <rect
                x={bx}
                y={base - h}
                width={bw}
                height={h}
                fill={s.chosen ? '#C2DADF' : '#496166'}
                stroke={s.chosen ? '#F8D441' : undefined}
                strokeWidth={s.chosen ? 2 : undefined}
              />
              <text
                x={bx + bw / 2}
                y={base + 16}
                textAnchor="middle"
                fontFamily="JetBrains Mono"
                fontSize="10"
                fill={s.chosen ? '#FFFFFF' : '#ADC5CA'}
              >
                {s.seed}
              </text>
              {s.label && (
                <text x={bx + bw / 2} y={base - h - 5} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#FFFFFF">
                  {s.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <p className="sc-seeds-note">
        Seed 67 compiles to the fewest two-qubit gates, so it is the representative. The spread is 0.18.
      </p>
    </div>
  )
}
