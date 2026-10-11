/* Current engine records mapped to the Paper workspace; no scoring happens here (spec12 §1). */
import type { ScoreRow } from '../screens/workspace/data'
import type { Finding } from '../ui/parts'
import type { Job, JobEvent, ScorecardDoc } from './api'

export type LiveFinding = Finding & { id: string }
const RULE_NAMES: Record<string, string> = {
  D01: 'routing_overhead', D02: 'seed_spread', D03: 'commuting_block', D04: 'resynthesis',
  D05: 'clifford_linear_block', D06: 'reliability_hotspot', D07: 'decoherence',
  D08: 'entanglement_variance', D09: 'scaling', D10: 'task_score',
}
const SEVERITY_RANK = { high: 0, warning: 1, info: 2 } as const
const GROUPS = ['resources', 'hardware', 'opportunities', 'research'] as const

export function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return Math.abs(v) < 10 ? v.toPrecision(3) : v.toFixed(1)
}
function evidenceLine(f: ScorecardDoc['findings'][number]): string {
  const parts: string[] = []
  // Keep the measured evidence, rather than inventing a comparison direction from a threshold.
  if (Object.keys(f.evidence).length) parts.push(JSON.stringify(f.evidence))
  if (f.region) {
    const q = f.region.qubits
    if (q.length) parts.push(q.length > 4 ? `${q.length} q` : `q${q.join(',q')}`)
    const [a, b] = f.region.layers
    parts.push(`${f.region.scope} · ${a === b ? `layer ${a}` : `layers ${a}–${b}`}`)
  }
  return parts.join(' · ') || f.id
}
export function findingsFrom(card: ScorecardDoc): LiveFinding[] {
  return card.findings.filter((f) => !f.suppressed).slice()
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.rule.localeCompare(b.rule) || a.id.localeCompare(b.id))
    .map((f, i) => ({ id: f.id, rank: i + 1, severity: f.severity, rule: f.rule,
      ruleName: RULE_NAMES[f.rule] ?? f.rule, title: f.title, evidence: evidenceLine(f) }))
}
export function suppressedCount(card: ScorecardDoc): number {
  return card.findings.filter((f) => f.suppressed).length
}
export function rowsFrom(card: ScorecardDoc): ScoreRow[] {
  const rows: ScoreRow[] = []
  for (const group of GROUPS) {
    const metrics = card.metrics.filter((m) => m.group === group)
    if (!metrics.length) continue
    rows.push({ kind: 'group', label: group, note: group === 'hardware' && card.target ? card.target.name : undefined })
    for (const m of metrics) {
      if (m.status === 'failed') {
        rows.push({ kind: 'metric', name: m.id, now: 'failed', unit: '', open: true })
        rows.push({ kind: 'caveat', text: `${m.error!.type}: ${m.error!.message}` })
      } else if (m.status !== 'computed') {
        rows.push({ kind: 'status', name: m.id, status: m.status, note: m.reason! })
      } else {
        rows.push({ kind: 'metric', name: m.id, now: typeof m.value === 'number' ? formatNumber(m.value) : 'JSON',
          unit: m.unit ?? '', primary: m.id === 'two_qubit_count',
          aside: m.uncertainty ? `95% CI [${m.uncertainty.ci95.map(formatNumber).join(', ')}]` : undefined })
        if (typeof m.value !== 'number') rows.push({ kind: 'caveat', text: JSON.stringify(m.value) })
        if (m.id === 'reliability_heuristic') rows.push({ kind: 'caveat', text: 'Calibration-based reliability heuristic, not a success probability.' })
      }
    }
  }
  return rows
}

/** Progress reports state and event text; it never estimates elapsed time or a completion percentage. */
export function jobMessage(job: Job, events: JobEvent[]): string {
  if (job.state === 'failed') return `The job failed: ${job.error?.message ?? 'no error details were recorded'}`
  if (job.state === 'cancelled') return 'The job was cancelled'
  const latest = events.findLast((e) => e.data.message)
  if (latest?.data.message) return latest.data.message
  if (job.state === 'queued') return job.attempts > 0
    ? `Waiting for a worker after ${job.attempts} attempt(s), maximum ${job.max_attempts}`
    : 'Waiting for a worker to claim the job'
  if (job.state === 'claimed') return 'A worker claimed the job'
  if (job.state === 'running') {
    const item = events.findLast((e) => e.kind === 'item_started')?.data.item_id
    return item ? `Scoring ${item}` : 'The worker is running the engine'
  }
  if (job.state === 'done') return 'The worker finished the job'
  return 'The worker finished the job'
}
