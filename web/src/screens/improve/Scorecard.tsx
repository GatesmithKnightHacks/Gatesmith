/*
 * S-07 Scorecard tile: four primary rows with baseline and now bars (pink where a rule still fires, a
 * 1 px threshold tick), then the findings left after the last round. Loading re-diagnoses in place.
 */
import { Tile } from '../../ui/parts'
import { Word, Spinner } from './marks'
import { Block } from './parts'
import type { Scorecard } from './loopData'

export function ScorecardTile({ data }: { data: Scorecard }) {
  const loading = data === 'loading'
  return (
    <Tile
      className="lp-score"
      tabs={[
        { id: 'score', label: 'Scorecard', active: true },
        { id: 'seeds', label: 'Seeds' },
        { id: 'hw', label: 'Hardware' },
      ]}
      meta={<span className="mono">{loading ? 'after R3' : data.meta}</span>}
      bodyClassName="lp-score-body"
    >
      {loading ? (
        <div className="lp-score-inset is-loading" role="status" aria-live="polite">
          <div className="lp-score-stage">
            <Spinner />
            <span>Re-diagnosing after R3</span>
            <span className="im-grow" />
            <span className="mono lp-score-eta">about 4 s</span>
          </div>
          {[120, 104, 112, 136].map((w) => (
            <div key={w} className="lp-score-sk">
              <Block w={w} onInset />
              <span className="im-grow" />
              <Block w={44} onInset />
              <Block w={64} onInset />
            </div>
          ))}
          <div className="lp-score-sk is-gap">
            <Block w={56} h={10} onInset />
          </div>
          {[140, 120].map((w) => (
            <div key={w} className="lp-score-sk">
              <Block w={28} onInset />
              <Block w={w} onInset />
              <span className="im-grow" />
              <Block w={56} onInset />
            </div>
          ))}
        </div>
      ) : (
        <div className="lp-score-inset">
          <div className="lp-group">
            <span className="lp-group-title">{data.title}</span>
            <span className="mono lp-group-note">bars baseline · now · tick threshold</span>
          </div>
          {data.rows.map((r, i) => (
            <div key={r.name} className={`lp-score-row${i === data.rows.length - 1 ? ' is-last' : ''}`}>
              <span className={`mono lp-score-name${r.primary ? ' is-primary' : ''}`}>{r.name}</span>
              <span className="lp-score-bars">
                <span className="lp-score-track">
                  <span className="lp-score-bg" />
                  {r.base != null && <span className="lp-score-base" style={{ width: r.base }} />}
                  <span className={`lp-score-now${r.high ? ' is-high' : ''}`} style={{ width: r.now }} />
                  {r.tick != null && <span className="lp-score-tick" style={{ left: r.tick }} />}
                </span>
                <span className="lp-score-delta">
                  {r.high ? (
                    <Word kind="high" size={11} />
                  ) : (
                    <span className="mono">{r.delta ?? ''}</span>
                  )}
                </span>
              </span>
              <span className={`mono lp-score-value${r.primary ? ' is-primary' : ''}`}>{r.value}</span>
              <span className="mono lp-score-unit">{r.unit}</span>
            </div>
          ))}
          <div className="lp-group">
            <span className="lp-group-title">findings</span>
            <span className="mono lp-group-note">{data.findingsMeta}</span>
          </div>
          {data.findings.map((f, i) => (
            <div key={`${f.rule}${f.title}`} className={`lp-finding-row${i === data.findings.length - 1 ? ' is-last' : ''}${f.status === 'accepted' ? ' is-done' : ''}`}>
              <span className="mono lp-finding-rule">{f.rule}</span>
              <span className="lp-finding-title">{f.title}</span>
              <span className="im-grow" />
              <span className="lp-finding-status">
                <Word kind={f.status} />
              </span>
            </div>
          ))}
        </div>
      )}
    </Tile>
  )
}
