/*
 * Each S-07 state is a moment of run 7f3a·0412: what the Rounds lanes, the primary lane, the scorecard
 * and the circuit show then. Card positions are the board's (plot 932 px = 600 s).
 */
import type { AxisData, CardData, LaneData, PrimaryData } from './Rounds'
import type { Block2 } from './FinalCanvas'
import { gatesY } from './data'

export type Moment = 'stop' | 'run400' | 'offline' | 'stalled' | 'user-stop' | 'budget' | 'error' | 'after-r3' | 'empty'

/* ── Cards that never change once decided ───────────────────────────── */
const REF_R1: CardData = { round: 1, left: 4, width: 139, strategy: 'routing_search', status: 'accepted', note: '92 s', bars: [48, 45], value: '298 gates', foot: ['attempt 1'] }
const REF_R2: CardData = { round: 2, left: 189, width: 185, strategy: 'block_resynthesis', status: 'inconclusive', note: 'QCEC timeout', bars: [48, 48], value: '298 gates', foot: ['attempt 3'] }
const LOC_R1: CardData = { round: 1, left: 4, width: 181, strategy: 'commutation_aware_routing', status: 'rejected', note: '2q depth', bars: [45, 48], value: '214 > 202 layers', foot: ['attempt 2'] }
const LOC_R2: CardData = { round: 2, left: 189, width: 185, strategy: 'commutation_aware_routing', status: 'accepted', note: 'block 1', bars: [48, 45], value: '281 gates', foot: ['attempt 4'] }

const REF_R3_REJECTED: CardData = { round: 3, left: 393, width: 193, strategy: 'layout_search', status: 'rejected', note: 'not better', bars: [47, 48], value: '283 > 281 gates', foot: ['attempt 5'] }
const LOC_R3_ACCEPTED: CardData = { round: 3, left: 393, width: 193, strategy: 'commutation_aware_routing', status: 'accepted', note: 'block 2', bars: [48, 46], value: '270 gates', foot: ['attempt 6'] }
const REF_R4_REJECTED: CardData = { round: 4, left: 594, width: 163, strategy: 'routing_search', status: 'rejected', note: '+2 gates', bars: [47, 48], value: '272 gates', foot: ['attempt 7'] }
const LOC_R4_INCONCLUSIVE: CardData = { round: 4, left: 594, width: 163, strategy: 'block_resynthesis', status: 'inconclusive', note: 'QCEC', bars: [48, 48], value: '270 gates', foot: ['attempt 8'] }

const REF_R3_VERIFYING: CardData = { round: 3, left: 393, width: 227, strategy: 'layout_search', status: 'verifying', note: '32 seeds', bars: [48, 'pending'], value: 'pending', valueMuted: true, foot: ['attempt 5'] }
const LOC_R3_PROPOSED: CardData = { round: 3, left: 393, width: 227, strategy: 'commutation_aware_routing', status: 'proposed', note: 'block 2 · parse ok', bars: [48, 'pending'], value: 'verifying', valueMuted: true, foot: ['attempt 6'] }
const REF_R4_QUEUED: CardData = { round: 4, left: 642, width: 230, strategy: 'routing_search', status: 'queued', foot: ['round 4 · after round 3 decides', 'attempt 7'] }
const LOC_R4_QUEUED: CardData = { round: 4, left: 642, width: 230, strategy: 'block_resynthesis', status: 'queued', foot: ['round 4 · D04 top block', 'attempt 8'] }

/* ── Axes ─────────────────────────────────────────────────────────────── */
const TICKS = { s0: { at: 6, label: '0 s' }, s100: { at: 162, label: '100' }, s200: { at: 317, label: '200' }, s300: { at: 473, label: '300' }, s400: { at: 629, label: '400' }, s500: { at: 784, label: '500' }, s600: { at: 0, label: '600', right: true } }
const R123 = [
  { at: 6, label: 'R1' },
  { at: 191, label: 'R2' },
]

const AXIS_STOP: AxisData = {
  fill: 761,
  ticks: [TICKS.s0, TICKS.s100, TICKS.s200, TICKS.s300, TICKS.s400, TICKS.s600],
  rounds: [...R123, { at: 395, label: 'R3' }, { at: 596, label: 'R4' }],
  pipes: [185, 389, 590],
  needle: { x: 761, label: '490 s' },
}

