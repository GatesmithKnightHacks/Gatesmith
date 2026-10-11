/*
 * S-12 · Repo dashboard data: qlab/sidechain-packing on main at 9c41e2a, three circuits, five runs of
 * sidechain_qaoa.qasm since Oct 4. The timeline plots runs (jobs), never the rounds of one run; the
 * latest run is 7f3a·0412, done at 11:42 with 270 two-qubit gates.
 */

export const REPO = 'qlab/sidechain-packing'
export const HEAD = '9c41e2a'

/** The one pull request, named the same on every screen. */
export const PR = { n: '#41', title: 'Reorder commuting block in sidechain_qaoa' }

export type Highest = 'high' | 'warning' | 'info' | 'none'

export type RepoCircuit = {
  id: string
  file: string
  qubits: number
  gates: string
  trend: string
  /** trend tone: white for a change, secondary for flat, tertiary for one run */
  trendTone: 'change' | 'flat' | 'one'
  open: number
  highest: Highest
  lastTime: string
  lastWhat: string
  /** Inspector · Selected circuit */
  latest: string
  runs: string
  top: { rule: string; severity: Highest } | null
}

export const CIRCUITS: RepoCircuit[] = [
  {
    id: 'sidechain_qaoa',
    file: 'sidechain_qaoa.qasm',
    qubits: 12,
    gates: '270 gates',
    trend: '▼ −15.9%',
    trendTone: 'change',
    open: 2,
    highest: 'high',
    lastTime: '11:42',
    lastWhat: `PR ${PR.n}`,
    latest: '270 gates',
    runs: '5 runs · since Oct 4',
    top: { rule: 'D01 Routing-dominated', severity: 'high' },
  },
  {
    id: 'sbox_oracle',
    file: 'sbox_oracle.qasm',
    qubits: 20,
    gates: '1041 gates',
    trend: 'flat',
    trendTone: 'flat',
    open: 4,
    highest: 'high',
    lastTime: '10:40',
    lastWhat: 'push main',
    latest: '1041 gates',
    runs: '4 runs · since Oct 5',
    top: { rule: 'D01 Routing-dominated', severity: 'high' },
  },
  {
    id: 'ghz_8',
    file: 'ghz_8.qasm',
    qubits: 8,
    gates: '7 gates',
    trend: '1 run',
    trendTone: 'one',
    open: 0,
    highest: 'none',
    lastTime: 'yesterday',
    lastWhat: 'push main',
    latest: '7 gates',
    runs: '1 run · Oct 9',
    top: null,
  },
]

/** "many": eight circuits over 30 days (the six extra are conformance fixtures kept in the repo). */
export const MANY_CIRCUITS: RepoCircuit[] = [
  CIRCUITS[0],
  { ...CIRCUITS[1], gates: '1018 gates', trend: '▼ −2.2%', trendTone: 'change', runs: '7 runs · since Sep 13' },
  mk('bv_10', 10, '20 gates', '▼ −9.1%', 0, 'none', '09:12'),
  mk('qft_8', 8, '98 gates', '▼ −18.3%', 1, 'warning', '08:55'),
  mk('adder_4', 4, '55 gates', '▼ −12.7%', 2, 'warning', 'yesterday'),
  mk('vqe_h2_4q', 4, '18 gates', '▼ −5.3%', 0, 'none', 'yesterday'),
  mk('maxcut_6', 6, '75 gates', '▼ −1.3%', 1, 'info', 'Oct 8'),
  mk('grover_5q', 5, '101 gates', '▲ +1.0%', 1, 'warning', 'Oct 8'),
]

function mk(id: string, qubits: number, gates: string, trend: string, open: number, highest: Highest, lastTime: string): RepoCircuit {
  return { id, file: `${id}.qasm`, qubits, gates, trend, trendTone: 'change', open, highest, lastTime, lastWhat: 'push main', latest: gates, runs: '6 runs · since Sep 12', top: null }
}

/* ── Timeline series: x in ticks (one per day on the main board), y in % vs the circuit's first run ── */
export type Pt = { x: number; y: number }
/** A label pinned to point i: dx/dy from the point, aligned by its start, end or center. */
export type Label = { i: number; text: string; dx: number; dy: number; align: 'start' | 'end' | 'center' }
export type Series = {
  id: string
  points: Pt[]
  /** labels on the points while this series is the selected one */
  labels?: Label[]
  /** one summary label while it is not selected */
  summary?: Label
  /** a single run draws an open ring instead of a dot */
  single?: boolean
}

const pct = (g: number) => (100 * (g - 321)) / 321

