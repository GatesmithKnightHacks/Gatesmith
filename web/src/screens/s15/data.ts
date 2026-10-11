/*
 * S-15 · Candidate screening, round 4 of run 7f3a·0412 at 400 s: eight candidates for finding #3,
 * "D03 block 2" (layers 17 to 31, lines 48 to 86). The predictor orders the queue; the engine still
 * verifies, re-scores and decides. Values as on Paper 1BKI-0 and its states board 1LVA-0.
 */

export type Layer = 'reference-qiskit' | 'local' | 'hf'
export const LAYER_KIND: Record<Layer, 'engine' | 'model'> = { 'reference-qiskit': 'engine', local: 'model', hf: 'model' }

export type Candidate = {
  rank: number
  strategy: string
  layer: Layer
  /** predicted two_qubit_count, ±CI95, n seeds */
  predicted: number
  ci: number
  n: number
  /** probability the engine verifies it */
  verify: number
  /** order the model proposed it in (the no-predictor state keeps this order) */
  proposed: number
}

/** All eight once screened (the "all screened" state); the main board has #1 to #4 screened. */
export const CANDIDATES: Candidate[] = [
  { rank: 1, strategy: 'block_resynthesis', layer: 'reference-qiskit', predicted: 264, ci: 6, n: 5, verify: 0.81, proposed: 2 },
  { rank: 2, strategy: 'commutation_aware_routing', layer: 'local', predicted: 268, ci: 9, n: 5, verify: 0.74, proposed: 1 },
  { rank: 3, strategy: 'routing_search', layer: 'reference-qiskit', predicted: 275, ci: 7, n: 5, verify: 0.62, proposed: 3 },
  { rank: 4, strategy: 'layout_search', layer: 'reference-qiskit', predicted: 281, ci: 4, n: 5, verify: 0.4, proposed: 5 },
  { rank: 5, strategy: 'commutation_aware_routing', layer: 'hf', predicted: 284, ci: 8, n: 5, verify: 0.31, proposed: 4 },
  { rank: 6, strategy: 'block_resynthesis', layer: 'local', predicted: 287, ci: 5, n: 5, verify: 0.22, proposed: 6 },
  { rank: 7, strategy: 'reversible_rewrite', layer: 'local', predicted: 290, ci: 9, n: 5, verify: 0.15, proposed: 7 },
  { rank: 8, strategy: 'noise_aware_layout', layer: 'reference-qiskit', predicted: 296, ci: 6, n: 5, verify: 0.08, proposed: 8 },
]

/** On the main board the first four are screened and the rest are still screening. */
export const SCREENED_ON_BOARD = 4

/** Round 3's candidate, sent before screening existed: verifying at 400 s. */
export const IN_VERIFICATION = { label: 'R3', strategy: 'commutation_aware_routing', layer: 'local' as Layer, note: 'attempt 6 · equivalent running' }

export const NOW_GATES = 281

/** The ladder for the selected candidate (all four steps queued before Verify). */
export const LADDER = ['allowed', 'equivalent', 're-scored', 'decided'] as const

/** Findings at 400 s: "3 open · 1 accepted". */
export const FINDINGS = [
  { id: '#1', rule: 'D01 Routing-dominated', note: 'routing_overhead 0.446', state: 'high' as const },
  { id: '#2', rule: 'D03 block 1', note: 'fixed R2 · 281 gates', state: 'accepted' as const },
  { id: '#3', rule: 'D03 block 2', note: 'screening · 8 candidates', state: 'high' as const },
  { id: '#4', rule: 'D04 Resynthesizable blocks', note: '6 gates removable · q25 q26', state: 'high' as const },
]

export const HISTORY = [
  { round: 'round 4', note: '8 candidates · 4 screened · top 2 to the engine' },
  { round: 'round 3', note: '3 candidates · 1 sent before screening · verifying' },
]
