/**
 * Where a screen differs from its design export: tiles the diff into 48 px cells, ranks the cells
 * by differing pixels, merges neighbours, and writes a crop of design | code for each hotspot.
 *
 *   node scripts/hotspots.mjs S-04        # after `node scripts/diff.mjs S-04`
 *
 * Writes tests/output/hotspots/<id>-<n>.png and prints the hotspot list.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'tests', 'output', 'hotspots')
fs.mkdirSync(out, { recursive: true })
const CELL = 48
const MIN = Number(process.env.MIN ?? 90) // differing pixels per cell to count

for (const id of process.argv.slice(2)) {
  const design = PNG.sync.read(fs.readFileSync(path.join(root, 'tests', 'design', `${id}.png`)))
  const actual = PNG.sync.read(fs.readFileSync(path.join(root, 'tests', 'output', `${id}.actual.png`)))
  const diff = PNG.sync.read(fs.readFileSync(path.join(root, 'tests', 'output', `${id}.diff.png`)))
  const { width, height } = diff
  const cols = Math.ceil(width / CELL)
  const rows = Math.ceil(height / CELL)
  const count = new Array(cols * rows).fill(0)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      // pixelmatch paints differing pixels red-ish (r high, g and b low)
      if (diff.data[i] > 200 && diff.data[i + 1] < 120 && diff.data[i + 2] < 120) count[Math.floor(y / CELL) * cols + Math.floor(x / CELL)]++
    }
  const hot = new Set(count.map((c, i) => (c >= MIN ? i : -1)).filter((i) => i >= 0))
  // merge 4-neighbour hot cells into boxes
  const seen = new Set()
  const boxes = []
  for (const start of hot) {
    if (seen.has(start)) continue
    const stack = [start]
    let x0 = cols, y0 = rows, x1 = 0, y1 = 0, total = 0
    while (stack.length) {
      const c = stack.pop()
      if (seen.has(c) || !hot.has(c)) continue
      seen.add(c)
      const cx = c % cols, cy = Math.floor(c / cols)
      x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy)
      total += count[c]
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) stack.push(ny * cols + nx)
      }
    }
    boxes.push({ x: x0 * CELL, y: y0 * CELL, w: (x1 - x0 + 1) * CELL, h: (y1 - y0 + 1) * CELL, total })
  }
  boxes.sort((a, b) => b.total - a.total)
  const top = boxes.slice(0, 8)
  console.log(`${id}: ${boxes.length} hotspots${top.length ? '' : ' (none above threshold)'}`)
  top.forEach((b, n) => {
    const pad = 24
    const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad)
    const w = Math.min(width - x, b.w + 2 * pad), h = Math.min(height - y, b.h + 2 * pad)
    const crop = new PNG({ width: w * 2 + 8, height: h })
    for (let i = 0; i < crop.data.length; i += 4) { crop.data[i] = 0; crop.data[i + 1] = 0; crop.data[i + 2] = 0; crop.data[i + 3] = 255 }
    PNG.bitblt(design, crop, x, y, w, h, 0, 0)
    PNG.bitblt(actual, crop, x, y, w, h, w + 8, 0)
    const file = path.join(out, `${id}-${n + 1}.png`)
    fs.writeFileSync(file, PNG.sync.write(crop))
    console.log(`  ${n + 1}. at ${x},${y} ${w}x${h} · ${b.total} px → tests/output/hotspots/${id}-${n + 1}.png`)
  })
}
