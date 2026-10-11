/* Icons the intake screens share, copied from the Paper boards (strokes follow currentColor). */
/* ── Icons used across the intake screens (18 px inspector icons, white strokes) ── */
const w = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 } as const
export const InkIcons = {
  upload: (size = 24, sw = 1.5) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 14v4.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V14" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  ),
  link: (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 013.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 01-3.7-3.7L5.3 7.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  caret: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 3.5L5 6.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  score: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 15h12M5 15v-4M9 15V4M13 15V8" {...w} strokeLinecap="round" />
    </svg>
  ),
  fix: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M11.2 3.2a3.6 3.6 0 00-4.4 4.6L3 11.6a1.4 1.4 0 002 2l3.8-3.8a3.6 3.6 0 004.6-4.4l-2.1 2.1-1.8-.4-.4-1.8z" {...w} strokeLinejoin="round" />
    </svg>
  ),
  verify: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M9 2.5l5.5 2v4.2c0 3.2-2.3 5.8-5.5 6.8-3.2-1-5.5-3.6-5.5-6.8V4.5z" {...w} strokeLinejoin="round" />
      <path d="M6.6 9l1.7 1.7 3.2-3.4" {...w} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  report: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M4.5 2.5h6l3 3v10h-9z" {...w} strokeLinejoin="round" />
      <path d="M10.5 2.5v3h3M6.5 9h5M6.5 12h5" {...w} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}
