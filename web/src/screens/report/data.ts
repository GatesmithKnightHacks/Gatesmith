/*
 * The canonical run 7f3a·0412 as the report and export screens show it (fix-round-1 D2, fix-round-2 D23 to D31):
 * sidechain_qaoa.qasm · 12 q · FakeTorino · 8 seeds, seed 37 best · two_qubit_count 321 → 298 → 281 → 270, R4 accepts
 * nothing, the engine stops at 490 s. Values are the engine's own words and numbers, copied from the Paper boards.
 * Kept here until the shared demo data carries the 33-layer run; field names follow qscore.scorecard/v0.2.
 */

export const JOB = '7f3a·0412'
export const REPO = 'qlab/sidechain-packing'
export const HANDLE = 'qlab-dev'
export const PR = '#41 Reorder commuting block in sidechain_qaoa'
export const RELIABILITY_CAVEAT = 'calibration-based reliability heuristic, not a success probability'
/** Verbatim, never paraphrased. */
export const STOP_COPY =
  'Stop here. Round 4 accepted nothing and every open finding has had its strategies tried. Two more rounds would cost about 3 minutes for less than 1% on two-qubit gates.'

/* ── Metrics table ──────────────────────────────────────────────────── */
export type MetricRow = {
  kind: 'row'
  name: string
  /** qualifier beside the name: "primary", "n = 8" (fix-round-2 D23) */
  qualifier?: string
  /** 44 px track: dim baseline bar, now bar, optional threshold tick (px) */
  bars: { before: number; after: number; tick?: number }
  delta: string
  before: string
  after: string
  unit: string
  change: string
  /** a rule still fires on this metric: the status column says "high" */
  high?: boolean
  primary?: boolean
}
export type MetricGroup = { kind: 'group'; label: string; note?: string }
export type MetricNote = { kind: 'note'; text: string }
export type MetricLine = MetricRow | MetricGroup | MetricNote

export const METRICS_FINAL: MetricLine[] = [
  { kind: 'group', label: 'resources', note: 'bars before · after · tick threshold' },
  {
    kind: 'row',
    name: 'two_qubit_count',
    qualifier: 'primary',
    primary: true,
    bars: { before: 44, after: 37 },
    delta: '−51',
    before: '321',
    after: '270',
    unit: 'gates',
    change: '−15.9%',
  },
  { kind: 'row', name: 'two_qubit_depth', bars: { before: 44, after: 39 }, delta: '−24', before: '202', after: '178', unit: 'layers', change: '−11.9%' },
  { kind: 'group', label: 'hardware', note: 'FakeTorino · calibration Oct 9' },
  {
    kind: 'row',
    name: 'routing_overhead',
    bars: { before: 44, after: 36, tick: 26 },
    delta: '−0.093',
    before: '0.514',
    after: '0.421',
    unit: 'ratio',
    change: '−18.1%',
    high: true,
  },
  { kind: 'row', name: 'swaps_inserted', bars: { before: 44, after: 30 }, delta: '−21', before: '65', after: '44', unit: 'gates', change: '−32.3%' },
  { kind: 'row', name: 'compile_ratio', bars: { before: 44, after: 37 }, delta: '−0.33', before: '2.06', after: '1.73', unit: 'ratio', change: '−16.0%' },
  {
    kind: 'row',
    name: 'reliability_heuristic',
    bars: { before: 36, after: 44 },
    delta: '+0.055',
    before: '0.263',
    after: '0.318',
    unit: '(0, 1]',
    change: '+20.9%',
  },
  { kind: 'note', text: RELIABILITY_CAVEAT },
  { kind: 'row', name: 'scheduled_duration', bars: { before: 44, after: 38 }, delta: '−3.3', before: '24.2', after: '20.9', unit: 'µs', change: '−13.6%' },
  {
    kind: 'row',
    name: 'seed_spread',
    qualifier: 'n = 8',
    bars: { before: 44, after: 32 },
    delta: '−0.023',
    before: '0.087',
    after: '0.064',
    unit: 'ratio',
    change: '−26.4%',
  },
  { kind: 'group', label: 'opportunities' },
  {
    kind: 'row',
    name: 'resynthesis_potential',
    bars: { before: 44, after: 29, tick: 20 },
    delta: '−3',
    before: '9',
    after: '6',
    unit: 'gates',
    change: '−33.3%',
    high: true,
  },
]

