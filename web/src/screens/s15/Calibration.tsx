/*
 * S-15 · Calibration: how well the predictor's intervals held against the engine's verdicts.
 * Coverage = share of verified candidates whose change fell inside the predicted 90% interval.
 */
import { EditorButton } from '../../ui/parts'
import { Status } from '../../ui/status'
import '../team/team.css'

const ROWS = [
  { round: 'R1', sent: 2, inside: 2, mae: '0.4', note: 'routing_search, commuting_reorder' },
  { round: 'R2', sent: 2, inside: 2, mae: '0.5', note: 'recalibrated after this round · 11:02' },
  { round: 'R3', sent: 2, inside: 1, mae: '0.9', note: 'layout_search verified −1, outside −3.0 to −1.2' },
]

export function CalibrationPanel({ recalibrated, onRecalibrate }: { recalibrated: boolean; onRecalibrate: () => void }) {
  return (
    <div className="s15k">
      <div className="s15-intro">
        <h2 className="s15-heading">The engine's verdicts keep the predictor honest.</h2>
        <p className="st-note">
          Every candidate the verifier checks is also a test of the prediction. Coverage counts how often the verified change landed inside the
          predicted 90% interval.
        </p>
      </div>
      <div className="s15k-table" role="grid" aria-label="Calibration by round">
        <div className="s15k-row s15k-head" role="row">
          <span className="team-th s15k-round">Round</span>
          <span className="team-th s15k-num">Verified</span>
          <span className="team-th s15k-num">Inside interval</span>
          <span className="team-th s15k-num">Coverage</span>
          <span className="team-th s15k-num">Mean abs. error</span>
          <span className="team-th s15k-status">Status</span>
          <span className="team-th s15k-note">Note</span>
        </div>
        {ROWS.map((r, i) => {
          const pct = Math.round((100 * r.inside) / r.sent)
          return (
            <div key={r.round} className="s15k-row team-arrive" role="row" style={{ animationDelay: `${i * 40}ms` }}>
              <span className="mono s15k-round">{r.round}</span>
              <span className="mono s15k-num">{r.sent}</span>
              <span className="mono s15k-num">
                {r.inside} of {r.sent}
              </span>
              <span className="mono s15k-num">{pct}%</span>
              <span className="mono s15k-num">{r.mae} gates</span>
              <span className="s15k-status">
                {r.inside === r.sent ? <Status kind="holds" size={11} /> : <Status kind="warning" label="1 missed" size={11} />}
              </span>
              <span className="s15k-note">{r.note}</span>
            </div>
          )
        })}
        <div className="s15k-row s15k-total" role="row">
          <span className="s15k-round">Last 40</span>
          <span className="mono s15k-num">40</span>
          <span className="mono s15k-num">35 of 40</span>
          <span className="mono s15k-num">88%</span>
          <span className="mono s15k-num">0.6 gates</span>
          <span className="s15k-status">
            <Status kind="holds" label="above 80%" size={11} />
          </span>
          <span className="s15k-note">target 90% · pauses below 80% over 5 rounds</span>
        </div>
      </div>
      <div className="s15k-foot">
        <span className="st-note">
          {recalibrated ? 'Recalibrated just now on the last 40 verdicts.' : 'Last calibrated after round 2 · 11:02 on 18,400 verified attempts.'}
        </span>
        <EditorButton onClick={onRecalibrate} disabled={recalibrated}>
          {recalibrated ? 'Recalibrated' : 'Recalibrate now'}
        </EditorButton>
      </div>
    </div>
  )
}
