/*
 * Scorecard tile bodies (MVN-0 20HZ-0 and the DS-06 state frames): rows on the inset, 20 tall; name 150 |
 * bars 80 (36 px track + 40 px delta or status) | now 40 | unit 42. Group headers 18 tall.
 */
import { Sk } from '../../ui/Skeleton'
import { MarkIcon, MarkWord } from './icons'
import { BASELINE_ROWS, SCORE_ROWS, SEEDS, type ScoreRow } from './data'

function Row({ row }: { row: ScoreRow }) {
  switch (row.kind) {
    case 'group':
      return (
        <div className="ws-sc-group">
          <span className="ws-sc-group-label">{row.label}</span>
          {row.note && <span className={`ws-sc-group-note${row.noteSize === 11 ? ' is-11' : ''}`}>{row.note}</span>}
        </div>
      )
    case 'caveat':
      return <div className="ws-sc-caveat">{row.text}</div>
    case 'status':
      return (
        <div className={`ws-sc-row is-status${row.last ? ' is-last' : ''}`}>
          <span className="ws-sc-status-name">{row.name}</span>
          <span className="ws-sc-status-right">
            <span>{row.note}</span>
            <MarkWord kind="queued" label={row.status} size={11} tone="var(--color-text-tertiary)" />
          </span>
        </div>
      )
    case 'metric':
      return (
        <div className={`ws-sc-row${row.open ? ' is-open' : ''}${row.primary ? ' is-primary' : ''}`}>
          <span className="ws-sc-name">{row.name}</span>
          {row.aside ? (
            <span className="ws-sc-aside">{row.aside}</span>
          ) : row.bars ? (
            <span className="ws-sc-bars">
              <span className="ws-sc-track">
                <span className="ws-sc-bg" />
                <span className="ws-sc-base" style={{ width: row.bars[0] }} />
                <span className={`ws-sc-now${row.fires ? ' is-fires' : ''}`} style={{ width: row.bars[1] }} />
                {row.tick != null && <span className="ws-sc-tick" style={{ left: row.tick }} />}
              </span>
              <span className="ws-sc-delta">{row.fires ? <MarkWord kind="high" size={11} /> : row.delta}</span>
            </span>
          ) : (
            <span className="ws-sc-bars" />
          )}
          <span className="ws-sc-now-value">{row.now}</span>
          <span className="ws-sc-unit">{row.unit}</span>
        </div>
      )
  }
}

/** The scorecard at 400 s. `partial` swaps seed_spread for "pending" (round 3 re-score, 3 of 8 seeds). */
export function ScorecardRows({ partial, rows = SCORE_ROWS }: { partial?: boolean; rows?: ScoreRow[] }) {
  return (
    <div className="ws-tile-pad">
      <div className="ws-sc-inset">
        {rows.map((row, i) =>
          partial && row.kind === 'metric' && row.name === 'seed_spread' ? (
            <div key={i} className="ws-sc-row is-status">
              <span className="ws-sc-name">seed_spread</span>
              <span className="ws-sc-status-right">
                <MarkWord kind="pending" label="pending" size={11} tone="var(--color-text-tertiary)" />
              </span>
            </div>
          ) : (
            <Row key={i} row={row} />
          ),
        )}
      </div>
    </div>
  )
}

/** Solid blocks where values will be (scoring: the engine is still measuring). */
function Wait({ w, h = 12 }: { w: number; h?: number }) {
  return <span className="ws-wait" style={{ width: w, height: h }} />
}

const PENDING: ([number, number] | 'gap' | string)[] = [
  'hardware',
  [106, 64],
  [92, 64],
  [86, 64],
  [139, 64],
  'gap',
  [119, 64],
  [73, 64],
  'opportunities',
  [139, 64],
  [139, 64],
  'research',
  [132, 120],
  [79, 120],
]

/** First score: the baseline resource rows land first, the rest waits as solid blocks. */
export function ScorecardScoring() {
  return (
    <div className="ws-tile-pad">
      <div className="ws-sc-inset" aria-busy="true">
        {BASELINE_ROWS.map((row, i) => (
          <Row key={i} row={row} />
        ))}
        {PENDING.map((p, i) =>
          p === 'gap' ? (
            <div key={i} style={{ height: 19, flexShrink: 0 }} />
          ) : typeof p === 'string' ? (
            <div key={i} className="ws-sc-group">
              <span className="ws-sc-group-label">{p}</span>
            </div>
          ) : (
            <div key={i} className="ws-sc-skrow">
              <Wait w={p[0]} />
              <Wait w={p[1]} />
            </div>
          ),
        )}
      </div>
    </div>
  )
}

/** Never run: nothing measured yet. */
export function ScorecardEmpty() {
  return (
    <div className="ws-tile-pad">
      <div className="ws-sc-inset is-empty">
        <span>Not scored yet · Run engine to score</span>
      </div>
    </div>
  )
}

const LOADING: (number[] | 'g' | 'g19')[] = [
  'g',
  [33, 64],
  [33, 64],
  [99, 64, 16],
  [99, 64],
  'g',
  [106, 64],
  [92, 64],
  [86, 64],
  [139, 64],
  'g19',
  [119, 64],
  [73, 64],
  'g',
  [139, 64],
  [139, 64],
  'g',
  [132, 120],
  [79, 120],
]

/** Opening a saved run: the shimmer holds the scorecard's real shape. */
export function ScorecardLoading() {
  return (
    <div className="ws-tile-pad">
      <div className="ws-sc-inset is-loading">
        {LOADING.map((r, i) =>
          r === 'g' || r === 'g19' ? (
            <div key={i} style={{ height: r === 'g' ? 18 : 19, flexShrink: 0 }} />
          ) : (
            <div key={i} className="ws-sc-skrow">
              <Sk w={r[0]} h={12} />
              <Sk w={r[1]} h={r[2] ?? 12} />
            </div>
          ),
        )}
      </div>
    </div>
  )
}

/** Seeds tab: two_qubit_count per seed after round 2, best of 8. */
export function SeedsChart() {
  const max = 305
  const min = 275
  return (
    <div className="ws-tile-pad">
      <div className="ws-sc-inset ws-seeds">
        <div className="ws-sc-group">
          <span className="ws-sc-group-label">two_qubit_count per seed</span>
          <span className="ws-sc-group-note">after R2 · best of 8</span>
        </div>
        {SEEDS.map((s) => {
          const best = s.seed === 37
          return (
            <div key={s.seed} className={`ws-seed-row${best ? ' is-best' : ''}`}>
              <span className="ws-seed-name">seed {s.seed}</span>
              <span className="ws-seed-track">
                <span className="ws-seed-bar" style={{ width: `${((s.gates - min) / (max - min)) * 100}%` }} />
              </span>
              <span className="ws-sc-now-value">{s.gates}</span>
              <span className="ws-sc-unit">gates</span>
              <span className="ws-seed-flag">{best && <MarkIcon kind="accepted" tone="var(--color-text-secondary)" />}</span>
            </div>
          )
        })}
        <div className="ws-sc-caveat">seed_spread 0.071 ratio = (301 − 281) ÷ 281 · n = 8 · seed 37 is the circuit shown</div>
      </div>
    </div>
  )
}
