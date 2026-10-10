/**
 * Design diff: screenshot screens at 1440×900 and compare them with the Paper exports.
 *
 *   node scripts/diff.mjs S-04 S-06      # some screens
 *   node scripts/diff.mjs                # all
 *   BASE=http://localhost:5174 node scripts/diff.mjs S-04
 *
 * Writes tests/output/<id>.actual.png, <id>.diff.png and <id>.side.png (design | code | diff),
 * and prints the share of pixels that differ.
 */
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { SCREENS } from './screens.mjs'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'tests', 'output')
fs.mkdirSync(out, { recursive: true })

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCREENS)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
const results = {}

for (const id of ids) {
  const route = SCREENS[id]
  if (!route) {
    console.log(`${id}: unknown screen`)
    continue
  }
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(Number(process.env.SETTLE ?? 1200))
  const actualPath = path.join(out, `${id}.actual.png`)
  await page.screenshot({ path: actualPath })

  const designPath = path.join(root, 'tests', 'design', `${id}.png`)
  if (!fs.existsSync(designPath)) {
    console.log(`${id}: no design export`)
    continue
  }
  // Paper exports are Display P3; compare in sRGB like the browser.
  execFileSync('python3', [path.join(root, 'scripts', 'srgb.py'), designPath], { stdio: 'inherit' })
  const a = PNG.sync.read(fs.readFileSync(designPath))
  const b = PNG.sync.read(fs.readFileSync(actualPath))
  const { width, height } = a
  const diff = new PNG({ width, height })
  const n = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.12 })
  fs.writeFileSync(path.join(out, `${id}.diff.png`), PNG.sync.write(diff))

  // design | code | diff, scaled to half size for quick review
  const side = new PNG({ width: width * 3, height })
  PNG.bitblt(a, side, 0, 0, width, height, 0, 0)
  PNG.bitblt(b, side, 0, 0, width, height, width, 0)
  PNG.bitblt(diff, side, 0, 0, width, height, width * 2, 0)
  fs.writeFileSync(path.join(out, `${id}.side.png`), PNG.sync.write(side))

  const pct = (100 * n) / (width * height)
  results[id] = Math.round(pct * 100) / 100
  console.log(`${id}  ${results[id].toFixed(2)}% pixels differ  → tests/output/${id}.side.png`)
}

await browser.close()
const reportPath = path.join(out, 'report.json')
const prev = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : {}
fs.writeFileSync(reportPath, JSON.stringify({ ...prev, ...results }, null, 2))
