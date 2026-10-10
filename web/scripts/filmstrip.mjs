/**
 * Filmstrips of the live flow, to review motion frame by frame against the storyboards (M1–M6, DS-07).
 *
 *   node scripts/filmstrip.mjs            # normal motion  → tests/output/film/
 *   REDUCED=1 node scripts/filmstrip.mjs  # reduced motion → tests/output/film-reduced/
 *   BASE=http://localhost:5174 node scripts/filmstrip.mjs
 *
 * Frames come from the compositor (CDP screencast), so view transitions and CSS animations are
 * captured as painted. Each sheet shows one frame per step with its time since the action.
 * Also writes vt.json: for each screen change, which view-transition groups morphed (old + new)
 * and which only faded.
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const REDUCED = !!process.env.REDUCED
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'tests', 'output', REDUCED ? 'film-reduced' : 'film')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

/* ── Capture ─────────────────────────────────────────────────────────── */
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: REDUCED ? 'reduce' : 'no-preference',
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const cdp = await ctx.newCDPSession(page)

let buffer = null // frames of the current recording: { t (ms, wall clock), data (base64 png) }
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  if (buffer) buffer.push({ t: metadata.timestamp * 1000, data })
  try {
    await cdp.send('Page.screencastFrameAck', { sessionId })
  } catch {}
})
await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 720, maxHeight: 450, everyNthFrame: 1 })

/** Record while `act` runs and for `ms` after it starts. Returns frames with t relative to the action. */
async function record(ms, act) {
  await page.evaluate(() => {
    window.__vt = null
    window.__vtTransition = null
  })
  buffer = []
  // a still page sends no frames; force one so the "before" state is in the strip
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())))
  const t0 = Date.now()
  await act()
  await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)))
  const frames = buffer.map((f) => ({ ...f, t: f.t - t0 }))
  buffer = null
  return frames
}

/** Record which view-transition pseudo elements animate during the next screen change. */
async function watchViewTransition() {
  await page.evaluate(() => {
    window.__vt = null
    const orig = document.startViewTransition?.bind(document)
    if (!orig || window.__vtPatched) return
    window.__vtPatched = true
    document.startViewTransition = (cb) => {
      const vt = orig(cb)
      vt.ready.then(() => {
        const names = {}
        for (const a of document.getAnimations()) {
          const pe = a.effect?.pseudoElement
          if (!pe) continue
          const m = pe.match(/::view-transition-(group|old|new|image-pair)\((.+)\)/)
          if (!m) continue
          names[m[2]] ??= new Set()
          names[m[2]].add(m[1])
        }
        window.__vt = Object.fromEntries(
          Object.entries(names).map(([k, v]) => [k, [...v].sort().join('+')]),
        )
        window.__vtTransition = document.documentElement.dataset.transition ?? null
      })
      return vt
    }
  })
}
const vtLog = {}
async function readViewTransition(label) {
  await page.waitForTimeout(50)
  const r = await page.evaluate(() => ({ groups: window.__vt, name: window.__vtTransition }))
  vtLog[label] = r
}

/* ── Contact sheets ──────────────────────────────────────────────────── */
// 3×5 digits plus a few glyphs, drawn at 2× for labels.
const GLYPHS = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
  4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001',
  8: '111101111101111', 9: '111101111001111', '+': '000010111010000', '-': '000000111000000',
  m: '000000111111101', s: '000011010001110', ' ': '000000000000000',
}
function drawText(img, x, y, text, color = [255, 255, 255], scale = 2) {
  let cx = x
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS[' ']
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++)
        if (g[r * 3 + c] === '1')
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) {
              const px = cx + c * scale + dx
              const py = y + r * scale + dy
              if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue
              const i = (py * img.width + px) * 4
              img.data[i] = color[0]
              img.data[i + 1] = color[1]
              img.data[i + 2] = color[2]
              img.data[i + 3] = 255
            }
    cx += 4 * scale
  }
}

/** Half-size a frame by 2×2 averaging (720×450 → 360×225). */
function half(png) {
  const w = png.width >> 1
  const h = png.height >> 1
  const o = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let k = 0; k < 4; k++) {
        const i = ((y * 2) * png.width + x * 2) * 4 + k
        const j = ((y * 2 + 1) * png.width + x * 2) * 4 + k
        o.data[(y * w + x) * 4 + k] = (png.data[i] + png.data[i + 4] + png.data[j] + png.data[j + 4]) >> 2
      }
  return o
}

/**
 * One frame per `step` ms from `from` to `to` (the latest frame painted at or before each tick),
 * laid out `cols` per row. `full` keeps 720×450 frames for close reading.
 */
