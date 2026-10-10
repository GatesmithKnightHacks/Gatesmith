/*
 * The demo engine. It plays the canonical run with the timings from DS-07 / M1–M6, so the
 * live flow moves the way the storyboards say. Deep-linking to a screen shows its Paper snapshot.
 */
import { useSyncExternalStore } from 'react'
import { navigate, ROUTES, type RoutePath } from '../app/router'
import type { ScoreRow } from '../screens/workspace/data'
import type { Finding } from '../ui/parts'
import { api, ApiError, LIVE, type Job } from './api'
import { ATTEMPTS, type AttemptStatus } from './demo'
import { findingsFrom, rowsFrom, suppressedCount } from './live'

export type Phase =
  | 'intake' // S-01
  | 'preflight' // S-03
  | 'scoring' // S-04, M1 scan running
  | 'findings' // S-04, M2 cards landing
  | 'looping' // S-04 / S-07, rounds running
  | 'review' // S-06, a proposal is open
  | 'accepting' // M4, the accept moment
  | 'stopped' // S-07, the engine recommends stopping (M5)
  | 'report' // S-09
  | 'export' // S-10
  | 'scored' // live: a real scorecard landed; the run stops here until the loop is connected

/** A real run on the platform (live build only). Null while the scripted demo engine drives. */
export type RealRun = {
  example: string
  jobId: string | null
  step: 'submitting' | 'queued' | 'claimed' | 'running' | 'diagnose' | 'done'
  message: string
  gpuOnline: boolean | null
  findings: Finding[]
  rows: ScoreRow[]
  suppressed: number
  scorecardStatus: string | null
  error: string | null
}

export type ScoreStage = 'validate' | 'compile' | 'measure' | 'diagnose' | 'done'
export type CandidateState = 'writing' | 'verifying' | 'verified'

export type RunState = {
  phase: Phase
  /** true while the engine is playing the live flow; false for a deep-linked snapshot */
  live: boolean
  selectedExample: 'sidechain_qaoa' | 'grover_5q' | 'sbox_oracle'
  preflightChecks: number // 0–4 checks landed
  scoreProgress: number // 0–1
  scoreStage: ScoreStage
  findingsShown: number // 0–3
  selectedFinding: string | null // rule id
  round: number // 1–4
  loopProgress: number // 0–1, shown in the primary label
  attempts: Record<number, AttemptStatus | 'hidden'>
  twoQubit: number
  candidate: CandidateState
  ladderStep: number // verification ladder steps passed, 0–2
  accepted: boolean
  stopCard: boolean
  /** live build: the real job behind this run; null on the scripted demo engine */
  real: RealRun | null
}

const allAttempts = (fn: (n: number, round: number) => AttemptStatus | 'hidden') =>
  Object.fromEntries(ATTEMPTS.map((a) => [a.n, fn(a.n, a.round)])) as RunState['attempts']

const finalOf = (n: number) => ATTEMPTS.find((a) => a.n === n)!.final

/** S-04 / DS-06 snapshot: running round 3 of 4 (41%), local proposed commuting_reorder for D03. */
const workspaceSnapshot: RunState = {
  phase: 'looping',
  live: false,
  selectedExample: 'sidechain_qaoa',
  preflightChecks: 4,
  scoreProgress: 1,
  scoreStage: 'done',
  findingsShown: 3,
  selectedFinding: 'D03',
  round: 3,
  loopProgress: 0.41,
  attempts: allAttempts((n, r) => (r < 3 ? finalOf(n) : n === 5 ? 'verifying' : n === 6 ? 'proposed' : 'queued')),
  twoQubit: 36,
  candidate: 'verified',
  ladderStep: 2,
  accepted: false,
  stopCard: false,
  real: null,
}

const SNAPSHOTS: Partial<Record<RoutePath, Partial<RunState>>> = {
  [ROUTES.newRun]: { phase: 'intake', attempts: allAttempts(() => 'hidden'), twoQubit: 44, findingsShown: 0, round: 1, loopProgress: 0 },
  [ROUTES.preflight]: { phase: 'preflight', attempts: allAttempts(() => 'hidden'), twoQubit: 44, findingsShown: 0, round: 1, loopProgress: 0 },
  [ROUTES.workspace]: {},
  [ROUTES.fixReview]: { phase: 'review' },
  [ROUTES.loop]: {
    phase: 'stopped',
    round: 4,
    loopProgress: 1,
    accepted: true,
    stopCard: true,
    twoQubit: 33,
    attempts: allAttempts((n) => finalOf(n)),
  },
  [ROUTES.report]: { phase: 'report', round: 4, loopProgress: 1, accepted: true, twoQubit: 33, attempts: allAttempts((n) => finalOf(n)) },
  [ROUTES.export]: { phase: 'export', round: 4, loopProgress: 1, accepted: true, twoQubit: 33, attempts: allAttempts((n) => finalOf(n)) },
}

