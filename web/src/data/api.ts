/*
 * Platform API client (qscore/docs/deployment.md §4). Same origin: Caddy serves this app and
 * sends /api/* to the platform, so every call is a relative URL.
 *
 * Live mode is chosen at build time: the production image builds with VITE_API_MODE=live.
 * `npm run dev` stays on the scripted demo engine unless you set it (and proxy /api).
 */

export const LIVE = import.meta.env.VITE_API_MODE === 'live'

const BASE = '/api'

export type Health = {
  ok: boolean
  version: string
  gpu_online: boolean
  gpu_last_seen: string | null
  examples: string[]
}

export type JobState = 'queued' | 'claimed' | 'running' | 'done' | 'failed' | 'cancelled'

export type Job = {
  id: string
  kind: string
  state: JobState
  example: string | null
  items: string[]
  attempts: number
  max_attempts: number
  claimed_by: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  error: { type?: string; message?: string } | null
}

export type JobEvent = { seq: number; at: string; kind: string; data: { message?: string; item_id?: string } }

/** A `qscore.scorecard/v0.2` document; only the fields the screens read are typed. */
export type ScorecardDoc = {
  item: { id: string; item_sha256: string }
  status: 'complete' | 'partial' | 'failed'
  target?: { name: string; num_qubits: number } | null
  metrics: {
    id: string
    group: 'resources' | 'hardware' | 'opportunities' | 'research'
    value?: number | Record<string, unknown> | null
    unit?: string | null
    status: 'computed' | 'skipped' | 'unavailable' | 'failed'
    reason?: string | null
    error?: { type: string; message: string } | null
    uncertainty?: { ci95?: [number, number] } | null
  }[]
  findings: {
    id: string
    rule: string
    title: string
    severity: 'info' | 'warning' | 'high'
    threshold?: { name: string; value: number; margin: number } | null
    evidence?: Record<string, unknown>
    region?: { scope: string; qubits: number[]; layers: [number, number] } | null
    suppressed?: { by: string; reason: string } | null
  }[]
}

export type ScorecardRow = {
  item_id: string
  item_sha256: string
  status: string
  worst_severity: string | null
  findings_count: number
  scorecard: ScorecardDoc
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } })
  } catch {
    throw new ApiError(0, 'The platform cannot be reached. Check your connection and try again.')
  }
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new ApiError(res.status, `The platform answered ${res.status} without JSON; is the API running?`)
  }
  if (!res.ok) {
    const b = body as { detail?: unknown; error?: string } | null
    const detail = typeof b?.detail === 'string' ? b.detail : (b?.error ?? `request failed (${res.status})`)
    throw new ApiError(res.status, detail)
  }
  return body as T
}

export const api = {
  health: () => call<Health>('/health'),
  submitJob: (example: string) => call<{ id: string }>('/jobs', { method: 'POST', body: JSON.stringify({ example }) }),
  job: (id: string) => call<Job>(`/jobs/${id}`),
  events: (id: string, after: number) => call<JobEvent[]>(`/jobs/${id}/events?after=${after}`),
  scorecards: (id: string) => call<ScorecardRow[]>(`/jobs/${id}/scorecards`),
}