const AXIS_400: AxisData = {
  fill: 623,
  ticks: [TICKS.s0, TICKS.s100, TICKS.s200, TICKS.s300, { ...TICKS.s400, hot: true }, TICKS.s500, TICKS.s600],
  rounds: [...R123, { at: 395, label: 'R3', tone: 'now' }, { at: 644, label: 'R4', tone: 'later' }],
  pipes: [185, 389, 638],
  needle: { x: 623 },
}

/* ── Primary lane pieces ──────────────────────────────────────────────── */
const BASE = { x: 0, y: gatesY(321), label: '321 baseline' }
const S_R1 = { x: 143, y: gatesY(298), label: '298 · −23 · R1 accepted' }
const S_R2 = { x: 374, y: gatesY(281), label: '281 · −17 · R2 accepted' }
const S_R3 = { x: 586, y: gatesY(270), label: '270 · −11 · R3 accepted' }
const L1 = { x: 6, label: 'R1', ref: 'accepted', refWord: 'accepted', local: 'rejected', localWord: 'rejected' } as const
const L2 = { x: 191, label: 'R2', ref: 'inconclusive', refWord: 'inconclusive', local: 'accepted', localWord: 'accepted' } as const
const L3 = { x: 395, label: 'R3', ref: 'rejected', refWord: 'rejected', local: 'accepted', localWord: 'accepted' } as const
const L4 = { x: 596, label: 'R4', ref: 'rejected', refWord: 'rejected', local: 'inconclusive', localWord: 'inconclusive' } as const

/* ── Scorecard ────────────────────────────────────────────────────────── */
export type ScoreRow = { name: string; primary?: boolean; base: number | null; now: number; tick?: number; delta?: string; high?: boolean; value: string; unit: string }
export type FindingRow = { rule: string; title: string; status: 'high' | 'accepted' }
export type Scorecard = { title: string; meta: string; rows: ScoreRow[]; findingsMeta: string; findings: FindingRow[] } | 'loading'

const ROWS_R4: ScoreRow[] = [
  { name: 'two_qubit_count', primary: true, base: 44, now: 37, delta: '−51', value: '270', unit: 'gates' },
  { name: 'two_qubit_depth', base: 44, now: 39, delta: '−24', value: '178', unit: 'layers' },
  { name: 'routing_overhead', base: null, now: 31, tick: 22, high: true, value: '0.421', unit: 'ratio' },
  { name: 'resynthesis_potential', base: null, now: 26, tick: 4, high: true, value: '6', unit: 'gates' },
]
const ROWS_R2: ScoreRow[] = [
  { name: 'two_qubit_count', primary: true, base: 44, now: 39, delta: '−40', value: '281', unit: 'gates' },
  { name: 'two_qubit_depth', base: 44, now: 40, delta: '−18', value: '184', unit: 'layers' },
  { name: 'routing_overhead', base: null, now: 33, tick: 22, high: true, value: '0.446', unit: 'ratio' },
  { name: 'resynthesis_potential', base: null, now: 26, tick: 4, high: true, value: '6', unit: 'gates' },
]
const ROWS_BASE: ScoreRow[] = [
  { name: 'two_qubit_count', primary: true, base: 44, now: 44, value: '321', unit: 'gates' },
  { name: 'two_qubit_depth', base: 44, now: 44, value: '202', unit: 'layers' },
  { name: 'routing_overhead', base: null, now: 38, tick: 22, high: true, value: '0.514', unit: 'ratio' },
  { name: 'resynthesis_potential', base: null, now: 39, tick: 4, high: true, value: '9', unit: 'gates' },
]
const F_FINAL: FindingRow[] = [
  { rule: 'D01', title: 'Routing-dominated', status: 'high' },
  { rule: 'D04', title: 'Resynthesizable blocks', status: 'high' },
  { rule: 'D03', title: 'Commuting block · blocks 1 and 2', status: 'accepted' },
]
const F_R2: FindingRow[] = [
  { rule: 'D01', title: 'Routing-dominated', status: 'high' },
  { rule: 'D03', title: 'Commuting block · block 2', status: 'high' },
  { rule: 'D04', title: 'Resynthesizable blocks', status: 'high' },
  { rule: 'D03', title: 'Commuting block · block 1', status: 'accepted' },
]
const F_BASE: FindingRow[] = [
  { rule: 'D01', title: 'Routing-dominated', status: 'high' },
  { rule: 'D03', title: 'Commuting block · block 1', status: 'high' },
  { rule: 'D03', title: 'Commuting block · block 2', status: 'high' },
  { rule: 'D04', title: 'Resynthesizable blocks', status: 'high' },
]

