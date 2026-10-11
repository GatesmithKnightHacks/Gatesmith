/* The export files as text, so Download hands over real files (run 7f3a·0412, 12 q, 321 → 270 two-qubit gates). */
import { ACTION_LINES, JOB, QISKIT_PREVIEW } from './data'

/** One cost layer of the final circuit: the rzz pairs in the order accepted in R2 and R3. */
const COST_PAIRS: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [1, 2], [3, 4], [5, 6], [7, 8], [9, 10],
  [0, 2], [3, 5], [6, 8], [9, 11], [1, 3], [4, 6], [7, 9], [2, 4], [5, 7], [8, 10],
  [0, 3], [4, 7], [8, 11], [1, 4], [5, 8], [2, 5], [6, 9], [3, 6], [7, 10],
  [0, 4], [5, 9], [1, 5], [6, 10], [2, 6], [7, 11], [3, 7], [4, 8], [3, 8],
]

function costLayer(n: number, round: string) {
  return [`// cost layer ${n} · order from accepted ${round}`, ...COST_PAIRS.map(([a, b]) => `rzz(0.7854) q[${a}],q[${b}];`)]
}

export const FINAL_QASM = [
  'OPENQASM 2.0;',
  'include "qelib1.inc";',
  `// job ${JOB} · qscore-2026.1`,
  'qreg q[12];',
  'creg c[12];',
  'h q;',
  ...costLayer(1, 'R2'),
  'rx(0.3927) q;',
  ...costLayer(2, 'R3'),
  'rx(0.3927) q;',
  'measure q -> c;',
  '',
].join('\n')

export const MANIFEST_YAML = `schema: qscore.project/v0.2
project: sidechain-packing
items:
  - id: packing_qaoa_p2
    source: circuits/sidechain_qaoa.qasm
    intent: expectation
    target: FakeTorino
    seeds: [11, 23, 37, 41, 53, 67, 79, 97]
    primary: two_qubit_count
    max_rounds: 4
    wall_budget_s: 900
    auto: false
    layers: [reference-qiskit, local]
score_version: qscore-2026.1
prompt_version: p-2026.1
`

export const QISKIT_CODE = [
  ...QISKIT_PREVIEW.slice(0, 7).map((l) => l.text),
  ...COST_PAIRS.map(([a, b]) => `qc.rzz(0.7854, ${a}, ${b})`),
  'qc.rx(0.3927, range(12))',
  '',
  '# cost layer 2 · order from accepted R3',
  ...COST_PAIRS.map(([a, b]) => `qc.rzz(0.7854, ${a}, ${b})`),
  'qc.rx(0.3927, range(12))',
  'qc.measure(range(12), range(12))',
  '',
].join('\n')

export const ACTION_YAML = ACTION_LINES.map((l) => l.text).join('\n') + '\n'

export function reportJson() {
  return JSON.stringify(
    {
      schema: 'qscore.report/v0.2',
      job: JOB,
      item: 'packing_qaoa_p2',
      score_version: 'qscore-2026.1',
      prompt_version: 'p-2026.1',
      target: 'FakeTorino',
      seeds: [11, 23, 37, 41, 53, 67, 79, 97],
      best_seed: 37,
      primary: { metric: 'two_qubit_count', before: 321, after: 270, unit: 'gates' },
      metrics: {
        two_qubit_depth: [202, 178],
        routing_overhead: [0.514, 0.421],
        swaps_inserted: [65, 44],
        compile_ratio: [2.06, 1.73],
        reliability_heuristic: [0.263, 0.318],
        scheduled_duration_us: [24.2, 20.9],
        seed_spread: [0.087, 0.064],
        resynthesis_potential: [9, 6],
      },
      stopped: { by: 'engine', after_round: 4, wall_time_s: 490 },
      findings: { open: ['D01', 'D04'], accepted: ['D03 block 1', 'D03 block 2'], not_evaluated: ['D09', 'D10'] },
    },
    null,
    2,
  )
}

/** Preview lines of the other two files, so selecting a row shows that file. */
export const MANIFEST_PREVIEW = MANIFEST_YAML.split('\n').slice(0, 10).map((text) => ({ text }))
export const REPORT_PREVIEW = reportJson().split('\n').slice(0, 10).map((text) => ({ text }))
