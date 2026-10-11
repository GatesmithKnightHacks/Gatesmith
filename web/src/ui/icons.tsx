/* Icons drawn exactly as in Paper (S-00 shell, DS-03 icon set). Stroke widths are part of the spec. */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

export function LogoBurst({ size = 28, ...p }: P & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" aria-label="Gatesmith" role="img" {...p}>
      <g fill="#C3FCE1">
        <circle cx="39.98" cy="39.86" r="6.309" />
        <circle cx="39.98" cy="9.766" r="4.211" />
        <circle cx="39.98" cy="23.36" r="3.73" />
        <rect x="38.44" y="12.75" width="3.344" height="8.359" />
        <circle cx="19.33" cy="17.95" r="4.172" />
        <circle cx="30.55" cy="29.15" r="3.582" />
        <rect transform="rotate(-45 19.76 20.87)" x="19.76" y="20.87" width="3.73" height="11.45" />
        <circle cx="9.766" cy="39.89" r="4.086" />
        <circle cx="24.75" cy="39.85" r="3.781" />
        <rect x="12.75" y="38.35" width="9.766" height="3.074" />
        <circle cx="19.74" cy="59.67" r="3.789" />
        <circle cx="30.27" cy="50.86" r="3.48" />
        <rect transform="rotate(46.69 27.23 50.93)" x="27.23" y="50.93" width="2.908" height="9.169" />
        <circle cx="39.98" cy="70.23" r="4.266" />
        <circle cx="39.99" cy="54.93" r="3.625" />
        <rect x="38.42" y="57.45" width="3.211" height="10.03" />
        <circle cx="62.31" cy="61.98" r="4.406" />
        <circle cx="50.25" cy="49.83" r="3.605" />
        <rect transform="rotate(-45 50.46 52.73)" x="50.46" y="52.73" width="3.933" height="12.52" />
        <circle cx="70.05" cy="39.89" r="4.141" />
        <circle cx="55.6" cy="39.89" r="3.738" />
        <rect x="58.17" y="38.43" width="9.766" height="3.184" />
        <circle cx="59.48" cy="20.73" r="3.516" />
        <circle cx="50.39" cy="29.27" r="3.561" />
        <rect transform="rotate(45 57.05 21.14)" x="57.05" y="21.14" width="2.854" height="8.535" />
      </g>
    </svg>
  )
}

/*
 * ── Rail (24px boxes, drawn on a 20 grid, stroke 1.17 → 1.4px) ────────────
 * Colors default to currentColor so the rail sets idle #ADC5CA, hover #FFFFFF and current #F8D441 in CSS.
 */
type RailIconProps = { color?: string; size?: number }
const rail = (stroke: string) => ({ fill: 'none', stroke, strokeWidth: 1.17 })

export function IconNewRun({ color = 'currentColor', size = 24 }: RailIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M10 2.2l6.8 3.9v7.8L10 17.8l-6.8-3.9V6.1z" {...rail(color)} strokeLinejoin="round" />
      <path d="M10 7v6M7 10h6" {...rail(color)} strokeLinecap="round" />
    </svg>
  )
}

export function IconRuns({ color = 'currentColor', size = 24 }: RailIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9" {...rail(color)} strokeLinecap="round" />
      <path d="M4 5.5h.01M4 10h.01M4 14.5h.01" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconRepo({ color = 'currentColor', size = 24 }: RailIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M6 3.5v13M6 9.5c0 2.2 1.8 3 4 3h1.2a3 3 0 003-3V8" {...rail(color)} strokeLinecap="round" />
      <path
        d="M6 3.5m-1.8 0a1.8 1.8 0 103.6 0a1.8 1.8 0 10-3.6 0M14.2 6.2m-1.8 0a1.8 1.8 0 103.6 0a1.8 1.8 0 10-3.6 0"
        {...rail(color)}
      />
    </svg>
  )
}

/** Retired from the rail (fix round 3); kept for any page that still links the docs. */
export function IconDocs({ color = 'currentColor', size = 24 }: RailIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M4.5 3.5h9.5a1.5 1.5 0 011.5 1.5v11H6a1.5 1.5 0 01-1.5-1.5z" {...rail(color)} strokeLinejoin="round" />
      <path d="M4.5 14.5A1.5 1.5 0 016 13h9.5" {...rail(color)} />
    </svg>
  )
}

export function IconHelp({ color = 'currentColor', size = 24 }: RailIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M10 2.75a7.25 7.25 0 110 14.5a7.25 7.25 0 010-14.5z" {...rail(color)} />
      <path d="M7.9 8a2.1 2.1 0 114 .9c-.5.6-1.9 1.1-1.9 2.3" {...rail(color)} strokeLinecap="round" />
      <path d="M10 14.2h.01" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function IconLeaderboard({ color = 'currentColor', size = 24 }: RailIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M3.5 16.5h13M5.5 16.5v-5M10 16.5V5M14.5 16.5v-8" {...rail(color)} strokeLinecap="round" />
    </svg>
  )
}

