/*
 * S-04 view data: the scorecard as drawn at 400 s (MVN-0 20HZ-0), the seeds behind "best of 8", and the
 * Rounds geometry (time axis 0–600 s on a 932 px plot). Values come from ../../data/demo; bar lengths are
 * the board's (36 px track: the baseline bar on top, now below, the threshold tick).
 */
import { metric, RUN } from '../../data/demo'

export type LineMark = 'open' | 'accepted' | 'selected'

/* ── Status colors (the master's mark grammar) ───────────────────────── */

export type Mark = 'high' | 'warning' | 'accepted' | 'passed' | 'rejected' | 'inconclusive' | 'verifying' | 'running' | 'proposed' | 'queued' | 'unavailable' | 'skipped' | 'pending'

export const C = {
  high: 'var(--color-signal-bad)',
  warning: 'var(--color-signal-warn)',
  accepted: 'var(--color-signal-good)',
  rejected: 'var(--color-signal-bad)',
  inconclusive: 'var(--color-signal-warn)',
  verifying: 'var(--color-signal-info)',
  proposed: 'var(--color-signal-ai)',
  queued: 'var(--color-text-tertiary)',
} as const

/** The word color for a mark. */
export function markColor(m: Mark): string {
  switch (m) {
    case 'high':
    case 'rejected':
      return C.high
    case 'warning':
    case 'inconclusive':
      return C.warning
    case 'accepted':
      return C.accepted
    case 'verifying':
    case 'running':
      return C.verifying
    case 'proposed':
      return C.proposed
    case 'passed':
      return 'var(--color-text-secondary)'
    default:
      return 'var(--color-text-tertiary)'
  }
}


export type ScoreRow =
  | { kind: 'group'; label: string; note?: string; noteSize?: 10 | 11 }
  | {
      kind: 'metric'
      name: string
      now: string
      unit: string
      /** bar lengths in px of 36: baseline, now; tick position */
      bars?: [number, number]
      tick?: number
      /** the rule fires: now bar pink and the "high" word instead of the delta */
      fires?: boolean
      delta?: string
      /** a word in the bar column instead of bars ("cv 0.12") */
      aside?: string
      primary?: boolean
      /** no bottom rule (the caveat line follows) */
      open?: boolean
    }
  | { kind: 'caveat'; text: string }
  | { kind: 'status'; name: string; note: string; status: 'unavailable' | 'skipped' | 'pending'; last?: boolean }

const fmt = (name: string, which: 'baseline' | 'afterR2') => {
  const m = metric(name)
  const v = m[which]!
  return m.digits ? v.toFixed(m.digits) : String(v)
}
const delta = (name: string, digits?: number) => {
  const m = metric(name)
  const d = m.afterR2! - m.baseline!
  const s = digits != null ? Math.abs(d).toFixed(digits) : String(Math.abs(Math.round(d)))
  return `${d < 0 ? '−' : '+'}${s}`
}

/** The scorecard at 400 s: after round 2, against the baseline. */
export const SCORE_ROWS: ScoreRow[] = [
  { kind: 'group', label: 'resources', note: 'bars baseline · now · tick threshold', noteSize: 10 },
  { kind: 'metric', name: 'width', now: '12', unit: 'qubits' },
  { kind: 'metric', name: 'depth', now: fmt('depth', 'afterR2'), unit: 'layers', bars: [36, 33], delta: delta('depth') },
  { kind: 'metric', name: 'two_qubit_count', now: fmt('two_qubit_count', 'afterR2'), unit: 'gates', bars: [36, 32], delta: delta('two_qubit_count'), primary: true },
  { kind: 'metric', name: 'two_qubit_depth', now: fmt('two_qubit_depth', 'afterR2'), unit: 'layers', bars: [36, 33], delta: delta('two_qubit_depth') },
  { kind: 'group', label: 'hardware', note: `${RUN.target} · seed ${RUN.bestSeed} · level ${RUN.optimizationLevel}`, noteSize: 11 },
  { kind: 'metric', name: 'routing_overhead', now: fmt('routing_overhead', 'afterR2'), unit: 'ratio', bars: [31, 27], tick: 18, fires: true },
  { kind: 'metric', name: 'swaps_inserted', now: fmt('swaps_inserted', 'afterR2'), unit: 'gates', bars: [36, 27], delta: delta('swaps_inserted') },
  { kind: 'metric', name: 'compile_ratio', now: fmt('compile_ratio', 'afterR2'), unit: 'ratio', bars: [36, 31], delta: delta('compile_ratio', 2) },
  { kind: 'metric', name: 'reliability_heuristic', now: fmt('reliability_heuristic', 'afterR2'), unit: '(0, 1]', bars: [31, 36], delta: delta('reliability_heuristic', 3), open: true },
  { kind: 'caveat', text: metric('reliability_heuristic').note! },
  { kind: 'metric', name: 'scheduled_duration', now: fmt('scheduled_duration', 'afterR2'), unit: 'µs', bars: [36, 32], delta: delta('scheduled_duration', 1) },
  { kind: 'metric', name: 'seed_spread', now: fmt('seed_spread', 'afterR2'), unit: 'ratio', bars: [11, 8], tick: 18, delta: delta('seed_spread', 3) },
  { kind: 'group', label: 'opportunities' },
  { kind: 'metric', name: 'entanglement_variance', now: '9', unit: 'gates²', aside: 'cv 0.12' },
  { kind: 'metric', name: 'resynthesis_potential', now: fmt('resynthesis_potential', 'afterR2'), unit: 'gates', bars: [32, 21], tick: 3, fires: true },
  { kind: 'group', label: 'research' },
  { kind: 'status', name: 'simulated_task_score', note: 'not in the MVP build', status: 'unavailable' },
  { kind: 'status', name: 'mirror_score', note: 'not selected', status: 'skipped', last: true },
]

