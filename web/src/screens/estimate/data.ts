/*
 * S-05 · Machine estimate data: the final circuit (270 two-qubit gates) priced on five fake backends.
 * Shots scale with reliability (4 000 × 0.263 ÷ reliability_heuristic) at about 1.02 ms per shot,
 * 96 $ per QPU minute. FakeTorino's numbers come from the run (COST, RELIABILITY); the other four are
 * the board's estimates for the same circuit.
 */
import { COST, RELIABILITY, RUN } from '../../data/demo'

export type Backend = {
  name: string
  qubits: number
  /** reliability_heuristic, final circuit and baseline */
  rel: { final: number; baseline: number }
  /** QPU seconds per run */
  time: { final: number; baseline: number }
  /** $ per run */
  cost: { final: number; baseline: number }
  target?: boolean
}

export const BACKENDS: Backend[] = [
  {
    name: RUN.target,
    qubits: RUN.targetQubits,
    rel: { final: RELIABILITY.final, baseline: RELIABILITY.baseline },
    time: { final: COST.final.qpuSeconds, baseline: COST.baseline.qpuSeconds },
    cost: { final: COST.final.perRun, baseline: COST.baseline.perRun },
    target: true,
  },
  { name: 'FakeBrisbane', qubits: 127, rel: { final: 0.241, baseline: 0.192 }, time: { final: 4.5, baseline: 5.8 }, cost: { final: 7.12, baseline: 9.2 } },
  { name: 'FakeSherbrooke', qubits: 127, rel: { final: 0.274, baseline: 0.221 }, time: { final: 3.9, baseline: 5.0 }, cost: { final: 6.27, baseline: 8.0 } },
  { name: 'FakeKyiv', qubits: 127, rel: { final: 0.229, baseline: 0.183 }, time: { final: 4.7, baseline: 6.0 }, cost: { final: 7.5, baseline: 9.66 } },
  { name: 'FakeMarrakesh', qubits: 156, rel: { final: 0.296, baseline: 0.244 }, time: { final: 3.6, baseline: 4.5 }, cost: { final: 5.8, baseline: 7.24 } },
]

/** Bars are 280 px for reliability_heuristic 0 to 1. */
export const BAR = 280
export const barWidth = (v: number) => Math.round(v * BAR)

export const usd = (v: number) => v.toFixed(2)
export const sec = (v: number) => v.toFixed(1)

/**
 * Cost per run after each round (index 0 = baseline) on a backend. FakeTorino is the run's own
 * series; the others scale it to their baseline and land on their final estimate.
 */
export function perRound(b: Backend): number[] {
  if (b.target) return [...COST.perRound]
  const scale = b.cost.baseline / COST.perRound[0]
  const series = COST.perRound.map((v) => Math.round(v * scale * 100) / 100)
  series[3] = b.cost.final
  series[4] = b.cost.final
  return series
}

export const saving = (b: Backend) => ({
  perRun: b.cost.baseline - b.cost.final,
  pct: (b.cost.final / b.cost.baseline - 1) * 100,
})

/** "−19.6%": a real minus sign, one decimal. */
export const signedPct = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}%`

/** The calibration snapshot every estimate uses. */
export const SNAPSHOT_DATE = 'Oct 9'

export const CAVEAT = RELIABILITY.label
