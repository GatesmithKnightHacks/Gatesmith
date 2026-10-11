/*
 * Spinner (DS-08): a 2 px ring with a 270° arc, 14 / 20 / 28 px, one turn per --motion-spin, linear.
 * It always sits beside its stage word. Reduced motion: a static whole ring.
 * Local until the shared one lands in ui/Skeleton.tsx.
 */
export function Spinner({ size = 14, onAccent = false }: { size?: 14 | 20 | 28; onAccent?: boolean }) {
  const r = size / 2 - 1
  const c = size / 2
  return (
    <svg className="ws-spinner" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={c} cy={c} r={r} fill="none" stroke={onAccent ? 'var(--color-spinner-track-on-accent)' : 'var(--color-spinner-track)'} strokeWidth="2" />
      <path
        className="ws-spinner-arc"
        d={`M${c} 1A${r} ${r} 0 1 1 1 ${c}`}
        fill="none"
        stroke={onAccent ? 'var(--color-spinner-arc-on-accent)' : 'var(--color-spinner-arc)'}
        strokeWidth="2"
      />
    </svg>
  )
}
