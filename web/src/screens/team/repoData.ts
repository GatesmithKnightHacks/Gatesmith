/* S-12 Repo dashboard data: knighthacks/qaoa-packing, scored by CI on every pull request. */
import type { Severity } from '../../ui/status'

export type RepoFinding = { severity: Severity; rule: string; title: string }
export type RepoPr = { pr: string; title: string; change: string }

export type RepoCircuit = {
  id: string
  file: string
  item: string
  qubits: number
  gates: number
  first: number
  /** 90×20 sparkline over the last 8 runs */
  spark: string
  open: { severity: Severity | 'none'; count: number }
  lastRun: string
  /** timeline step path in the 978×500 chart, and where it ends */
  line: string
  endY: number
  label: string
  run: string
  pullRequest: string
  reliability: string
  findings: RepoFinding[]
  prs: RepoPr[]
  gate: string
}

export const REPO_CIRCUITS: RepoCircuit[] = [
  {
    id: 'sidechain_qaoa',
    file: 'sidechain_qaoa.qasm',
    item: 'packing_qaoa_p2',
    qubits: 12,
    gates: 33,
    first: 44,
    spark: 'M2 3H14V3H26V7H38V7H50V12H62V16H74V16H88',
    open: { severity: 'high', count: 2 },
    lastRun: '2 h ago · #41',
    line: 'M56 131.0H364.8V225.5H519.2V320.0H828.0V393.5H828',
    endY: 393.5,
    label: 'sidechain_qaoa −25%',
    run: 'run 7f2c·b310 · 2 h ago',
    pullRequest: '#41 · head 9c2e17b',
    reliability: '0.762',
    findings: [
      { severity: 'high', rule: 'D01 routing_overhead', title: 'Routing still dominates · 0.34 ratio ≥ 0.30' },
      { severity: 'warning', rule: 'D04 resynthesis', title: 'Block is resynthesizable · 4 gates' },
    ],
    prs: [
      { pr: '#41', title: 'Reorder commuting block', change: '36 → 33' },
      { pr: '#37', title: 'Merge rotation layers', change: '40 → 36' },
      { pr: '#35', title: 'Routing search on main', change: '44 → 40' },
    ],
    gate: 'A pull request fails its check when it adds a high finding. D01 was open before #41, so #41 passed.',
  },
  {
    id: 'sidechain_qaoa_p1',
    file: 'sidechain_qaoa_p1.qasm',
    item: 'packing_qaoa_p1',
    qubits: 12,
    gates: 21,
    first: 23,
    spark: 'M2 9H26V9H38V11H62V11H88',
    open: { severity: 'warning', count: 1 },
    lastRun: '1 d ago · #39',
    line: 'M56 131.0H442.0V173.0H673.6V225.5H828',
    endY: 225.5,
    label: 'sidechain_qaoa_p1 −9%',
    run: 'run 7f1e·0c42 · 1 d ago',
    pullRequest: '#39 · head 51d0a3e',
    reliability: '0.781',
    findings: [{ severity: 'warning', rule: 'D04 resynthesis', title: 'Block is resynthesizable · 2 gates' }],
    prs: [
      { pr: '#39', title: 'Drop a redundant CX pair', change: '22 → 21' },
      { pr: '#36', title: 'Routing search on p1', change: '23 → 22' },
    ],
    gate: 'A pull request fails its check when it adds a high finding. Only a warning is open, so #39 passed.',
  },
  {
    id: 'qft_8',
    file: 'qft_8.qasm',
    item: 'qft_8',
    qubits: 8,
    gates: 56,
    first: 52,
    spark: 'M2 12H26V12H38V8H62V5H88',
    open: { severity: 'high', count: 3 },
    lastRun: '5 d ago · #35',
    line: 'M56 131.0H287.6V89.0H364.8V47.0H828',
    endY: 47,
    label: 'qft_8 +8%',
    run: 'run 7f0b·91a4 · 5 d ago',
    pullRequest: '#35 · head 3e0b2c9',
    reliability: '0.655',
    findings: [
      { severity: 'high', rule: 'D01 routing_overhead', title: 'Routing dominates · 0.47 ratio ≥ 0.30' },
      { severity: 'high', rule: 'D02 seed_spread', title: 'Results vary between seeds · 0.31' },
      { severity: 'warning', rule: 'D03 commuting_block', title: 'Commuting block can be reordered' },
    ],
    prs: [
      { pr: '#35', title: 'Add a swap network', change: '54 → 56' },
      { pr: '#34', title: 'Inline controlled phases', change: '52 → 54' },
    ],
    gate: 'D01 was already open on main, so #34 and #35 passed. Both made two_qubit_count worse.',
  },
  {
    id: 'grover_5q',
    file: 'grover_5q.qasm',
    item: 'grover_5q',
    qubits: 5,
    gates: 18,
    first: 18,
    spark: 'M2 10H88',
    open: { severity: 'none', count: 0 },
    lastRun: '3 d ago · #37',
    line: 'M56 131.0H828',
    endY: 131,
    label: 'grover_5q 0%',
    run: 'run 7f12·6d03 · 3 d ago',
    pullRequest: '#37 · head 0a7f6e1',
    reliability: '0.874',
    findings: [],
    prs: [],
    gate: 'Every rule is below its threshold, so pull requests that touch grover_5q pass.',
  },
  {
    id: 'vqe_h2_4q',
    file: 'vqe_h2_4q.qasm',
    item: 'vqe_h2_4q',
    qubits: 4,
    gates: 6,
    first: 7,
    spark: 'M2 8H50V12H88',
    open: { severity: 'info', count: 1 },
    lastRun: '3 d ago · #37',
    line: 'M56 131.0H519.2V278.0H828',
    endY: 278,
    label: 'vqe_h2_4q −14%',
    run: 'run 7f12·6d07 · 3 d ago',
    pullRequest: '#37 · head 0a7f6e1',
    reliability: '0.903',
    findings: [{ severity: 'info', rule: 'D05 clifford_block', title: 'Clifford block can be simplified' }],
    prs: [{ pr: '#37', title: 'Merge rotation layers', change: '7 → 6' }],
    gate: 'Only an info finding is open. Info stays in report.json and never fails a check.',
  },
]

export const RUN_TICKS = ['#31', '#32', '#33', '#34', '#35', '#36', '#37', '#38', '#39', '#40', '#41']