/** Oct 4 … Oct 10, one tick per day. 7f3a·0412 is the last point of sidechain_qaoa (Oct 10, 11:42). */
export const DAY_TICKS = ['Oct 4', 'Oct 5', 'Oct 6', 'Oct 7', 'Oct 8', 'Oct 9', 'Oct 10']

export const SERIES: Series[] = [
  {
    id: 'sbox_oracle',
    points: [
      { x: 1, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0.3 },
      { x: 6, y: 0 },
    ],
    labels: [{ i: 3, text: '1041 gates · flat', dx: 12, dy: -6, align: 'start' }],
    summary: { i: 3, text: 'sbox_oracle.qasm · 1041 gates · flat', dx: -8, dy: -23, align: 'end' },
  },
  {
    id: 'ghz_8',
    points: [{ x: 5, y: 0 }],
    single: true,
    labels: [{ i: 0, text: '7 gates · 1 run', dx: 12, dy: -6, align: 'start' }],
    summary: { i: 0, text: 'ghz_8.qasm · 7 gates · 1 run', dx: -8, dy: 6, align: 'end' },
  },
  {
    id: 'sidechain_qaoa',
    points: [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: pct(298) },
      { x: 5, y: pct(281) },
      { x: 6, y: pct(270) },
    ],
    labels: [
      { i: 0, text: '321 gates', dx: 0, dy: -20, align: 'center' },
      { i: 2, text: '298 gates', dx: 10, dy: -17.5, align: 'start' },
      { i: 3, text: '281 gates', dx: 10, dy: -17.5, align: 'start' },
      { i: 4, text: '270 gates · −15.9%', dx: 12, dy: -6, align: 'start' },
    ],
    summary: { i: 4, text: 'sidechain_qaoa.qasm · 270 gates · −15.9%', dx: 12, dy: -6, align: 'start' },
  },
]

/* ── one run: a point per circuit, no trend yet (x in hours from 09:00) ── */
export const HOUR_TICKS = ['09:00', '10:00', '11:00', '12:00', '13:00']
export const ONE_RUN_SERIES: Series[] = [
  { id: 'ghz_8', points: [{ x: 1 / 3, y: 0 }], single: true, summary: { i: 0, text: 'ghz_8.qasm · 7 gates', dx: 8, dy: -20, align: 'start' } },
  { id: 'sbox_oracle', points: [{ x: 1.5, y: 0 }], summary: { i: 0, text: 'sbox_oracle.qasm · 1041 gates', dx: 8, dy: 8, align: 'start' } },
  {
    id: 'sidechain_qaoa',
    points: [{ x: 19 / 6, y: 0 }],
    labels: [{ i: 0, text: 'sidechain_qaoa.qasm · 321 gates', dx: -8, dy: -20, align: 'end' }],
  },
]

/* ── many: eight circuits, 30 days (x in weeks from Sep 12) ── */
export const WEEK_TICKS = ['Sep 12', 'Sep 19', 'Sep 26', 'Oct 3', 'Oct 10']
const w = (pts: number[][]): Pt[] => pts.map(([d, y]) => ({ x: d / 7, y }))
export const MANY_SERIES: Series[] = [
  ...[
    [[-1, 0], [3, -1.2], [8, -3.0], [12, -2.6], [17, -6.1], [21, -6.4], [26, -8.8], [28, -9.1]],
    [[1, 0], [6, 1.4], [11, 0.8], [15, -0.5], [20, -0.2], [25, -1.9], [28, -2.2]],
    [[4, 0], [7, -4.4], [13, -11.8], [18, -13.0], [23, -17.6], [27, -18.3]],
    [[0, 0], [5, 0.3], [10, 0.3], [16, 2.9], [19, 2.4], [24, 1.1], [28, 1.0]],
    [[9, 0], [14, -2.2], [17, -2.0], [22, -4.9], [28, -5.3]],
    [[2, 0], [8, -0.8], [14, -0.8], [20, -1.4], [26, -1.3]],
    [[11, 0], [15, -6.0], [19, -9.4], [25, -10.1], [28, -12.7]],
  ].map((p, k) => ({ id: `other-${k}`, points: w(p) })),
  {
    id: 'sidechain_qaoa',
    points: w([
      [22, 0],
      [24, 0],
      [25, pct(298)],
      [27, pct(281)],
      [28, pct(270)],
    ]),
  },
]

/* ── Inspector · PR comments (last 3) ── */
export type PrComment = { n: string; title: string; verdict: 'improved' | 'regressed' | 'first run' }
export const PR_COMMENTS: PrComment[] = [
  { n: PR.n, title: PR.title, verdict: 'improved' },
  { n: '#40', title: 'Reuse sbox ancillas', verdict: 'regressed' },
  { n: '#38', title: 'Add ghz_8 benchmark', verdict: 'first run' },
]
