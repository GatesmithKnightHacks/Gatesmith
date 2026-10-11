/*
 * The canonical demo run, the same story on every board (fix-round-1 D2, brief-code §4):
 * run 7f3a·0412 · sidechain_qaoa.qasm · 12 q · FakeTorino · 8 seeds, seed 37 best · two_qubit_count
 * 321 → 298 (R1) → 281 (R2) → 270 (R3) · R4 accepts nothing · the engine stops at 490 s of 900 s.
 * Auto mode is off: the user accepted every verified fix in the fix review.
 * Field names follow qscore.scorecard/v0.2 and the engine's rule ids (D01…D10) so a real backend can replace this.
 */
import type { Finding } from '../ui/parts'

export const RUN = {
  job: '7f3a·0412',
  item: 'packing_qaoa_p2',
  file: 'sidechain_qaoa.qasm',
  other: 'sbox_oracle.qasm',
  qubits: 12,
  /** 88 lines of OpenQASM 2.0, drawn as 33 layers */
  qasmLines: 88,
  layers: 33,
  target: 'FakeTorino',
  targetQubits: 133,
  basis: 'cz rz sx x',
  seeds: [11, 23, 37, 41, 53, 67, 79, 97],
  bestSeed: 37,
  optimizationLevel: 3,
  qiskit: '1.3.1',
  scoreVersion: 'qscore-2026.1',
  promptVersion: 'p-2026.1',
  localModel: 'Qiskit/granite-3.3-8b-qiskit',
  repo: 'qlab/sidechain-packing',
  handle: 'qlab-dev',
  email: 'dev@qlab.dev',
  maxRounds: 4,
  /** wall-time budget, seconds */
  wallBudget: 900,
  /** the engine stopped the run here, seconds (8 m 10 s) */
  stoppedAt: 490,
  duration: '8 m 10 s',
  /** the S-04 snapshot: round 3 of 4 at 400 of 900 s */
  snapshotAt: 400,
  costPerMin: 96,
  /** auto mode off: the user accepts each verified fix (fix-round-2 D19) */
  autoMode: false,
} as const

/** Other jobs that appear in runs lists. */
export const OTHER_RUNS = ['7f3b·0c5e', '7f3c·1a02', '7f39·5b08'] as const

/** Run progress is wall time: elapsed ÷ budget, shown only on the mint label (fix-round-1 D1, fix-round-2 D1a). */
export const progressOf = (elapsed: number) => Math.min(1, Math.max(0, elapsed / RUN.wallBudget))
export const percentOf = (elapsed: number) => Math.round(progressOf(elapsed) * 100)

/* ── Rounds ──────────────────────────────────────────────────────────── */

/** Where each round starts on the time axis, seconds (the master's R1 · R2 · R3 · R4 ticks). */
export const ROUND_START = [0, 119, 250, 410] as const

/** two_qubit_count after each round (index 0 = baseline). R4 accepts nothing. */
export const TWO_QUBIT = [321, 298, 281, 270, 270] as const

/* ── Scorecard (qscore.scorecard/v0.2) ───────────────────────────────── */

export type MetricStatus = 'computed' | 'skipped' | 'unavailable'
export type MetricGroup = 'resources' | 'hardware' | 'opportunities' | 'research'

export type Metric = {
  name: string
  group: MetricGroup
  unit: string
  status: MetricStatus
  /** lower is better unless false */
  lowerIsBetter?: boolean
  baseline?: number
  /** after round 2 (the S-04 snapshot at 400 s) */
  afterR2?: number
  /** after round 4 (report screens) */
  final?: number
  /** the rule fires at or above this value */
  threshold?: number
  /** decimals to print */
  digits?: number
  primary?: boolean
  note?: string
}

