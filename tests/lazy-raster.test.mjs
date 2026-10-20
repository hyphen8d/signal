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
// radio itself and the effects that draw beam-resolution bitmaps
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

for (const [station, fx] of [
  ['distortion-field', 'flame'],
  ['nin', 'dread'],
  ['cold-wave', 'frost'],
  ['city-lights', 'ripple'],
  ['green-room', 'flowfield'],
  ['drift-mode', 'aurora'],
]) {
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
