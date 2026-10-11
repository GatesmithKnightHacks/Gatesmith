/*
 * S-14 · Conformance fixtures: which layers pass qscore conform on each of the 12 fixtures.
 * A layer that fails any fixture is listed on the leaderboard last and unranked.
 */
import { EditorButton } from '../../ui/parts'
import { ATTEMPTS, FAILED_LAYER, FIXTURE_COUNT, FIXTURES, LAYERS, type LayerRow } from './boardData'

const COLUMNS: LayerRow[] = [...LAYERS, FAILED_LAYER]

const SHORT: Record<string, string> = {
  qwen14: 'Qwen2.5-14B',
  reference: 'reference',
  granite: 'granite p-2026.1',
  qwen32: 'Qwen2.5-32B',
  'granite-old': 'granite p-2025.4',
  llama: 'llama3.1-8b',
  qwen7: 'Qwen2.5-7B',
}

const failedOn = (c: LayerRow, fixture: string) => !!c.failed?.on.includes(fixture)

export function FixturesView({ onBack }: { onBack: () => void }) {
  return (
    <section className="tile s14-conform">
      <div className="tile-header">
        <div className="tile-tabs">
          <span className="tile-tab is-active">Conformance fixtures</span>
        </div>
        <div className="tile-meta">
          <span className="mono">
            {FIXTURE_COUNT} fixtures × {ATTEMPTS} attempts · qscore conform · qscore-2026.1
          </span>
        </div>
      </div>
      <div className="s14c-body">
        <div className="s14c-table" role="grid" aria-label="qscore conform by fixture">
          <div className="s14c-row s14c-head" role="row">
            <span className="s14-th s14c-id">#</span>
            <span className="s14-th s14c-fixture">fixture</span>
            {COLUMNS.map((c) => (
              <span key={c.id} role="columnheader" className="s14-th s14c-cell" title={`${c.model}${c.prompt ? ` ${c.prompt}` : ''}`}>
                {SHORT[c.id]}
              </span>
            ))}
          </div>
          {FIXTURES.map((f, i) => (
            <div key={f} className="s14c-row" role="row">
              <span className="mono s14c-id">F{String(i + 1).padStart(2, '0')}</span>
              <span className="mono s14c-fixture">{f}</span>
              {COLUMNS.map((c) => (
                <span key={c.id} className="s14c-cell">
                  {failedOn(c, f) ? (
                    <span className="s14c-word is-bad">
                      <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
                        <path d="M3 3l6 6M9 3L3 9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                      failed · <span className="mono">{c.failed!.code}</span>
                    </span>
                  ) : (
                    <span className="s14c-word">
                      <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
                        <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      passed
                    </span>
                  )}
                </span>
              ))}
            </div>
          ))}
          <div className="s14c-row s14c-total" role="row">
            <span className="s14c-id" />
            <span className="s14c-fixture">Passed</span>
            {COLUMNS.map((c) => (
              <span key={c.id} className={`mono s14c-cell${c.kit < FIXTURE_COUNT ? ' is-bad' : ''}`}>
                {c.kit} of {FIXTURE_COUNT}
              </span>
            ))}
          </div>
        </div>
        <div className="s14c-foot">
          <p className="s14c-note">
            Only layers that pass all {FIXTURE_COUNT} fixtures are ranked. {FAILED_LAYER.model} edited outside the allowed region on bv_10, adder_4 and
            hhl_4 (<span className="mono">{FAILED_LAYER.failed!.code}</span>), so it is listed last, unranked.
          </p>
          <EditorButton onClick={onBack}>Back to leaderboard</EditorButton>
        </div>
      </div>
    </section>
  )
}
