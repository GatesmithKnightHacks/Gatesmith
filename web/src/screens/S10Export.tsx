import { Shell } from '../ui/Shell'
import { ModeTabs } from '../ui/parts'

/** S-10 · Export. Placeholder until the screen is built from its Paper board. */
export function S10Export() {
  return (
    <Shell rail="new" inspector={<ModeTabs />}>
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>S-10 · Export</div>
    </Shell>
  )
}