/** Partial: the run was cancelled at 400 s, values are after round 2 (S-09 states, partial). */
export const METRICS_PARTIAL: MetricLine[] = [
  { kind: 'group', label: 'after round 2', note: 'bars before · after · tick threshold' },
  {
    kind: 'row',
    name: 'two_qubit_count',
    qualifier: 'primary',
    primary: true,
    bars: { before: 44, after: 39 },
    delta: '−40',
    before: '321',
    after: '281',
    unit: 'gates',
    change: '−12.5%',
  },
  { kind: 'row', name: 'two_qubit_depth', bars: { before: 44, after: 40 }, delta: '−18', before: '202', after: '184', unit: 'layers', change: '−8.9%' },
  {
    kind: 'row',
    name: 'routing_overhead',
    bars: { before: 44, after: 38, tick: 26 },
    delta: '−0.068',
    before: '0.514',
    after: '0.446',
    unit: 'ratio',
    change: '−13.2%',
    high: true,
  },
  {
    kind: 'row',
    name: 'reliability_heuristic',
    bars: { before: 38, after: 44 },
    delta: '+0.038',
    before: '0.263',
    after: '0.301',
    unit: '(0, 1]',
    change: '+14.4%',
  },
  {
    kind: 'row',
    name: 'resynthesis_potential',
    bars: { before: 44, after: 29, tick: 20 },
    delta: '−3',
    before: '9',
    after: '6',
    unit: 'gates',
    change: '−33.3%',
    high: true,
  },
]

/** Round 1 only: the one canonical number after round 1 (routing_search accepted 321 → 298). */
export const PRIMARY_AFTER_R1: MetricRow = {
  kind: 'row',
  name: 'two_qubit_count',
  qualifier: 'primary',
  primary: true,
  bars: { before: 44, after: 41 },
  delta: '−23',
  before: '321',
  after: '298',
  unit: 'gates',
  change: '−7.2%',
}

/**
 * Round 1 only (budget 1 round): the primary metric is the canonical 321 → 298; reliability_heuristic
 * follows from the canonical per-round cost (6.72 → 6.30 $ per run, cost scales with 1 ÷ reliability).
 */
export const METRICS_R1: MetricLine[] = [
  { kind: 'group', label: 'after round 1', note: 'bars before · after · tick threshold' },
  PRIMARY_AFTER_R1,
  {
    kind: 'row',
    name: 'reliability_heuristic',
    bars: { before: 41, after: 44 },
    delta: '+0.018',
    before: '0.263',
    after: '0.281',
    unit: '(0, 1]',
    change: '+6.8%',
  },
  { kind: 'note', text: 'calibration-based reliability heuristic, not a success probability' },
]

/* ── Rounds ─────────────────────────────────────────────────────────── */
export type Decision = 'accepted' | 'rejected' | 'inconclusive'
export type RoundCell = Decision | 'skipped'

export const ROUNDS = {
  reference: { cells: ['accepted', 'inconclusive', 'rejected', 'rejected'] as RoundCell[], meta: '4 attempts · 1 accepted' },
  local: { cells: ['rejected', 'accepted', 'accepted', 'inconclusive'] as RoundCell[], meta: '4 attempts · 2 accepted' },
  totals: { accepted: 3, rejected: 3, inconclusive: 2 },
  meta: '4 rounds · 8 attempts · 490 s',
}

export const ROUNDS_PARTIAL = {
  reference: { cells: ['accepted', 'inconclusive', 'skipped', 'skipped'] as RoundCell[], meta: '2 attempts · 1 accepted' },
  local: { cells: ['rejected', 'accepted', 'skipped', 'skipped'] as RoundCell[], meta: '2 attempts · 1 accepted' },
  totals: { accepted: 2, rejected: 1, inconclusive: 1 },
  meta: '2 rounds · 4 attempts · 400 s',
}