export const METRICS: Metric[] = [
  { name: 'width', group: 'resources', unit: 'qubits', status: 'computed', baseline: 12, afterR2: 12, final: 12 },
  { name: 'size', group: 'resources', unit: 'ops', status: 'computed', baseline: 1290 },
  { name: 'depth', group: 'resources', unit: 'layers', status: 'computed', baseline: 584, afterR2: 541 },
  { name: 'two_qubit_count', group: 'resources', unit: 'gates', status: 'computed', baseline: 321, afterR2: 281, final: 270, primary: true },
  { name: 'two_qubit_depth', group: 'resources', unit: 'layers', status: 'computed', baseline: 202, afterR2: 184, final: 178 },
  { name: 'routing_overhead', group: 'hardware', unit: 'ratio', status: 'computed', baseline: 0.514, afterR2: 0.446, final: 0.421, threshold: 0.3, digits: 3 },
  { name: 'swaps_inserted', group: 'hardware', unit: 'gates', status: 'computed', baseline: 65, afterR2: 49 },
  { name: 'compile_ratio', group: 'hardware', unit: 'ratio', status: 'computed', baseline: 2.06, afterR2: 1.8, digits: 2 },
  {
    name: 'reliability_heuristic',
    group: 'hardware',
    unit: '(0, 1]',
    status: 'computed',
    lowerIsBetter: false,
    baseline: 0.263,
    afterR2: 0.301,
    final: 0.318,
    digits: 3,
    note: 'calibration-based reliability heuristic, not a success probability',
  },
  { name: 'scheduled_duration', group: 'hardware', unit: 'µs', status: 'computed', baseline: 24.2, afterR2: 21.6, digits: 1 },
  { name: 'seed_spread', group: 'hardware', unit: 'ratio', status: 'computed', baseline: 0.087, afterR2: 0.071, threshold: 0.15, digits: 3 },
  { name: 'entanglement_variance', group: 'opportunities', unit: 'gates²', status: 'computed', baseline: 9, afterR2: 9, note: 'cv 0.12' },
  { name: 'resynthesis_potential', group: 'opportunities', unit: 'gates', status: 'computed', baseline: 9, afterR2: 6, final: 6, threshold: 1 },
  { name: 'simulated_task_score', group: 'research', unit: '', status: 'unavailable', note: 'not in the MVP build' },
  { name: 'mirror_score', group: 'research', unit: '', status: 'skipped', note: 'not selected' },
]

export const metric = (name: string) => METRICS.find((m) => m.name === name)!

/* ── Findings ────────────────────────────────────────────────────────── */

export type FindingId = 'D01' | 'D03-1' | 'D03-2' | 'D04'

/** A finding as the engine reports it, plus where it stands at each point of the run. */
export type CanonicalFinding = Finding & {
  /** unique id: the two commuting runs share rule D03 */
  id: FindingId
  /** "D03 block 2": the name used on canvas labels, cards, QASM, lanes and the report (fix-round-1 D3) */
  name: string
  /** layers and lines in the baseline circuit */
  layers?: [number, number]
  lines?: [number, number]
  /** evidence after round 2 and after round 4 */
  evidenceAt400: string
  evidenceFinal: string
  /** round that accepted its fix, if any */
  acceptedIn?: 2 | 3
  /** two-qubit gates removed by that fix */
  delta?: number
}

export const FINDINGS: CanonicalFinding[] = [
  {
    id: 'D01',
    name: 'D01',
    rank: 1,
    severity: 'high',
    rule: 'D01',
    ruleName: 'routing_overhead',
    title: 'Routing-dominated',
    evidence: '0.514 ≥ 0.30 ratio · 65 swaps',
    evidenceAt400: '0.446 ≥ 0.30 ratio · 49 swaps',
    evidenceFinal: '0.421 ≥ 0.30 ratio · after R4',
  },
  {
    id: 'D03-1',
    name: 'D03 block 1',
    rank: 2,
    severity: 'high',
    rule: 'D03',
    ruleName: 'structure · block 1',
    title: 'Commuting block',
    evidence: '39 2q ops · q0–q11 · layers 1–15 · lines 6–44',
    evidenceAt400: 'R2 · −17 gates · passed',
    evidenceFinal: 'R2 · −17 gates · passed',
    layers: [1, 15],
    lines: [6, 44],
    acceptedIn: 2,
    delta: -17,
  },
  {
    id: 'D03-2',
    name: 'D03 block 2',
    rank: 3,
    severity: 'high',
    rule: 'D03',
    ruleName: 'structure · block 2',
    title: 'Commuting block',
    evidence: '39 2q ops · q0–q11 · layers 17–31 · lines 48–86',
    evidenceAt400: '39 2q ops · q0–q11 · layers 17–31 · lines 48–86',
    evidenceFinal: 'R3 · −11 gates · passed',
    layers: [17, 31],
    lines: [48, 86],
    acceptedIn: 3,
    delta: -11,
  },
  {
    id: 'D04',
    name: 'D04',
    rank: 4,
    severity: 'high',
    rule: 'D04',
    ruleName: 'resynthesis_potential',
    title: 'Resynthesizable blocks',
    evidence: '6 gates removable · q25 q26',
    evidenceAt400: '6 gates removable · q25 q26',
    evidenceFinal: '6 gates removable · q25 q26',
  },
]

