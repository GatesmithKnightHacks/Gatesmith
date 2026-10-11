/**
 * Dead-button audit: on every screen, click each visible button and report the ones that change
 * nothing (no navigation, no DOM change, no download).
 *
 *   node scripts/audit.mjs            # all screens
 *   node scripts/audit.mjs S-04       # one
 */
import { chromium } from '@playwright/test'
import { SCREENS } from './screens.mjs'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCREENS)
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true })
await context.grantPermissions(['clipboard-read', 'clipboard-write'])
const page = await context.newPage()

const dead = []
for (const id of ids) {
  const route = SCREENS[id]
  await page.goto(`${BASE}/?audit=${id}#${route}`, { waitUntil: 'load' })
  await page.waitForTimeout(500)
  const count = await page.locator('button:visible, [role="button"]:visible, a[href]:visible').count()
  let checked = 0
  for (let i = 0; i < count; i++) {
    // a fresh query string forces a real reload; a hash-only goto would keep the old state
    await page.goto(`${BASE}/?audit=${id}-${i}#${route}`, { waitUntil: 'load' })
    await page.waitForTimeout(250)
    const el = page.locator('button:visible, [role="button"]:visible, a[href]:visible').nth(i)
    if (!(await el.count())) continue
    if (await el.isDisabled().catch(() => false)) continue
    const label = ((await el.getAttribute('aria-label')) || (await el.innerText().catch(() => '')) || '?').trim().slice(0, 40)
    await page.evaluate(() => {
      window.__mutations = 0
      new MutationObserver((m) => (window.__mutations += m.length)).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      })
    })
    const before = page.url()
    const download = page.waitForEvent('download', { timeout: 400 }).then(() => true, () => false)
    await el.click({ timeout: 2000 }).catch(() => {})
    const downloaded = await download
    await page.waitForTimeout(300)
    const changed = page.url() !== before || (await page.evaluate(() => window.__mutations)) > 0 || downloaded
    checked++
    if (!changed) {
      dead.push(`${id}  "${label}"`)
      console.log(`  ${id} no effect: "${label}"`)
    }
  }
  console.log(`${id}: ${checked} controls checked`)
}
await browser.close()
console.log(dead.length ? `\nno effect:\n${dead.join('\n')}` : '\nevery control does something')
