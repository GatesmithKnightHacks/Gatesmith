/* S-13 Runs data: jobs on this machine and the platform queue, newest first. */

export type JobState = 'claimed' | 'running' | 'done' | 'queued' | 'failed' | 'cancelled'
export type JobKind = 'profile' | 'improve' | 'score' | 'validate' | 'conform' | 'bench'

export type Job = {
  id: string
  item: string
  file: string
  kind: JobKind
  state: JobState
  started: string
  duration: string
  result: string
  day: 'today' | 'yesterday' | 'earlier'
  worker?: string
  model?: string
  queued?: string
}

export const JOBS: Job[] = [
  { id: '7f3b·0c5e', item: 'packing_qaoa_p2', file: 'sidechain_qaoa.qasm', kind: 'profile', state: 'claimed', started: '11:08', duration: '2 s', result: 'laptop-cpu claimed it · starting', day: 'today', worker: 'laptop-cpu · local', queued: '11:08:01 · waited 2 s' },
  { id: '7f3a·0412', item: 'packing_qaoa_p2', file: 'sidechain_qaoa.qasm', kind: 'improve', state: 'running', started: '11:02', duration: '6 m 40 s', result: 'round 3 of 4 · 44 to 36 gates verified so far', day: 'today', worker: 'laptop-gpu · local', model: 'granite-8b-qiskit', queued: '11:01:52 · waited 9 s' },
  { id: '7f39·9c11', item: 'packing_qaoa_p2', file: 'sidechain_qaoa.qasm', kind: 'score', state: 'done', started: '10:58', duration: '41 s', result: '44 gates · 3 findings, 2 high', day: 'today', worker: 'laptop-cpu · local', queued: '10:58:10 · waited 1 s' },
  { id: '7f38·51d0', item: 'sbox_oracle', file: 'sbox_layer_4x.qasm', kind: 'improve', state: 'queued', started: '10:57', duration: 'not started', result: 'waiting for GPU · position 1', day: 'today', worker: 'platform queue', model: 'granite-8b-qiskit', queued: '10:57:30 · waiting 11 m' },
  { id: '7f37·a2e4', item: 'sbox_oracle', file: 'sbox_layer_4x.qasm', kind: 'score', state: 'done', started: '10:40', duration: '2 m 12 s', result: '118 gates · 4 findings · 2 metrics skipped', day: 'today', worker: 'laptop-cpu · local', queued: '10:40:02 · waited 1 s' },
  { id: '7f36·0b7c', item: 'grover_5q', file: 'grover_5q.qasm', kind: 'validate', state: 'failed', started: '10:31', duration: '0.4 s', result: 'Q118 · creg c[4] smaller than qreg q[5]', day: 'today', worker: 'laptop-cpu · local', queued: '10:31:00 · waited 0 s' },
  { id: '7f35·77e0', item: 'packing_qaoa_p2', file: 'sidechain_qaoa.qasm', kind: 'conform', state: 'done', started: '10:12', duration: '4 m 05 s', result: 'granite-8b-qiskit · 12 of 12 fixtures', day: 'today', worker: 'laptop-gpu · local', model: 'granite-8b-qiskit', queued: '10:11:58 · waited 2 s' },
  { id: '7f34·c3a9', item: 'qft_8', file: 'qft_8.qasm', kind: 'score', state: 'done', started: '09:55', duration: '52 s', result: '56 gates · 3 findings, 1 high', day: 'today', worker: 'laptop-cpu · local', queued: '09:55:04 · waited 1 s' },
  { id: '7f33·19bf', item: 'vqe_h2_4q', file: 'vqe_h2_4q.qasm', kind: 'improve', state: 'cancelled', started: '09:41', duration: 'not started', result: 'cancelled while queued', day: 'today', worker: 'platform queue', model: 'granite-8b-qiskit', queued: '09:40:12 · cancelled at 09:41' },
  { id: '7f32·e801', item: 'packing_qaoa_p2', file: 'sidechain_qaoa.qasm', kind: 'bench', state: 'done', started: '09:20', duration: '1 m 30 s', result: '8 seeds · spread 0.18', day: 'today', worker: 'laptop-gpu · local', queued: '09:19:55 · waited 5 s' },
  { id: '7f31·4d6a', item: 'sidechain_qaoa_p1', file: 'sidechain_qaoa_p1.qasm', kind: 'improve', state: 'done', started: '09:02', duration: '5 m 18 s', result: '21 to 20 gates · stopped by the engine', day: 'today', worker: 'laptop-gpu · local', model: 'granite-8b-qiskit', queued: '09:01:50 · waited 10 s' },
  { id: '7f30·8a42', item: 'qft_8', file: 'qft_8.qasm', kind: 'score', state: 'failed', started: '08:47', duration: '1 m 03 s', result: 'WorkerStopped · not requeued', day: 'today', worker: 'laptop-gpu · local', queued: '08:46:58 · waited 2 s' },
  { id: '7f2f·91e0', item: 'grover_5q', file: 'grover_5q.qasm', kind: 'score', state: 'done', started: '18:12', duration: '22 s', result: '18 gates · none open', day: 'yesterday', worker: 'laptop-cpu · local', queued: '18:12:00 · waited 0 s' },
  { id: '7f2e·5b37', item: 'qft_8', file: 'qft_8.qasm', kind: 'bench', state: 'done', started: '17:40', duration: '1 m 52 s', result: '8 seeds · spread 0.22', day: 'yesterday', worker: 'laptop-gpu · local', queued: '17:39:51 · waited 9 s' },
  { id: '7f2d·c018', item: 'vqe_h2_4q', file: 'vqe_h2_4q.qasm', kind: 'score', state: 'done', started: '16:05', duration: '19 s', result: '6 gates · 1 finding, info', day: 'yesterday', worker: 'laptop-cpu · local', queued: '16:05:01 · waited 1 s' },
  { id: '7f2b·6e42', item: 'grover_5q', file: 'grover_5q.qasm', kind: 'improve', state: 'done', started: '14:48', duration: '3 m 12 s', result: 'no accepted rounds · stopped by the engine', day: 'yesterday', worker: 'laptop-gpu · local', model: 'granite-8b-qiskit', queued: '14:47:59 · waited 1 s' },
  { id: '7f2a·07d9', item: 'sbox_oracle', file: 'sbox_layer_4x.qasm', kind: 'score', state: 'done', started: '13:30', duration: '2 m 05 s', result: '118 gates · 4 findings', day: 'yesterday', worker: 'laptop-cpu · local', queued: '13:29:58 · waited 2 s' },
]

