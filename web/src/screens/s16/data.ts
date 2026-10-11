/* S-16 data: block D04 on q9–q10, three proposers, the bench table and the bench set. */

export type ModelId = 'inhouse' | 'granite' | 'base'

export type Box = { x: number; y: number; label: 'RZ' | 'RX'; changed?: boolean }

export type Rewrite = {
  title: string
  meta: string
  /** CX positions on the q9 → q10 pair */
  cx: number[]
  boxes: Box[]
  status: { word: string; kind: 'rewrite' | 'passes'; text: string }
  target: string
  whole: string
  depth: string
  equivalence: string
  replay: { status: 'accepted' | 'rejected'; value: string }
}

const RX: Box[] = [
  { x: 258, y: 47, label: 'RX' },
  { x: 258, y: 79, label: 'RX' },
]

export const INPUT = {
  cx: [44, 112, 172, 238],
  boxes: [
    { x: 62, y: 47, label: 'RZ' },
    { x: 62, y: 79, label: 'RZ' },
    { x: 130, y: 47, label: 'RZ' },
    { x: 190, y: 79, label: 'RZ' },
    ...RX,
  ] as Box[],
}

export const REWRITES: Record<ModelId, Rewrite> = {
  inhouse: {
    title: 'Output · in-house model',
    meta: '6 gates · 2 two-qubit',
    cx: [44, 238],
    boxes: [{ x: 62, y: 47, label: 'RZ', changed: true }, { x: 62, y: 79, label: 'RZ', changed: true }, ...RX],
    status: { word: 'rewrite', kind: 'rewrite', text: 'CX pair removed, RZs merged' },
    target: '4 → 2',
    whole: '36 → 34 gates',
    depth: '8 → 4 layers',
    equivalence: 'up to global phase',
    replay: { status: 'accepted', value: '−2 gates' },
  },
  granite: {
    title: 'Output · granite-8b-qiskit',
    meta: '8 gates · 3 two-qubit',
    cx: [44, 112, 238],
    boxes: [{ x: 62, y: 47, label: 'RZ' }, { x: 62, y: 79, label: 'RZ' }, { x: 148, y: 79, label: 'RZ', changed: true }, ...RX],
    status: { word: 'rewrite', kind: 'rewrite', text: 'one CX removed, RZ moved' },
    target: '4 → 3',
    whole: '36 → 35 gates',
    depth: '8 → 6 layers',
    equivalence: 'up to global phase',
    replay: { status: 'accepted', value: '−1 gate' },
  },
  base: {
    title: 'Output · reference-qiskit passes',
    meta: '9 gates · 4 two-qubit',
    cx: [44, 112, 172, 238],
    boxes: [{ x: 62, y: 47, label: 'RZ' }, { x: 62, y: 79, label: 'RZ' }, { x: 142, y: 47, label: 'RZ', changed: true }, ...RX],
    status: { word: 'passes', kind: 'passes', text: 'two RZs merged, no CX removed' },
    target: '4 → 4',
    whole: '36 → 36 gates',
    depth: '8 → 7 layers',
    equivalence: 'exact',
    replay: { status: 'rejected', value: '0 gates' },
  },
}

export type BenchRow = {
  id: ModelId
  rank: string
  name: string
  sub: string
  dot: string
  rate: number
  gain: string
  invalid: string
  latency: string
}

export const BENCH: BenchRow[] = [
  { id: 'inhouse', rank: '#1', name: 'in-house block model', sub: 'local · 0.3B · stretch', dot: '#867BFA', rate: 47, gain: '−1.9 gates', invalid: '2%', latency: '0.4 s' },
  { id: 'granite', rank: '#2', name: 'granite-8b-qiskit', sub: 'local · 8B', dot: '#867BFA', rate: 31, gain: '−1.1 gates', invalid: '9%', latency: '6.8 s' },
  { id: 'base', rank: 'base', name: 'reference-qiskit passes', sub: 'reference-qiskit · no model', dot: '#2EA3F8', rate: 22, gain: '−0.8 gates', invalid: '0%', latency: '0.1 s' },
]

/** 120 recorded blocks across 14 circuits; the eight largest. */
export const BENCH_SET = [
  { circuit: 'sidechain_qaoa', blocks: 18, widths: '2–4 q', inhouse: '52%', granite: '33%' },
  { circuit: 'maxcut_6', blocks: 14, widths: '2–3 q', inhouse: '57%', granite: '36%' },
  { circuit: 'qft_8', blocks: 12, widths: '2–5 q', inhouse: '41%', granite: '30%' },
  { circuit: 'adder_4', blocks: 11, widths: '3–5 q', inhouse: '36%', granite: '27%' },
  { circuit: 'grover_5q', blocks: 9, widths: '2–5 q', inhouse: '44%', granite: '29%' },
  { circuit: 'packing_qaoa_p2', blocks: 8, widths: '2–4 q', inhouse: '50%', granite: '31%' },
  { circuit: 'qpe_6', blocks: 7, widths: '2–4 q', inhouse: '43%', granite: '28%' },
  { circuit: 'vqe_h2_4q', blocks: 6, widths: '2–4 q', inhouse: '50%', granite: '33%' },
]

export const BY_WIDTH = [
  { label: '2 qubits', a: 58, b: 34 },
  { label: '3 qubits', a: 52, b: 33 },
  { label: '4 qubits', a: 47, b: 31 },
  { label: '5 qubits', a: 29, b: 27 },
]

export const INVALID: [string, string, string][] = [
  ['Could not parse the rewrite', '0', '41'],
  ['Not equivalent to the input', '11', '38'],
  ['Touched qubits outside the block', '8', '7'],
]
