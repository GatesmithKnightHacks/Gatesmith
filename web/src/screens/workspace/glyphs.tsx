/*
 * S-04 glyphs as the master draws them: the transport icons and the Target section icon.
 */
const stroke = (c: string) => ({ fill: 'none', stroke: c, strokeWidth: 1.4 }) as const

export type TransportId = 'start' | 'back' | 'play' | 'pause' | 'forward' | 'end'

export function TransportGlyph({ id, color }: { id: TransportId; color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      {id === 'start' && <path d="M4 3v10M12 3L6 8l6 5z" {...stroke(color)} strokeLinejoin="round" />}
      {id === 'back' && <path d="M8 3L2.5 8 8 13zM14 3L8.5 8l5.5 5z" {...stroke(color)} strokeLinejoin="round" />}
      {id === 'play' && <path d="M4.5 3l8 5-8 5z" {...stroke(color)} strokeLinejoin="round" />}
      {id === 'pause' && <path d="M5 3v10M11 3v10" {...stroke(color)} strokeLinecap="round" />}
      {id === 'forward' && <path d="M2 3l5.5 5L2 13zM8 3l5.5 5L8 13z" {...stroke(color)} strokeLinejoin="round" />}
      {id === 'end' && <path d="M12 3v10M4 3l6 5-6 5z" {...stroke(color)} strokeLinejoin="round" />}
    </svg>
  )
}

export function TargetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="2.5" y="4" width="13" height="10" rx="1.5" {...stroke('#FFFFFF')} />
      <path d="M5.5 7.5h3M5.5 10.5h7" {...stroke('#FFFFFF')} strokeLinecap="round" />
    </svg>
  )
}
