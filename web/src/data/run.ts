/*
 * The demo engine. It plays the canonical run 7f3a·0412 (321 → 298 → 281 → 270, stopped by the engine
 * at 490 of 900 s, auto mode off) with the timings from DS-07 / M1–M6, so the live flow moves the way
 * the storyboards say. Deep-linking to a screen shows its Paper snapshot.
 */
import { useSyncExternalStore } from 'react'
import { navigate, ROUTES, type RoutePath } from '../app/router'
import { accountActions, getAccount } from './account'
import type { ScoreRow } from '../screens/workspace/data'
import { api, ApiError, LIVE, LIVE_SUBMISSION_UNAVAILABLE, type JobEvent, type JobState, type ScorecardDoc } from './api'
import { ATTEMPTS, RUN, TWO_QUBIT, progressOf, type AttemptStatus } from './demo'
import { findingsFrom, rowsFrom, suppressedCount, jobMessage, type LiveFinding } from './live'

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
  step: 'submitting' | 'unavailable' | JobState
  events: JobEvent[]
  cards: ScorecardDoc[]
  selectedCard: number
  message: string
  gpuOnline: boolean | null
  findings: LiveFinding[]
  rows: ScoreRow[]
  suppressed: number
  scorecardStatus: string | null
  error: string | null
}

export type ScoreStage = 'validate' | 'confirm' | 'compile' | 'measure' | 'diagnose' | 'done'

/** The first score's stages, in order, as the inspector lists them while scoring (DS-06 scoring frame). */
export const SCORE_STAGES: Exclude<ScoreStage, 'done'>[] = ['validate', 'confirm', 'compile', 'measure', 'diagnose']
export type CandidateState = 'writing' | 'verifying' | 'verified'

