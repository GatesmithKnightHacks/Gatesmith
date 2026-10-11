/*
 * S-13 local parts: state word, filter controls, inspector rows and the top-bar account.
 * Kept here so the Runs screen does not change the shared team files.
 */
import type { ReactNode, Ref } from 'react'
import type { JobState } from './runsData'

/* ── State word: icon + word in the state color ─────────────────────── */
const STATE_CLASS: Record<JobState, string> = {
  running: 'is-running',
  queued: 'is-queued',
  done: 'is-done',
  failed: 'is-failed',
  cancelled: 'is-cancelled',
}

export function StateIcon({ state }: { state: JobState }) {
  const s = { width: 12, height: 12, viewBox: '0 0 14 14', 'aria-hidden': true, className: 's13-state-icon' } as const
  switch (state) {
    case 'running':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="4" fill="currentColor" />
        </svg>
      )
    case 'queued':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )
    case 'done':
      return (
        <svg {...s}>
          <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'failed':
      return (
        <svg {...s}>
          <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'cancelled':
      return (
        <svg {...s}>
          <path d="M3.5 7h7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
  }
}

export function StateWord({ state }: { state: JobState }) {
  return (
    <span className={`s13-state ${STATE_CLASS[state]}`}>
      <StateIcon state={state} />
      {state}
    </span>
  )
}

/* ── Filter controls ─────────────────────────────────────────────────── */
export function SearchField({
  value,
  onChange,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  inputRef?: Ref<HTMLInputElement>
}) {
  return (
    <label className="s13-search">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M9.2 9.2L12.5 12.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        className={`s13-search-input${value ? ' has-value' : ''}`}
        value={value}
        placeholder="Filter by run id or item"
        aria-label="Filter by run id or item"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

/** A native select under a drawn face: "State all" with the 10 px chevron. */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  onChange: (v: T) => void
}) {
  return (
    <label className="s13-select">
      <span className="s13-select-face">
        <span className="s13-select-label">{label}</span>
        <span className="s13-select-value">{value}</span>
      </span>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ── Inspector ───────────────────────────────────────────────────────── */
export function InspRows({ children }: { children: ReactNode }) {
  return <div className="s13-rows">{children}</div>
}

export function InspRow({ label, value, monoLabel }: { label: ReactNode; value: ReactNode; monoLabel?: boolean }) {
  return (
    <div className="s13-kv">
      <span className={`s13-kv-label${monoLabel ? ' is-mono' : ''}`}>{label}</span>
      <span className="s13-kv-value">{value}</span>
    </div>
  )
}

/** Top bar right side on signed-in screens: GPU dot + word, then the account handle. */
export function TopStatus({ gpu = true, signedIn = true }: { gpu?: boolean; signedIn?: boolean }) {
  return (
    <span className="s13-topstatus">
      <span className="s13-gpu">
        <span className={`s13-gpu-dot${gpu ? '' : ' is-off'}`} />
        {gpu ? 'GPU online' : 'GPU off'}
      </span>
      <span className="s13-handle">
        <span className="s13-handle-icon">
          <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
            <path d="M7 7.2a2.4 2.4 0 100-4.8a2.4 2.4 0 000 4.8zM2.8 12.2c.6-2 2.2-3.1 4.2-3.1s3.6 1.1 4.2 3.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        {signedIn ? <span className="mono">qlab-dev</span> : <span>not signed in</span>}
      </span>
    </span>
  )
}