let state: RunState = { ...workspaceSnapshot }
const listeners = new Set<() => void>()
const timers = new Set<number>()

function set(patch: Partial<RunState> | ((s: RunState) => Partial<RunState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  listeners.forEach((l) => l())
}

function after(ms: number, fn: () => void) {
  const id = window.setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms)
  timers.add(id)
}

function clearTimers() {
  timers.forEach((t) => clearTimeout(t))
  timers.clear()
}

export function useRun(): RunState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

export const getRun = () => state

/** Show a screen's Paper snapshot unless the live flow is already driving it. */
export function ensureSnapshot(route: RoutePath) {
  if (state.live) return
  const snap = SNAPSHOTS[route]
  if (!snap) return
  clearTimers()
  state = { ...workspaceSnapshot, ...snap }
  listeners.forEach((l) => l())
}

/* ── Actions: the live flow ──────────────────────────────────────────── */

/* ── Live build: a real job on the platform queue (qscore/docs/deployment.md §4) ─────────── */

const POLL_MS = 2000
const MAX_POLL_FAILURES = 3
/** Bumped by every new live run and by reset, so answers for an abandoned run are ignored. */
let generation = 0

const LIVE_PROGRESS: Record<RealRun['step'], number> = {
  submitting: 0.03,
  queued: 0.08,
  claimed: 0.2,
  running: 0.45,
  diagnose: 0.9,
  done: 1,
}
const LIVE_STAGE: Record<RealRun['step'], ScoreStage> = {
  submitting: 'validate',
  queued: 'validate',
  claimed: 'validate',
  running: 'measure',
  diagnose: 'diagnose',
  done: 'done',
}

function setReal(gen: number, patch: Partial<RealRun>, extra: Partial<RunState> = {}) {
  if (gen !== generation || !state.real) return
  const real = { ...state.real, ...patch }
  set({ ...extra, real, ...(patch.step ? { scoreProgress: LIVE_PROGRESS[real.step], scoreStage: LIVE_STAGE[real.step] } : {}) })
}

function failLive(gen: number, message: string) {
  setReal(gen, { error: message }, { phase: 'scored' })
}

function stepFor(job: Job, events: { kind: string; data: { item_id?: string } }[], current: RealRun): Partial<RealRun> {
  if (events.some((e) => e.kind === 'run_finished') || (current.step === 'diagnose' && job.state === 'running'))
    return { step: 'diagnose', message: 'Writing the scorecard' }
  if (job.state === 'running') {
    const item = [...events].reverse().find((e) => e.kind === 'item_started')
    if (item) return { step: 'running', message: `Scoring ${item.data.item_id ?? 'the circuit'} on the worker` }
    return { step: 'running', message: current.step === 'running' ? current.message : 'Scoring on the worker' }
  }
  if (job.state === 'claimed') return { step: 'claimed', message: 'A worker claimed the job' }
  return {
    step: 'queued',
    message:
      job.attempts > 0
        ? `A worker stopped; waiting for another (attempt ${job.attempts + 1} of ${job.max_attempts})`
        : 'Waiting for a worker to claim the job',
  }
}

async function finishLive(gen: number, jobId: string) {
  const rows = await api.scorecards(jobId)
  if (gen !== generation) return
  if (!rows.length) return failLive(gen, 'The job finished without a scorecard.')
  const card = rows[0].scorecard
  const findings = findingsFrom(card)
  setReal(
    gen,
    {
      step: 'done',
      message: `Scored ${card.item.id}`,
      findings,
      rows: rowsFrom(card),
      suppressed: suppressedCount(card),
      scorecardStatus: card.status,
    },
    { phase: 'findings', findingsShown: 0 },
  )
  // M2, as in the scripted flow: the cards land 40 ms apart, then the run rests on the scorecard.
  for (let i = 1; i <= findings.length; i++) after(80 + (i - 1) * 40, () => gen === generation && set({ findingsShown: i }))
  after(80 + findings.length * 40 + 200, () => gen === generation && set({ phase: 'scored' }))
}