export type RunState = {
  phase: Phase
  /** true while the engine is playing the live flow; false for a deep-linked snapshot */
  live: boolean
  selectedExample: 'sidechain_qaoa' | 'grover_5q' | 'sbox_oracle'
  preflightChecks: number // 0–4 checks landed
  scoreProgress: number // 0–1
  scoreStage: ScoreStage
  findingsShown: number // 0–4
  /** finding id ('D01', 'D03-1', 'D03-2', 'D04'); 'D03' alone means block 2, the open one */
  selectedFinding: string | null
  round: number // 1–4
  /** wall time of the run, seconds of the 900 s budget */
  elapsed: number
  /** elapsed ÷ budget, 0–1; shown only in the mint label ("Run engine (44%)") */
  loopProgress: number
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

/** 'D03' on its own means the open commuting block (block 2); finding ids pass through. */
const normalizeFinding = (id: string) => (id === 'D03' ? 'D03-2' : id)

/** S-04 / DS-06 snapshot: round 3 of 4 at 400 of 900 s (44%); local proposed commutation_aware_routing for D03 block 2. */
const workspaceSnapshot: RunState = {
  phase: 'looping',
  live: false,
  selectedExample: 'sidechain_qaoa',
  preflightChecks: 4,
  scoreProgress: 1,
  scoreStage: 'done',
  findingsShown: 4,
  selectedFinding: 'D03-2',
  round: 3,
  elapsed: RUN.snapshotAt,
  loopProgress: progressOf(RUN.snapshotAt),
  attempts: allAttempts((n, r) => (r < 3 ? finalOf(n) : n === 5 ? 'verifying' : n === 6 ? 'proposed' : 'queued')),
  twoQubit: TWO_QUBIT[2],
  candidate: 'verified',
  ladderStep: 2,
  accepted: false,
  stopCard: false,
  real: null,
}

/** Before the first score: nothing found, nothing run. */
const notStarted: Partial<RunState> = {
  attempts: allAttempts(() => 'hidden'),
  twoQubit: TWO_QUBIT[0],
  findingsShown: 0,
  selectedFinding: null,
  round: 1,
  elapsed: 0,
  loopProgress: 0,
}

/** After the stop at 490 s: 321 → 270, every attempt decided, the engine recommends stopping. */
const stopped: Partial<RunState> = {
  phase: 'stopped',
  round: 4,
  elapsed: RUN.stoppedAt,
  loopProgress: progressOf(RUN.stoppedAt),
  accepted: true,
  stopCard: true,
  twoQubit: TWO_QUBIT[4],
  attempts: allAttempts((n) => finalOf(n)),
}

const SNAPSHOTS: Partial<Record<RoutePath, Partial<RunState>>> = {
  [ROUTES.newRun]: { phase: 'intake', ...notStarted },
  [ROUTES.preflight]: { phase: 'preflight', ...notStarted },
  [ROUTES.workspace]: {},
  [ROUTES.estimate]: { ...stopped },
  [ROUTES.fixReview]: { phase: 'review' },
  [ROUTES.loop]: { ...stopped },
  [ROUTES.report]: { ...stopped, phase: 'report', stopCard: false },
  [ROUTES.export]: { ...stopped, phase: 'export', stopCard: false },
}

let state: RunState = { ...workspaceSnapshot }
const listeners = new Set<() => void>()
const timers = new Set<number>()

function set(patch: Partial<RunState> | ((s: RunState) => Partial<RunState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch
  // Progress is always wall time: elapsed ÷ budget.
  state = { ...state, ...p, ...(p.elapsed != null ? { loopProgress: progressOf(p.elapsed) } : {}) }
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

function setReal(gen: number, patch: Partial<RealRun>, extra: Partial<RunState> = {}) {
  if (gen !== generation || !state.real) return
  const real = { ...state.real, ...patch }
  set({ ...extra, real })
}

function failLive(gen: number, message: string) {
  setReal(gen, { error: message }, { phase: 'scored' })
}

function cardFields(card: ScorecardDoc): Partial<RealRun> {
  return { findings: findingsFrom(card), rows: rowsFrom(card), suppressed: suppressedCount(card), scorecardStatus: card.status }
}

async function finishLive(gen: number, jobId: string) {
  const rows = await api.scorecards(jobId)
  if (gen !== generation) return
  if (!rows.length) return failLive(gen, 'The job finished without a scorecard.')
  const cards = rows.map((r) => r.scorecard)
  setReal(gen, { step: 'done', cards, selectedCard: 0, ...cardFields(cards[0]), message: 'The worker finished the job' },
    { phase: 'scored', findingsShown: cards[0].findings.length })
}

async function readLive(gen: number, jobId: string, lastSeq: number): Promise<number | null> {
  const [job, events, health] = await Promise.all([api.job(jobId), api.events(jobId, lastSeq), api.health()])
  if (gen !== generation || !state.real) return null
  if (job.id !== jobId) throw new ApiError(502, 'The platform returned a different job identity.')
  const known = new Map(state.real.events.map((e) => [e.seq, e]))
  for (const event of events) {
    const previous = known.get(event.seq)
    if (previous && JSON.stringify(previous) !== JSON.stringify(event)) throw new ApiError(502, `Conflicting event replay at sequence ${event.seq}.`)
    known.set(event.seq, event)
  }
  setReal(gen, { example: job.example ?? job.kind, step: job.state, gpuOnline: health.gpu_online,
    events: [...known.values()].sort((a, b) => a.seq - b.seq), message: jobMessage(job, events) })
  if (job.state === 'done') { await finishLive(gen, jobId); return null }
  if (job.state === 'failed' || job.state === 'cancelled') {
    failLive(gen, jobMessage(job, events)); return null
  }
  return Math.max(lastSeq, ...events.map((e) => e.seq))
}

function pollLive(gen: number, jobId: string, lastSeq: number, failures: number) {
  after(POLL_MS, async () => {
    if (gen !== generation) return
    try {
      const seq = await readLive(gen, jobId, lastSeq)
      if (seq !== null) pollLive(gen, jobId, seq, 0)
    } catch (e) {
      if (gen !== generation) return
      const message = e instanceof Error ? e.message : String(e)
      const transient = e instanceof ApiError && (e.status === 0 || e.status === 429 || e.status >= 500)
      if (!transient || failures + 1 >= MAX_POLL_FAILURES) return failLive(gen, `Lost contact with the platform: ${message}`)
      console.warn(`Platform poll attempt ${failures + 1} failed: ${message}`)
      after(POLL_MS * 2 ** failures, () => pollLive(gen, jobId, lastSeq, failures + 1))
    }
  })
}

function startReal(example: string, step: RealRun['step'], message: string, jobId: string | null = null) {
  const gen = ++generation
  clearTimers()
  set({ ...notStarted, live: true, phase: 'scoring', findingsShown: 0, selectedFinding: null,
    accepted: false, stopCard: false, scoreProgress: 0,
    real: { example, jobId, step, message, gpuOnline: null, events: [], cards: [], selectedCard: 0,
      findings: [], rows: [], suppressed: 0, scorecardStatus: null, error: null } })
  return gen
}

/** A server-owned authenticated submission route must be installed before enabling browser writes. */
function runLive() {
  const gen = startReal(state.selectedExample, 'unavailable', LIVE_SUBMISSION_UNAVAILABLE)
  failLive(gen, LIVE_SUBMISSION_UNAVAILABLE)
  navigate(ROUTES.workspace, { transition: 'confirm' })
}

async function watchLive(jobId: string) {
  const gen = startReal('Existing job', 'submitting', 'Loading the recorded job', jobId)
  try {
    const seq = await readLive(gen, jobId, 0)
    if (seq !== null) pollLive(gen, jobId, seq, 0)
  } catch (e) {
    failLive(gen, e instanceof Error ? e.message : String(e))
  }
}

export const actions = {
  watchJob(jobId: string) {
    return watchLive(jobId.trim())
  },

  selectScorecard(index: number) {
    const card = state.real?.cards[index]
    if (!card) return
    setReal(generation, { selectedCard: index, ...cardFields(card) }, { selectedFinding: null, findingsShown: card.findings.length })
  },
  selectExample(id: RunState['selectedExample']) {
    set({ selectedExample: id })
  },

  /** S-01 Continue → S-03. Validation checks land top to bottom, 40 ms apart. */
  continueToPreflight() {
    if (LIVE || state.real) return runLive()
    clearTimers()
    // Keep the picked example: the live build submits it (the snapshot would reset it to sidechain_qaoa).
    set({ ...workspaceSnapshot, ...SNAPSHOTS[ROUTES.preflight], selectedExample: state.selectedExample, live: true, preflightChecks: 0 })
    navigate(ROUTES.preflight, { transition: 'forward' })
    for (let i = 1; i <= 4; i++) after(180 + i * 40, () => set({ preflightChecks: i }))
  },

  /** S-03 Confirm and score → S-04 (M1). The scan runs exactly as long as the engine. */
  confirmAndScore() {
    if (LIVE || state.real) return runLive() // authenticated server submission is explicitly pending
    clearTimers()
    set({
      ...notStarted,
      live: true,
      phase: 'scoring',
      scoreProgress: 0.04,
      scoreStage: 'validate',
      accepted: false,
      stopCard: false,
    })
    navigate(ROUTES.workspace, { transition: 'confirm' })
    // "Scoring (62%)" is the stage share of the first score, the one percent besides the run's.
    const ticks: [number, number, ScoreStage][] = [
      [350, 0.12, 'confirm'],
      [700, 0.21, 'compile'],
      [1400, 0.38, 'compile'],
      [2150, 0.55, 'measure'],
      [2600, 0.62, 'measure'],
      [3000, 0.74, 'measure'],
      [3500, 0.86, 'diagnose'],
      [4100, 1, 'done'],
    ]
    ticks.forEach(([ms, p, st]) => after(ms, () => set({ scoreProgress: p, scoreStage: st })))
    // M2: the count reads 4 open first; the card list then fades in as one block (no stagger).
    after(4100, () => set({ phase: 'findings', findingsShown: 0 }))
    after(4180, () => set({ findingsShown: 4 }))
    after(4800, () => actions.runRounds())
  },

  /**
   * Rounds 1 and 2 play (the user accepted R1 and R2 in the fix review; auto mode is off), then round 3
   * waits on the local proposal for D03 block 2 at 400 of 900 s.
   */
  runRounds() {
    if (LIVE || state.real) return
    set({ phase: 'looping', round: 1, elapsed: 4 })
    const step = 1200 // M6: Play steps one round per 1.2 s
    const reveal = (n: number, s: AttemptStatus) => set((st) => ({ attempts: { ...st.attempts, [n]: s } }))
    // Round 1
    after(100, () => (reveal(1, 'verifying'), reveal(2, 'verifying'), set({ elapsed: 40 })))
    after(step * 0.6, () => (reveal(1, 'accepted'), reveal(2, 'rejected'), set({ twoQubit: TWO_QUBIT[1], elapsed: 117 })))
    // Round 2
    after(step, () => (set({ round: 2, elapsed: 160 }), reveal(3, 'verifying'), reveal(4, 'verifying')))
    after(step * 1.6, () => (reveal(3, 'inconclusive'), reveal(4, 'accepted'), set({ twoQubit: TWO_QUBIT[2], elapsed: 245 })))
    // Round 3: reference verifying, local proposed → D03 block 2 is where you are
    after(step * 2, () => (set({ round: 3, elapsed: 330 }), reveal(5, 'verifying'), reveal(6, 'proposed'), reveal(7, 'queued'), reveal(8, 'queued')))
    after(step * 2 + 140, () => set({ selectedFinding: 'D03-2', elapsed: RUN.snapshotAt }))
  },

  selectFinding(id: string) {
    set({ selectedFinding: state.real ? id : normalizeFinding(id) })
  },

  /** M3: the finding card grows into the fix review. The candidate fills once the engine verified it. */
  requestFix(id = 'D03-2') {
    if (LIVE || state.real) return
    set({ selectedFinding: normalizeFinding(id), phase: 'review', candidate: 'writing', ladderStep: 0 })
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
    if (LIVE || state.real) return
    // From a deep-linked snapshot too: the accept moment starts the live flow from here.
    set({ phase: 'accepting', accepted: true, live: true, elapsed: 405 })
    // The count swaps at 0 ms (281 → 270); the delta fades in beside it. No digit ticking.
    set((st) => ({ attempts: { ...st.attempts, 5: 'rejected', 6: 'accepted' }, twoQubit: TWO_QUBIT[3] }))
    after(760, () => {
      set({ phase: 'looping', round: 4, elapsed: 410 })
      navigate(ROUTES.loop, { transition: 'forward' })
    })
    after(760 + 400, () => set((st) => ({ attempts: { ...st.attempts, 7: 'verifying', 8: 'verifying' }, elapsed: 440 })))
    // Round 4 accepts nothing; the engine stops the run at 490 s.
    after(760 + 1600, () => set((st) => ({ attempts: { ...st.attempts, 7: 'rejected', 8: 'inconclusive' }, elapsed: 488 })))
    after(760 + 1900, () => set({ phase: 'stopped', stopCard: true, elapsed: RUN.stoppedAt }))
  },

  /** Keep current: the next finding (D04) goes to the models. */
  keepCurrent() {
    if (LIVE || state.real) return
    set({ phase: 'looping' })
    navigate(ROUTES.workspace, { transition: 'back' })
  },

  continueAnyway() {
    if (LIVE || state.real) return
    set({ stopCard: false })
  },

  /** M5: Export final carries the circuit into the report, and the finished run is saved to the account when one is signed in. */
  exportFinal() {
    if (LIVE || state.real) return
    set({ phase: 'report' })
    if (getAccount().session) {
      void accountActions.saveRun({
        id: RUN.job,
        item: RUN.item,
        qubits: RUN.qubits,
        state: 'done',
        startedAt: '2026-10-10 11:34',
        durationS: 490,
        twoQubitCount: 270,
        summary: 'two_qubit_count 321 → 270 · 4 rounds · stopped by the engine',
        bytes: 42_700,
      })
    }
    navigate(ROUTES.report, { transition: 'export-final' })
  },

  openExport() {
    if (LIVE || state.real) return
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
