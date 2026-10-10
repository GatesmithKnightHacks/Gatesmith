/* Inspector pieces for the team screens (S-12 to S-14), as drawn on their boards. */
import { useState, type ReactNode } from 'react'
import './team.css'

export function TeamModeTabs() {
  const [mode, setMode] = useState<'laptop' | 'platform'>('laptop')
  return (
    <div className="team-mode-tabs" role="tablist">
      {(['laptop', 'platform'] as const).map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          className={`team-mode-tab${mode === m ? ' is-active' : ''}`}
          onClick={() => setMode(m)}
        >
          {m === 'laptop' ? 'Laptop' : 'Platform'}
        </button>
      ))}
    </div>
  )
}

export function TeamModeLine({ children }: { children: ReactNode }) {
  return (
    <div className="team-mode-line">
      <div>{children}</div>
    </div>
  )
}

export function TeamSection({
  icon,
  title,
  meta,
  children,
  gap = 0,
}: {
  icon: ReactNode
  title: string
  meta?: ReactNode
  children: ReactNode
  gap?: number
}) {
  return (
    <section className="team-sec" style={{ gap }}>
      <div className="team-sec-head">
        {icon}
        <span className="team-sec-title">{title}</span>
        {meta != null && <span className="team-sec-meta">{meta}</span>}
      </div>
      {children}
    </section>
  )
}

export function TeamKV({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="team-kv">
      <span className="team-kv-label">{label}</span>
      <span className="team-kv-value">{value}</span>
    </div>
  )
}

const s = { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.4 } as const

export const TeamIcons = {
  list: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 4.5h12M3 9h12M3 13.5h7" {...s} strokeLinecap="round" />
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M9 1.8l6 2.6v4.4c0 3.8-2.6 5.9-6 7.2c-3.4-1.3-6-3.4-6-7.2V4.4z" {...s} />
    </svg>
  ),
  pr: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="5" cy="4" r="1.8" {...s} />
      <circle cx="5" cy="14" r="1.8" {...s} />
      <circle cx="13" cy="14" r="1.8" {...s} />
      <path d="M5 5.8v6.4M13 12.2V8.5a2.5 2.5 0 0 0-2.5-2.5H8" {...s} strokeLinecap="round" />
    </svg>
  ),
}
