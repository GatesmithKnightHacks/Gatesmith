import { Shell } from '../ui/Shell'
import { ModeTabs } from '../ui/parts'

/** S-01 · New run. Placeholder until the screen is built from its Paper board. */
export function S01NewRun() {
  return (
    <Shell rail="new" inspector={<ModeTabs />}>
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>S-01 · New run</div>
    </Shell>
  )
}