function pollLive(gen: number, jobId: string, lastSeq: number, failures: number) {
  after(POLL_MS, async () => {
    if (gen !== generation) return
    try {
      const [job, events] = await Promise.all([api.job(jobId), api.events(jobId, lastSeq)])
      if (gen !== generation || !state.real) return
      if (job.state === 'done') return await finishLive(gen, jobId)
      if (job.state === 'failed') return failLive(gen, `The job failed: ${job.error?.message ?? 'no details were recorded'}`)
      if (job.state === 'cancelled') return failLive(gen, 'The job was cancelled.')
      setReal(gen, stepFor(job, events, state.real))
      pollLive(gen, jobId, events.length ? events[events.length - 1].seq : lastSeq, 0)
    } catch (e) {
      if (gen !== generation) return
      const message = e instanceof ApiError ? e.message : String(e)
      if (failures + 1 >= MAX_POLL_FAILURES) return failLive(gen, `Lost contact with the platform: ${message}`)
      pollLive(gen, jobId, lastSeq, failures + 1)
    }
  })
}

/** S-03 Confirm and score in the live build: submit a real job and follow it until it is scored. */
async function runLive() {
  const gen = ++generation
  clearTimers()
  const example = state.selectedExample
  set({
    live: true,
    phase: 'scoring',
    findingsShown: 0,
    selectedFinding: null,
    round: 1,
    loopProgress: 0,
    attempts: allAttempts(() => 'hidden'),
    accepted: false,
    stopCard: false,
    real: {
      example,
      jobId: null,
      step: 'submitting',
      message: 'Submitting the job',
      gpuOnline: null,
      findings: [],
      rows: [],
      suppressed: 0,
      scorecardStatus: null,
      error: null,
    },
  })
  setReal(gen, { step: 'submitting' })
  navigate(ROUTES.workspace, { transition: 'confirm' })
  try {
    const health = await api.health()
    setReal(gen, { gpuOnline: health.gpu_online })
    if (!health.examples.includes(example))
      return failLive(gen, `${example} is a design example only. The platform runs ${health.examples.join(' and ')}.`)
    const { id } = await api.submitJob(example)
    setReal(gen, { jobId: id, step: 'queued', message: 'Waiting for a worker to claim the job' })
    pollLive(gen, id, 0, 0)
  } catch (e) {
    failLive(gen, e instanceof ApiError ? e.message : String(e))
  }
}