/* ── Moments ──────────────────────────────────────────────────────────── */
export type MomentData = {
  axis: AxisData
  lanes: LaneData[]
  primary?: PrimaryData
  scorecard: Scorecard
  block2: Block2 | 'none'
  block2Label?: string
  circuitMeta: string
  readout: string
}

const ref = (meta: string, cards: CardData[], tail?: LaneData['tail'], extra?: LaneData['extra']): LaneData => ({ layer: 'reference', meta, cards, tail, extra })
const local = (meta: string, cards: CardData[], tail?: LaneData['tail'], extra?: LaneData['extra']): LaneData => ({ layer: 'local', meta, cards, tail, extra })

const STOP: MomentData = {
  axis: AXIS_STOP,
  lanes: [
    ref('1 of 4 accepted', [REF_R1, REF_R2, REF_R3_REJECTED, REF_R4_REJECTED], { left: 763, text: 'engine stopped' }),
    local('2 of 4 accepted', [LOC_R1, LOC_R2, LOC_R3_ACCEPTED, LOC_R4_INCONCLUSIVE], { left: 763, text: 'no round 5 · budget met' }),
  ],
  primary: { now: '270 now ·', delta: '−15.9%', steps: [BASE, S_R1, S_R2, S_R3], end: 761, tail: { x: 771, y: 137.2, label: 'stopped · 490 s' }, legend: [L1, L2, L3, L4] },
  scorecard: { title: 'after R4', meta: 're-diagnosed · 4.1 s', rows: ROWS_R4, findingsMeta: '2 open · 2 accepted', findings: F_FINAL },
  block2: 'accepted',
  circuitMeta: 'final · 12 q · 31 layers',
  readout: '490 of 900 s · stopped',
}

const RUN400: MomentData = {
  axis: AXIS_400,
  lanes: [
    ref('3 attempts · 1 accepted', [REF_R1, REF_R2, REF_R3_VERIFYING, REF_R4_QUEUED]),
    local('3 attempts · 1 accepted', [LOC_R1, LOC_R2, LOC_R3_PROPOSED, LOC_R4_QUEUED]),
  ],
  primary: {
    now: '281 now · 321 base ·',
    delta: '−12.5%',
    steps: [BASE, S_R1, S_R2],
    end: 623,
    pending: { from: 623, y: gatesY(281), label: '281 until round 3 decides' },
    legend: [L1, L2],
  },
  scorecard: { title: 'after R2', meta: 're-diagnosed · 4.1 s', rows: ROWS_R2, findingsMeta: '3 open · 1 accepted', findings: F_R2 },
  block2: 'proposed',
  circuitMeta: 'after R2 · 12 q · 33 layers',
  readout: '400 of 900 s',
}

const OFFLINE: MomentData = {
  ...RUN400,
  lanes: [
    RUN400.lanes[0],
    local(
      '1 queued',
      [LOC_R1, LOC_R2, { round: 3, left: 393, width: 227, strategy: 'commutation_aware_routing', status: 'queued', foot: ['waits for the GPU machine', 'attempt 6'] }],
      { left: 630, text: 'engine runs on CPU' },
      'gpu-off',
    ),
  ],
  block2: 'open',
  block2Label: 'D03 block 2 · open · waits for the GPU',
}