/** The first score's resource rows, baseline only (DS-06 scoring frame). */
export const BASELINE_ROWS: ScoreRow[] = [
  { kind: 'group', label: 'resources' },
  { kind: 'metric', name: 'width', now: '12', unit: 'qubits' },
  { kind: 'metric', name: 'depth', now: fmt('depth', 'baseline'), unit: 'layers' },
  { kind: 'metric', name: 'two_qubit_count', now: fmt('two_qubit_count', 'baseline'), unit: 'gates', primary: true },
  { kind: 'metric', name: 'two_qubit_depth', now: fmt('two_qubit_depth', 'baseline'), unit: 'layers' },
]

/** two_qubit_count per seed after round 2; seed 37 is the best (281), spread = (max − min) ÷ best = 0.071. */
export const SEEDS = [
  { seed: 11, gates: 296 },
  { seed: 23, gates: 289 },
  { seed: 37, gates: 281 },
  { seed: 41, gates: 301 },
  { seed: 53, gates: 292 },
  { seed: 67, gates: 285 },
  { seed: 79, gates: 298 },
  { seed: 97, gates: 293 },
] as const

/* ── Rounds geometry ─────────────────────────────────────────────────── */

/** The plot is 932 px wide; the board puts 100 s every 155.75 px (400 s at 623 px). */
export const PLOT_W = 932
export const PX_PER_S = 623 / 400
export const xOf = (s: number, zoom = 1) => s * PX_PER_S * zoom

/** Card boxes on the plot as the master draws them at 400 s, [left, width] in px. */
export const CARD_BOX: Record<number, [number, number]> = {
  1: [4, 139],
  2: [4, 181],
  3: [189, 196],
  4: [189, 196],
  5: [393, 227],
  6: [393, 227],
  7: [642, 230],
  8: [642, 230],
}

/** Round labels and their tick positions on the axis (px). */
export const ROUND_TICKS = [
  { label: 'R1', x: 6, tick: null },
  { label: 'R2', x: 191, tick: 185 },
  { label: 'R3', x: 395, tick: 389 },
  { label: 'R4', x: 644, tick: 638 },
] as const

export const AXIS_LABELS = [
  { label: '0 s', x: 6 },
  { label: '100', x: 162 },
  { label: '200', x: 317 },
  { label: '300', x: 473 },
  { label: '400', x: 629 },
  { label: '500', x: 784 },
] as const

/**
 * The full scorecard before round 2 lands (the first score, then round 1): baseline values, the rules
 * that fire marked, no deltas yet. two_qubit_count follows the run (321, then 298 after R1).
 */
export function baselineScoreRows(twoQubit: number): ScoreRow[] {
  return SCORE_ROWS.map((row) => {
    if (row.kind !== 'metric' || row.name === 'width') return row
    if (row.name === 'entanglement_variance') return row
    const m = metric(row.name)
    const now = row.name === 'two_qubit_count' ? String(twoQubit) : m.digits ? m.baseline!.toFixed(m.digits) : String(m.baseline)
    const fires = row.fires
    return {
      ...row,
      now,
      delta: undefined,
      bars: fires ? ([row.bars![0], row.bars![0]] as [number, number]) : undefined,
      tick: fires ? row.tick : undefined,
    }
  }).map((row) => (row.kind === 'group' && row.label === 'resources' ? { ...row, note: 'baseline · best of 8', noteSize: 10 as const } : row))
}

/** Line marks for a point of the run: block 1 accepted, block 2 open with line 48 selected. */
export function lineMarks({ block1, block2, selectedLine }: { block1?: 'open' | 'accepted'; block2?: 'open' | 'accepted'; selectedLine?: number }) {
  const marks: Record<number, LineMark> = {}
  if (block1) for (let n = 6; n <= 44; n++) marks[n] = block1
  if (block2) for (let n = 48; n <= 86; n++) marks[n] = block2
  if (selectedLine) marks[selectedLine] = 'selected'
  return marks
}
