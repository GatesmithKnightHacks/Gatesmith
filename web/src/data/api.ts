/* Same-origin platform reads. Static write credentials remain on the server (spec12 §2). */
export const LIVE = import.meta.env?.VITE_API_MODE === 'live'
export const LIVE_SUBMISSION_UNAVAILABLE =
  'Submitting runs is unavailable until server-side sign-in is connected. Platform and worker tokens must stay on the server. You can open an existing job below.'
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
export type JobEvent = { seq: number; at: string; kind: string; data: { schema: 'qscore.event/v0.2'; seq: number; at: string; kind: string; message: string; item_id?: string | null; stage?: string | null } }

/** Current engine contract. Extra engine fields are retained in the downloaded document. */
export type ScorecardDoc = {
  schema: 'qscore.scorecard/v0.3'
  item: { id: string; item_sha256: string; score_version: string }
  status: 'complete' | 'partial' | 'failed'
  error?: { type: string; message: string } | null
  target?: { name: string; num_qubits: number; basis: string[] } | null
  compile?: {
    seeds: number[]
    representative_seed: number | null
    per_seed: { seed: number; two_qubit_count: number; two_qubit_depth: number; depth: number; time_s: number }[]
  } | null
  metrics: {
    id: string
    group: 'resources' | 'hardware' | 'opportunities' | 'research'
    value?: number | Record<string, unknown> | null
    unit?: string | null
    status: 'computed' | 'skipped' | 'unavailable' | 'failed'
    reason?: string | null
    error?: { type: string; message: string } | null
    uncertainty?: { ci95: [number, number]; trials: number } | null
  }[]
  findings: {
    id: string
    rule: string
    title: string
    severity: 'info' | 'warning' | 'high'
    threshold?: { name: string; value: number; margin: number } | null
    evidence: Record<string, unknown>
    region?: { scope: string; qubits: number[]; layers: [number, number] } | null
    suppressed?: { by: string; reason: string } | null
  }[]
  fallbacks_used: unknown[]
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

function invalid(where: string): never {
  throw new ApiError(502, `The platform returned invalid data at ${where}. Check the platform and engine versions.`)
}
function record(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(where)
  return value as Record<string, unknown>
}
function string(value: unknown, where: string): asserts value is string {
  if (typeof value !== 'string') invalid(where)
}
function number(value: unknown, where: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(where)
}
function array(value: unknown, where: string): asserts value is unknown[] {
  if (!Array.isArray(value)) invalid(where)
}
function strings(value: unknown, where: string) {
  array(value, where)
  value.forEach((v, i) => string(v, `${where}[${i}]`))
}
function numbers(value: unknown, where: string) {
  array(value, where)
  value.forEach((v, i) => number(v, `${where}[${i}]`))
}
function oneOf(value: unknown, allowed: readonly string[], where: string) {
  if (typeof value !== 'string' || !allowed.includes(value)) invalid(where)
}
function errorInfo(value: unknown, where: string) {
  const e = record(value, where)
  string(e.type, `${where}.type`)
  string(e.message, `${where}.message`)
}

/** Validate every field consumed by live screens before rendering external data. */
export function parseScorecard(value: unknown): ScorecardDoc {
  const card = record(value, 'scorecard')
  if (card.schema !== 'qscore.scorecard/v0.3') invalid('scorecard.schema (expected qscore.scorecard/v0.3)')
  const item = record(card.item, 'scorecard.item')
  for (const key of ['id', 'item_sha256', 'score_version']) string(item[key], `scorecard.item.${key}`)
  oneOf(card.status, ['complete', 'partial', 'failed'], 'scorecard.status')
  if (card.status === 'failed') errorInfo(card.error, 'scorecard.error')
  if (card.target != null) {
    const t = record(card.target, 'scorecard.target')
    string(t.name, 'target.name')
    number(t.num_qubits, 'target.num_qubits')
    strings(t.basis, 'target.basis')
  }
  if (card.compile != null) {
    const c = record(card.compile, 'scorecard.compile')
    numbers(c.seeds, 'compile.seeds')
    if (c.representative_seed !== null) number(c.representative_seed, 'compile.representative_seed')
    array(c.per_seed, 'compile.per_seed')
    c.per_seed.forEach((v, i) => {
      const s = record(v, `compile.per_seed[${i}]`)
      for (const key of ['seed', 'two_qubit_count', 'two_qubit_depth', 'depth', 'time_s']) number(s[key], `compile.per_seed[${i}].${key}`)
    })
  }
  array(card.metrics, 'scorecard.metrics')
  card.metrics.forEach((v, i) => {
    const m = record(v, `metrics[${i}]`)
    string(m.id, `metrics[${i}].id`)
    oneOf(m.group, ['resources', 'hardware', 'opportunities', 'research'], `metrics[${i}].group`)
    oneOf(m.status, ['computed', 'skipped', 'unavailable', 'failed'], `metrics[${i}].status`)
    if (m.unit != null) string(m.unit, `metrics[${i}].unit`)
    if (m.status === 'failed') errorInfo(m.error, `metrics[${i}].error`)
    else if (m.status !== 'computed') string(m.reason, `metrics[${i}].reason`)
    else if (typeof m.value === 'number') number(m.value, `metrics[${i}].value`)
    else record(m.value, `metrics[${i}].value`)
    if (m.uncertainty != null) {
      const u = record(m.uncertainty, `metrics[${i}].uncertainty`)
      numbers(u.ci95, `metrics[${i}].uncertainty.ci95`)
      if ((u.ci95 as unknown[]).length !== 2) invalid(`metrics[${i}].uncertainty.ci95`)
      number(u.trials, `metrics[${i}].uncertainty.trials`)
    }
  })
  array(card.findings, 'scorecard.findings')
  card.findings.forEach((v, i) => {
    const f = record(v, `findings[${i}]`)
    for (const key of ['id', 'rule', 'title']) string(f[key], `findings[${i}].${key}`)
    oneOf(f.severity, ['info', 'warning', 'high'], `findings[${i}].severity`)
    record(f.evidence, `findings[${i}].evidence`)
    if (f.threshold != null) {
      const t = record(f.threshold, `findings[${i}].threshold`)
      string(t.name, `findings[${i}].threshold.name`)
      number(t.value, `findings[${i}].threshold.value`)
      number(t.margin, `findings[${i}].threshold.margin`)
    }
    if (f.region != null) {
      const r = record(f.region, `findings[${i}].region`)
      oneOf(r.scope, ['logical', 'compiled'], `findings[${i}].region.scope`)
      numbers(r.qubits, `findings[${i}].region.qubits`)
      numbers(r.layers, `findings[${i}].region.layers`)
      if ((r.layers as unknown[]).length !== 2) invalid(`findings[${i}].region.layers`)
    }
    if (f.suppressed != null) {
      const s = record(f.suppressed, `findings[${i}].suppressed`)
      string(s.by, `findings[${i}].suppressed.by`)
      string(s.reason, `findings[${i}].suppressed.reason`)
    }
  })
  array(card.fallbacks_used, 'scorecard.fallbacks_used')
  return card as ScorecardDoc
}

async function call(path: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(BASE + path)
  } catch (error) {
    throw new ApiError(0, `The platform cannot be reached: ${error instanceof Error ? error.message : String(error)}`)
  }
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new ApiError(res.status, `The platform answered ${res.status} without JSON. Check that the API is running.`)
  }
  if (!res.ok) {
    const b = record(body, 'error response')
    const detail = typeof b.detail === 'string' ? b.detail : typeof b.error === 'string' ? b.error : JSON.stringify(body)
    throw new ApiError(res.status, detail)
  }
  return body
}

