import { Shell } from '../ui/Shell'
import { ModeTabs } from '../ui/parts'

/** S-02 · Repo scan. Placeholder until the screen is built from its Paper board. */
export function S02RepoScan() {
  return (
    <Shell rail="new" inspector={<ModeTabs />}>
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>S-02 · Repo scan</div>
    </Shell>
  )
}