export const findingById = (id: string) => FINDINGS.find((f) => f.id === id)

/** Rules the engine could not evaluate on this run. */
export const NOT_EVALUATED = { rules: ['D09', 'D10'], label: 'Not evaluated: no size_sweep, no simulation' } as const

/** Finding counts in the inspector header (fix-round-2 D30). */
export const FINDING_COUNTS = {
  baseline: '4 open · by severity',
  at400: '3 open · 1 accepted · by severity',
  final: '2 open · 2 accepted · by severity',
} as const

/**
 * @deprecated The canonical run has no suppressed finding; kept for screens that still import it.
 * Use NOT_EVALUATED for the D09/D10 row.
 */
export const SUPPRESSED = { rule: 'D08', label: 'Suppressed · measurement order' }

/* ── Attempts: the lanes as drawn on S-04 (at 400 s) and S-07 (after the stop) ── */

export type Layer = 'reference' | 'local'
export type AttemptStatus = 'proposed' | 'verifying' | 'accepted' | 'rejected' | 'inconclusive' | 'queued'
type FinalDecision = Exclude<AttemptStatus, 'proposed' | 'verifying' | 'queued'>

/** What a lane card says in one state: the word after the decision, and the value line. */
export type AttemptCopy = { note?: string; value: string; /** the candidate bar, 0–1 of the baseline bar */ bar?: number }

export type Attempt = {
  n: number
  round: 1 | 2 | 3 | 4
  layer: Layer
  strategy: string
  final: FinalDecision
  /** two-qubit gates removed when accepted */
  delta?: number
  /** what the engine said, in its words */
  reason?: string
  /** the finding it works on */
  finding?: FindingId
  /** start and end on the time axis, seconds */
  start: number
  end: number
  /** the card once decided (S-07, report) */
  decided: AttemptCopy
  /** the card at 400 s when it was still open there (S-04) */
  at400?: AttemptCopy & { status: AttemptStatus }
}

