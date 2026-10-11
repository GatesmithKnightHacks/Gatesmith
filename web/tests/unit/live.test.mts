import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { api, ApiError, LIVE_SUBMISSION_UNAVAILABLE, parseScorecard, type Job, type JobEvent, type ScorecardDoc } from '../../src/data/api.ts'
import { findingsFrom, jobMessage, rowsFrom, suppressedCount } from '../../src/data/live.ts'

/** UI transport fixture: current scorecard fields consumed by the screen, not an engine golden. */
function scorecard(): ScorecardDoc {
  return {
    schema: 'qscore.scorecard/v0.3', item: { id: 'ladder', item_sha256: 'a'.repeat(64), score_version: 'qscore-2026.2' },
    status: 'partial', target: { name: 'line-3', num_qubits: 3, basis: ['rz', 'sx', 'x', 'cx'] },
    compile: { seeds: [0, 1], representative_seed: 0, per_seed: [
      { seed: 0, two_qubit_count: 6, two_qubit_depth: 6, depth: 10, time_s: 0.2 },
      { seed: 1, two_qubit_count: 6, two_qubit_depth: 6, depth: 10, time_s: 0.3 },
    ] },
    metrics: [
      { id: 'two_qubit_count', group: 'resources', status: 'computed', value: 6, unit: 'gates' },
      { id: 'routing_overhead', group: 'hardware', status: 'computed', value: 0.5, unit: 'ratio' },
      { id: 'reliability_heuristic', group: 'hardware', status: 'unavailable', reason: 'No calibration declared' },
      { id: 'scheduled_duration', group: 'hardware', status: 'failed', error: { type: 'MetricError', message: 'Timing unavailable for cx(0, 1)' } },
      { id: 'simulated_task_score', group: 'research', status: 'computed', value: 0.7, unit: 'probability', uncertainty: { ci95: [0.61, 0.85], trials: 20 } },
      { id: 'mirror_score', group: 'research', status: 'skipped', reason: 'Not requested' },
    ],
    findings: [
      { id: 'D03#2', rule: 'D03', title: 'Second commuting block', severity: 'warning', evidence: { two_qubit_ops: 9 } },
      { id: 'D01#1', rule: 'D01', title: 'Routing dominates', severity: 'high', evidence: { routing_overhead: 0.5 }, region: { scope: 'compiled', qubits: [1, 2], layers: [0, 9] } },
      { id: 'D03#1', rule: 'D03', title: 'First commuting block', severity: 'warning', evidence: { two_qubit_ops: 3 } },
      { id: 'D08#1', rule: 'D08', title: 'Suppressed finding', severity: 'info', evidence: {}, suppressed: { by: 'manifest', reason: 'Reviewed by author' } },
    ], fallbacks_used: [],
  }
}
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const respond = (body: unknown, status = 200) => {
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('current scorecards preserve values, statuses, errors and asymmetric confidence intervals', () => {
  const rows = rowsFrom(parseScorecard(scorecard()))
  assert.deepEqual(rows.find((r) => r.kind === 'metric' && r.name === 'two_qubit_count'),
    { kind: 'metric', name: 'two_qubit_count', now: '6', unit: 'gates', primary: true, aside: undefined })
  assert.ok(rows.some((r) => r.kind === 'status' && r.name === 'reliability_heuristic' && r.status === 'unavailable' && r.note === 'No calibration declared'))
  assert.ok(rows.some((r) => r.kind === 'metric' && r.name === 'scheduled_duration' && r.now === 'failed'))
  assert.ok(rows.some((r) => r.kind === 'caveat' && r.text === 'MetricError: Timing unavailable for cx(0, 1)'))
  assert.ok(rows.some((r) => r.kind === 'status' && r.name === 'mirror_score' && r.status === 'skipped'))
  assert.ok(rows.some((r) => r.kind === 'metric' && r.name === 'simulated_task_score' && r.aside === '95% CI [0.610, 0.850]'))
})

test('findings retain stable identities and actual evidence, sorted by severity; suppressions stay counted', () => {
  const card = parseScorecard(scorecard())
  const findings = findingsFrom(card)
  assert.deepEqual(findings.map((f) => f.id), ['D01#1', 'D03#1', 'D03#2'])
  assert.match(findings[0].evidence, /"routing_overhead":0.5/)
  assert.match(findings[0].evidence, /compiled · layers 0–9/)
  assert.equal(suppressedCount(card), 1)
})

test('old or malformed scorecards fail visibly instead of substituting values', () => {
  assert.throws(() => parseScorecard({ ...scorecard(), schema: 'qscore.scorecard/v0.2' }), ApiError)
  for (const metric of [
    { id: 'depth', group: 'resources', status: 'computed', value: null },
    { id: 'depth', group: 'resources', status: 'failed' },
    { id: 'depth', group: 'resources', status: 'skipped' },
    { id: 'depth', group: 'resources', status: 'computed', value: Number.NaN },
  ]) assert.throws(() => parseScorecard({ ...scorecard(), metrics: [metric] }), ApiError)
})

test('browser submission is unavailable and never sends a credentialed request', async () => {
  let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error('should not send') }
  await assert.rejects(api.submitJob('sidechain_qaoa'), (e: unknown) => e instanceof ApiError && e.status === 403 && e.message === LIVE_SUBMISSION_UNAVAILABLE)
  assert.equal(requests, 0)
})

test('scorecard read validates row identity and returns current engine records', async () => {
  const card = scorecard()
  const row = { item_id: card.item.id, item_sha256: card.item.item_sha256, status: card.status, worst_severity: 'high', findings_count: 4, scorecard: card }
  respond([row])
  assert.equal((await api.scorecards('job-1'))[0].scorecard.metrics[0].value, 6)
  respond([{ ...row, item_id: 'another-circuit' }])
  await assert.rejects(api.scorecards('job-1'), /identity/)
})

test('event reads retain the versioned engine event envelope', async () => {
  const event: JobEvent = { seq: 1, at: '2026-10-11T08:00:00Z', kind: 'stage_started', data: {
    schema: 'qscore.event/v0.2', seq: 1, at: '2026-10-11T08:00:00Z', kind: 'stage_started', stage: 'compile', message: 'Compiling across seeds',
  } }
  respond([event])
  assert.equal((await api.events('job-1', 0))[0].data.stage, 'compile')
  respond([{ ...event, data: { ...event.data, seq: 2 } }])
  await assert.rejects(api.events('job-1', 0), /identity/)
})

test('terminal failure overrides an earlier successful progress event', () => {
  const job = { state: 'failed', error: { type: 'WorkerError', message: 'Worker heartbeat expired' } } as Job
  const events = [{ kind: 'stage_finished', data: { message: 'Compilation completed' } }] as JobEvent[]
  assert.equal(jobMessage(job, events), 'The job failed: Worker heartbeat expired')
  assert.equal(jobMessage({ ...job, state: 'cancelled' }, events), 'The job was cancelled')
  assert.equal(jobMessage({ ...job, state: 'running' }, events), 'Compilation completed')
})

test('network and HTTP failures retain actionable errors', async () => {
  globalThis.fetch = async () => { throw new TypeError('connection refused') }
  await assert.rejects(api.health(), /connection refused/)
  respond({ detail: 'Hub reader is not configured' }, 503)
  await assert.rejects(api.scorecards('job-1'), /Hub reader is not configured/)
})
