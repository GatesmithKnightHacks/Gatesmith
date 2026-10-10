/* S-14 Leaderboard data: 12 conformance fixtures × 20 requests, qscore-2026.1. */

export type BenchRow = {
  id: string
  model: string
  provider: string
  where: 'local' | 'platform'
  layer: string
  prompt: string | null
  proposals: number
  parse: number // %
  verified: number // %
  vir: number // verified-improvement rate, %
  latency: number // s
  tokens: number // M
  cost: number // $
  conform: string
}

export const REQUESTS = 240

export const BENCH: BenchRow[] = [
  { id: 'qwen-v3', model: 'qwen2.5-coder-32b', provider: 'vllm', where: 'platform', layer: 'gatesmith-improve', prompt: 'v3', proposals: 236, parse: 98.3, verified: 72.0, vir: 41.7, latency: 8.4, tokens: 1.92, cost: 2.16, conform: '7f29·3b10' },
  { id: 'reference', model: 'transpile level 3', provider: 'qiskit', where: 'local', layer: 'reference-qiskit', prompt: null, proposals: 240, parse: 100.0, verified: 100.0, vir: 33.8, latency: 0.9, tokens: 0, cost: 0, conform: '7f26·0a91' },
  { id: 'granite-v3', model: 'granite-8b-qiskit', provider: 'ollama', where: 'local', layer: 'gatesmith-improve', prompt: 'v3', proposals: 231, parse: 96.1, verified: 61.3, vir: 28.3, latency: 3.1, tokens: 1.41, cost: 0, conform: '7f35·77e0' },
  { id: 'deepseek-v3', model: 'deepseek-coder-v2-16b', provider: 'ollama', where: 'local', layer: 'gatesmith-improve', prompt: 'v3', proposals: 228, parse: 91.7, verified: 52.6, vir: 22.1, latency: 5.6, tokens: 1.66, cost: 0, conform: '7f28·c6d2' },
  { id: 'granite-v2', model: 'granite-8b-qiskit', provider: 'ollama', where: 'local', layer: 'gatesmith-improve', prompt: 'v2', proposals: 225, parse: 84.4, verified: 49.5, vir: 17.5, latency: 3.0, tokens: 1.38, cost: 0, conform: '7f24·5e17' },
  { id: 'llama-v3', model: 'llama3.1-8b', provider: 'ollama', where: 'local', layer: 'gatesmith-improve', prompt: 'v3', proposals: 219, parse: 79.0, verified: 38.2, vir: 11.7, latency: 2.7, tokens: 1.29, cost: 0, conform: '7f27·81fa' },
]

export const FIXTURES = ['ghz_8', 'qft_8', 'grover_5q', 'vqe_h2_4q', 'maxcut_6', 'packing_qaoa_p2', 'bv_10', 'sbox_oracle', 'adder_4', 'hhl_4', 'qpe_6', 'w_state_5']

/** reference-qiskit accepted per fixture (of 20), the grey ticks on the chart. */
export const REFERENCE_BY_FIXTURE = [10, 6, 5, 7, 6, 9, 8, 4, 9, 5, 7, 5]

const GRANITE_V3 = [9, 4, 7, 5, 8, 11, 6, 2, 7, 3, 4, 2]

/** Accepted per fixture for a row: the board's numbers for granite v3 and the reference, scaled for the rest. */
export function byFixture(row: BenchRow): number[] {
  if (row.id === 'granite-v3') return GRANITE_V3
  if (row.id === 'reference') return REFERENCE_BY_FIXTURE
  const total = accepted(row)
  const base = GRANITE_V3.reduce((a, b) => a + b, 0)
  const raw = GRANITE_V3.map((v) => (v * total) / base)
  const out = raw.map((v) => Math.min(20, Math.floor(v)))
  let left = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (left <= 0) break
    if (out[i] < 20) (out[i]++, left--)
  }
  return out
}

export const accepted = (r: BenchRow) => Math.round((REQUESTS * r.vir) / 100)
export const parsed = (r: BenchRow) => Math.round((r.proposals * r.parse) / 100)
export const passed = (r: BenchRow) => Math.round((parsed(r) * r.verified) / 100)

export const PROMPT_NOTES: Record<string, { title: string; meta: string; lines: string[] }> = {
  v3: {
    title: 'What prompt v3 changed',
    meta: 'vs v2',
    lines: [
      "Sends the finding's evidence lines, not the whole file",
      'Asks for one block rewrite per proposal',
      'Returns OpenQASM only, so parse rate rose to 96.1%',
    ],
  },
  v2: {
    title: 'What prompt v2 sends',
    meta: 'replaced by v3',
    lines: ['The whole file with the finding as a comment', 'Several rewrites per proposal', 'Prose around the QASM, so parse rate is 84.4%'],
  },
  reference: {
    title: 'What reference-qiskit runs',
    meta: 'no model',
    lines: ['routing_search over the 8 fixed seeds', 'layout_search with SABRE at level 3', 'block_resynthesis on two-qubit blocks'],
  },
}
