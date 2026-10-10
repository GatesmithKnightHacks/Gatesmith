import { Shell } from '../ui/Shell'
import { ModeTabs } from '../ui/parts'

/** S-07 · Loop view and stop. Placeholder until the screen is built from its Paper board. */
export function S07Loop() {
  return (
    <Shell rail="new" inspector={<ModeTabs />}>
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>S-07 · Loop view and stop</div>
    </Shell>
  )
}
