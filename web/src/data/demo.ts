/*
 * The canonical demo run, the same story on every board:
 * sidechain_qaoa · 12 q · FakeTorino · 8 seeds · two_qubit_count 44 → 40 → 36 → 33 · stop after round 4.
 * Field names follow qscore.scorecard/v0.2 and the engine's rule ids (D01…D10) so a real backend can replace this.
 */
import type { Finding } from '../ui/parts'

export const RUN = {
  job: '7f3a·0412',
  item: 'packing_qaoa_p2',
  file: 'sidechain_qaoa.qasm',
  other: 'sbox_oracle.qasm',
  qubits: 12,
  target: 'FakeTorino',
  targetQubits: 133,
  seeds: [11, 23, 37, 41, 53, 67, 79, 97],
  scoreVersion: 'qscore-2026.1',
  maxRounds: 4,
  wallBudget: 900,
  costPerMin: 96,
} as const

export const FINDINGS: Finding[] = [
  {
    rank: 1,
    severity: 'high',
    rule: 'D01',
    ruleName: 'routing_overhead',
    title: 'Routing dominates the transpiled circuit',
    evidence: '0.41 ratio ≥ 0.30 · 18 swaps',
  },
  {
    rank: 2,
    severity: 'high',
    rule: 'D03',
    ruleName: 'commuting_block',
    title: 'Commuting block can be reordered',
    evidence: '6 2q ops · 4 q · lines 13–18',
  },
  {
    rank: 3,
    severity: 'warning',
    rule: 'D04',
    ruleName: 'resynthesis',
    title: 'Block is resynthesizable',
    evidence: '4 gates removable · q9–q10',
  },
]

export const SUPPRESSED = { rule: 'D08', label: 'Suppressed · measurement order' }

export type Layer = 'reference' | 'local'
export type AttemptStatus = 'proposed' | 'verifying' | 'accepted' | 'rejected' | 'inconclusive' | 'queued'

export type Attempt = {
  n: number
  round: 1 | 2 | 3 | 4
  layer: Layer
  strategy: string
  final: Exclude<AttemptStatus, 'proposed' | 'verifying' | 'queued'>
  /** two-qubit gates removed when accepted */
  delta?: number
  /** what the engine said, in its words */
  reason?: string
}

export const ATTEMPTS: Attempt[] = [
  { n: 1, round: 1, layer: 'reference', strategy: 'routing_search', final: 'accepted', delta: -4 },
  { n: 2, round: 1, layer: 'local', strategy: 'commuting_reorder', final: 'rejected', reason: 'two_qubit_depth 27 > 24 layers baseline' },
  { n: 3, round: 2, layer: 'reference', strategy: 'block_resynthesis', final: 'inconclusive' },
  { n: 4, round: 2, layer: 'local', strategy: 'commuting_reorder', final: 'accepted', delta: -4 },
  { n: 5, round: 3, layer: 'reference', strategy: 'layout_search', final: 'rejected' },
  { n: 6, round: 3, layer: 'local', strategy: 'commuting_reorder', final: 'accepted', delta: -3 },
  { n: 7, round: 4, layer: 'reference', strategy: 'routing_search', final: 'rejected' },
  { n: 8, round: 4, layer: 'local', strategy: 'block_resynthesis', final: 'inconclusive' },
]

/** two_qubit_count after each round (index 0 = baseline). */
export const TWO_QUBIT = [44, 40, 36, 33, 33] as const

export const LAYERS = {
  reference: { name: 'reference-qiskit', role: 'engine', note: 'deterministic', color: 'var(--color-signal-info)' },
  local: { name: 'local', role: 'granite-8b', note: 'proposes, engine verifies', color: 'var(--color-signal-ai)' },
} as const

export const COST = {
  baseline: { qpuSeconds: 4.2, perRun: 6.72 },
  afterRound2: { qpuSeconds: 3.5, perRun: 5.6 },
  final: { qpuSeconds: 3.3, perRun: 5.32 },
} as const

export const RELIABILITY = {
  baseline: 0.692,
  afterRound2: 0.741,
  final: 0.762,
  label: 'calibration-based reliability heuristic, not a success probability',
} as const

/** Verbatim, never paraphrased. */
export const REGRESSION_MESSAGE =
  'If results are stagnating, the changes improve the circuit in one way, but worsen it in another, or you suspect the pipeline has serious flaws, please consider making a GitHub Issue and documenting your problems'

export const STOP_RECOMMENDATION =
  'Stop here. The remaining findings are below their thresholds. Two more rounds would cost about 3 minutes for less than 1% on two-qubit gates.'
