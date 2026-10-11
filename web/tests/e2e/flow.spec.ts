import { expect, test, type Page } from '@playwright/test'

/**
 * The demo, end to end, on the canonical run 7f3a·0412 (321 → 298 → 281 → 270, stopped by the engine
 * at 490 of 900 s, auto mode off): pick the example, confirm, watch it score, review the local
 * proposal for D03 block 2, accept it, let the engine stop, read the report, export.
 * Screenshots at every step land in test-results/flow.
 */

async function snap(page: Page, name: string) {
  await page.screenshot({ path: `test-results/flow/${name}.png` })
}

test('the improvement loop, from a new run to the export', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/#/new')
  await page.evaluate(() => document.fonts.ready)

  // S-01 New run: choose the bundled example, then Continue
  await expect(page.getByText('Drop .qasm files or paste a GitHub URL')).toBeVisible()
  await page.getByRole('radio', { name: /sidechain_qaoa\.qasm/ }).click()
  await snap(page, '01-new-run')
  await page.getByRole('button', { name: 'Continue' }).click()

  // S-03 Pre-flight: what the engine understood, then Confirm and score
  await expect(page).toHaveURL(/#\/preflight/)
  await expect(page.getByText('D03 block 2 · 39 rzz')).toBeVisible()
  const confirm = page.getByRole('button', { name: 'Confirm and score' })
  await expect(confirm).toBeEnabled()
  await snap(page, '03-preflight')
  await confirm.click()

  // S-04 Workspace: the first score (stage share on the mint), findings land, rounds 1 to 3 run
  await expect(page).toHaveURL(/#\/workspace/)
  await expect(page.getByRole('button', { name: /^Scoring \(\d+%\)$/ })).toBeVisible()
  await page.waitForTimeout(1500)
  await snap(page, '04a-scoring')
  await expect(page.getByText('Routing-dominated')).toBeVisible({ timeout: 8000 })
  await snap(page, '04b-findings')
  // round 3 of 4 at 400 of 900 s: the mint carries elapsed ÷ budget, nothing else does
  await expect(page.getByRole('button', { name: 'Run engine (44%)' })).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('3 open · 1 accepted · by severity')).toBeVisible()
  await expect(page.getByText('281 now · 321 base ·')).toBeVisible()
  await snap(page, '04c-round-3')

  // M3: review the local proposal for D03 block 2
  const block2 = page.locator('article', { hasText: 'D03 · structure · block 2' })
  await block2.getByRole('button', { name: 'Review proposal' }).click()

  // S-06 Fix review: the candidate is verified, then the user accepts it (auto mode is off)
  await expect(page).toHaveURL(/#\/fix/)
  await expect(page.getByRole('tab', { name: 'Fix · D03 block 2' })).toBeVisible()
  await snap(page, '06a-verifying')
  await expect(page.getByText('Engine accepted · not applied until you accept')).toBeVisible({ timeout: 8000 })
  const accept = page.getByRole('button', { name: /^Accept$/ })
  await expect(accept).toBeEnabled()
  await snap(page, '06b-verified')
  await accept.click()
  await page.waitForTimeout(400)
  await snap(page, '06c-accept-moment')

  // S-07 Loop view: round 4 accepts nothing and the engine stops the run at 490 s
  await expect(page).toHaveURL(/#\/loop/, { timeout: 5000 })
  await expect(page.getByText('Round 4 accepted nothing and every open finding has had its strategies tried.', { exact: false })).toBeVisible({
    timeout: 8000,
  })
  await expect(page.getByText('2 open · 2 accepted · by severity')).toBeVisible()
  await snap(page, '07-stop')
  await page.getByRole('button', { name: 'Export final' }).click()

  // S-09 Final report: 321 → 270 two-qubit gates, done in 8 m 10 s
  await expect(page).toHaveURL(/#\/report/)
  await expect(page.getByText('12 q · 270 gates · two_qubit_depth 178')).toBeVisible()
  await expect(page.getByText('done in 8 m 10 s', { exact: false })).toBeVisible()
  await page.waitForTimeout(600)
  await snap(page, '09-report')
  await page.getByRole('button', { name: 'Export', exact: true }).click()

  // S-10 Export
  await expect(page).toHaveURL(/#\/export/)
  await expect(page.getByRole('button', { name: 'Download final .qasm' })).toBeVisible()
  await expect(page.getByText('321 → 270 gates', { exact: false }).first()).toBeVisible()
  await snap(page, '10-export')
  expect(errors).toEqual([])
})

test('every screen opens on its own and shows no render error', async ({ page }) => {
  const routes = [
    '/template',
    '/new',
    '/scan',
    '/preflight',
    '/workspace',
    '/estimate',
    '/fix',
    '/loop',
    '/report',
    '/export',
    '/pr',
    '/repo',
    '/runs',
    '/leaderboard',
    '/screening',
    '/bench',
    '/signin',
    '/signup',
    '/account',
    '/gate',
  ]
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const r of routes) {
    await page.goto(`/#${r}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('failed to render')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('the workspace states render with the canonical numbers', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const at = async (state: string) => {
    await page.goto(`/#/workspace?state=${state}`)
    await page.waitForLoadState('networkidle')
  }
  await at('never-run')
  await expect(page.getByRole('button', { name: 'Run engine', exact: true })).toBeVisible()
  await expect(page.getByText('Not scored yet · Run engine to score')).toBeVisible()
  await at('loading')
  await expect(page.getByText('Drawing the circuit')).toBeVisible()
  await at('scoring')
  await expect(page.getByRole('button', { name: 'Scoring (62%)' })).toBeVisible()
  await expect(page.getByText('about 40 s left')).toBeVisible()
  await at('partial')
  await expect(page.getByText('Partial score')).toBeVisible()
  await at('gpu-off')
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(page.getByText('round 4 · waiting for GPU')).toBeVisible()
  await at('focus')
  await expect(page.getByText('D03 block 1').first()).toBeVisible()
  expect(errors).toEqual([])
})