const STALLED: MomentData = {
  axis: AXIS_STOP,
  lanes: [
    ref('1 of 4 accepted', [REF_R1, REF_R2, REF_R3_REJECTED, { ...REF_R4_REJECTED, value: '283 gates' }], { left: 763, text: 'stalled after R4' }),
    local(
      '1 of 4 accepted',
      [LOC_R1, LOC_R2, { ...LOC_R3_ACCEPTED, status: 'rejected', note: '2q depth', bars: [45, 48], value: '214 > 202 layers' }, { ...LOC_R4_INCONCLUSIVE, value: '281 gates' }],
      { left: 763, text: 'waits for you' },
    ),
  ],
  primary: {
    now: '281 now ·',
    delta: '−12.5%',
    steps: [BASE, S_R1, S_R2],
    end: 761,
    tail: { x: 771, y: gatesY(281) + 4, label: 'stalled · 490 s' },
    legend: [L1, L2, { ...L3, local: 'rejected', localWord: 'rejected' }, L4],
  },
  scorecard: { title: 'after R4', meta: 're-diagnosed · 4.1 s', rows: ROWS_R2, findingsMeta: '3 open · 1 accepted', findings: F_R2 },
  block2: 'open',
  circuitMeta: 'after R4 · 12 q · 33 layers',
  readout: '490 of 900 s · stalled',
}

const USER_STOP: MomentData = {
  axis: {
    fill: 623,
    ticks: [TICKS.s0, TICKS.s100, TICKS.s200, TICKS.s300, TICKS.s500, TICKS.s600],
    rounds: [...R123, { at: 395, label: 'R3' }],
    pipes: [185, 389],
    needle: { x: 623, label: '400 s' },
  },
  lanes: [
    ref('3 attempts · 1 accepted', [REF_R1, REF_R2, { ...REF_R3_VERIFYING, status: 'cancelled', note: 'stopped by you', bars: [48, null], value: 'not scored' }], { left: 630, text: 'no round 4' }),
    local('3 attempts · 1 accepted', [LOC_R1, LOC_R2, { ...LOC_R3_PROPOSED, status: 'cancelled', note: 'discarded', bars: [48, null], value: 'not verified', look: 'default' }], { left: 630, text: 'no round 4' }),
  ],
  primary: {
    now: '281 now ·',
    delta: '−12.5%',
    steps: [BASE, S_R1, S_R2],
    end: 623,
    tail: { x: 633, y: gatesY(281) + 4, label: 'stopped by you · 400 s' },
    legend: [L1, L2, { x: 395, label: 'R3', ref: 'cancelled', refWord: 'cancelled', local: 'cancelled', localWord: 'cancelled' }],
  },
  scorecard: { title: 'after R2', meta: 're-diagnosed · 4.1 s', rows: ROWS_R2, findingsMeta: '3 open · 1 accepted', findings: F_R2 },
  block2: 'open',
  block2Label: 'D03 block 2 · open · R3 discarded',
  circuitMeta: 'after R2 · 12 q · 33 layers',
  readout: '400 of 900 s · cancelled',
}

/*
 * Budget hit: a slower run where four rounds fill the whole 900 s. The axis is rescaled so 900 s sits at
 * 790 px, left of the lane metas, and each round gets 225 s.
 */
const B = (s: number) => Math.round((s / 900) * 790)
const bcard = (c: CardData, round: 1 | 2 | 3 | 4, note?: string): CardData => ({ ...c, round, left: B((round - 1) * 225) + 4, width: B(225) - 8, note: note ?? c.note })
const BUDGET: MomentData = {
  axis: {
    fill: B(900),
    ticks: [
      { at: 6, label: '0 s' },
      { at: B(150) + 6, label: '150' },
      { at: B(300) + 6, label: '300' },
      { at: B(450) + 6, label: '450' },
      { at: B(600) + 6, label: '600' },
      { at: B(750) + 6, label: '750' },
    ],
    rounds: [1, 2, 3, 4].map((r) => ({ at: B((r - 1) * 225) + 6, label: `R${r}` })),
    pipes: [B(225), B(450), B(675)],
    needle: { x: B(900), label: '900 s' },
  },
  lanes: [
    ref('1 of 4 accepted', [bcard(REF_R1, 1, 'passed'), bcard(REF_R2, 2), bcard(REF_R3_REJECTED, 3), bcard(REF_R4_REJECTED, 4)], { left: B(900) + 2, text: 'budget reached' }),
    local('2 of 4 accepted', [bcard(LOC_R1, 1), bcard(LOC_R2, 2), bcard(LOC_R3_ACCEPTED, 3), bcard(LOC_R4_INCONCLUSIVE, 4)], { left: B(900) + 2, text: 'no round 5' }),
  ],
  primary: {
    now: '270 now ·',
    delta: '−15.9%',
    steps: [BASE, { ...S_R1, x: B(190) }, { ...S_R2, x: B(420) }, { ...S_R3, x: B(650) }],
    end: B(900),
    tail: { x: B(900) + 10, y: gatesY(270) + 4, label: '900 s · budget' },
    legend: [1, 2, 3, 4].map((r) => ({ ...[L1, L2, L3, L4][r - 1], x: B((r - 1) * 225) + 6 })),
  },
  scorecard: { title: 'after R4', meta: 're-diagnosed · 4.1 s', rows: ROWS_R4, findingsMeta: '2 open · 2 accepted', findings: F_FINAL },
  block2: 'accepted',
  circuitMeta: 'final · 12 q · 31 layers',
  readout: '900 of 900 s · budget',
}

