/* The verification ladder per engine outcome: allowed, equivalent, re-scored, decided. */
import type { MarkKind } from './style'
import type { Rung } from './parts'

export type Outcome = 'accepted' | 'rejected' | 'inconclusive' | 'invalid' | 'verifying' | 'loading' | 'waiting'

/* ── Ladders per outcome ─────────────────────────────────────────────── */
const R = (label: string, kind: MarkKind, word: string, bar: Rung['bar']): Rung => ({ label, kind, word, bar })

export function ladderFor(o: Outcome, step = 2): Rung[] {
  switch (o) {
    case 'accepted':
      return [R('allowed', 'passed', 'passed', 'done'), R('equivalent', 'passed', 'passed', 'done'), R('re-scored', 'passed', 'passed', 'done'), R('decided', 'accepted', 'accepted', 'done')]
    case 'rejected':
      return [R('allowed', 'passed', 'passed', 'done'), R('equivalent', 'passed', 'passed', 'done'), R('re-scored', 'failed', 'failed', 'bad'), R('decided', 'rejected', 'rejected', 'bad')]
    case 'inconclusive':
      return [R('allowed', 'passed', 'passed', 'done'), R('equivalent', 'inconclusive', 'inconclusive', 'warn'), R('re-scored', 'skipped', 'skipped', 'off'), R('decided', 'inconclusive', 'inconclusive', 'warn')]
    case 'invalid':
      return [R('allowed', 'invalid', 'invalid', 'bad'), R('equivalent', 'skipped', 'skipped', 'off'), R('re-scored', 'skipped', 'skipped', 'off'), R('decided', 'invalid', 'invalid', 'bad')]
    case 'loading':
      return [R('allowed', 'passed', 'passed', 'done'), R('equivalent', 'passed', 'passed', 'done'), R('re-scored', 'running', 'running', 'running'), R('decided', 'queued', 'queued', 'off')]
    case 'verifying':
      return step <= 1
        ? [R('allowed', 'running', 'running', 'running'), R('equivalent', 'queued', 'queued', 'off'), R('re-scored', 'queued', 'queued', 'off'), R('decided', 'queued', 'queued', 'off')]
        : [R('allowed', 'passed', 'passed', 'done'), R('equivalent', 'running', 'running', 'running'), R('re-scored', 'queued', 'queued', 'off'), R('decided', 'queued', 'queued', 'off')]
    case 'waiting':
      return [R('allowed', 'queued', 'queued', 'off'), R('equivalent', 'queued', 'queued', 'off'), R('re-scored', 'queued', 'queued', 'off'), R('decided', 'queued', 'queued', 'off')]
  }
}

