/*
 * S-04 icons drawn as the master board (MVN-0) draws them: the 10 px status marks used in lane cards,
 * finding cards and the verification ladder, the transport and zoom icons, the Target section icon.
 */
import { C, markColor, type Mark } from './data'

/** 10 px status mark. `tone` overrides the color (the ladder draws passed in secondary). */
export function MarkIcon({ kind, tone, size = 10 }: { kind: Mark; tone?: string; size?: number }) {
  const s = { width: size, height: size, 'aria-hidden': true, style: { flexShrink: 0 } } as const
  switch (kind) {
    case 'high':
      return (
        <svg {...s} viewBox="0 0 14 14">
          <path d="M7 2v6M7 11v.5" fill="none" stroke={tone ?? C.high} strokeWidth="1.96" strokeLinecap="round" />
        </svg>
      )
    case 'warning':
      return (
        <svg {...s} viewBox="0 0 12 12">
          <path d="M6 1.5l4.8 8.6H1.2z" fill="none" stroke={tone ?? C.warning} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )
    case 'accepted':
    case 'passed':
      return (
        <svg {...s} viewBox="0 0 12 12">
          <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke={tone ?? markColor(kind)} strokeWidth="1.68" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'rejected':
      return (
        <svg {...s} viewBox="0 0 12 12">
          <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke={tone ?? C.high} strokeWidth="1.68" strokeLinecap="round" />
        </svg>
      )
    case 'inconclusive':
      return (
        <svg {...s} viewBox="0 0 12 12">
          <circle cx="6" cy="6" r="4" fill="none" stroke={tone ?? C.warning} strokeWidth="1.68" strokeDasharray="2 1.6" />
        </svg>
      )
    case 'verifying':
    case 'running':
      return (
        <svg {...s} viewBox="0 0 12 12">
          <circle cx="6" cy="6" r="3" fill={tone ?? C.verifying} />
        </svg>
      )
    case 'proposed':
      return (
        <svg {...s} viewBox="0 0 12 12">
          <path d="M6 1.5l4.5 4.5L6 10.5 1.5 6z" fill="none" stroke={tone ?? C.proposed} strokeWidth="1.68" strokeLinejoin="round" />
        </svg>
      )
    default:
      return (
        <svg {...s} viewBox="0 0 10 10">
          <circle cx="5" cy="5" r="3.5" fill="none" stroke={tone ?? 'var(--color-text-disabled)'} strokeWidth="1.4" />
        </svg>
      )
  }
}

/** Icon + word, the status grammar (never a word alone, never an icon alone). */
export function MarkWord({ kind, label, size = 12, weight, tone }: { kind: Mark; label?: string; size?: 11 | 12; weight?: 500; tone?: string }) {
  return (
    <span className="ws-mark" style={{ color: tone ?? markColor(kind), fontSize: size, fontWeight: weight }}>
      <MarkIcon kind={kind} tone={tone} />
      <span>{label ?? kind}</span>
    </span>
  )
}

const stroke = (c: string) => ({ fill: 'none', stroke: c, strokeWidth: 1.4 }) as const

export function ZoomIcon({ plus }: { plus?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="6.5" cy="6.5" r="4.8" {...stroke('#C2DADF')} />
      <path d={plus ? 'M10.2 10.2L14.5 14.5M4.3 6.5h4.4M6.5 4.3v4.4' : 'M10.2 10.2L14.5 14.5M4.3 6.5h4.4'} {...stroke('#C2DADF')} strokeLinecap="round" />
    </svg>
  )
}

