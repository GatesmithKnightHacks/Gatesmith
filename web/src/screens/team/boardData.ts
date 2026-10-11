/*
 * S-14 Leaderboard data: every improve layer on the same qscore conform kit (12 fixtures × 20 attempts =
 * 240 requests per row), qscore-2026.1. Rates carry the 95% binomial interval at n = 240.
 * Local to the screen; the engine's leaderboard table can replace it row for row.
 */

export type Rate = { value: number; ci: number }

export type LayerRow = {
  id: string
  /** rank by verified-improvement rate; null when the layer failed the kit (listed last, unranked) */
  rank: number | null
  model: string
  /** layer name used in the run's Layers list */
  layer: 'local' | 'hf' | 'engine'
  where: string
  prompt: string | null
  proposals: number
  parsed: number
  passed: number
  accepted: number
  parse: Rate
  verified: Rate
  vir: Rate
  /** s per request */
  latency: number
  /** M tokens over the 240 requests; null for the engine */
  tokens: number | null
  /** $ over the 240 requests */
  cost: number
  conform: string
  /** fixtures passed of 12 */
  kit: number
  /** the layer failed the kit: why, and where */
  failed?: { code: string; word: string; edits: number; on: string[] }
}

export const REQUESTS = 240
export const FIXTURE_COUNT = 12
export const ATTEMPTS = 20

export const LAYERS: LayerRow[] = [
  { id: 'qwen14', rank: 1, model: 'Qiskit/Qwen2.5-Coder-14B-Qiskit', layer: 'local', where: 'local · exclusive GPU', prompt: 'p-2026.1', proposals: 236, parsed: 232, passed: 167, accepted: 100, parse: { value: 98.3, ci: 1.6 }, verified: { value: 72.0, ci: 5.7 }, vir: { value: 41.7, ci: 6.2 }, latency: 8.4, tokens: 1.92, cost: 0, conform: '7f34·2c1d', kit: 12 },
  { id: 'reference', rank: 2, model: 'reference-qiskit', layer: 'engine', where: 'engine · deterministic', prompt: null, proposals: 240, parsed: 240, passed: 240, accepted: 81, parse: { value: 100.0, ci: 0 }, verified: { value: 100.0, ci: 0 }, vir: { value: 33.8, ci: 6.0 }, latency: 0.9, tokens: null, cost: 0, conform: '7f33·0a91', kit: 12 },
  { id: 'granite', rank: 3, model: 'Qiskit/granite-3.3-8b-qiskit', layer: 'local', where: 'local · GPU machine', prompt: 'p-2026.1', proposals: 231, parsed: 222, passed: 136, accepted: 68, parse: { value: 96.1, ci: 2.5 }, verified: { value: 61.3, ci: 6.2 }, vir: { value: 28.3, ci: 5.7 }, latency: 3.1, tokens: 1.41, cost: 0, conform: '7f35·77e0', kit: 12 },
  { id: 'qwen32', rank: 4, model: 'Qwen2.5-Coder-32B', layer: 'hf', where: 'hf · platform router', prompt: 'p-2026.1', proposals: 228, parsed: 209, passed: 110, accepted: 53, parse: { value: 91.7, ci: 3.5 }, verified: { value: 52.6, ci: 6.4 }, vir: { value: 22.1, ci: 5.2 }, latency: 5.6, tokens: 1.66, cost: 2.16, conform: '7f32·c6d2', kit: 12 },
  { id: 'granite-old', rank: 5, model: 'Qiskit/granite-3.3-8b-qiskit', layer: 'local', where: 'local · GPU machine', prompt: 'p-2025.4', proposals: 225, parsed: 190, passed: 94, accepted: 42, parse: { value: 84.4, ci: 4.6 }, verified: { value: 49.5, ci: 6.5 }, vir: { value: 17.5, ci: 4.8 }, latency: 3.0, tokens: 1.38, cost: 0, conform: '7f24·5e17', kit: 12 },
  { id: 'llama', rank: 6, model: 'llama3.1-8b', layer: 'local', where: 'local · GPU machine', prompt: 'p-2026.1', proposals: 219, parsed: 173, passed: 66, accepted: 28, parse: { value: 79.0, ci: 5.2 }, verified: { value: 38.2, ci: 6.4 }, vir: { value: 11.7, ci: 4.1 }, latency: 2.7, tokens: 1.29, cost: 0, conform: '7f31·81fa', kit: 12 },
]

