/* S-12 icons as drawn on boards 1B78-0 and 1IR7-0 (colors come from classes in S12Repo.css). */
const round = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const S12Icon = {
  high: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="s12i-bad">
      <path d="M6 2v5" strokeWidth="1.6" {...round} fill="none" />
      <circle cx="6" cy="9.8" r="0.9" className="s12i-fill" />
    </svg>
  ),
  warning: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="s12i-warn">
      <path d="M6 1.8L10.8 10.2H1.2z" fill="none" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 5v2.4" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="s12i-info">
      <circle cx="6" cy="6" r="3.6" fill="none" strokeWidth="1.4" />
    </svg>
  ),
  none: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="s12i-dim">
      <path d="M3 6.2l2.2 2.2L9.5 3.8" fill="none" strokeWidth="1.4" {...round} />
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden className="s12i-white">
      <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" strokeWidth="1.6" {...round} />
    </svg>
  ),
  failed: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="s12i-bad">
      <path d="M2 2l6 6M8 2L2 8" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  power: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="s12i-sec">
      <path d="M5 1v3.6" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2.7 2.6a3.5 3.5 0 1 0 4.6 0" fill="none" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  offline: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="s12i-sec">
      <path d="M1 3.6a6 6 0 0 1 8 0M2.6 5.4a3.6 3.6 0 0 1 4.8 0" fill="none" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="5" cy="7.6" r="0.9" className="s12i-fill" />
      <path d="M1.5 1.5l7 7" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  improved: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="s12i-white">
      <path d="M1.5 3h7L5 8z" className="s12i-fill" stroke="none" />
    </svg>
  ),
  regressed: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="s12i-bad">
      <path d="M1.5 7.5h7L5 2.5z" className="s12i-fill" stroke="none" />
    </svg>
  ),
  firstRun: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="s12i-dim">
      <circle cx="5" cy="5" r="3.2" fill="none" strokeWidth="1.4" />
    </svg>
  ),
}

/** Section icons on the S-12 board (18 px, white, 1.4 stroke). */
const sec = { fill: 'none', strokeWidth: 1.4 } as const
export const S12SectionIcon = {
  repo: (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden className="s12i-white">
      <path d="M6 3.5v13M6 9.5c0 2.2 1.8 3 4 3h1.2a3 3 0 003-3V8" {...sec} strokeLinecap="round" />
      <path d="M6 3.5m-1.8 0a1.8 1.8 0 103.6 0a1.8 1.8 0 10-3.6 0M14.2 6.2m-1.8 0a1.8 1.8 0 103.6 0a1.8 1.8 0 10-3.6 0" {...sec} />
    </svg>
  ),
  circuit: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="s12i-white">
      <path d="M4 2.5h6.5L14 6v9.5H4z" {...sec} strokeLinejoin="round" />
      <path d="M10.5 2.5V6H14M6.5 9.5h5M6.5 12.5h5" {...sec} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  comments: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="s12i-white">
      <path d="M3 3.5h12v8.5H8l-3.5 3v-3H3z" {...sec} strokeLinejoin="round" />
    </svg>
  ),
}

