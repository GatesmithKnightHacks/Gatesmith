/* Inspector and tile icons used by the intake screens, copied from Paper. */
const s = { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.4 } as const

export const IkIcons = {
  steps: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M7.5 4.5H15M7.5 9H15M7.5 13.5H15M3 4.5h1.5M3 9h1.5M3 13.5h1.5" {...s} strokeLinecap="round" />
    </svg>
  ),
  chip: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="3" y="3" width="12" height="12" rx="1.5" {...s} />
      <rect x="6.5" y="6.5" width="5" height="5" {...s} />
    </svg>
  ),
  history: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3.6 9a5.4 5.4 0 1 0 1.6-3.8" {...s} strokeLinecap="round" />
      <path d="M3.4 3.4v2.4h2.4" {...s} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 6.2V9l2 1.2" {...s} strokeLinecap="round" />
    </svg>
  ),
  download: (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" fill="none" stroke="#C2DADF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 16v3h14v-3" fill="none" stroke="#C2DADF" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  smallCheck: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 5.2l2 2 4-4.4" fill="none" stroke="#5FEEA3" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}
