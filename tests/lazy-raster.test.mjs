// The harness's lazy raster is exact (2026-10-20, test-speed pass).
//
// tests/harness.mjs used to rasterise the real Term after every simulated
// frame; it now rasterises only when something reads the framebuffer
// (h.fb / h.flushRaster()). The claim that makes that safe is that a
// deferred raster paints the SAME BYTES as a raster per frame -- CellGrid's
// dirty rows accumulate until raster() clears them, and each dirty row is
// redrawn from the planes' current state. This proves it the only way that
// counts: one seed, two boots, one rasterising every frame and one only at
// the checkpoints, and the framebuffers compared byte for byte -- across the
// radio itself and every effect that draws beam-resolution bitmaps
// through putGlyph(), which are where a deferred raster could plausibly
// diverge (a bitmap mutated in place without a fresh putGlyph() -- see the
// note in the harness's advance()).
//
// Mutation-checked: making flushRaster() skip the raster leaves the lazy
// framebuffer at its allocation zeros and this goes red at the first
// checkpoint; it is also the only test in the suite that reads term.fb, so it
// is what stands between that flush and silent rot.
//
// Run: node --test tests/

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

// xorshift32, the same generator tools/dead-feedback.mjs seeds with: both
// boots must draw the identical random stream.
function seedRandom() {
  let s = 0x2545F491
  Math.random = () => {
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

// Row 0's clock reads the REAL time (`new Date()`, which the fake clock does
// not reach -- the same reason dead-feedback masks it), so two boots a second
// apart can differ there for reasons that have nothing to do with rastering.
function masked(h, fb) {
  const out = Uint8Array.from(fb)
  const y1 = h.term.padY + h.term.font.cellH
  out.fill(0, 0, y1 * h.term.w)
  return out
}

async function run(station, fx, eagerRaster) {
  const rnd = Math.random
  seedRandom()
  const h = await boot({ station, eagerRaster })
  const shots = []
  // Eager mode must not flush either, or both runs are lazy-at-checkpoints:
  // read term.fb directly there, h.fb (the flush) only in the lazy run.
  const snap = () => shots.push(masked(h, eagerRaster ? h.term.fb : h.fb))
  try {
    h.powerOn()
    snap() // the radio: dial, meters, status row
    h.key('v')
    assert.equal(h.program.activeVisualKey(), fx, `${station} should land on ${fx}`)
    h.advance(700)
    snap() // the effect, early
    h.advance(700)
    snap() // the effect, later -- bitmaps rewritten many times between
    h.key('e')
    h.advance(500)
    snap() // back to the radio over the effect's leftovers
  } finally {
    h.shutdown()
    Math.random = rnd
  }
  return shots
}

// The effects under test are DERIVED, not listed (2026-11-01, audit L3):
// every registered effect (visuals/index.js) whose module calls putGlyph(),
// each booted on the station that ships it. This test is the only
// same-bitmap guard most of those effects have -- deleting OUTRUN's
// double-buffer swap left all of OUTRUN's own tests green and only this one
// red -- so a hand-kept list that forgot the next pixel effect would leave
// it with no guard at all and nothing saying so. Comments are stripped
// before the search, so a module whose comments merely mention putGlyph
// is not mistaken for one that calls it.
const { readFileSync } = await import('node:fs')
const { VISUAL_KEYS } = await import('../visuals/index.js')
const { STATIONS, SECRET_STATIONS } = await import('../stations.js')
const callsPutGlyph = (key) => {
  const src = readFileSync(new URL(`../visuals/${key}.js`, import.meta.url), 'utf8')
  return /\.putGlyph\s*\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))
}
const PIXEL_EFFECTS = VISUAL_KEYS.filter(callsPutGlyph).map((fx) => {
  const station = [...STATIONS, ...SECRET_STATIONS].find((s) => s.visual === fx)
  return [station?.id, fx]
})

test('lazy raster: every putGlyph effect is covered, each from a station that ships it', () => {
  // A floor, so a broken search (a renamed method, a moved directory) that
  // finds nothing cannot pass by testing nothing: sixteen effects drew
  // through putGlyph when this was written.
  assert.ok(PIXEL_EFFECTS.length >= 16, `found only ${PIXEL_EFFECTS.length} putGlyph effects: ${PIXEL_EFFECTS.map(([, fx]) => fx)}`)
  const orphans = PIXEL_EFFECTS.filter(([station]) => !station).map(([, fx]) => fx)
  assert.deepEqual(orphans, [], 'a putGlyph effect no station ships cannot be booted onto here -- give this test a way to reach it')
})

for (const [station, fx] of PIXEL_EFFECTS.filter(([station]) => station)) {
  test(`lazy raster paints the same framebuffer as a raster per frame (${fx})`, async () => {
    const eager = await run(station, fx, true)
    const lazy = await run(station, fx, false)
    eager.forEach((e, i) => {
      // A framebuffer of zeros on both sides would compare equal and prove
      // nothing; the radio and every one of these effects light thousands
      // of pixels.
      const lit = e.reduce((n, v) => n + (v > 0), 0)
      assert.ok(lit > 2000, `${fx} checkpoint ${i}: eager framebuffer is nearly dark (${lit} lit)`)
      let first = -1, count = 0
      for (let p = 0; p < e.length; p++) if (e[p] !== lazy[i][p]) { if (first < 0) first = p; count++ }
      assert.equal(count, 0, `${fx} checkpoint ${i}: ${count} pixels differ, first at byte ${first}`)
    })
  })
}
