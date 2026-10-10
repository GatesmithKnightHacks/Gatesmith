import { expect, test, type Page } from '@playwright/test'

/**
 * The demo, end to end: pick the example, confirm, watch it score, request a fix, accept it,
 * let the engine stop, read the report, export. Screenshots at every step land in test-results.
 */

async function snap(page: Page, name: string) {
  await page.screenshot({ path: `test-results/flow/${name}.png` })
}

test('the improvement loop, from a new run to the export', async ({ page }) => {
  await page.goto('/#/new')
  await page.evaluate(() => document.fonts.ready)

  // S-01 New run
  await expect(page.getByText('Drop .qasm files or paste a GitHub URL')).toBeVisible()
  await page.getByText('sidechain_qaoa', { exact: true }).first().click()
  await snap(page, '01-new-run')
  await page.getByRole('button', { name: 'Continue' }).click()

  // S-03 Pre-flight
  await expect(page).toHaveURL(/#\/preflight/)
  await expect(page.getByText('No issues')).toBeVisible()
  await snap(page, '03-preflight')
  await page.getByRole('button', { name: 'Confirm and score' }).click()

  // S-04 Workspace: the scan, then findings land, then rounds run
  await expect(page).toHaveURL(/#\/workspace/)
  await expect(page.getByRole('button', { name: /Scoring \(\d+%\)/ })).toBeVisible()
  await page.waitForTimeout(1500)
  await snap(page, '04a-scoring')
  await expect(page.getByText('Commuting block can be reordered')).toBeVisible({ timeout: 8000 })
  await snap(page, '04b-findings')
  await expect(page.getByRole('button', { name: /Running round 3 of 4/ })).toBeVisible({ timeout: 10000 })
  await snap(page, '04c-round-3')

  // M3: request a fix for D03
  const d03 = page.locator('article', { hasText: 'Commuting block can be reordered' })
  await d03.getByRole('button', { name: 'Request fix' }).click()

  // S-06 Fix review: the candidate is written, verified, then accepted
  await expect(page).toHaveURL(/#\/fix/)
  await snap(page, '06a-writing')
  const accept = page.getByRole('button', { name: 'Accept' })
  await expect(accept).toBeEnabled({ timeout: 8000 })
  await expect(page.getByText('Same job, checked exactly')).toBeVisible()
  await snap(page, '06b-verified')
  await accept.click()
  await page.waitForTimeout(400)
  await snap(page, '06c-accept-moment')

  // S-07 Loop view: round 4 runs, then the engine recommends stopping
  await expect(page).toHaveURL(/#\/loop/, { timeout: 5000 })
  await expect(page.getByText('Engine recommendation')).toBeVisible({ timeout: 8000 })
  await snap(page, '07-stop')
  await page.getByRole('button', { name: 'Export final' }).click()

  // S-09 Final report
  await expect(page).toHaveURL(/#\/report/)
  await expect(page.getByText('44 two-qubit gates', { exact: false })).toBeVisible()
  await expect(page.getByText('33 two-qubit gates', { exact: false })).toBeVisible()
  await page.waitForTimeout(600)
  await snap(page, '09-report')
  await page.getByRole('button', { name: 'Export', exact: true }).click()

  // S-10 Export
  await expect(page).toHaveURL(/#\/export/)
  await expect(page.getByRole('button', { name: 'Download final .qasm' })).toBeVisible()
  await snap(page, '10-export')
})

test('every screen opens on its own and shows no render error', async ({ page }) => {
  const routes = ['/template', '/new', '/scan', '/preflight', '/workspace', '/estimate', '/fix', '/loop', '/report', '/export', '/pr', '/repo', '/runs', '/leaderboard', '/screening', '/bench']
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const r of routes) {
    await page.goto(`/#${r}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('failed to render')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})
