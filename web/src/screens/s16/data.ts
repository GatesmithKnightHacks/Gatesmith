/*
 * S-16 · Model bench: three in-house gate-group layers benched on fixture subsets with qscore conform
 * (12 fixtures × 20 attempts). Rates use S-14's definitions verbatim; every rate carries ±CI95 and n.
 * Values as on Paper 1CJS-0 and its states board 1LWU-0.
 */

/** The three rate definitions, verbatim from S-14 "How rates are counted". */
export const RATE_DEFINITIONS = [
  'Parse rate: proposals that parse ÷ proposals returned',
  'Verified rate: passed ÷ parsed',
  'Verified-improvement rate: accepted ÷ requests attempted, the headline',
] as const

export type BenchRow = {
  id: string
  model: string
  size: string
  fixtures: string[]
  proposals: number
  subsets: number
  parse: { rate: string; ci: string; n: number }
  verified: { rate: string; ci: string; n: number }
  /** verified-improvement rate; bar is the share of the 60 px track, tick the reference's share */
  vir: { rate: string; ci: string; n: number; ref: string; bar: number; tick: number }
  latency: string
  tokens: string
  cost: string
}

export const BENCH: BenchRow[] = [
  {
    id: 'clifford',
    model: 'gategroup-clifford-0.2',
    size: '0.3B',
    fixtures: ['ghz_8 · bv_10'],
    proposals: 40,
    subsets: 2,
    parse: { rate: '97.5%', ci: '±4.8', n: 40 },
    verified: { rate: '92.3%', ci: '±8.4', n: 39 },
    vir: { rate: '55.0%', ci: '±15.4', n: 40, ref: '47.5%', bar: 33, tick: 28 },
    latency: '0.6 s',
    tokens: '0.02 M',
    cost: '0.00 $',
  },
  {
    id: 'linear',
    model: 'gategroup-linear-0.2',
    size: '0.3B',
    fixtures: ['ghz_8 · bv_10 · maxcut_6', 'packing_qaoa_p2'],
    proposals: 80,
    subsets: 4,
    parse: { rate: '98.8%', ci: '±2.4', n: 80 },
    verified: { rate: '81.0%', ci: '±8.6', n: 79 },
    vir: { rate: '45.0%', ci: '±10.9', n: 80, ref: '42.5%', bar: 27, tick: 25 },
    latency: '0.7 s',
    tokens: '0.05 M',
    cost: '0.00 $',
  },
  {
    id: 'reversible',
    model: 'gategroup-reversible-0.1',
    size: '0.6B',
    fixtures: ['sbox_oracle · adder_4', 'grover_5q'],
    proposals: 60,
    subsets: 3,
    parse: { rate: '93.3%', ci: '±6.3', n: 60 },
    verified: { rate: '67.9%', ci: '±12.2', n: 56 },
    vir: { rate: '26.7%', ci: '±11.2', n: 60, ref: '30.0%', bar: 16, tick: 18 },
    latency: '1.1 s',
    tokens: '0.04 M',
    cost: '0.00 $',
  },
]

/** Loss per epoch, as plotted on the board (x = epoch, y = px on the 340-tall chart). */
export const TRAIN: [number, number][] = [
  [0, 49.3], [2, 105.1], [4, 155.2], [6, 192.3], [8, 215], [10, 232.9], [12, 248.9], [14, 261.3], [16, 268],
  [18, 273], [20, 278.7], [24, 285.6], [28, 287], [32, 290.9], [34, 290.8], [36, 290.8], [40, 291.9],
]
export const VALIDATION: [number, number][] = [
  [0, 50.3], [2, 119.3], [4, 146.6], [6, 178.9], [8, 203.2], [10, 222.1], [12, 236.5], [14, 247.5], [16, 256],
  [18, 262.5], [20, 267.3], [24, 274], [28, 278], [32, 280.1], [34, 281.1], [36, 280.9], [40, 279.9],
]

/** qscore conform kit: 12 fixtures, each run 20 times (240 requests). */
export const KIT = [
  { label: 'Parses as OpenQASM', value: '6 checks' },
  { label: 'Equivalent to the input block', value: '8 checks' },
  { label: 'Stays inside its block', value: '6 checks' },
  { label: 'Within token and time budget', value: '4 checks' },
]

export type HistoryRow = { at: string; job: string; word: 'passed' | 'failed'; note: string }
export const HISTORY: HistoryRow[] = [
  { at: '11:20', job: '7f3d·2a10', word: 'passed', note: '12 of 12 fixtures' },
  { at: '10:02', job: '7f3c·91b2', word: 'failed', note: 'Q403 ×2 · Q404' },
  { at: '09:15', job: '7f3b·4e70', word: 'passed', note: '12 of 12 fixtures' },
  { at: 'Oct 9', job: '7f37·0d21', word: 'passed', note: '12 of 12 fixtures' },
]

/** The failed conform run 7f3c·91b2: Q403 twice, Q404 once (error-codes.md). */
export const CONFORM_FAILURES = [
  { what: 'outside allowed region', code: 'Q403', fixture: 'adder_4', where: 'block 2 is q0 to q2, lines 31 to 38 · the rewrite changed a cx on q3' },
  { what: 'outside allowed region', code: 'Q403', fixture: 'sbox_oracle', where: 'block 5 ends at line 112 · a ccx on q7 q8 q12 moved past the block edge' },
  { what: 'added qubit', code: 'Q404', fixture: 'grover_5q', where: 'block 1, lines 9 to 22 · the rewrite added ancilla q5, the input has 5 qubits' },
]

export const THROUGHPUT = 'M28 70L40 66L52 40L64 34L76 31L88 36L100 30L112 33L124 29L136 35L148 31L160 28L172 33L184 30L196 34L208 29L220 32L232 31L244 28L256 33L268 30L274 31'

export const FIXTURE_SUBSETS = [
  { layer: 'gategroup-clifford-0.2', fixtures: 'ghz_8 · bv_10' },
  { layer: 'gategroup-linear-0.2', fixtures: 'ghz_8 · bv_10 · maxcut_6 · packing_qaoa_p2' },
  { layer: 'gategroup-reversible-0.1', fixtures: 'sbox_oracle · adder_4 · grover_5q' },
]