export const api = {
  health: async (): Promise<Health> => {
    const h = record(await call('/health'), 'health')
    if (typeof h.ok !== 'boolean' || typeof h.gpu_online !== 'boolean') invalid('health flags')
    string(h.version, 'health.version')
    if (h.gpu_last_seen !== null) string(h.gpu_last_seen, 'health.gpu_last_seen')
    strings(h.examples, 'health.examples')
    return h as Health
  },
  // A browser cannot safely hold the static platform credential. A server-owned session route is pending.
  submitJob: async (_example: string): Promise<{ id: string }> => { throw new ApiError(403, LIVE_SUBMISSION_UNAVAILABLE) },
  job: async (id: string): Promise<Job> => {
    const j = record(await call(`/jobs/${encodeURIComponent(id)}`), 'job')
    for (const key of ['id', 'kind', 'created_at']) string(j[key], `job.${key}`)
    oneOf(j.state, ['queued', 'claimed', 'running', 'done', 'failed', 'cancelled'], 'job.state')
    strings(j.items, 'job.items')
    for (const key of ['attempts', 'max_attempts']) number(j[key], `job.${key}`)
    for (const key of ['example', 'claimed_by', 'started_at', 'finished_at']) if (j[key] !== null) string(j[key], `job.${key}`)
    if (j.error != null) errorInfo(j.error, 'job.error')
    return j as Job
  },
  events: async (id: string, after: number): Promise<JobEvent[]> => {
    const events = await call(`/jobs/${encodeURIComponent(id)}/events?after=${after}`)
    array(events, 'events')
    events.forEach((v, i) => {
      const e = record(v, `events[${i}]`)
      number(e.seq, `events[${i}].seq`)
      string(e.at, `events[${i}].at`)
      string(e.kind, `events[${i}].kind`)
      const data = record(e.data, `events[${i}].data`)
      if (data.schema !== 'qscore.event/v0.2' || data.seq !== e.seq || data.at !== e.at || data.kind !== e.kind) invalid(`events[${i}].data identity`)
      string(data.message, `events[${i}].data.message`)
      for (const key of ['item_id', 'stage']) if (data[key] != null) string(data[key], `events[${i}].data.${key}`)
    })
    return events as JobEvent[]
  },
  scorecards: async (id: string): Promise<ScorecardRow[]> => {
    const rows = await call(`/jobs/${encodeURIComponent(id)}/scorecards`)
    array(rows, 'scorecards')
    rows.forEach((v, i) => {
      const row = record(v, `scorecards[${i}]`)
      for (const key of ['item_id', 'item_sha256', 'status']) string(row[key], `scorecards[${i}].${key}`)
      if (row.worst_severity != null) string(row.worst_severity, `scorecards[${i}].worst_severity`)
      number(row.findings_count, `scorecards[${i}].findings_count`)
      const card = parseScorecard(row.scorecard)
      if (row.item_id !== card.item.id || row.item_sha256 !== card.item.item_sha256 || row.status !== card.status) invalid(`scorecards[${i}] identity`)
    })
    return rows as ScorecardRow[]
  },
}
