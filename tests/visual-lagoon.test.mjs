// LAGOON (TRADEWINDS, 2026-09-13) -- what the effect actually leaves on the
// grid, read back off it the way tests/visuals.test.mjs reads BREACH's words:
// the canvas contract (every cell of rows 1..21 repainted, nothing outside),
// that it moves, that re-entry after a long visit carries no stale flare,
// and that the three things the picture promises -- a round moon, a horizon,
// and the moon's reflection UNDER the moon -- are legible every frame.
//
// Run: node --test tests/visual-lagoon.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from './harness.mjs'
import { parseBDF } from '../src/bdf.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const VIZ_BOT = 22
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000

async function bootLagoon() {
  const h = await boot({ station: 'tradewinds' })
  h.powerOn()
  h.key('v')
  assert.equal(h.program.activeVisualKey(), 'lagoon', 'TRADEWINDS should land on LAGOON')
  return h
}

/** The effect module from the SAME instance the program imported. */
async function lagoonModule() {
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  return VISUALS.lagoon
}

/** Moon cells: the disc's fill, maria and rim characters, in the sky rows. */
function moonCells(h) {
  const cells = []
  for (let y = 1; y < 13; y++) {
    const r = h.row(y)
    for (let x = 0; x < r.length; x++) if ('@#O'.includes(r[x])) cells.push({ x, y })
  }
  return cells
}

test('LAGOON: repaints every canvas cell and nothing outside rows 1..21', async () => {
  const h = await bootLagoon()
  try {
    h.advance(1500)
    const fx = await lagoonModule()
    const put = h.term.put
    const hit = new Uint8Array(h.term.cols * VIZ_BOT)
    const outside = []
    h.term.put = function (x, y, ...rest) {
      if (y < 1 || y >= VIZ_BOT) outside.push(`${x},${y}`)
      else if (x >= 0 && x < this.cols) hit[y * this.cols + x] = 1
      return put.call(this, x, y, ...rest)
    }
    try {
      fx.draw(h.program, { term: h.term }, effectT(h))
    } finally { h.term.put = put }
    assert.deepEqual(outside.slice(0, 5), [], `${outside.length} puts landed outside the canvas`)
    let missed = 0
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) if (!hit[y * h.term.cols + x]) missed++
    assert.equal(missed, 0, `${missed} canvas cells were not repainted this frame`)
    let lit = 0
    for (let y = 1; y < VIZ_BOT; y++) lit += h.row(y).replace(/ /g, '').length
    assert.ok(lit > 400, `only ${lit} non-space cells on the canvas`)
  } finally { h.shutdown() }
})

test('LAGOON: every character it draws exists in the BDF font', async () => {
  const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
  const h = await bootLagoon()
  try {
    const seen = new Set()
    for (let i = 0; i < 120; i++) {
      h.advance(100)
      for (let y = 1; y < VIZ_BOT; y++) for (const ch of h.row(y)) seen.add(ch)
    }
    const missing = [...seen].filter((ch) => !font.glyphs.has(ch.codePointAt(0)))
    assert.deepEqual(missing, [], 'glyphs not in ter-u16n.bdf render as blanks')
  } finally { h.shutdown() }
})

test('LAGOON: the scene moves', async () => {
  const h = await bootLagoon()
  try {
    h.advance(1000)
    const a = Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1)).join('\n')
    h.advance(1200)
    const b = Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1)).join('\n')
    assert.notEqual(a, b, 'two frames 1.2s apart are identical')
  } finally { h.shutdown() }
})

