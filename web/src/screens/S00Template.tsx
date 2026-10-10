import { Shell } from '../ui/Shell'
import { ModeTabs } from '../ui/parts'

/** S-00 · Shell template. Placeholder until the screen is built from its Paper board. */
export function S00Template() {
  return (
    <Shell rail="new" inspector={<ModeTabs />}>
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>S-00 · Shell template</div>
    </Shell>
  )
}
