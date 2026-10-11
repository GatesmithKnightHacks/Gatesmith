/*
 * S-14 · Conformance fixtures: which layers pass qscore conform on each of the 12 fixtures.
 * Only layers that pass all 12 are ranked on the leaderboard.
 */
import { EditorButton, Tile } from '../../ui/parts'
import { Status } from '../../ui/status'
import { BENCH, FIXTURES } from './boardData'

type Column = { id: string; model: string; prompt: string | null; failed: number[] }

const COLUMNS: Column[] = [
  ...BENCH.map((r) => ({ id: r.id, model: r.model, prompt: r.prompt, failed: [] })),
  // codegemma-7b is not on the board: F04, F07 and F11 failed conform
  { id: 'codegemma', model: 'codegemma-7b', prompt: 'v3', failed: [3, 6, 10] },
]

const short = (c: Column) =>
  c.id === 'reference'
    ? 'transpile L3'
    : `${c.model.replace('deepseek-coder-v2-16b', 'deepseek-16b').replace('-coder', '').replace('-qiskit', '')}${c.prompt ? ` ${c.prompt}` : ''}`

export function FixturesView({ onBack }: { onBack: () => void }) {
  return (
    <Tile
      className="s14-conform"
      tabs={[{ id: 'f', label: 'Conformance fixtures', active: true }]}
      meta={<span className="mono">12 fixtures × 20 requests · qscore conform · qscore-2026.1</span>}
    >
      <div className="s14c-body">
        <div className="s14c-table" role="grid" aria-label="Conformance by fixture">
          <div className="s14c-row s14c-head" role="row">
            <span className="team-th s14c-id">#</span>
            <span className="team-th s14c-fixture">Fixture</span>
            {COLUMNS.map((c) => (
              <span key={c.id} className={`team-th s14c-cell${c.failed.length ? ' is-off' : ''}`} title={c.model}>
                {short(c)}
              </span>
            ))}
          </div>
          {FIXTURES.map((f, i) => (
            <div key={f} className="s14c-row team-row team-arrive" role="row" style={{ animationDelay: `${i * 40}ms` }}>
              <span className="mono s14c-id">F{String(i + 1).padStart(2, '0')}</span>
              <span className="mono s14c-fixture">{f}</span>
              {COLUMNS.map((c) => (
                <span key={c.id} className="s14c-cell">
                  {c.failed.includes(i) ? <Status kind="failed" size={11} /> : <Status kind="passed" size={11} />}
                </span>
              ))}
            </div>
          ))}
          <div className="s14c-row s14c-total" role="row">
            <span className="s14c-id" />
            <span className="s14c-fixture">Passed</span>
            {COLUMNS.map((c) => (
              <span key={c.id} className={`mono s14c-cell${c.failed.length ? ' is-bad' : ''}`}>
                {12 - c.failed.length} of 12
              </span>
            ))}
          </div>
        </div>
        <div className="s14c-foot">
          <p className="s14c-note">
            Only layers that pass all 12 fixtures are ranked. codegemma-7b failed F04, F07 and F11, so it is not on the board.
          </p>
          <EditorButton onClick={onBack}>Back to leaderboard</EditorButton>
        </div>
      </div>
    </Tile>
  )
}