test('LAGOON: re-entry after a long visit carries no flare from the previous visit', async () => {
  // _lagoonFlareAt is the effect's one absolute effect-clock value. Forced to
  // the end of a two-minute visit (as DREAD's tear is forced), then muted so
  // no synthetic onset can overwrite it during the check -- without that, a
  // missing reset() hides behind the next random onset about three runs in
  // four. The draw does not self-heal it, so reset() is what this tests.
  // 2026-09-13 (audit L12) -- the two minutes are compressed: the entry stamp
  // is moved back 120s instead of rendering 7500 frames of it. What this bug
  // class needs is an effect clock ~120s ahead at exit, and the draw's t is
  // computed from _vizEnterAt (visualizer.js), so that is exactly the state a
  // real long visit leaves. Still red with reset() emptied.
  const h = await bootLagoon()
  try {
    h.advance(1000)
    h.program._vizEnterAt -= 120000
    h.advance(500)
    h.program._lagoonFlareAt = effectT(h)
    h.program.muted = true
    h.key('e')
    h.advance(500)
    h.key('v')
    h.advance(2000)
    const t = effectT(h)
    assert.ok(t < 5, `effect clock should have restarted (t=${t.toFixed(1)})`)
    assert.ok(!(h.program._lagoonFlareAt > t), `flare stamped at ${h.program._lagoonFlareAt}s on a clock at ${t.toFixed(1)}s`)
    assert.ok(moonCells(h).length > 60, 'the moon should still be up after re-entry')
    let lit = 0
    for (let y = 1; y < VIZ_BOT; y++) lit += h.row(y).replace(/ /g, '').length
    assert.ok(lit > 300, `only ${lit} non-space cells after re-entry`)
  } finally { h.shutdown() }
})

test('LAGOON: a round moon above a horizon, with its reflection under it', async () => {
  const h = await bootLagoon()
  try {
    for (let i = 0; i < 40; i++) {
      h.advance(150)
      // The moon: a disc roughly twice as wide as it is tall in cells, which
      // is what a circle is on ~2:1 cells.
      const moon = moonCells(h)
      assert.ok(moon.length > 60, `moon has only ${moon.length} cells`)
      const xs = moon.map((c) => c.x), ys = moon.map((c) => c.y)
      const w = Math.max(...xs) - Math.min(...xs) + 1
      const ht = Math.max(...ys) - Math.min(...ys) + 1
      assert.ok(w >= 13 && w <= 17 && ht >= 6 && ht <= 8, `moon is ${w}x${ht} cells`)
      assert.ok(w / ht > 1.7 && w / ht < 2.6, `moon aspect ${(w / ht).toFixed(2)} is not a circle on 2:1 cells`)
      const moonX = (Math.max(...xs) + Math.min(...xs)) / 2
      const moonBottom = Math.max(...ys)

      // The horizon: a row that is mostly the horizon rule, below the moon
      // and about two-thirds of the way down the canvas.
      let horizon = -1
      for (let y = 1; y < VIZ_BOT; y++) if ((h.row(y).match(/─/g) || []).length >= 40) { horizon = y; break }
      assert.ok(horizon >= 12 && horizon <= 15, `no horizon row near two-thirds down (found ${horizon})`)
      assert.ok(horizon > moonBottom, 'the moon should sit above the horizon')

      // The reflection: '=' dashes are drawn only by the moon path, and they
      // must sit under the moon -- centred on it, never far off it.
      const dashes = []
      for (let y = horizon + 1; y < VIZ_BOT; y++) {
        const r = h.row(y)
        for (let x = 0; x < r.length; x++) if (r[x] === '=') dashes.push(x)
      }
      assert.ok(dashes.length >= 4, `only ${dashes.length} reflection dashes`)
      const mean = dashes.reduce((a, b) => a + b, 0) / dashes.length
      assert.ok(Math.abs(mean - moonX) <= 3, `reflection centred at ${mean.toFixed(1)}, moon at ${moonX}`)
      assert.ok(dashes.every((x) => Math.abs(x - moonX) <= 9), 'a reflection dash strayed from under the moon')
    }
  } finally { h.shutdown() }
})

test('LAGOON: torches stand on the beach and flare on an onset', async () => {
  const h = await bootLagoon()
  try {
    h.program.muted = true // no synthetic onsets: the flare below is the only one
    h.advance(1000)
    const cups = () => Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1)).join('\n').split('\\#/').length - 1
    const tongues = () => Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1)).join('').split('*').length - 1
    assert.equal(cups(), 2, 'both torch cups should be on the grid')
    const before = tongues()
    h.program._lagoonFlareAt = effectT(h)
    h.advance(50)
    assert.ok(tongues() >= before + 2, 'an onset should flare both flames')
    h.advance(1500)
    assert.equal(tongues(), before, 'the flare should die back down within a moment')
  } finally { h.shutdown() }
})