/* ── Machine estimate: 4 000 × 0.263 ÷ reliability shots at 1.02 ms, 96 $ per minute ── */
export type Estimate = {
  reliability: [string, string, string]
  qpu: [string, string, string]
  cost: [string, string, string]
}
export const ESTIMATE_FINAL: Estimate = {
  reliability: ['0.263', '0.318', '+20.9%'],
  qpu: ['4.2 s', '3.4 s', '3 308 shots'],
  cost: ['6.72 $', '5.40 $', '−1.32 $'],
}
export const ESTIMATE_PARTIAL: Estimate = {
  reliability: ['0.263', '0.301', '+14.4%'],
  qpu: ['4.2 s', '3.6 s', '3 495 shots'],
  cost: ['6.72 $', '5.70 $', '−1.02 $'],
}

export const ESTIMATE_R1: Estimate = {
  reliability: ['0.263', '0.281', '+6.8%'],
  qpu: ['4.2 s', '3.9 s', '3 744 shots'],
  cost: ['6.72 $', '6.30 $', '−0.42 $'],
}

/* ── Inspector ──────────────────────────────────────────────────────── */
export const RUN_FACTS: [string, string][] = [
  ['seeds', '11 23 37 41 53 67 79 97'],
  ['qiskit', '1.3.1'],
  ['score version', 'qscore-2026.1'],
  ['prompt version', 'p-2026.1'],
  ['local model', 'Qiskit/granite-3.3-8b-qiskit'],
  ['manifest', 'sha256 9c41…'],
  ['calibration', 'snapshot Oct 9'],
  ['hardware profile', 'FakeTorino · 133 q'],
  ['wall time', '490 s · 8 m 10 s'],
]

export type FindingLine = { rank: string; title: string; evidence: string; status: 'high' | 'accepted'; word: string }
export const FINDINGS_FINAL: FindingLine[] = [
  { rank: '#1 D01', title: 'Routing-dominated', evidence: '0.421 ratio', status: 'high', word: 'high' },
  { rank: '#2 D03', title: 'Commuting block', evidence: 'block 1', status: 'accepted', word: 'accepted R2' },
  { rank: '#3 D03', title: 'Commuting block', evidence: 'block 2', status: 'accepted', word: 'accepted R3' },
  { rank: '#4 D04', title: 'Resynthesizable blocks', evidence: '6 gates', status: 'high', word: 'high' },
]
export const FINDINGS_PARTIAL: FindingLine[] = [
  { rank: '#1 D01', title: 'Routing-dominated', evidence: '0.446 ratio', status: 'high', word: 'high' },
  { rank: '#2 D03', title: 'Commuting block', evidence: 'block 1', status: 'accepted', word: 'accepted R2' },
  { rank: '#3 D03', title: 'Commuting block', evidence: 'block 2', status: 'high', word: 'high' },
  { rank: '#4 D04', title: 'Resynthesizable blocks', evidence: '6 gates', status: 'high', word: 'high' },
]

/** Round 1 only: routing_search touched no commuting block, so every finding stays open. */
export const FINDINGS_R1: FindingLine[] = [
  { rank: '#1 D01', title: 'Routing-dominated', evidence: '≥ 0.30 ratio', status: 'high', word: 'high' },
  { rank: '#2 D03', title: 'Commuting block', evidence: 'block 1', status: 'high', word: 'high' },
  { rank: '#3 D03', title: 'Commuting block', evidence: 'block 2', status: 'high', word: 'high' },
  { rank: '#4 D04', title: 'Resynthesizable blocks', evidence: '9 gates', status: 'high', word: 'high' },
]

/** fix-round-2 D28: what reproduces this report, bit for bit. Hashes match the S-10 files. */
export const REPRODUCIBILITY: [string, string][] = [
  ['final.qasm', 'sha256 1f0e…'],
  ['report.json', 'sha256 d93a…'],
  ['engine', 'qscore-2026.1'],
  ['prompt', 'p-2026.1'],
]

