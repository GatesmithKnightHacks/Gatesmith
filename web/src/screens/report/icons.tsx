/* Inspector and tile icons of S-09 and S-10, copied from the Paper boards. */
const st = { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.4 } as const
export const Icons = {
  facts: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="3" y="2.5" width="12" height="13" rx="1.5" {...st} />
      <path d="M6 6.5h6M6 9.5h6M6 12.5h3.5" {...st} strokeLinecap="round" />
    </svg>
  ),
  stop: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M6.2 2.5h5.6l3.7 3.7v5.6l-3.7 3.7H6.2l-3.7-3.7V6.2z" {...st} strokeLinejoin="round" />
      <path d="M6.5 9h5" {...st} strokeLinecap="round" />
    </svg>
  ),
  list: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 4.5h12M3 9h12M3 13.5h7" {...st} strokeLinecap="round" />
    </svg>
  ),
  hash: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M7 3l-1.5 12M12.5 3L11 15M3.5 6.5h12M2.5 11.5h12" {...st} strokeLinecap="round" />
    </svg>
  ),
  target: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="2.5" y="4" width="13" height="10" rx="1.5" {...st} />
      <path d="M5.5 7.5h3M5.5 10.5h7" {...st} strokeLinecap="round" />
    </svg>
  ),
  branch: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="5" cy="4.5" r="2" {...st} />
      <circle cx="5" cy="13.5" r="2" {...st} />
      <circle cx="13" cy="9" r="2" {...st} />
      <path d="M5 6.5v5M5 9h3.5a2.5 2.5 0 0 0 2.5-2.5" {...st} strokeLinecap="round" />
    </svg>
  ),
  file: (color = '#FFFFFF') => (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M4 1.8h5.2L12.5 5v9.2H4z" fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9 2v3.3h3.3" fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  emptyReport: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="3" y="2.5" width="12" height="13" rx="1.5" fill="none" stroke="#C2DADF" strokeWidth="1.4" />
      <path d="M6 6.5h6M6 9.5h6M6 12.5h3.5" fill="none" stroke="#C2DADF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  emptyFile: (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
      <path d="M4 1.8h5.2L12.5 5v9.2H4z" fill="none" stroke="#C2DADF" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9 2v3.3h3.3" fill="none" stroke="#C2DADF" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
}