export const ATTEMPTS: Attempt[] = [
  {
    n: 1,
    round: 1,
    layer: 'reference',
    strategy: 'routing_search',
    final: 'accepted',
    delta: -23,
    finding: 'D01',
    start: 0,
    end: 92,
    decided: { note: '92 s', value: '298 gates', bar: 45 / 48 },
  },
  {
    n: 2,
    round: 1,
    layer: 'local',
    strategy: 'commutation_aware_routing',
    final: 'rejected',
    reason: 'two_qubit_depth 214 > 202 layers baseline',
    finding: 'D03-1',
    start: 0,
    end: 117,
    decided: { note: '2q depth', value: '214 > 202 layers', bar: 1 },
  },
  {
    n: 3,
    round: 2,
    layer: 'reference',
    strategy: 'block_resynthesis',
    final: 'inconclusive',
    reason: 'QCEC timeout 60 s (Q402)',
    finding: 'D04',
    start: 119,
    end: 245,
    decided: { note: 'QCEC timeout', value: '298 gates', bar: 1 },
  },
  {
    n: 4,
    round: 2,
    layer: 'local',
    strategy: 'commutation_aware_routing',
    final: 'accepted',
    delta: -17,
    finding: 'D03-1',
    start: 119,
    end: 245,
    decided: { note: 'block 1 · passed', value: '281 gates', bar: 45 / 48 },
  },
  {
    n: 5,
    round: 3,
    layer: 'reference',
    strategy: 'layout_search',
    final: 'rejected',
    reason: 'not better: 283 > 281 gates',
    finding: 'D01',
    start: 250,
    end: 405,
    decided: { note: 'not better', value: '283 > 281 gates', bar: 1 },
    at400: { status: 'verifying', note: '32 seeds', value: 'pending' },
  },
  {
    n: 6,
    round: 3,
    layer: 'local',
    strategy: 'commutation_aware_routing',
    final: 'accepted',
    delta: -11,
    finding: 'D03-2',
    start: 250,
    end: 405,
    decided: { note: 'block 2', value: '270 gates', bar: 46 / 48 },
    at400: { status: 'proposed', note: 'block 2 · parse ok', value: 'verifying' },
  },
  {
    n: 7,
    round: 4,
    layer: 'reference',
    strategy: 'routing_search',
    final: 'rejected',
    reason: '+2 gates',
    finding: 'D01',
    start: 410,
    end: 488,
    decided: { note: '+2 gates', value: '272 gates', bar: 1 },
    at400: { status: 'queued', value: 'round 4 · after round 3 decides' },
  },
  {
    n: 8,
    round: 4,
    layer: 'local',
    strategy: 'block_resynthesis',
    final: 'inconclusive',
    reason: 'QCEC timeout (Q402)',
    finding: 'D04',
    start: 410,
    end: 488,
    decided: { note: 'QCEC', value: '270 gates', bar: 1 },
    at400: { status: 'queued', value: 'round 4 · D04 top block' },
  },
]

/** Per-layer tallies after the stop (S-07, S-09). */
export const LAYER_TALLY = {
  reference: '1 of 4 accepted',
  local: '2 of 4 accepted',
  total: '3 accepted · 3 rejected · 2 inconclusive',
} as const

export const LAYERS = {
  reference: {
    name: 'reference-qiskit',
    role: 'engine',
    note: 'deterministic',
    strategies: 'layout_search · routing_search · block_resynthesis',
    color: 'var(--color-signal-info)',
  },
  local: {
    name: 'local',
    role: RUN.localModel,
    note: 'proposes, the engine verifies',
    strategies: 'commutation_aware_routing · block_resynthesis',
    color: 'var(--color-signal-ai)',
  },
} as const

/* ── Machine estimate ────────────────────────────────────────────────── */

/**
 * QPU cost per run: shots scale with reliability (4 000 × 0.263 ÷ reliability_heuristic) at about
 * 1.02 ms per shot, priced at 96 $ per QPU minute. An estimate, not a quote.
 */
export const COST = {
  shotsBaseline: 4000,
  msPerShot: 1.02,
  baseline: { qpuSeconds: 4.2, perRun: 6.72 },
  afterRound2: { qpuSeconds: 3.6, perRun: 5.7 },
  final: { qpuSeconds: 3.4, perRun: 5.4 },
  /** after each round, index 0 = baseline; flat through R4 */
  perRound: [6.72, 6.3, 5.7, 5.4, 5.4],
  saving: 1.32,
  savingPct: -19.6,
} as const

export const RELIABILITY = {
  baseline: 0.263,
  afterRound2: 0.301,
  final: 0.318,
  label: 'calibration-based reliability heuristic, not a success probability',
} as const

/* ── Copy, verbatim ──────────────────────────────────────────────────── */

/** Verbatim, never paraphrased. */
export const REGRESSION_MESSAGE =
  'If results are stagnating, the changes improve the circuit in one way, but worsen it in another, or you suspect the pipeline has serious flaws, please consider making a GitHub Issue and documenting your problems'

export const STOP_RECOMMENDATION =
  'Stop here. Round 4 accepted nothing and every open finding has had its strategies tried. Two more rounds would cost about 3 minutes for less than 1% on two-qubit gates.'

