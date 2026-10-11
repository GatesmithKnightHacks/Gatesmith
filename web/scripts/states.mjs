/**
 * Every state on every screen, as contact sheets for review against the Paper states boards.
 *
 *   node scripts/states.mjs            # all screens
 *   node scripts/states.mjs S-06 S-07  # some
 *
 * Writes tests/output/states/<id>.png (one tile per state, labelled by name).
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { SCREENS } from './screens.mjs'

export const STATES = {
  'S-00': ['feedback'],
  'S-01': ['drag-over', 'bad-file', 'fetching', 'chosen', 'offline', 'focus'],
  'S-02': ['found', 'no-qiskit', 'private-repo', 'scanning', 'offline', 'focus'],
  'S-03': ['issues', 'rejected', 'impractical', 'loading', 'offline', 'gpu-off', 'focus'],
  'S-04': ['never-run', 'loading', 'scoring', 'partial', 'gpu-off', 'focus'],
  'S-05': ['loading', 'error', 'offline', 'gpu-off', 'empty', 'focus'],
  'S-06': ['accepted', 'rejected', 'inconclusive', 'invalid', 'verifying', 'worse-than-before', 'loading', 'empty', 'offline', 'focus'],
  'S-07': ['running', 'paused', 'stalled', 'budget-hit', 'stopped-by-the-user', 'loading', 'empty', 'error', 'offline', 'focus'],
  'S-09': ['complete', 'partial', 'one-round', 'loading', 'error', 'offline', 'gpu-off', 'empty', 'focus'],
  'S-10': ['downloaded', 'converting', 'converted', 'added', 'no-repo', 'error', 'loading', 'offline', 'empty', 'focus'],
  'S-11': ['regressed', 'partial', 'first-run', 'running', 'error', 'gpu-off', 'focus'],
  'S-12': ['no-runs-yet', 'one-run', 'many', 'action-not-installed', 'loading', 'error', 'offline', 'gpu-off', 'keyboard-focus'],
  'S-13': ['no-runs-yet', 'loading', 'sync-failed', 'signed-out', 'no-match', 'focus', 'offline', 'gpu-off', 'run-failed'],
  'S-14': ['loading', 'no-conformance-runs', 'error', 'one-layer-only', 'no-match', 'sorted-by-latency', 'focus', 'failed-kit', 'gpu-off', 'stale', 'offline'],
  'S-15': ['no-predictor', 'screening', 'all-screened', 'verified-wrong', 'loading', 'keyboard-focus', 'gpu-off', 'offline', 'empty'],
  'S-16': ['training', 'evaluating', 'keyboard-focus', 'gpu-busy', 'conform-failed', 'loading', 'gpu-off', 'offline', 'empty'],
  'S-17': ['typing', 'signing-in', 'wrong-password', 'session-ended', 'offline'],
  'S-18': ['empty', 'keyboard-focus', 'invalid-email', 'weak-password', 'email-in-use', 'creating', 'created', 'offline'],
  'S-19': ['signed-out', 'editing', 'saved', 'sync-failed', 'offline', 'delete-confirmation', 'loading', 'keyboard-focus', 'empty', 'token-created'],
}

const BASE = process.env.BASE ?? 'http://localhost:5173'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'tests', 'output', 'states')
fs.mkdirSync(out, { recursive: true })

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(STATES)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// tiles at half size, three per row
const TW = 720
const TH = 450
const COLS = 3

for (const id of ids) {
  const shots = []
  for (const state of STATES[id]) {
    await page.goto(`${BASE}/?shot=${id}-${state}#${SCREENS[id]}?state=${state}`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(900)
    const failed = await page.getByText('failed to render').count()
    if (failed) errors.push(`${id} ${state}: render error`)
    const buf = await page.screenshot({ scale: 'css' })
    shots.push({ state, png: PNG.sync.read(buf) })
  }
  const rows = Math.ceil(shots.length / COLS)
  const sheet = new PNG({ width: COLS * TW, height: rows * TH })
  sheet.data.fill(0)
  shots.forEach(({ png }, i) => {
    const ox = (i % COLS) * TW
    const oy = Math.floor(i / COLS) * TH
    // 2:1 box downscale
    for (let y = 0; y < TH; y++)
      for (let x = 0; x < TW; x++) {
        const d = ((oy + y) * sheet.width + ox + x) * 4
        for (let c = 0; c < 3; c++) {
          let sum = 0
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++) sum += png.data[((y * 2 + dy) * png.width + x * 2 + dx) * 4 + c]
          sheet.data[d + c] = sum / 4
        }
        sheet.data[d + 3] = 255
      }
  })
  fs.writeFileSync(path.join(out, `${id}.png`), PNG.sync.write(sheet))
  console.log(`${id}: ${shots.map((s) => s.state).join(', ')} → tests/output/states/${id}.png`)
}

await browser.close()
if (errors.length) {
  console.log('errors:\n' + errors.join('\n'))
  process.exitCode = 1
}