export const isActive = (j: Job) => j.state === 'claimed' || j.state === 'running' || j.state === 'queued'
export const isFailed = (j: Job) => j.state === 'failed'

/** The selected job's events, newest last. The running job's are the ones on the board. */
export function eventsFor(j: Job): { time: string; word: string; note?: string; now?: boolean }[] {
  if (j.id === '7f3a·0412')
    return [
      { time: '11:01:52', word: 'queued' },
      { time: '11:02:01', word: 'claimed', note: 'by laptop-gpu' },
      { time: '11:02:02', word: 'running', note: 'base score 44 gates' },
      { time: '11:04:10', word: 'accepted', note: 'round 1 · 44 to 40 gates' },
      { time: '11:06:02', word: 'accepted', note: 'round 2 · 40 to 36 gates' },
      { time: '11:07:48', word: 'parsed', note: 'round 3 · 36 to 33 gates' },
      { time: 'now', word: 'verifying', note: 're-score and task check', now: true },
    ]
  const t = j.queued?.slice(0, 8) ?? j.started
  const worker = j.worker?.split(' · ')[0] ?? 'worker'
  const base = [{ time: t, word: 'queued' }]
  if (j.state === 'queued') return [...base, { time: 'now', word: 'waiting', note: j.result, now: true }]
  if (j.state === 'cancelled') return [...base, { time: `${j.started}:00`, word: 'cancelled', note: 'by you, before a worker claimed it' }]
  if (j.state === 'claimed') return [...base, { time: 'now', word: 'claimed', note: `by ${worker}`, now: true }]
  const rest = [
    { time: `${j.started}:01`, word: 'claimed', note: `by ${worker}` },
    { time: `${j.started}:02`, word: 'running' },
  ]
  if (j.state === 'running') return [...base, rest[0], { time: 'now', word: 'running', note: j.result, now: true }]
  if (j.state === 'failed') return [...base, ...rest, { time: 'end', word: 'failed', note: j.result }]
  return [...base, ...rest, { time: 'end', word: 'done', note: j.result }]
}

/** Older runs, shown after Load earlier runs (the same runs the intake and export screens list). */
export const EARLIER: Job[] = [
  { id: '5a02·0371', item: 'packing_qaoa_p2', file: 'sidechain_qaoa.qasm', kind: 'score', state: 'done', started: '13:12', duration: '38 s', result: '44 gates · score only', day: 'earlier', worker: 'laptop-cpu · local', queued: 'Oct 8 13:12:04 · waited 1 s' },
  { id: '4e77·0350', item: 'sbox_oracle', file: 'sbox_layer_4x.qasm', kind: 'score', state: 'done', started: '11:47', duration: '2 m 01 s', result: '118 gates · score only', day: 'earlier', worker: 'laptop-cpu · local', queued: 'Oct 8 11:47:30 · waited 2 s' },
  { id: '4e70·0344', item: 'grover_5q', file: 'grover_5q.qasm', kind: 'score', state: 'done', started: '10:05', duration: '21 s', result: '18 gates · none open', day: 'earlier', worker: 'laptop-cpu · local', queued: 'Oct 8 10:05:12 · waited 1 s' },
  { id: '4e6a·0339', item: 'qft_8', file: 'qft_8.qasm', kind: 'score', state: 'done', started: '09:40', duration: '52 s', result: '56 gates · 3 findings, 1 high', day: 'earlier', worker: 'laptop-cpu · local', queued: 'Oct 8 09:40:21 · waited 1 s' },
  { id: '4e66·0331', item: 'vqe_h2_4q', file: 'vqe_h2_4q.qasm', kind: 'score', state: 'done', started: '09:12', duration: '19 s', result: '6 gates · 1 finding, info', day: 'earlier', worker: 'laptop-cpu · local', queued: 'Oct 8 09:12:47 · waited 1 s' },
]
