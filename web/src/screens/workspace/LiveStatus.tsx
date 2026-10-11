/* Only recorded job state and events are shown; no estimated progress is invented. */
import type { RealRun } from '../../data/run'
import { MarkIcon } from './icons'

export function LiveStatus({ real }: { real: RealRun }) {
  const waiting = real.step === 'queued' || real.step === 'claimed' || real.step === 'running' || real.step === 'submitting'
  return (
    <div className="ws-tile-pad">
      <div className="ws-sc-inset" style={{ padding: 12, gap: 12, overflow: 'auto' }}>
        <div className="ws-stage" role="status">
          <MarkIcon kind={real.error ? 'rejected' : waiting ? 'running' : 'queued'} />
          <span>{real.step}</span>
          <span className="mono">{real.jobId ? `job ${real.jobId.slice(0, 8)}` : 'no job submitted'}</span>
        </div>
        <p role={real.error ? 'alert' : 'status'}>{real.error ?? real.message}</p>
        {real.events.length > 0 && (
          <ol aria-label="Recorded engine events" style={{ paddingLeft: 20 }}>
            {real.events.map((event) => (
              <li key={event.seq}>
                <span className="mono">#{event.seq} · {event.kind}</span>
                {event.data.message && <span> · {event.data.message}</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