export function IconSettings({ color = 'currentColor', size = 24 }: RailIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M4 6h7M15 6h1M4 14h1M9 14h7" {...rail(color)} strokeLinecap="round" />
      <path d="M13 6m-2 0a2 2 0 104 0a2 2 0 10-4 0M7 14m-2 0a2 2 0 104 0a2 2 0 10-4 0" {...rail(color)} />
    </svg>
  )
}

/** Person, drawn on a 14 grid and shown in the rail's 24 box. */
export function IconAccount({ color = 'currentColor', size = 24 }: RailIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path
        d="M7 7.2a2.4 2.4 0 100-4.8a2.4 2.4 0 000 4.8zM2.8 12.2c.6-2 2.2-3.1 4.2-3.1s3.6 1.1 4.2 3.1"
        fill="none"
        stroke={color}
        strokeWidth={0.82}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Expand (chevron right) or, in the expanded rail, Collapse (chevron left). 16px. */
export function IconRailChevron({ color = 'currentColor', collapse = false }: { color?: string; collapse?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        d={collapse ? 'M10 3.5L5.5 8l4.5 4.5' : 'M6 3.5l4.5 4.5L6 12.5'}
        fill="none"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ── Tab strip ───────────────────────────────────────────────────────── */
export function IconPlus({ size = 14, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 5v14M5 12h14" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconUndo({ color = '#FFFFFF' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M9 14L4 9l5-5" fill="none" stroke={color} strokeWidth="1.87" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9h10.5a5.5 5.5 0 010 11H11" fill="none" stroke={color} strokeWidth="1.87" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconRedo({ color = '#667E83' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M15 14l5-5-5-5" fill="none" stroke={color} strokeWidth="1.87" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 9H9.5a5.5 5.5 0 000 11H13" fill="none" stroke={color} strokeWidth="1.87" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ── Inspector section icons (18px, stroke 1.4, white) ───────────────── */
const sec = { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.4 } as const

export const SectionIcons = {
  /** Target: a chip card with two lines (master MVN-0) */
  target: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="2.5" y="4" width="13" height="10" rx="1.5" {...sec} />
      <path d="M5.5 7.5h3M5.5 10.5h7" {...sec} strokeLinecap="round" />
    </svg>
  ),
  clock: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="6.5" {...sec} />
      <path d="M9 5.5V9l2.5 1.5" {...sec} strokeLinecap="round" />
    </svg>
  ),
  list: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 4.5h12M3 9h12M3 13.5h7" {...sec} strokeLinecap="round" />
    </svg>
  ),
  numbered: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M7.5 4.5H15M7.5 9H15M7.5 13.5H15M3 4.5h1.5M3 9h1.5M3 13.5h1.5" {...sec} strokeLinecap="round" />
    </svg>
  ),
  chip: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="3" y="3" width="12" height="12" rx="1.5" {...sec} />
      <rect x="6.5" y="6.5" width="5" height="5" {...sec} />
    </svg>
  ),
  history: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3.6 9a5.4 5.4 0 1 0 1.6-3.8" {...sec} strokeLinecap="round" />
      <path d="M3.4 3.4v2.4h2.4" {...sec} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 6.2V9l2 1.2" {...sec} strokeLinecap="round" />
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M9 2.5l5.5 2v4.2c0 3.2-2.3 5.7-5.5 6.8-3.2-1.1-5.5-3.6-5.5-6.8V4.5z" {...sec} strokeLinejoin="round" />
    </svg>
  ),
  doc: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M4.5 2.5h6l3 3v10h-9z" {...sec} strokeLinejoin="round" />
      <path d="M7 9h4M7 12h4" {...sec} strokeLinecap="round" />
    </svg>
  ),
  dollar: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="6.5" {...sec} />
      <path d="M11 6.6c-.4-.6-1.1-.9-2-.9-1.2 0-2 .6-2 1.5 0 2 4 1 4 3 0 .9-.8 1.5-2 1.5-.9 0-1.7-.4-2.1-1M9 4.6v1.1M9 12.3v1.1" {...sec} strokeLinecap="round" />
    </svg>
  ),
  branch: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M5 3v12M5 8.5c0 2 1.6 2.7 3.6 2.7h1a2.7 2.7 0 002.7-2.7V7" {...sec} strokeLinecap="round" />
      <circle cx="12.3" cy="5.4" r="1.6" {...sec} />
    </svg>
  ),
  chat: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 4.5A1.5 1.5 0 014.5 3h9A1.5 1.5 0 0115 4.5v6a1.5 1.5 0 01-1.5 1.5H8l-3.5 3v-3A1.5 1.5 0 013 10.5z" {...sec} strokeLinejoin="round" />
    </svg>
  ),
} as const

/** Points up when open; turns 180° when closed. */
export function Chevron({ open = true }: { open?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className={`chevron${open ? '' : ' is-closed'}`}>
      <path
        d="M3.5 8.5L7 5l3.5 3.5"
        fill="none"
        stroke="#C2DADF"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SelectCaret() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M2.5 4l2.5 2.5L7.5 4" fill="none" stroke="#C2DADF" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
