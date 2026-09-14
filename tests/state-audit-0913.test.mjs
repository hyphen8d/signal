// State-machine findings from AUDIT-2026-09-13 (M2, L2, L3, L4), each replayed
// from its reproduction. Every station here is pinned: all four depend on
// where the dial is (a band, a secret station in range, the lite layout), and
// a random boot would test them one run in several.
// Run: node --test tests/

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

async function modules(h) {
  const tuning = await import(`../tuning.js?v=${h.tag}`)
  const stations = await import(`../stations.js?v=${h.tag}`)
  return { ...tuning, ...stations }
}

function assertInBand(h, bandFor, label) {
  const bd = bandFor(h.program.band)
  const f = h.program.freq
  assert.ok(f >= bd.freqMin && f <= bd.freqMax,
    `${label}: freq ${f} outside ${h.program.band} (${bd.freqMin}-${bd.freqMax})`)
}

// M2 -- a cross-band secret preset cut short inside the ~55ms before the
// sweep's first tick used to leave band=ym freq=1200.
for (const [key, label] of [['s', '[S]'], ['p', '[P]']]) {
  test(`M2: ${label} inside a cross-band secret preset sweep leaves the dial on its band`, async () => {
    const h = await boot({ station: 'after-hours' })
    try {
      const { bandFor } = await modules(h)
      h.powerOn()
      assert.equal(h.program.band, 'zm', 'precondition: AFTER HOURS is on ZM')
      h.key('0') // NIN, a YM secret station
      h.advance(20)
      h.key(key)
      h.advance(400)
      assert.equal(h.program.band, 'ym', 'the preset moved the band selector')
      assertInBand(h, bandFor, `${label} mid-sweep`)
      if (key === 'p') {
        assert.equal(h.program.poweredOn, false)
        h.powerOn()
        assertInBand(h, bandFor, `${label} then power back on`)
      } else {
        assert.equal(h.find('1200.0'), -1, 'no ZM frequency drawn under the YM scale')
      }
      // The arrow from a stranded 1200 wrapped to the band floor (100.0).
      const before = h.program.freq
      h.key('ArrowLeft')
      h.advance(100)
      assertInBand(h, bandFor, `${label} then an arrow`)
      assert.ok(h.program.freq < before, `arrow stepped down from ${before}, did not wrap (${h.program.freq})`)
    } finally { h.shutdown() }
  })
}

// L2 -- the lite layout has no room for any effect, or for the footer that
// says how to leave. [V] from a phone keyboard answers instead.
test('L2: [V] on the lite layout answers NO VISUALIZER and does not open', async () => {
  const h = await boot({ station: 'rise-up', mobile: true })
  try {
    h.powerOn()
    assert.equal(h.program.mode, 'locked', 'precondition: locked, so desktop would open')
    h.key('v')
    h.advance(100)
    assert.equal(h.program.visualizerActive, false, 'visualizer stayed shut')
    assert.equal(h.program.tapConsentOpen, false, 'no LINE INPUT card either')
    assert.notEqual(h.find('NO VISUALIZER'), -1, 'the key answered on the status row')
  } finally { h.shutdown() }
})

// Put the dial into a live tease: seeking, 3 from GREEN ROOM (420).
function teaseAt417(h) {
  h.program.enterSeeking(h.screen)
  h.program.retune(h.screen, 417)
  h.advance(50)
  assert.equal(h.program._teasing, true, 'precondition: teasing at 417')
}

// L3 -- the end-of-tease restore is an assignment (no clear) so a lock onto
// RISE UP does not flash black; [C] must not inherit that.
test('L3: [C] while teasing clears persistence exactly once and keeps the tease', async () => {
  const h = await boot({ station: 'rise-up' })
  try {
    h.powerOn()
    teaseAt417(h)
    const base = h.crt.clears
    h.key('c')
    h.advance(50)
    assert.equal(h.crt.clears, base + 1, '[C] mid-tease: exactly one persistence clear')
    assert.equal(h.program._teasing, true, 'still in range of GREEN ROOM: the tease is re-applied')
    const named = Object.values(h.config.PHOSPHORS)
    assert.ok(!named.includes(h.crt.phosphor), 'tint is a blend on the new base, not a bare named tint')
  } finally { h.shutdown() }
})

// L4 -- a tint blended on YM and carried to ZM (no secret stations) by a
// preset sweep that never reaches its lock.
test('L4: a tease carried onto a band with no secret station is restored', async () => {
  const h = await boot({ station: 'rise-up' })
  try {
    const { STATIONS } = await modules(h)
    h.powerOn()
    teaseAt417(h)
    const zm = STATIONS.find((st) => st.id === 'after-hours')
    h.program.presetTune(h.screen, zm)
    h.advance(20)
    h.key('s') // cut the sweep short: no lock, so applyPhosphor() never runs
    h.advance(300)
    // A tuning step on ZM is what asks applySecretTease() again. Without it
    // this test only passed through presetTune()'s own band-move retune (the
    // M2 fix), so reverting M2 turned it red and reverting L4 alone did not
    // isolate anything the audit's repro (an arrow after the cut) exercised.
    h.key('ArrowLeft')
    h.advance(100)
    assert.equal(h.program.band, 'zm')
    assert.equal(h.program._teasing, false, 'no tease on a band with no secret station')
    const named = Object.values(h.config.PHOSPHORS)
    assert.ok(named.includes(h.crt.phosphor), 'tint restored to the named display mode')
  } finally { h.shutdown() }
})
