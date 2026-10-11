/*
 * Spinner (DS-08): a 2 px ring with a 270° arc, 1000 ms per turn, linear. Sizes 14 (inline beside a
 * word), 20 (inside a button), 28 (tile center). It never appears alone: it sits beside its stage word.
 * Reduced motion: a static ring. Local to S-05 until the shared one lands in ui/Skeleton.
 */
export function Spinner({ size = 14 }: { size?: 14 | 20 | 28 }) {
  const r = size / 2 - 1
  const c = size / 2
  return (
    <svg className="est-spinner" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-spinner-track)" strokeWidth="2" />
      <path d={`M${c} ${c - r}A${r} ${r} 0 1 1 ${c - r} ${c}`} fill="none" stroke="var(--color-spinner-arc)" strokeWidth="2" />
    </svg>
  )
}
