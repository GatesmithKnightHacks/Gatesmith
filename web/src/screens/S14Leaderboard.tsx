import { Shell } from '../ui/Shell'
import { ModeTabs } from '../ui/parts'

/** S-14 · Leaderboard. Placeholder until the screen is built from its Paper board. */
export function S14Leaderboard() {
  return (
    <Shell rail="new" inspector={<ModeTabs />}>
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>S-14 · Leaderboard</div>
    </Shell>
  )
}
