/* Inspector section icons for S-15 and S-16 (18 px, white 1.4 strokes, as on the boards). */
const sec = { fill: 'none', stroke: 'var(--color-text-primary)', strokeWidth: 1.4 } as const
export const Icons = {
  clock: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="6.5" {...sec} />
      <path d="M9 5.5V9l2.5 1.5" {...sec} strokeLinecap="round" />
    </svg>
  ),
  target: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="6.5" {...sec} />
      <circle cx="9" cy="9" r="2" fill="var(--color-text-primary)" />
    </svg>
  ),
  list: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 5h12M3 9h12M3 13h8" {...sec} strokeLinecap="round" />
    </svg>
  ),
  lines: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3.5 4.5h11M3.5 9h11M3.5 13.5h11" {...sec} strokeLinecap="round" />
    </svg>
  ),
  history: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3.5 9a5.5 5.5 0 105.5-5.5A5.6 5.6 0 004.6 6" {...sec} strokeLinecap="round" />
      <path d="M4.2 3v3.2h3.2" {...sec} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 6.2V9l2 1.3" {...sec} strokeLinecap="round" />
    </svg>
  ),
  bars: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 15.5h12M4.5 15.5v-5M9 15.5V4.5M13.5 15.5v-8" {...sec} strokeLinecap="round" />
    </svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M4 3.5h10v11H4z" {...sec} strokeLinejoin="round" />
      <path d="M6.5 9l1.8 1.8L11.8 7" {...sec} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
} as const
