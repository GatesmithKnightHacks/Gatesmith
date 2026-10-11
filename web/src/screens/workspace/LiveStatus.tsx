/*
 * Live job progress for the Scorecard tile, in the same visual language as ScorecardScoring but with
 * only what the platform actually reports: the job state and the engine's stage events.
 */
import type { RealRun } from '../../data/run'

const STEPS = [
  { id: 'queued', label: 'queued' },
  { id: 'claimed', label: 'worker' },
  { id: 'running', label: 'scoring' },
  { id: 'diagnose', label: 'findings' },
] as const

export function LiveStatus({ real, progress }: { real: RealRun; progress: number }) {
  const at = STEPS.findIndex((s) => s.id === real.step)
  return (
    <div className="sc-scoring">
      <div className="sc-scoring-head">
        <span>{real.message}</span>
        <span className="mono sc-scoring-left">{real.jobId ? `job ${real.jobId.slice(0, 8)}` : 'submitting'}</span>
      </div>
      <div className="sc-scoring-bar">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="sc-stages">
        {STEPS.map((s, i) => (
          <span key={s.id} className={i < at ? 'is-done' : i === at ? 'is-now' : 'is-next'}>
            {i < at ? '✓' : i === at ? '●' : '○'} {s.label}
          </span>
        ))}
      </div>
      <div className="sc-scoring-note">
        Running {real.example} on the platform queue: a worker claims the job, the engine compiles across seeds,
        measures and diagnoses, and the scorecard lands here.
      </div>
    </div>
  )
}
