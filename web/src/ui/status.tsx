/*
 * Status is always a word + an icon + a color (DS-04 · Status chip).
 * Engine vocabulary is verbatim: never rename "high" to "critical" or "inconclusive" to "unknown".
 */

export type Severity = 'info' | 'warning' | 'high'
export type Verify = 'passed' | 'failed' | 'inconclusive' | 'unsupported'
export type Decision = 'accepted' | 'rejected' | 'inconclusive' | 'invalid' | 'proposed' | 'verifying'
export type StatusWord = Severity | Verify | Decision | 'holds' | 'improved' | 'resolved' | 'queued' | 'running'

const COLOR: Record<StatusWord, string> = {
  info: 'var(--color-signal-info)',
  warning: 'var(--color-signal-warn)',
  high: 'var(--color-signal-bad)',
  passed: 'var(--color-signal-good)',
  failed: 'var(--color-signal-bad)',
  inconclusive: 'var(--color-signal-warn)',
  unsupported: 'var(--color-text-tertiary)',
  accepted: 'var(--color-signal-good)',
  rejected: 'var(--color-signal-bad)',
  invalid: 'var(--color-text-tertiary)',
  proposed: 'var(--color-violet-300)',
  verifying: 'var(--color-signal-info)',
  holds: 'var(--color-text-secondary)',
  improved: 'var(--color-signal-good)',
  resolved: 'var(--color-signal-good)',
  queued: 'var(--color-text-tertiary)',
  running: 'var(--color-signal-info)',
}

export function StatusIcon({ kind, size = 10 }: { kind: StatusWord; size?: number }) {
  const c = COLOR[kind]
  const s = { width: size, height: size, viewBox: '0 0 14 14', 'aria-hidden': true } as const
  switch (kind) {
    case 'high':
      return (
        <svg {...s}>
          <path d="M7 2v6M7 11v.5" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'warning':
      return (
        <svg {...s}>
          <path d="M7 2.5l5 9H2z" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )
    case 'info':
    case 'queued':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke={c} strokeWidth="1.6" />
        </svg>
      )
    case 'running':
    case 'verifying':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="3.5" fill={c} />
        </svg>
      )
    case 'passed':
    case 'accepted':
    case 'holds':
    case 'improved':
    case 'resolved':
      return (
        <svg {...s}>
          <path d="M2.5 7.5l3 3 6-7" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'failed':
    case 'rejected':
      return (
        <svg {...s}>
          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'inconclusive':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke={c} strokeWidth="1.6" strokeDasharray="2 2" />
        </svg>
      )
    case 'unsupported':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke={c} strokeWidth="1.5" />
          <path d="M4 10l6-6" stroke={c} strokeWidth="1.5" />
        </svg>
      )
    case 'invalid':
      return (
        <svg {...s}>
          <path d="M3.5 7h7" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'proposed':
      return (
        <svg {...s}>
          <path d="M7 1.5l1.4 4.1L12.5 7 8.4 8.4 7 12.5 5.6 8.4 1.5 7l4.1-1.4z" fill="none" stroke={c} strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      )
  }
}

/** Icon + word in the status color. `size` is the font size; 12 in cards, 11 in dense tables. */
export function Status({ kind, label, size = 12, gap = 4 }: { kind: StatusWord; label?: string; size?: 11 | 12; gap?: number }) {
  return (
    <span className="status" style={{ color: COLOR[kind], gap, fontSize: size }}>
      <StatusIcon kind={kind} size={size === 11 ? 9 : 10} />
      <span>{label ?? kind}</span>
    </span>
  )
}

export const statusColor = (k: StatusWord) => COLOR[k]
