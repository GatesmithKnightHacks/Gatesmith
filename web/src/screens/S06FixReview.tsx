import { Shell } from '../ui/Shell'
import { ModeTabs } from '../ui/parts'

/** S-06 · Fix review. Placeholder until the screen is built from its Paper board. */
export function S06FixReview() {
  return (
    <Shell rail="new" inspector={<ModeTabs />}>
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>S-06 · Fix review</div>
    </Shell>
  )
}
