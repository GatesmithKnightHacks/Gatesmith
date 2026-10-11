/*
 * The canonical run 7f3a·0412 as the fix review (S-06) and the loop view (S-07) show it.
 * sidechain_qaoa.qasm · 12 q · FakeTorino · 8 seeds · two_qubit_count 321 → 298 (R1) → 281 (R2) → 270 (R3),
 * R4 accepts nothing, the engine stops at 490 s of a 900 s budget, auto mode off.
 * Field names follow the engine's report so a real backend can replace this file.
 */

export const RUN_7F3A = {
  job: '7f3a·0412',
  file: 'sidechain_qaoa.qasm',
  other: 'sbox_oracle.qasm',
  model: 'Qiskit/granite-3.3-8b-qiskit',
  engine: 'qscore-2026.1',
  qiskit: 'Qiskit 1.3.1',
  budget: '8 seeds · 4 rounds · 900 s · auto off',
} as const

/** Verbatim, never paraphrased (the engine's stop recommendation). */
export const STOP_COPY =
  'Round 4 accepted nothing and every open finding has had its strategies tried. Two more rounds would cost about 3 minutes for less than 1% on two-qubit gates.'

/** Verbatim regression message. */
export const REGRESSION_COPY =
  'If results are stagnating, the changes improve the circuit in one way, but worsen it in another, or you suspect the pipeline has serious flaws, please consider making a GitHub Issue and documenting your problems'

/** Budget hit, verbatim. */
export const BUDGET_COPY = 'Round 4 ended at 900 s, the budget. The best accepted circuit is kept.'

export const ISSUE_URL = 'https://github.com/GatesmithKnightHacks/Gatesmith/issues/new'

/* ── Rounds timeline geometry ────────────────────────────────────────── */
/** The plot is 932 px wide for 600 s on the default zoom. */
export const PLOT_W = 932
export const pxAt = (s: number, span = 600) => (s / span) * PLOT_W

/** two_qubit_count on the primary lane: y in px inside the 170 px plot. */
export const gatesY = (g: number) => 26.5 + (321 - g) * 2.0913
