import { Shell } from '../ui/Shell'
import { ModeTabs } from '../ui/parts'

/** S-12 · Repo dashboard. Placeholder until the screen is built from its Paper board. */
export function S12Repo() {
  return (
    <Shell rail="new" inspector={<ModeTabs />}>
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>S-12 · Repo dashboard</div>
    </Shell>
  )
}
