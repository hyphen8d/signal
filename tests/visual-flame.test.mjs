// FLAME at beam resolution, and the per-effect afterglow (both 2026-09-21,
// adapted from Cyberspace TERMINAL -- see visuals/flame.js and
// drawVisualizerFrame). The character-reading tests elsewhere cannot see
// FLAME at all any more: a putGlyph() cell holds a space. So these read the
// gfx plane, which is the only proof the pixels land.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { boot } from './harness.mjs'

const VIZ_BOT = 22

async function rig() {
  const h = await boot({ station: 'distortion-field' })
  const { Term } = await import('../src/term.js')
  const { parseBDF } = await import('../src/bdf.js')
  const font = parseBDF(readFileSync(new URL('../fonts/ter-u16n.bdf', import.meta.url), 'utf8'))
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const fx = VISUALS.flame
  const p = h.program
  // Drive the effect directly, the way visuals.test.mjs's width test does:
  // drawVisualizerFrame() overwrites p._au from the live tap every frame,
  // and these need to choose the signal.
  const run = (bass, seconds = 4) => {
    const term = new Term(font, 80, 25, 6, 5)
    p.muted = false
    p._au = { level: 0.5, bass, mid: 0.4, treble: 0.3, bands9: new Array(9).fill(0.4), onset: false, pulse: 0 }
    fx.init(p, term)
    fx.reset(p)
    for (let t = 0; t <= seconds; t += 1 / 60) fx.draw(p, { term }, t)
    return term
  }
  return { h, fx, p, run }
}

/** Lit pixels per cell row, rows 0..24. */
function litByRow(term) {
  const out = new Array(term.rows).fill(0)
  for (let y = 0; y < term.rows; y++) {
    for (let x = 0; x < term.cols; x++) {
      const bits = term.gfx[y * term.cols + x]
      if (!bits) continue
      for (const row of bits) { let r = row; while (r) { out[y] += r & 1; r >>>= 1 } }
    }
  }
  return out
}

test('FLAME draws in pixels, inside the canvas only, and tapers from the bed up', async () => {
  const { h, run } = await rig()
  try {
    const term = run(0.6)
    const lit = litByRow(term)
    assert.equal(lit[0], 0, 'nothing on the title row')
    for (let y = VIZ_BOT; y < term.rows; y++) assert.equal(lit[y], 0, `nothing on footer row ${y}`)
    const bottom = lit.slice(15, VIZ_BOT).reduce((a, b) => a + b, 0)
    const top = lit.slice(1, 8).reduce((a, b) => a + b, 0)
    assert.ok(bottom > 0, 'the bed burns')
    // The whole reason for the rewrite: in characters the column stayed lit
    // to the top (48th pass). Here the top third must be well under the bed.
    assert.ok(top < bottom / 3, `tapers: top ${top} vs bottom ${bottom}`)
    // And never a solid bar: TONE caps a cell at 80% lit.
    const bedCell = term.gfx[20 * term.cols + 40]
    if (bedCell) assert.ok(bedCell.some((r) => r !== 0xff), 'even the bed keeps dark pixels')
  } finally { h.shutdown() }
})

test('FLAME hands the grid a fresh bitmap every step (a same-reference re-put is a no-op)', async () => {
  const { h, fx, p, run } = await rig()
  try {
    const term = run(0.6, 2)
    const before = term.gfx.slice()
    fx.draw(p, { term }, 2 + 0.05) // past one 30Hz step
    let lit = 0
    let reused = 0
    for (let i = term.cols; i < VIZ_BOT * term.cols; i++) {
      if (!before[i] || !term.gfx[i]) continue
      lit++
      if (before[i] === term.gfx[i]) reused++
    }
    assert.ok(lit > 50, 'plenty of cells lit on both sides of the step')
    // Rewriting one buffer in place -- upstream's shape -- keeps every
    // reference, and cellgrid.js would never re-raster the fire.
    assert.equal(reused, 0, `${reused} of ${lit} cells kept last step's bitmap object`)
  } finally { h.shutdown() }
})

test('FLAME burns taller on bass', async () => {
  const { h, run } = await rig()
  try {
    const height = (term) => {
      const lit = litByRow(term)
      const top = lit.findIndex((n, y) => y >= 1 && n > 20)
      return top < 0 ? 0 : VIZ_BOT - top
    }
    const quiet = height(run(0))
    const loud = height(run(1))
    assert.ok(loud > quiet + 2, `bass should raise the flame: quiet ${quiet} rows, loud ${loud}`)
  } finally { h.shutdown() }
})

test('an effect\'s own decay is a floor over the station\'s, and leaves with the visualizer', async () => {
  const h = await boot({ station: 'distortion-field' })
  try {
    h.powerOn()
    const { crtBase } = await import(`../crt-hooks.js?v=${globalThis.SIGNAL_BUILD}`)
    const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
    const params = h.crt.params
    const base = crtBase.decay
    const own = VISUALS.flowfield.decay
    assert.ok(own > base, `the test needs a station whose decay (${base}) is under FLOW FIELD's (${own})`)
    h.program.visualOverrides[h.program.lockedStation.id] = 'flowfield'
    h.key('v')
    if (h.program.tapConsentOpen) h.key('n')
    h.advance(200)
    assert.equal(h.program.activeVisualKey(), 'flowfield')
    assert.equal(params.decay, own, 'the effect\'s afterglow is up')
    h.key('e')
    h.advance(200)
    assert.equal(h.program.visualizerActive, false)
    assert.equal(params.decay, base, 'and the dial gets the station\'s back')
    // Power-down leaves the visualizer without exitVisualizer().
    h.key('v')
    if (h.program.tapConsentOpen) h.key('n')
    h.advance(200)
    assert.equal(params.decay, own)
    // [P] is not a visualizer key; what switches the set off from in here
    // is the sleep timer, through powerDown().
    h.program.powerDown(h.screen)
    h.advance(2000)
    assert.equal(h.program.poweredOn, false)
    assert.equal(params.decay, base, 'STANDBY does not inherit a trail')
    // A floor, not an override: an effect asking for LESS afterglow than
    // the station runs gets the station's.
    const saved = VISUALS.flowfield.decay
    VISUALS.flowfield.decay = base - 0.05
    try {
      h.powerOn()
      h.program.visualOverrides[h.program.lockedStation.id] = 'flowfield'
      h.key('v')
      if (h.program.tapConsentOpen) h.key('n')
      h.advance(200)
      assert.equal(h.program.visualizerActive, true)
      assert.equal(params.decay, base, 'the station\'s longer afterglow wins')
    } finally { VISUALS.flowfield.decay = saved }
  } finally { h.shutdown() }
})
