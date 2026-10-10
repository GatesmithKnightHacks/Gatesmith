/*
 * S-04 data, read from the Paper board (BL9-0). The circuit is sidechain_qaoa's first 12-qubit layer pair,
 * drawn on a 29 px wire pitch exactly as in Paper.
 */

export const WIRE_Y = (q: number) => 26 + 29 * q
export const GATE_TOP = (q: number) => 16 + 29 * q
export const CANVAS_W = 314
export const CANVAS_H = 372

export type Box = { q: number; x: number; w: 20 | 22; label: 'H' | 'RZ' | 'RX' | 'M' }
export type Cx = { x: number; control: number; target: number }

const qubits = Array.from({ length: 12 }, (_, i) => i)
const odd = qubits.filter((q) => q % 2 === 1)
const evenInner = [2, 4, 6, 8, 10]

export const BOXES: Box[] = [
  ...qubits.map((q) => ({ q, x: 40, w: 20 as const, label: 'H' as const })),
  ...odd.map((q) => ({ q, x: 99, w: 22 as const, label: 'RZ' as const })),
  ...evenInner.map((q) => ({ q, x: 189, w: 22 as const, label: 'RZ' as const })),
  ...qubits.map((q) => ({ q, x: 249, w: 22 as const, label: 'RX' as const })),
  ...qubits.map((q) => ({ q, x: 280, w: 20 as const, label: 'M' as const })),
]

export const CXS: Cx[] = [
  // layer 1: q0→q1, q2→q3 … at columns 80 and 140
  ...[0, 2, 4, 6, 8, 10].flatMap((c) => [
    { x: 80, control: c, target: c + 1 },
    { x: 140, control: c, target: c + 1 },
  ]),
  // layer 2: q1→q2, q3→q4 … at columns 170 and 230
  ...[1, 3, 5, 7, 9].flatMap((c) => [
    { x: 170, control: c, target: c + 1 },
    { x: 230, control: c, target: c + 1 },
  ]),
]

/** Finding regions on the canvas, as drawn in Paper. */
export const REGIONS = {
  accepted: { x: 66.75, y: 12.75, w: 86.5, h: 55.5, chip: { left: 71, top: 8, text: 'accepted' } },
  D03: { x: 156.75, y: 99.75, w: 86.5, h: 113.5, chip: { left: 161, top: 95, text: 'D03 high' } },
  D04: { x: 156.75, y: 273.75, w: 86.5, h: 55.5, chip: { left: 161, top: 269, text: 'D04 warning' } },
} as const

/** The gate that carries the yellow "you are here" outline for each selectable finding. */
export const SELECTED_GATE: Record<string, { q: number; x: number }> = {
  D03: { q: 4, x: 189 },
  D04: { q: 10, x: 189 },
}

/** QASM lines (OpenQASM 2.0 · 12 q). */
export const QASM: string[] = [
  'OPENQASM 2.0;',
  'include "qelib1.inc";',
  'qreg q[12];',
  'creg c[12];',
  'h q;',
  'cx q[0], q[1];',
  'rz(0.42) q[1];',
  'cx q[0], q[1];',
  'cx q[2], q[3];',
  'rz(0.42) q[3];',
  'cx q[2], q[3];',
  '// layer 2',
  'cx q[3], q[4];',
  'rz(0.42) q[4];',
  'cx q[3], q[4];',
  'cx q[5], q[6];',
  'rz(0.42) q[6];',
  'cx q[5], q[6];',
  'rx(1.17) q;',
  'measure q -> c;',
]

/** Lines of each finding's region, and the line of its selected gate. */
export const FINDING_LINES: Record<string, { lines: number[]; gateLine: number }> = {
  D03: { lines: [13, 14, 15, 16, 17, 18], gateLine: 14 },
}

/* ── Scorecard (baseline · best of 8) ─────────────────────────────────── */
export type ScoreRow =
  | { kind: 'group'; label: string }
  | {
      kind: 'metric'
      id: string
      value: string
      unit?: string
      status?: 'high' | 'warning' | 'info'
      aside?: string
      note?: string
      bar?: { fill: number; marker: number }
    }
  | { kind: 'skipped'; id: string; reason: string }

export const SCORECARD: ScoreRow[] = [
  { kind: 'group', label: 'resources' },
  { kind: 'metric', id: 'width', value: '12', unit: 'q' },
  { kind: 'metric', id: 'two_qubit_count', value: '44', unit: 'gates' },
  { kind: 'metric', id: 'depth', value: '58', unit: 'layers' },
  { kind: 'metric', id: 'two_qubit_depth', value: '24', unit: 'layers' },
  { kind: 'group', label: 'hardware · FakeTorino' },
  { kind: 'metric', id: 'routing_overhead', value: '0.41', unit: 'ratio', status: 'high', bar: { fill: 24, marker: 18 } },
  { kind: 'metric', id: 'swaps_inserted', value: '18', unit: 'ops' },
  {
    kind: 'metric',
    id: 'reliability_heuristic',
    value: '0.692',
    note: 'calibration-based reliability heuristic, not a success probability',
  },
  { kind: 'metric', id: 'seed_spread', value: '0.18', unit: 'ratio', status: 'info' },
  { kind: 'group', label: 'opportunities' },
  { kind: 'metric', id: 'commuting_block', value: '6', unit: '2q ops', status: 'high' },
  { kind: 'metric', id: 'resynthesis_potential', value: '4', unit: 'gates', status: 'warning' },
  { kind: 'group', label: 'research' },
  { kind: 'metric', id: 'simulated_task_score', value: '0.87', unit: '±0.02', aside: 'n=5' },
  { kind: 'skipped', id: 'mirror_score', reason: 'skipped · not selected' },
]

/** Seeds tab: two-qubit count per seed; the chosen seed is outlined (states board). */
export const SEEDS = [
  { seed: 11, h: 86 },
  { seed: 23, h: 98 },
  { seed: 37, h: 80 },
  { seed: 41, h: 92 },
  { seed: 53, h: 84 },
  { seed: 67, h: 75, chosen: true, label: '44' },
  { seed: 79, h: 90 },
  { seed: 97, h: 94 },
]
