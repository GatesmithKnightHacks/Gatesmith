import { Shell } from '../ui/Shell'
import { ModeTabs } from '../ui/parts'

/** S-04 · Workspace. Placeholder until the screen is built from its Paper board. */
export function S04Workspace() {
  return (
    <Shell rail="new" inspector={<ModeTabs />}>
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>S-04 · Workspace</div>
    </Shell>
  )
}
