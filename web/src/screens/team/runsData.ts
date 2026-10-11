/*
 * S-13 Runs data: the runs saved to qlab-dev, newest first. Named like the engine's job states
 * (queued, running, done, failed, cancelled) so the account store can replace it.
 * 7f3a·0412 is the canonical loop run: it finished at 11:42 with 270 gates (S-12 shows the same run).
 */

export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
/** What the run did; the open action follows it. */
export type JobKind = 'improve' | 'score' | 'bench'

export type Job = {
  id: string
  item: 'sidechain_qaoa.qasm' | 'sbox_oracle.qasm'
  qubits: number
  kind: JobKind
  state: JobState
  started: string
  duration: string
  /** two_qubit_count, mono with its unit; empty when there is none yet */
  gates: string
  result: string
  day: 'today' | 'yesterday'
  /** inspector facts */
  baseline?: number
  fixes: string
}

const SIDE = { item: 'sidechain_qaoa.qasm', qubits: 12 } as const
const SBOX = { item: 'sbox_oracle.qasm', qubits: 20 } as const

export const JOBS: Job[] = [
  { id: '7f3c·1a02', ...SIDE, kind: 'improve', state: 'running', started: '11:42', duration: '2 m 10 s', gates: '298 gates', result: 'round 2 of 4 · from 321 so far', day: 'today', baseline: 321, fixes: '1 accepted · round 2 of 4' },
  { id: '7f3c·0e17', ...SBOX, kind: 'improve', state: 'queued', started: '11:40', duration: 'not started', gates: '', result: 'waiting for GPU · position 1', day: 'today', fixes: 'none yet · waiting for GPU' },
  { id: '7f3a·0412', ...SIDE, kind: 'improve', state: 'done', started: '11:34', duration: '8 m 10 s', gates: '270 gates', result: 'from 321 · 4 rounds · stopped by the engine', day: 'today', baseline: 321, fixes: '3 accepted · 3 rejected · 2 inconclusive' },
  { id: '7f3b·0c5e', ...SIDE, kind: 'improve', state: 'done', started: '11:08', duration: '6 m 12 s', gates: '281 gates', result: 'from 321 · 2 accepted', day: 'today', baseline: 321, fixes: '2 accepted · 1 rejected · 1 inconclusive' },
  { id: '7f3a·77d1', ...SBOX, kind: 'score', state: 'done', started: '10:40', duration: '2 m 05 s', gates: '1041 gates', result: 'score only · 4 findings, 1 high', day: 'today', fixes: 'none · score only' },
  { id: '7f39·5b08', ...SBOX, kind: 'improve', state: 'failed', started: '09:55', duration: '1 m 03 s', gates: '', result: 'Q501 · worker stopped · not requeued', day: 'today', fixes: 'none · stopped at compile' },
  { id: '7f39·2c1e', ...SIDE, kind: 'improve', state: 'cancelled', started: '09:41', duration: 'not started', gates: '', result: 'cancelled while queued', day: 'today', fixes: 'none · cancelled while queued' },
  { id: '7f38·f0a3', ...SBOX, kind: 'bench', state: 'done', started: '09:20', duration: '1 m 52 s', gates: '1041 gates', result: 'bench · 8 seeds · spread 0.22', day: 'today', fixes: 'none · bench' },
  { id: '7f38·e801', ...SIDE, kind: 'improve', state: 'done', started: '18:12', duration: '5 m 18 s', gates: '281 gates', result: 'from 321 · stopped by the engine', day: 'yesterday', baseline: 321, fixes: '2 accepted · 2 rejected' },
  { id: '7f38·4d6a', ...SBOX, kind: 'score', state: 'done', started: '17:40', duration: '2 m 05 s', gates: '1041 gates', result: 'score only · 4 findings, 1 high', day: 'yesterday', fixes: 'none · score only' },
  { id: '7f37·c018', ...SIDE, kind: 'score', state: 'done', started: '16:05', duration: '38 s', gates: '321 gates', result: 'score only · 4 findings, 4 high', day: 'yesterday', fixes: 'none · score only' },
  { id: '7f37·2e9b', ...SBOX, kind: 'bench', state: 'done', started: '14:30', duration: '2 m 11 s', gates: '1041 gates', result: 'bench · 8 seeds · spread 0.18', day: 'yesterday', fixes: 'none · bench' },
  { id: '7f36·b1f4', ...SIDE, kind: 'improve', state: 'done', started: '13:02', duration: '4 m 40 s', gates: '281 gates', result: 'from 321 · 2 accepted', day: 'yesterday', baseline: 321, fixes: '2 accepted · 1 rejected' },
  { id: '7f36·07d9', ...SIDE, kind: 'score', state: 'done', started: '11:30', duration: '44 s', gates: '321 gates', result: 'score only · first run', day: 'yesterday', fixes: 'none · first run' },
]

/** GPU off (states board): a run queued after the machine went to sleep waits in place. */
export const QUEUED_WHILE_GPU_OFF: Job = {
  id: '7f3d·2b10',
  ...SIDE,
  kind: 'improve',
  state: 'queued',
  started: '11:45',
  duration: 'not started',
  gates: '',
  result: 'waiting for GPU · position 2',
  day: 'today',
  fixes: 'none yet · waiting for GPU',
}

/** The failed run's detail line (error copy: what failed, the code, where, the fix). */
export const FAILURE: Record<string, { code: string; where: string; fix: string }> = {
  '7f39·5b08': {
    code: 'Q501',
    where: 'worker stopped at compile · seed 3 of 8 · 09:56',
    fix: 'The GPU machine went to sleep mid-run. Requeue it, or switch to Laptop.',
  },
}

export const ITEMS = ['sidechain_qaoa.qasm', 'sbox_oracle.qasm'] as const
export const STATES: JobState[] = ['running', 'queued', 'done', 'failed', 'cancelled']