/** Model lane copy while the GPU machine is off (fix-round-2 D29). */
export const GPU_OFF_MESSAGE = 'GPU machine is off · model proposals wait · the engine keeps running on CPU'

/* ── Error codes (error-codes.md): "<what failed> (<code>) · <where> · <fix verb>" ── */

export const ERROR_CODES = {
  Q101: 'QASM parse error',
  Q102: 'unsupported gate or instruction',
  Q103: 'circuit wider than the target',
  Q104: 'no Qiskit project found in the repository',
  Q301: 'transpile failed',
  Q302: 'compile time limit reached',
  Q401: 'verification unsupported',
  Q402: 'verification inconclusive',
  Q403: 'edit outside the allowed region',
  Q404: 'candidate changed the qubit count',
  Q501: 'worker stopped',
  Q502: 'GPU not available',
  Q601: 'report.json missing for the run',
  Q602: 'export could not be written',
  Q603: 'upload to the account failed',
  Q901: 'database unreachable',
  Q902: 'GitHub repository not found',
  Q903: 'GitHub token rejected',
  Q904: 'calibration data unreachable',
  Q905: 'wrong email or password',
} as const

export type ErrorCode = keyof typeof ERROR_CODES

/* ── The circuit: the canonical interaction graph ────────────────────── */

/**
 * One cost layer of the QAOA circuit as the engine draws it: 39 rzz edges over 15 layers on 12 qubits.
 * Each entry is [layer within the block (1–15), qubit a, qubit b]. The circuit has two such blocks
 * (layers 1–15 and 17–31) between an h layer (0), a mixer (16) and the final mixer (32): 33 layers.
 */
export const BLOCK_EDGES: [number, number, number][] = [
  [1, 0, 1], [1, 2, 3], [1, 4, 5], [1, 6, 7], [1, 8, 9], [1, 10, 11],
  [2, 1, 2], [2, 3, 4], [2, 5, 6], [2, 7, 8], [2, 9, 10],
  [3, 0, 2], [3, 3, 5], [3, 6, 8], [3, 9, 11],
  [4, 1, 3], [4, 4, 6], [4, 7, 9],
  [5, 2, 4], [5, 5, 7], [5, 8, 10],
  [6, 0, 3], [6, 4, 7], [6, 8, 11],
  [7, 1, 4], [7, 5, 8],
  [8, 2, 5], [8, 6, 9],
  [9, 3, 6], [9, 7, 10],
  [10, 0, 4], [10, 5, 9],
  [11, 1, 5], [11, 6, 10],
  [12, 2, 6], [12, 7, 11],
  [13, 3, 7],
  [14, 4, 8],
  [15, 3, 8],
]

/** rzz pairs in QASM order for one block (39 lines): the ring first, the long-range pairs after. */
const QASM_PAIRS: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [0, 11],
  [0, 2], [1, 3], [3, 5], [6, 8], [7, 9], [9, 11], [8, 10], [0, 3], [1, 4], [2, 5], [3, 6], [4, 7],
  [5, 8], [6, 9], [7, 10], [8, 11], [0, 4], [1, 5], [2, 6], [3, 7], [6, 10], [7, 11], [0, 5], [1, 6],
  [5, 7], [2, 9], [4, 6],
]

/** sidechain_qaoa.qasm, 88 lines: header 1–5, D03 block 1 on 6–44, mixer 45–47, D03 block 2 on 48–86. */
export const QASM: string[] = [
  'OPENQASM 2.0;',
  'include "qelib1.inc";',
  'qreg q[12];',
  'creg c[12];',
  'h q;',
  ...QASM_PAIRS.map(([a, b]) => `rzz(0.7854) q[${a}],q[${b}];`),
  '// mixer 1',
  'rx(1.5708) q;',
  '// cost layer 2',
  ...QASM_PAIRS.map(([a, b]) => `rzz(0.7854) q[${a}],q[${b}];`),
  'rx(1.1781) q;',
  'measure q -> c;',
]