function sheet(name, frames, { from = 0, to = 900, step = 40, cols = 6, full = false } = {}) {
  const ticks = []
  for (let t = from; t <= to; t += step) {
    let pick = null
    for (const f of frames) if (f.t <= t) pick = f
    if (!pick) pick = frames[0]
    if (pick) ticks.push({ t, f: pick })
  }
  if (!ticks.length) return console.log(`${name}: no frames`)
  const decoded = new Map()
  const img = (f) => {
    if (!decoded.has(f)) {
      const p = PNG.sync.read(Buffer.from(f.data, 'base64'))
      decoded.set(f, full ? p : half(p))
    }
    return decoded.get(f)
  }
  const fw = img(ticks[0].f).width
  const fh = img(ticks[0].f).height
  const pad = 8
  const label = 16
  const rows = Math.ceil(ticks.length / cols)
  const W = pad + cols * (fw + pad)
  const H = pad + rows * (fh + label + pad)
  const s = new PNG({ width: W, height: H })
  for (let i = 0; i < s.data.length; i += 4) {
    s.data[i] = 6
    s.data[i + 1] = 20
    s.data[i + 2] = 25
    s.data[i + 3] = 255
  }
  ticks.forEach(({ t, f }, i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    const x = pad + c * (fw + pad)
    const y = pad + r * (fh + label + pad)
    // repeated frame (nothing painted since the last tick) gets a dim label
    const same = i > 0 && ticks[i - 1].f === f
    drawText(s, x, y + 2, `${t >= 0 ? '+' : ''}${t}ms`, same ? [102, 126, 131] : [255, 255, 255])
    PNG.bitblt(img(f), s, 0, 0, fw, fh, x, y + label)
  })
  const file = path.join(out, `${name}.png`)
  fs.writeFileSync(file, PNG.sync.write(s))
  console.log(`${name}  ${ticks.length} frames  → ${path.relative(root, file)}`)
}

/* ── The flow ────────────────────────────────────────────────────────── */
const btn = (name, exact = true) => page.getByRole('button', { name, exact })

await page.goto(`${BASE}/#/new`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(800)
await watchViewTransition()

// S-01 → S-03
await page.getByText('sidechain_qaoa', { exact: true }).first().click()
let f = await record(1000, () => btn('Continue').click())
await readViewTransition('S-01 → S-03')
sheet('01-s01-to-s03', f, { to: 900 })
sheet('01-detail', f, { from: 40, to: 440, step: 80, cols: 3, full: true })
await page.getByText('No issues').waitFor()
await page.waitForTimeout(400)

// S-03 → S-04, M1 scan, M2 findings, rounds filling (one long recording)
f = await record(8200, () => btn('Confirm and score').click())
await readViewTransition('S-03 → S-04 (M1)')
sheet('02-s03-to-s04-confirm', f, { to: 900 })
sheet('02-detail', f, { from: 40, to: 440, step: 80, cols: 3, full: true })
sheet('03-m1-scan', f, { from: 0, to: 4400, step: 200 })
sheet('04-m2-findings-land', f, { from: 4000, to: 4800, step: 40 })
sheet('05-rounds-filling', f, { from: 4700, to: 8100, step: 170 })

// S-04 → S-06 (M3), candidate writing → verifying → verified, verdict count (M4 beat 1)
await btn('Running round 3 of 4 (41%)', false).waitFor({ timeout: 8000 })
await page.waitForTimeout(500)
const d03 = page.locator('article', { hasText: 'Commuting block can be reordered' })
f = await record(3000, () => d03.getByRole('button', { name: 'Request fix' }).click())
await readViewTransition('S-04 → S-06 (M3)')
sheet('06-m3-request-fix', f, { to: 900 })
sheet('06-detail', f, { from: 40, to: 440, step: 80, cols: 3, full: true })
sheet('07-candidate-writing-to-verified', f, { from: 600, to: 2200, step: 100 })
sheet('08-m4-verdict-count', f, { from: 1800, to: 2800, step: 40 })

// Accept (M4 beat 2), S-06 → S-07, round 4, stop card (M5)
await btn('Accept').waitFor()
await page.waitForTimeout(300)
await watchViewTransition()
f = await record(3600, () => btn('Accept').click())
await readViewTransition('S-06 → S-07')
sheet('09-m4-accept', f, { to: 800 })
sheet('10-s06-to-s07', f, { from: 650, to: 1550 })
sheet('10-detail', f, { from: 760, to: 1160, step: 80, cols: 3, full: true })
sheet('11-m5-round4-and-stop', f, { from: 1000, to: 3500, step: 100 })

// S-07 → S-09 report split
await page.getByText('Engine recommendation').waitFor({ timeout: 8000 })
await page.waitForTimeout(500)
f = await record(1400, () => btn('Export final').click())
await readViewTransition('S-07 → S-09 (M5)')
sheet('12-s07-to-s09-report', f, { to: 1300 })
sheet('12-detail', f, { from: 40, to: 840, step: 80, cols: 3, full: true })

// S-09 → S-10
await page.waitForTimeout(600)
f = await record(1000, () => btn('Export').click())
await readViewTransition('S-09 → S-10')
sheet('13-s09-to-s10', f, { to: 900 })

// Rail navigation: Export → Runs
await page.waitForTimeout(500)
f = await record(1000, () => page.getByRole('button', { name: 'Runs', exact: true }).first().click())
await readViewTransition('rail → Runs')
sheet('14-rail-to-runs', f, { to: 900 })

// Inspector section collapse and expand (deep link S-04)
await page.goto(`${BASE}/#/workspace`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
f = await record(700, () => page.getByRole('button', { name: /^Budget/ }).click())
sheet('15-section-collapse', f, { to: 600, step: 30 })
await page.waitForTimeout(300)
f = await record(700, () => page.getByRole('button', { name: /^Budget/ }).click())
sheet('16-section-expand', f, { to: 600, step: 30 })

await cdp.send('Page.stopScreencast')
await browser.close()
fs.writeFileSync(path.join(out, 'vt.json'), JSON.stringify({ viewTransitions: vtLog, errors }, null, 2))
console.log(JSON.stringify(vtLog, null, 2))
if (errors.length) console.log('page errors:', errors)
