/* S-15 data. Round 3 is the Paper snapshot; round 4 is what "Verify top 2" sends next. */

export type Verdict = {
  status: 'accepted' | 'rejected' | 'inconclusive'
  value: string
  sub: string
}

export type Candidate = {
  rank: number
  name: string
  layer: 'local' | 'reference-qiskit' | 'hf'
  ref: string
  /** predicted change in two_qubit_count, gates */
  predicted: number
  lo: number
  hi: number
  /** verified change, drawn as a diamond once the engine returns */
  verifiedAt?: number
  verdict: Verdict
}

export const LAYER_DOT: Record<Candidate['layer'], string> = {
  local: '#867BFA',
  hf: '#867BFA',
  'reference-qiskit': '#2EA3F8',
}

/** The interval plot: 0 at x 152.9, 28.6 px per gate (−5 … +2). */
export const xOf = (v: number) => Math.round((152.9 + 28.6 * v) * 10) / 10

export const ROUND3: Candidate[] = [
  {
    rank: 1,
    name: 'commuting_reorder',
    layer: 'local',
    ref: 'D03#1',
    predicted: -3.2,
    lo: -4.1,
    hi: -2.3,
    verifiedAt: -3,
    verdict: { status: 'accepted', value: '−3 gates', sub: '36 → 33 gates' },
  },
  {
    rank: 2,
    name: 'layout_search',
    layer: 'reference-qiskit',
    ref: 'D01#1',
    predicted: -2.1,
    lo: -3.0,
    hi: -1.2,
    verifiedAt: -1,
    verdict: { status: 'rejected', value: '−1 gate', sub: 'depth +6 layers' },
  },
  { rank: 3, name: 'block_resynthesis', layer: 'hf', ref: 'D04#1', predicted: -1.4, lo: -2.6, hi: -0.2, verdict: { status: 'rejected', value: '0 gates', sub: 'depth +2 layers' } },
  { rank: 4, name: 'reversible_rewrite', layer: 'local', ref: 'D04#2', predicted: -0.9, lo: -2.0, hi: 0.2, verdict: { status: 'inconclusive', value: '0 gates', sub: 'exact check timed out' } },
  { rank: 5, name: 'routing_search', layer: 'reference-qiskit', ref: 'D01#2', predicted: -0.4, lo: -1.1, hi: 0.3, verdict: { status: 'rejected', value: '+1 gate', sub: '36 → 37 gates' } },
  { rank: 6, name: 'commuting_reorder', layer: 'local', ref: 'D03#2', predicted: 0.6, lo: -0.4, hi: 1.6, verdict: { status: 'rejected', value: '+1 gate', sub: '36 → 37 gates' } },
]

/* Round 4 keeps the canonical story: reference routing_search rejected, local block_resynthesis inconclusive. */
export const ROUND4: Candidate[] = [
  { rank: 1, name: 'block_resynthesis', layer: 'local', ref: 'D04#1', predicted: -1.8, lo: -2.9, hi: -0.7, verdict: { status: 'inconclusive', value: '0 gates', sub: 'exact check timed out' } },
  { rank: 2, name: 'routing_search', layer: 'reference-qiskit', ref: 'D01#1', predicted: -1.1, lo: -2.0, hi: -0.2, verifiedAt: 1, verdict: { status: 'rejected', value: '+1 gate', sub: '33 → 34 gates' } },
  { rank: 3, name: 'layout_search', layer: 'reference-qiskit', ref: 'D01#2', predicted: -0.6, lo: -1.5, hi: 0.3, verifiedAt: 2, verdict: { status: 'rejected', value: '+2 gates', sub: '33 → 35 gates' } },
  { rank: 4, name: 'commuting_reorder', layer: 'local', ref: 'D03#1', predicted: -0.4, lo: -1.2, hi: 0.4, verifiedAt: 0, verdict: { status: 'rejected', value: '0 gates', sub: 'depth +2 layers' } },
  { rank: 5, name: 'reversible_rewrite', layer: 'local', ref: 'D04#2', predicted: -0.2, lo: -1.0, hi: 0.6, verdict: { status: 'inconclusive', value: '0 gates', sub: 'exact check timed out' } },
  { rank: 6, name: 'block_resynthesis', layer: 'hf', ref: 'D04#3', predicted: 0.3, lo: -0.5, hi: 1.1, verifiedAt: 1, verdict: { status: 'rejected', value: '+1 gate', sub: '33 → 34 gates' } },
]

export const fmtChange = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`
export const fmtGates = (v: number) => `${fmtChange(v)} gates`
export const fmtRange = (lo: number, hi: number) => `${fmtChange(lo)} to ${fmtChange(hi)}`

export const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six']
