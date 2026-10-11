/*
 * Real scorecards → the shapes the existing screens already render (Finding cards, ScoreRow lines).
 * The screens stay as designed; only their data source changes when a live run has finished.
 */
import type { ScoreRow } from '../screens/workspace/data'
import type { Finding } from '../ui/parts'
import type { ScorecardDoc } from './api'

/** Short names for the engine's rules (specs/07 §1), shown next to the rule id on each card. */
const RULE_NAMES: Record<string, string> = {
  D01: 'routing_overhead',
  D02: 'seed_spread',
  D03: 'commuting_block',
  D04: 'resynthesis',
  D05: 'clifford_linear_block',
  D06: 'reliability_hotspot',
  D07: 'decoherence',
  D08: 'entanglement_variance',
  D09: 'scaling',
  D10: 'task_score',
}

const SEVERITY_RANK = { high: 0, warning: 1, info: 2 } as const
const GROUPS = ['resources', 'hardware', 'opportunities', 'research'] as const

export function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return Math.abs(v) < 10 ? v.toPrecision(3) : v.toFixed(1)
}

function evidenceLine(f: ScorecardDoc['findings'][number]): string {
  const parts: string[] = []
  if (f.threshold) {
    const measured = f.evidence?.[f.threshold.name]
    if (typeof measured === 'number') parts.push(`${formatNumber(measured)} ≥ ${formatNumber(f.threshold.value)}`)
    else parts.push(`${f.threshold.name} ≥ ${formatNumber(f.threshold.value)}`)
  }
  if (f.region?.qubits.length) {
    const q = f.region.qubits
    parts.push(q.length > 4 ? `${q.length} q` : `q${q.join(',q')}`)
    const [a, b] = f.region.layers
    parts.push(a === b ? `layer ${a}` : `layers ${a}–${b}`)
  }
  return parts.join(' · ') || f.id
}

/** Unsuppressed findings, ranked by severity, then rule id (specs/07 §4 rank). */
export function findingsFrom(card: ScorecardDoc): Finding[] {
  return card.findings
    .filter((f) => !f.suppressed)
    .slice()
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.rule.localeCompare(b.rule))
    .map((f, i) => ({
      rank: i + 1,
      severity: f.severity,
      rule: f.rule,
      ruleName: RULE_NAMES[f.rule] ?? f.rule,
      title: f.title,
      evidence: evidenceLine(f),
    }))
}

export function suppressedCount(card: ScorecardDoc): number {
  return card.findings.filter((f) => f.suppressed).length
}

/** Scorecard tile rows, grouped as on the design board; every metric keeps its status (never blank). */
export function rowsFrom(card: ScorecardDoc): ScoreRow[] {
  const rows: ScoreRow[] = []
  for (const group of GROUPS) {
    const metrics = card.metrics.filter((m) => m.group === group)
    if (!metrics.length) continue
    const label = group === 'hardware' && card.target ? `hardware · ${card.target.name}` : group
    rows.push({ kind: 'group', label })
    for (const m of metrics) {
      if (m.status === 'failed') {
        rows.push({ kind: 'skipped', id: m.id, reason: `failed · ${m.error?.message ?? 'error'}` })
      } else if (m.status !== 'computed') {
        rows.push({ kind: 'skipped', id: m.id, reason: `${m.status} · ${m.reason ?? ''}`.trim() })
      } else if (typeof m.value === 'number') {
        const ci = m.uncertainty?.ci95
        rows.push({
          kind: 'metric',
          id: m.id,
          value: formatNumber(m.value),
          unit: m.unit ?? undefined,
          aside: ci ? `±${formatNumber((ci[1] - ci[0]) / 2)}` : undefined,
          note:
            m.id === 'reliability_heuristic'
              ? 'calibration-based reliability heuristic, not a success probability'
              : undefined,
        })
      } else {
        // Structured values (profiles, fits, block lists) live in the full scorecard and report.
        rows.push({ kind: 'metric', id: m.id, value: '—', aside: 'details in report' })
      }
    }
  }
  return rows
}
