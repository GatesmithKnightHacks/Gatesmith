import { Shell } from '../ui/Shell'
import { ModeTabs } from '../ui/parts'

/** S-15 · Candidate screening. Placeholder until the screen is built from its Paper board. */
export function S15Screening() {
  return (
    <Shell rail="new" inspector={<ModeTabs />}>
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>S-15 · Candidate screening</div>
    </Shell>
  )
}
