import { Shell } from '../ui/Shell'
import { ModeTabs } from '../ui/parts'

/** S-13 · Runs. Placeholder until the screen is built from its Paper board. */
export function S13Runs() {
  return (
    <Shell rail="new" inspector={<ModeTabs />}>
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>S-13 · Runs</div>
    </Shell>
  )
}
