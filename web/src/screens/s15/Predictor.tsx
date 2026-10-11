/*
 * S-15 Predictor tile (Paper 1G6D-0): the model card and its calibration plot. A prediction, not a
 * score: the engine still verifies every accepted change.
 */
import { TileHeader } from '../../ui/parts'
import { Fact, StatusWord } from '../stretch/parts'

export function PredictorTile({ installed = true, gpu = true }: { installed?: boolean; gpu?: boolean }) {
  return (
    <section className="tile s15-predictor">
      <TileHeader tabs={[{ id: 'p', label: 'Predictor', active: true }]} meta={<span className="mono">{installed ? 'gatesmith-predictor-0.3' : 'not installed'}</span>} />
      <div className="s15-pred-body">
        <div className="s15-pred-facts">
          <Fact label="Model" value={installed ? 'gatesmith-predictor-0.3' : <StatusWord word="unavailable" gap={4} className="is-tertiary" label="not installed" />} small={installed} mono={installed} />
          <Fact label="Kind" value="graph transformer · scorecards" mono={false} />
          <Fact label="Trained on" value="12 400" unit="attempts" />
          <Fact label="Calibration error" value="0.06" unit="prob." />
          <Fact label="Runs on" value={gpu ? 'GPU · 0.2' : 'GPU · off'} unit={gpu ? 's per candidate' : 'waits for the GPU'} />
        </div>
        <p className="s15-pred-note">A prediction, not a score: the engine still verifies every accepted change</p>
        <div className="s15-calib">
          <div className="s15-calib-head">
            <span className="s15-group-label">calibration</span>
            <span className="mono s15-axis">x predicted · 200 verified</span>
          </div>
          <div className="s15-calib-plot">
            <svg width="258" height="144" viewBox="0 0 258 144" aria-label="Calibration: verified share against predicted probability, close to the diagonal">
              <path d="M26 6H250M26 39H250M26 72H250M26 105H250M82 6V138M138 6V138M194 6V138M250 6V138" fill="none" stroke="var(--color-surface-app)" />
              <path d="M26 6V138H250" fill="none" stroke="var(--color-border-control)" />
              <path d="M26 138L250 6" fill="none" stroke="var(--color-border-control)" strokeDasharray="3 3" />
              <path d="M115.6 138V130M164.9 138V130M191.8 138V130M207.4 138V130" fill="none" stroke="var(--color-violet-400)" strokeWidth="2" />
              {[
                [48.4, 131.4],
                [93.2, 106.3],
                [138, 64.1],
                [182.8, 53.5],
                [227.6, 28.4],
              ].map(([x, y]) => (
                <circle key={x} cx={x} cy={y} r="3" fill="var(--color-text-primary)" />
              ))}
            </svg>
            <span className="mono s15-axis s15-y" style={{ top: 0 }}>
              1
            </span>
            <span className="mono s15-axis s15-y" style={{ top: 66 }}>
              0.5
            </span>
            <span className="mono s15-axis s15-y" style={{ top: 130 }}>
              0
            </span>
          </div>
          <div className="s15-calib-x">
            <span className="mono s15-axis" style={{ left: 23 }}>
              0
            </span>
            <span className="mono s15-axis" style={{ left: 129 }}>
              0.5
            </span>
            <span className="mono s15-axis" style={{ left: 247 }}>
              1
            </span>
          </div>
          <div className="s15-calib-legend">
            <span>
              <span className="s15-dot-white" />
              verified share by bin
            </span>
            <span>
              <span className="s15-tick-violet" />
              this round
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
