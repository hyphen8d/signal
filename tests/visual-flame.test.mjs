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

test('FLAME burns taller on bass, all the way up the range', async () => {
  // 2026-10-12 (audit) -- this used to read the height four seconds in, with
  // "lit" meaning 20 pixels in a row, and passed with FIRE_CAP set back to
  // FIRE_MAX: the fire climbs one sim row per 30Hz step, ~5.6s to the top of
  // the canvas, so at 4s both versions were still rising and both read 12
  // rows. It was measuring the climb, not the height. Settled (past 8s,
  // averaged over two seconds of frames, a row counting once a tenth of its
  // pixels are lit) the numbers are quiet 1 / mid 9 / loud 19 rows, and 9 /
  // 14-15 with the cap undone -- the top of the bass range is exactly what
  // FIRE_CAP buys, so that is the gap asserted. Repeatable across seeds.
  const { h, fx, p } = await rig()
  try {
    const { Term } = await import('../src/term.js')
    const { parseBDF } = await import('../src/bdf.js')
    const font = parseBDF(readFileSync(new URL('../fonts/ter-u16n.bdf', import.meta.url), 'utf8'))
    const settled = (bass) => {
      const term = new Term(font, 80, 25, 6, 5)
      p.muted = false
      p._au = { level: 0.5, bass, mid: 0.4, treble: 0.3, bands9: new Array(9).fill(0.4), onset: false, pulse: 0 }
      fx.init(p, term)
      fx.reset(p)
      const acc = new Array(term.rows).fill(0)
      let n = 0
      for (let t = 0; t <= 10; t += 1 / 60) {
        fx.draw(p, { term }, t)
        if (t >= 8) { litByRow(term).forEach((v, y) => { acc[y] += v }); n++ }
      }
      const rowPx = term.cols * term.font.cellW * term.font.cellH
      const top = acc.findIndex((v, y) => y >= 1 && v / n > rowPx / 10)
      return top < 0 ? 0 : VIZ_BOT - top
    }
    const quiet = settled(0)
    const mid = settled(0.5)
    const loud = settled(1)
    assert.ok(mid > quiet + 4, `bass should raise the flame: quiet ${quiet} rows, mid ${mid}`)
    assert.ok(loud >= mid + 8, `the loudest bass should stand well over a middling one (FIRE_CAP): mid ${mid}, loud ${loud}`)
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

// ---- 2026-10-12 (audit) -- tests that stayed green with their feature
// broken. Each one below was mutation-run: the named break, suite red.

test('FLAME draws its hottest cells: NORMAL is attribute 0, so `lit` -- not `attr` -- says which cells burn', async () => {
  // flame.js keeps a separate `lit` plane because using attr 0 as "blank"
  // once blanked every cell hot enough to be NORMAL: the core of the fire
  // came out as dark holes. The first test above only looked at one cell,
  // and only `if` it was drawn, so that regression passed it.
  const { h, p, run } = await rig()
  try {
    const { NORMAL } = await import('../src/term.js')
    assert.equal(NORMAL, 0, 'the trap this test exists for')
    const term = run(1, 6)
    const F = p._fire
    let hottest = 0
    const holes = []
    for (let i = 0; i < F.lit.length; i++) {
      if (!F.lit[i] || F.attr[i] !== NORMAL) continue
      hottest++
      if (!term.gfx[i + term.cols]) holes.push(i)
    }
    assert.ok(hottest > 50, `a loud fire has a NORMAL core to check (saw ${hottest} cells)`)
    assert.equal(holes.length, 0, `${holes.length} of the ${hottest} hottest cells drew nothing`)
  } finally { h.shutdown() }
})

test('FLAME never lights a whole cell: TONE caps the dither below solid', async () => {
  // Read across the whole canvas, not one cell: at the cap a cell lights 13
  // of every 16 dither positions, and without it the bed is solid bars.
  const { h, run } = await rig()
  try {
    const term = run(1, 6)
    const full = term.font.cellW * term.font.cellH
    let atCap = 0
    const solid = []
    for (let i = term.cols; i < VIZ_BOT * term.cols; i++) {
      const bits = term.gfx[i]
      if (!bits) continue
      let n = 0
      for (const row of bits) { let r = row; while (r) { n += r & 1; r >>>= 1 } }
      if (n === full) solid.push(i)
      if (n >= full * 0.75) atCap++
    }
    assert.ok(atCap > 100, `the test needs cells running at the cap (saw ${atCap})`)
    assert.equal(solid.length, 0, `${solid.length} cells lit solid`)
  } finally { h.shutdown() }
})

test('FLAME: re-entry after a long visit keeps the fire burning (the 50th pass, held)', async () => {
  // The effect clock restarts at 0 on every entry. A step time left at ~120s
  // from the last visit sits in the future and gates the simulation off --
  // the original FLAME freeze. Two guards (reset() and the draw's
  // clock-went-backwards re-arm); this fails with both removed. Same shape
  // as visuals.test.mjs's BREACH/RIPPLE/DREAD re-entry tests.
  const h = await boot({ station: 'distortion-field' })
  try {
    h.powerOn()
    h.key('v')
    if (h.program.tapConsentOpen) h.key('n')
    assert.equal(h.program.activeVisualKey(), 'flame')
    // Two minutes in coarse frames: the fire's own catch-up snaps its step
    // clock forward on a long frame, so this leaves it where a real long
    // visit does (~120s) at a twentieth of the cost of 16ms frames.
    h.advance(120000, 500)
    assert.ok(h.program._fireLastStep > 100, 'setup: the step clock is far ahead of a fresh visit')
    h.key('e')
    h.advance(500)
    h.key('v')
    if (h.program.tapConsentOpen) h.key('n')
    h.advance(1000)
    const tick = h.program._fire.tick
    h.advance(1000)
    const t = (Date.now() - h.program._vizEnterAt) / 1000
    assert.ok(h.program._fireLastStep <= t + 1e-6, `next step at ${h.program._fireLastStep.toFixed(1)}s on a clock at ${t.toFixed(1)}s`)
    assert.ok(h.program._fire.tick - tick >= 20, `the fire stepped ${h.program._fire.tick - tick} times in a second of re-entry`)
  } finally { h.shutdown() }
})

test('the lyrics view and the game keep the station\'s persistence, not the effect\'s afterglow', async () => {
  // drawVisualizerFrame()'s `own` is gated on !gameOpen && !lyricsViewOpen:
  // text crawling under a 0.88 trail smears, and the game's bullets are dots
  // on purpose. Nothing asserted that gate.
  // DISTORTION FIELD lists no instrumental tracks, so the canned lyric is
  // asked for and [L] can open for real.
  const h = await boot({ station: 'distortion-field', player: true, lyrics: true })
  try {
    h.powerOn()
    await h.flush() // the LRCLIB chain is a real promise chain
    h.advance(100)
    const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
    const { crtBase } = await import(`../crt-hooks.js?v=${globalThis.SIGNAL_BUILD}`)
    const base = crtBase.decay
    const own = VISUALS.flowfield.decay
    assert.ok(own > base, 'the scenario needs an effect decay over the station\'s')
    h.program.visualOverrides[h.program.lockedStation.id] = 'flowfield'
    h.key('v')
    if (h.program.tapConsentOpen) h.key('n')
    h.advance(200)
    assert.equal(h.crt.params.decay, own, 'setup: the effect\'s afterglow is up')
    h.key('l')
    h.advance(200)
    assert.equal(h.program.lyricsViewOpen, true, 'setup: [L] opened the lyrics view')
    assert.equal(h.crt.params.decay, base, 'the lyrics view ran under the effect\'s trail')
    h.key('l')
    h.advance(100)
    assert.equal(h.program.lyricsViewOpen, false)
    assert.equal(h.crt.params.decay, own)
    assert.equal(h.program.startGame(h.screen), true, 'the game opened')
    h.advance(100)
    assert.equal(h.crt.params.decay, base, 'the game ran under the effect\'s trail')
  } finally { h.shutdown() }
})

test('the LINE INPUT card opened from the visualizer does not run under the effect\'s afterglow', async () => {
  // 2026-10-12 (audit, LOW): frame() bails while the card is up, so the
  // per-frame decay write never ran and FLOW FIELD's 0.88 smeared the card.
  const h = await boot({ station: 'distortion-field', tap: 'mic', saved: { tapConsent: 'no' } })
  try {
    h.powerOn()
    const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
    const { crtBase } = await import(`../crt-hooks.js?v=${globalThis.SIGNAL_BUILD}`)
    const base = crtBase.decay
    const own = VISUALS.flowfield.decay
    h.program.visualOverrides[h.program.lockedStation.id] = 'flowfield'
    h.key('v')
    if (h.program.tapConsentOpen) h.key('n')
    h.advance(200)
    assert.equal(h.crt.params.decay, own, 'setup: the effect\'s afterglow is up')
    h.key('a')
    assert.equal(h.program.tapConsentOpen, true, 'setup: [A] raised the card')
    h.advance(200)
    assert.equal(h.crt.params.decay, base, 'the card drew under the effect\'s trail')
    h.key('n')
    h.advance(200)
    assert.equal(h.program.visualizerActive, true)
    assert.equal(h.crt.params.decay, own, 'and the effect has its afterglow back once the card is down')
  } finally { h.shutdown() }
})

// ---- 2026-10-20 (polish pass) ----

test('FLAME with no tap burns on a raised floor: never the 4-row hedge the synthetic troughs gave', async () => {
  // syntheticAudio()'s bass wanders 0..0.66; on the tap's fuel range the
  // troughs settled at 4-5 rows of the 21 (measured 4..14 over a minute).
  // FUEL_SYNTH holds it at 9..12. Read over a full synthetic bass cycle
  // (~27s), lowest one-second mean asserted.
  const { h, fx, p } = await rig()
  try {
    const { Term } = await import('../src/term.js')
    const { parseBDF } = await import('../src/bdf.js')
    const font = parseBDF(readFileSync(new URL('../fonts/ter-u16n.bdf', import.meta.url), 'utf8'))
    const term = new Term(font, 80, 25, 6, 5)
    p.muted = false
    p._au = null // no tap: the effect falls back to syntheticAudio(t)
    fx.init(p, term)
    fx.reset(p)
    const rowPx = term.cols * term.font.cellW * term.font.cellH
    const acc = new Array(term.rows).fill(0)
    let n = 0
    let lowest = Infinity
    for (let t = 0; t <= 40; t += 1 / 30) {
      fx.draw(p, { term }, t)
      if (t < 8) continue
      litByRow(term).forEach((v, y) => { acc[y] += v })
      if (++n === 30) {
        const top = acc.findIndex((v, y) => y >= 1 && v / n > rowPx / 10)
        lowest = Math.min(lowest, top < 0 ? 0 : VIZ_BOT - top)
        acc.fill(0)
        n = 0
      }
    }
    assert.ok(lowest >= 7, `the no-tap fire sank to ${lowest} rows`)
  } finally { h.shutdown() }
})

test('FLAME catches a one-frame onset that lands between 30Hz steps', async () => {
  // The tap raises `onset` for one render frame; at 60fps only every other
  // frame steps the fire, so before the latch half of all kicks did nothing.
  // Here the onset is shown on a frame that runs no step, and must still
  // start a surge on the next one.
  const { h, fx, p } = await rig()
  try {
    const { Term } = await import('../src/term.js')
    const { parseBDF } = await import('../src/bdf.js')
    const font = parseBDF(readFileSync(new URL('../fonts/ter-u16n.bdf', import.meta.url), 'utf8'))
    const term = new Term(font, 80, 25, 6, 5)
    p.muted = false
    p._au = { level: 0.5, bass: 0.5, mid: 0.4, treble: 0.3, bands9: new Array(9).fill(0.4), onset: false, pulse: 0 }
    fx.init(p, term)
    fx.reset(p)
    for (let t = 0; t <= 2; t += 1 / 60) fx.draw(p, { term }, t)
    const tick0 = p._fire.tick
    p._au = { ...p._au, onset: true }
    fx.draw(p, { term }, p._fireLastStep + 0.25 / 30) // a frame that runs no step
    assert.equal(p._fire.tick, tick0, 'setup: the onset frame ran no step')
    assert.equal(p._fire.surge, null, 'setup: nothing surged yet')
    p._au = { ...p._au, onset: false }
    fx.draw(p, { term }, p._fireLastStep + 1.01 / 30)
    assert.equal(p._fire.tick, tick0 + 1, 'setup: the next frame stepped')
    assert.ok(p._fire.surge && p._fire.surge.xs.length > 0, 'the kick never reached the fire')
  } finally { h.shutdown() }
})