/* ── Export (S-10) ──────────────────────────────────────────────────── */
export type ExportFile = { name: string; note: string; size: string; hash: string; action: 'Copy hash' | 'Download' }
export const EXPORT_FILES: ExportFile[] = [
  { name: 'final.qasm', note: 'final circuit · OpenQASM 2.0', size: '4.1 KB', hash: 'sha256 1f0e…', action: 'Copy hash' },
  { name: 'qscore.yaml', note: 'manifest · seeds, versions', size: '0.6 KB', hash: 'sha256 7c2b…', action: 'Download' },
  { name: 'report.json', note: 'metrics, rounds, findings', size: '38 KB', hash: 'sha256 d93a…', action: 'Download' },
]

/** A code line: text, comment (tertiary) and the left rail (accepted = #C2DADF). */
export type CodeLine = { text: string; comment?: boolean; rail?: 'accepted' }

export const QASM_PREVIEW: CodeLine[] = [
  { text: 'OPENQASM 2.0;' },
  { text: 'include "qelib1.inc";' },
  { text: `// job ${JOB} · qscore-2026.1`, comment: true },
  { text: 'qreg q[12];' },
  { text: 'creg c[12];' },
  { text: 'h q;' },
  { text: '// cost layer 1 · order from accepted R2', comment: true },
  { text: 'rzz(0.7854) q[0],q[1];', rail: 'accepted' },
  { text: 'rzz(0.7854) q[2],q[3];', rail: 'accepted' },
  { text: 'rzz(0.7854) q[4],q[5];', rail: 'accepted' },
]

export const QISKIT_PREVIEW: CodeLine[] = [
  { text: 'from qiskit import QuantumCircuit' },
  { text: '' },
  { text: `# final.qasm · job ${JOB} · qscore-2026.1` },
  { text: 'qc = QuantumCircuit(12, 12)' },
  { text: 'qc.h(range(12))' },
  { text: '' },
  { text: '# cost layer 1 · order from accepted R2' },
  { text: 'qc.rzz(0.7854, 0, 1)' },
  { text: 'qc.rzz(0.7854, 2, 3)' },
  { text: 'qc.rzz(0.7854, 4, 5)' },
  { text: 'qc.rzz(0.7854, 6, 7)' },
  { text: 'qc.rzz(0.7854, 8, 9)' },
  { text: 'qc.rzz(0.7854, 10, 11)' },
  { text: 'qc.rzz(0.7854, 1, 2)' },
  { text: 'qc.rzz(0.7854, 3, 4)' },
  { text: 'qc.rzz(0.7854, 5, 6)' },
]

export const ACTION_LINES: CodeLine[] = [
  { text: 'name: gatesmith' },
  { text: 'on:' },
  { text: '  pull_request:' },
  { text: '    paths: ["**/*.qasm"]' },
  { text: 'jobs:' },
  { text: '  score:' },
  { text: '    runs-on: ubuntu-latest' },
  { text: '    steps:' },
  { text: '      - uses: actions/checkout@v4' },
  { text: '      - uses: gatesmith/score-action@v1' },
  { text: '        with:' },
  { text: '          manifest: qscore.yaml' },
  { text: '          comment: delta' },
]

export const ACTION_FACTS: [string, string][] = [
  ['repo', REPO],
  ['adds', '.github/workflows/gatesmith.yml'],
  ['triggers on', 'pull_request · **/*.qasm'],
  ['manifest', 'qscore.yaml · qscore-2026.1'],
  ['comments', 'delta table · top finding'],
]

/** fix-round-2 D28: the Run section opens on before/after and hashes so the inspector is not empty. */
export const RUN_SECTION: [string, string][] = [
  ['two_qubit_count', '321 → 270 gates'],
  ['two_qubit_depth', '202 → 178 layers'],
  ['reliability_heuristic', '0.263 → 0.318'],
  ['cost per run', '6.72 → 5.40 $'],
  ['original.qasm', 'sha256 c41b…'],
  ['final.qasm', 'sha256 1f0e…'],
  ['report.json', 'sha256 d93a…'],
]
