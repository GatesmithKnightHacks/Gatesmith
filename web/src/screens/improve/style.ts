/* Status colors and the focus ring for S-06 and S-07 (not components, so fast refresh stays clean). */
import type { CSSProperties } from 'react'

export type MarkKind =
  | 'accepted'
  | 'passed'
  | 'ok'
  | 'rejected'
  | 'failed'
  | 'invalid'
  | 'high'
  | 'inconclusive'
  | 'warning'
  | 'queued'
  | 'skipped'
  | 'running'
  | 'verifying'
  | 'done'
  | 'proposed'
  | 'cancelled'
  | 'paused'

/** Word color per status. "ok" is a passed check whose word stays white (fact rows). */
export const WORD: Record<MarkKind, string> = {
  accepted: 'var(--color-signal-good)',
  passed: 'var(--color-signal-good)',
  ok: 'var(--color-text-primary)',
  rejected: 'var(--color-signal-bad)',
  failed: 'var(--color-signal-bad)',
  invalid: 'var(--color-signal-bad)',
  high: 'var(--color-signal-bad)',
  inconclusive: 'var(--color-signal-warn)',
  warning: 'var(--color-signal-warn)',
  queued: 'var(--color-text-tertiary)',
  skipped: 'var(--color-text-tertiary)',
  running: 'var(--color-signal-info)',
  verifying: 'var(--color-signal-info)',
  done: 'var(--color-signal-info)',
  proposed: 'var(--color-signal-ai)',
  cancelled: 'var(--color-text-secondary)',
  paused: 'var(--color-text-secondary)',
}

export const wordColor = (k: MarkKind) => WORD[k]

export const FOCUS_RING: CSSProperties = { outline: '2px solid var(--color-signal-select)', outlineOffset: 2 }