const ERROR: MomentData = {
  ...RUN400,
  lanes: [
    ref(
      '1 of 3 accepted · 1 failed',
      [REF_R1, REF_R2, { round: 3, left: 393, width: 227, strategy: 'layout_search', status: 'failed', note: 'transpile failed · seed 5', bars: [48, null], value: '7 of 8 seeds', foot: ['attempt 5'], look: 'bad' }],
      { left: 624, text: 'R4 waits for retry' },
    ),
    local('3 attempts · 1 accepted', [LOC_R1, LOC_R2, { round: 3, left: 393, width: 227, strategy: 'commutation_aware_routing', status: 'queued', foot: ['waits for the retry', 'attempt 6'] }], { left: 624, text: 'R4 waits for retry' }),
  ],
  primary: { ...RUN400.primary!, pending: { from: 623, y: gatesY(281), label: '281 until round 3 is retried' } },
  block2: 'open',
  block2Label: 'D03 block 2 · open · waits for the retry',
  readout: '400 of 900 s · failed',
}

const AFTER_R3: MomentData = {
  axis: {
    fill: 592,
    ticks: [TICKS.s0, TICKS.s100, TICKS.s200, TICKS.s300, TICKS.s500, TICKS.s600],
    rounds: [...R123, { at: 395, label: 'R3', tone: 'now' }, { at: 644, label: 'R4', tone: 'later' }],
    pipes: [185, 389, 638],
    needle: { x: 592, label: '381 s' },
  },
  lanes: [
    ref('3 attempts · 1 accepted', [REF_R1, REF_R2, REF_R3_REJECTED, { ...REF_R4_QUEUED, foot: ['round 4 · next', 'attempt 7'] }]),
    local('3 attempts · 2 accepted', [LOC_R1, LOC_R2, LOC_R3_ACCEPTED, LOC_R4_QUEUED]),
  ],
  primary: {
    now: '270 now · 321 base ·',
    delta: '−15.9%',
    steps: [BASE, S_R1, S_R2, { ...S_R3, labelX: 600 }],
    end: 592,
    pending: { from: 592, y: gatesY(270), label: '' },
    legend: [L1, L2, L3],
  },
  scorecard: 'loading',
  block2: 'accepted',
  circuitMeta: 'after R3 · 12 q · 31 layers',
  readout: '381 of 900 s',
}

const EMPTY: MomentData = {
  axis: {
    fill: 0,
    ticks: [TICKS.s0, TICKS.s100, TICKS.s200, TICKS.s300, TICKS.s400, TICKS.s500, TICKS.s600],
    rounds: [],
    pipes: [],
  },
  lanes: [],
  scorecard: { title: 'baseline', meta: 'diagnosed · 4.1 s', rows: ROWS_BASE, findingsMeta: '4 open', findings: F_BASE },
  block2: 'none',
  circuitMeta: 'baseline · 12 q · 33 layers',
  readout: '0 of 900 s',
}

export const MOMENTS: Record<Moment, MomentData> = {
  stop: STOP,
  run400: RUN400,
  offline: OFFLINE,
  stalled: STALLED,
  'user-stop': USER_STOP,
  budget: BUDGET,
  error: ERROR,
  'after-r3': AFTER_R3,
  empty: EMPTY,
}