/** Failed the kit (state failed-kit): listed last, unranked, rates still reported. */
export const FAILED_LAYER: LayerRow = {
  id: 'qwen7',
  rank: null,
  model: 'Qwen2.5-Coder-7B',
  layer: 'local',
  where: 'local',
  prompt: 'p-2026.1',
  proposals: 233,
  parsed: 206,
  passed: 53,
  accepted: 22,
  parse: { value: 88.4, ci: 4.1 },
  verified: { value: 25.7, ci: 6.0 },
  vir: { value: 9.2, ci: 3.7 },
  latency: 2.2,
  tokens: 1.21,
  cost: 0,
  conform: '7f36·4be2',
  kit: 9,
  failed: { code: 'Q403', word: 'region edits', edits: 3, on: ['bv_10', 'adder_4', 'hhl_4'] },
}

/** reference-qiskit is in every run's Layers list (the engine layer), so it is the current layer. */
export const CURRENT_LAYER_ID = 'reference'

export const FIXTURES = ['ghz_8', 'qft_8', 'grover_5q', 'vqe_h2_4q', 'maxcut_6', 'packing_qaoa_p2', 'bv_10', 'sbox_oracle', 'adder_4', 'hhl_4', 'qpe_6', 'w_state_5']

/** reference-qiskit accepted per fixture (of 20): the white ticks on the chart. Sums to 81. */
export const REFERENCE_BY_FIXTURE = [9, 7, 6, 7, 7, 8, 10, 4, 8, 4, 6, 5]

/** Qiskit/granite-3.3-8b-qiskit p-2026.1 accepted per fixture, as on the board. Sums to 68. */
const GRANITE_BY_FIXTURE = [5, 4, 9, 5, 10, 11, 6, 2, 6, 3, 4, 3]

/** Accepted per fixture: the board's numbers for granite and the reference, the same shape scaled for the rest. */
export function byFixture(row: LayerRow): number[] {
  if (row.id === 'granite') return GRANITE_BY_FIXTURE
  if (row.id === 'reference') return REFERENCE_BY_FIXTURE
  const base = GRANITE_BY_FIXTURE.reduce((a, b) => a + b, 0)
  const raw = GRANITE_BY_FIXTURE.map((v) => (v * row.accepted) / base)
  const out = raw.map((v) => Math.min(ATTEMPTS, Math.floor(v)))
  let left = row.accepted - out.reduce((a, b) => a + b, 0)
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (left <= 0) break
    if (out[i] < ATTEMPTS) {
      out[i]++
      left--
    }
  }
  return out
}

export const PROMPT_NOTES: Record<string, { title: string; meta: string; lines: string[] }> = {
  'p-2026.1': {
    title: 'What p-2026.1 changed',
    meta: 'vs p-2025.4',
    lines: ["Sends the finding's evidence lines, not the whole file", 'Asks for one block rewrite per proposal', 'Returns OpenQASM only, so parse rate rose to 96.1%'],
  },
  'p-2025.4': {
    title: 'What p-2025.4 sends',
    meta: 'replaced by p-2026.1',
    lines: ['The whole file with the finding as a comment', 'Several block rewrites per proposal', 'Prose around the QASM, so parse rate is 84.4%'],
  },
  engine: {
    title: 'What reference-qiskit runs',
    meta: 'no model',
    lines: ['routing_search over the 8 fixed seeds', 'layout_search at optimization level 3', 'block_resynthesis on two-qubit blocks'],
  },
}

/** The three definitions, long form ("How rates are counted"). S-16 Model bench quotes these verbatim. */
export const RATE_DEFINITIONS = [
  { name: 'Parse rate', def: 'proposals that parse ÷ proposals returned' },
  { name: 'Verified rate', def: 'passed ÷ parsed' },
  { name: 'Verified-improvement rate', def: 'accepted ÷ requests attempted, the headline' },
] as const

/** The command that puts a layer on the board. */
export const CONFORM_COMMAND = 'qscore conform --layer local --prompt p-2026.1'