export const actions = {
  selectExample(id: RunState['selectedExample']) {
    set({ selectedExample: id })
  },

  /** S-01 Continue → S-03. Validation checks land top to bottom, 40 ms apart. */
  continueToPreflight() {
    clearTimers()
    // Keep the picked example: the live build submits it (the snapshot would reset it to sidechain_qaoa).
    set({ ...workspaceSnapshot, ...SNAPSHOTS[ROUTES.preflight], selectedExample: state.selectedExample, live: true, preflightChecks: 0 })
    navigate(ROUTES.preflight, { transition: 'forward' })
    for (let i = 1; i <= 4; i++) after(180 + i * 40, () => set({ preflightChecks: i }))
  },

  /** S-03 Confirm and score → S-04 (M1). The scan runs exactly as long as the engine. */
  confirmAndScore() {
    if (LIVE) return void runLive() // live build: a real job instead of the scripted scan
    clearTimers()
    set({
      live: true,
      phase: 'scoring',
      scoreProgress: 0.04,
      scoreStage: 'compile',
      findingsShown: 0,
      selectedFinding: null,
      round: 1,
      loopProgress: 0,
      twoQubit: 44,
      attempts: allAttempts(() => 'hidden'),
      accepted: false,
      stopCard: false,
    })
    navigate(ROUTES.workspace, { transition: 'confirm' })
    const ticks: [number, number, ScoreStage][] = [
      [700, 0.21, 'compile'],
      [1400, 0.38, 'compile'],
      [2150, 0.55, 'measure'],
      [2900, 0.71, 'measure'],
      [3500, 0.86, 'diagnose'],
      [4100, 1, 'done'],
    ]
    ticks.forEach(([ms, p, st]) => after(ms, () => set({ scoreProgress: p, scoreStage: st })))
    // M2: the count is final first, then cards land 40 ms apart.
    after(4100, () => set({ phase: 'findings', findingsShown: 0 }))
    for (let i = 1; i <= 3; i++) after(4100 + 80 + (i - 1) * 40, () => set({ findingsShown: i }))
    after(4800, () => actions.runRounds())
  },

  /** Auto mode plays rounds 1 and 2, then round 3 waits on the local proposal for D03. */
  runRounds() {
    set({ phase: 'looping', round: 1, loopProgress: 0.02 })
    const step = 1200 // M6: Play steps one round per 1.2 s
    const reveal = (n: number, s: AttemptStatus) => set((st) => ({ attempts: { ...st.attempts, [n]: s } }))
    // Round 1
    after(100, () => (reveal(1, 'verifying'), reveal(2, 'verifying')))
    after(step * 0.6, () => (reveal(1, 'accepted'), reveal(2, 'rejected'), set({ twoQubit: 40, loopProgress: 0.14 })))
    // Round 2
    after(step, () => (set({ round: 2 }), reveal(3, 'verifying'), reveal(4, 'verifying')))
    after(step * 1.6, () => (reveal(3, 'inconclusive'), reveal(4, 'accepted'), set({ twoQubit: 36, loopProgress: 0.28 })))
    // Round 3: reference verifying, local proposed → D03 is where you are
    after(step * 2, () => (set({ round: 3 }), reveal(5, 'verifying'), reveal(6, 'proposed'), reveal(7, 'queued'), reveal(8, 'queued')))
    after(step * 2 + 140, () => set({ selectedFinding: 'D03', loopProgress: 0.41 }))
  },

  selectFinding(rule: string) {
    set({ selectedFinding: rule })
  },

  /** M3: the finding card grows into the fix review. The candidate fills once the engine verified it. */
  requestFix(rule = 'D03') {
    set({ selectedFinding: rule, phase: 'review', candidate: 'writing', ladderStep: 0 })
    navigate(ROUTES.fixReview, { transition: 'request-fix' })
    if (!state.live) {
      set({ live: true })
    }
    after(900, () => set({ candidate: 'verifying' }))
    after(900 + 500, () => set({ ladderStep: 1 }))
    after(900 + 1000, () => set({ ladderStep: 2, candidate: 'verified' }))
  },

  /** M4: the accept moment, then the loop view (S-07) finishes round 4 and stops (M5). */
  accept() {
    // From a deep-linked snapshot too: the accept moment starts the live flow from here.
    set({ phase: 'accepting', accepted: true, live: true })
    set((st) => ({ attempts: { ...st.attempts, 5: 'rejected', 6: 'accepted' } }))
    // count 36 → 35 → 34 → 33 over 600 ms, each step a little longer than the last
    after(140, () => set({ twoQubit: 35 }))
    after(140 + 180, () => set({ twoQubit: 34 }))
    after(140 + 180 + 240, () => set({ twoQubit: 33 }))
    after(760, () => {
      set({ phase: 'looping', round: 4, loopProgress: 0.62 })
      navigate(ROUTES.loop, { transition: 'forward' })
    })
    after(760 + 400, () => set((st) => ({ attempts: { ...st.attempts, 7: 'verifying', 8: 'verifying' } })))
    after(760 + 1600, () => set((st) => ({ attempts: { ...st.attempts, 7: 'rejected', 8: 'inconclusive' }, loopProgress: 1 })))
    after(760 + 1900, () => set({ phase: 'stopped', stopCard: true }))
  },

  /** Keep current: the next finding (D04) goes to the models. */
  keepCurrent() {
    set({ phase: 'looping' })
    navigate(ROUTES.workspace, { transition: 'back' })
  },

  continueAnyway() {
    set({ stopCard: false })
  },

  /** M5: Export final carries the circuit into the report. */
  exportFinal() {
    set({ phase: 'report' })
    navigate(ROUTES.report, { transition: 'export-final' })
  },

  openExport() {
    set({ phase: 'export' })
    navigate(ROUTES.export, { transition: 'forward' })
  },

  /** Start over from the intake screen. */
  reset() {
    generation += 1 // abandon any live job's pending answers
    clearTimers()
    state = { ...workspaceSnapshot, ...SNAPSHOTS[ROUTES.newRun], live: false }
    listeners.forEach((l) => l())
    navigate(ROUTES.newRun, { transition: 'back' })
  },
}
