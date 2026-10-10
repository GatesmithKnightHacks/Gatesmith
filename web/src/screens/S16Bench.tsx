import { Shell } from '../ui/Shell'
import { ModeTabs } from '../ui/parts'

/** S-16 · Model bench. Placeholder until the screen is built from its Paper board. */
export function S16Bench() {
  return (
    <Shell rail="new" inspector={<ModeTabs />}>
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>S-16 · Model bench</div>
    </Shell>
  )
}
