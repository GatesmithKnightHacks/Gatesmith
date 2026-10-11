/**
 * Every screen and every state: load it, collect console and page errors, and flag single-line text
 * that overflows its box (clipped text). Prints one line per problem and a summary.
 *
 *   node scripts/sweep.mjs            # all
 *   node scripts/sweep.mjs S-06 S-07  # some
 */
import { chromium } from '@playwright/test'
import { SCREENS } from './screens.mjs'
import { STATES } from './states.mjs'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCREENS)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
let problems = 0
let views = 0
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

for (const id of ids) {
  const route = SCREENS[id]
  if (!route) continue
  for (const state of ['', ...(STATES[id] ?? [])]) {
    errors.length = 0
    const url = `${BASE}/?shot=${id}#${route}${state ? `?state=${state}` : ''}`
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(400)
    views++
    const clipped = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('body *')) {
        if (el.classList.contains('sr-only')) continue // screen-reader text is 1 px by design
        const cs = getComputedStyle(el)
        if (cs.whiteSpace !== 'nowrap' && cs.whiteSpace !== 'pre') continue
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
        if (el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible') out.push(el.textContent.trim().slice(0, 48))
        if (el.scrollWidth > el.clientWidth + 2 && cs.overflow === 'visible') {
          // overflowing a clipped ancestor
          let p = el.parentElement
          while (p && getComputedStyle(p).overflow === 'visible') p = p.parentElement
          if (p && el.getBoundingClientRect().right > p.getBoundingClientRect().right + 1) out.push(el.textContent.trim().slice(0, 48))
        }
      }
      return out.slice(0, 6)
    })
    const empty = (await page.evaluate(() => document.body.innerText.trim().length)) < 40
    const label = `${id}${state ? `?state=${state}` : ''}`
    for (const e of errors) {
      problems++
      console.log(`${label}  console: ${e.slice(0, 160)}`)
    }
    for (const c of clipped) {
      problems++
      console.log(`${label}  clipped: "${c}"`)
    }
    if (empty) {
      problems++
      console.log(`${label}  empty page`)
    }
  }
}
await browser.close()
console.log(`${views} views checked · ${problems} problems`)
