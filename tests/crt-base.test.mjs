// crtBase is read live by every module (2026-10-12, audit M1). It used to be
// an `export let` that setCrtCharacter() reassigned, and every reader took it
// as `const { crtBase } = await import(...)` -- a destructure, which copies
// the boot-time `{ ...SCREEN }` and never sees a reassignment. The cost was
// each station's phosphor decay: power-up, the visualizer's per-frame floor
// and restoreTubeDecay() all wrote SCREEN's 0.75. visual-flame.test.mjs's
// afterglow test missed it because DISTORTION FIELD's decay IS SCREEN's;
// everything here runs on a station whose decay differs from SCREEN's, and
// asserts that first, so the scenario cannot quietly lose its point.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

async function decays() {
  const { SCREEN } = await import(`../config.js?v=${globalThis.SIGNAL_BUILD}`)
  const { STATIONS, SECRET_STATIONS } = await import(`../stations.js?v=${globalThis.SIGNAL_BUILD}`)
  const byId = (id) => [...STATIONS, ...SECRET_STATIONS].find((c) => c.id === id)
  return { screen: SCREEN.decay, of: (id) => byId(id).crt.decay }
}

function enterViz(h) {
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  h.advance(300)
  assert.equal(h.program.visualizerActive, true, 'visualizer up')
}

for (const id of ['neon-stasis', 'drift-mode', 'green-room', 'atomic']) {
  test(`power-up on ${id} keeps the station's own phosphor decay`, async () => {
    const h = await boot({ station: id })
    try {
      const d = await decays()
      const want = d.of(id)
      assert.notEqual(want, d.screen, 'the scenario needs a decay unlike SCREEN\'s')
      h.powerOn()
      assert.equal(h.program.lockedStation.id, id)
      assert.equal(h.crt.params.decay, want, `power-up wrote ${h.crt.params.decay}, not ${id}'s ${want}`)
    } finally { h.shutdown() }
  })
}

test('the visualizer keeps a 0.88 station\'s decay, and [E] / power-off give it back', async () => {
  const h = await boot({ station: 'neon-stasis' })
  try {
    const d = await decays()
    const want = d.of('neon-stasis')
    const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
    h.powerOn()
    // Its own effect (DRIFT) declares no decay, so the floor is the station's.
    assert.equal(VISUALS[h.program.activeVisualKey()].decay, undefined)
    enterViz(h)
    h.advance(500)
    assert.equal(h.crt.params.decay, want, 'the per-frame floor overrode the station')
    h.key('e')
    h.advance(300)
    assert.equal(h.program.visualizerActive, false)
    assert.equal(h.crt.params.decay, want, 'restoreTubeDecay() put back the wrong value after [E]')
    // A floor, not an override: an effect asking for LESS than the station
    // runs gets the station's.
    const saved = VISUALS.flowfield.decay
    VISUALS.flowfield.decay = want - 0.05
    try {
      h.program.visualOverrides[h.program.lockedStation.id] = 'flowfield'
      enterViz(h)
      assert.equal(h.program.activeVisualKey(), 'flowfield')
      h.advance(300)
      assert.equal(h.crt.params.decay, want, 'a lower effect decay overrode the station\'s')
    } finally { VISUALS.flowfield.decay = saved }
    h.program.powerDown(h.screen)
    h.advance(2000)
    assert.equal(h.program.poweredOn, false)
    assert.equal(h.crt.params.decay, want, 'powerDown\'s restore wrote the wrong value')
  } finally { h.shutdown() }
})

test('a station under SCREEN\'s decay (ATOMIC 0.7) gets an effect\'s longer one, then its own back', async () => {
  const h = await boot({ station: 'atomic' })
  try {
    const d = await decays()
    const want = d.of('atomic')
    const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
    assert.ok(want < d.screen)
    h.powerOn()
    // Its own effect has no decay: the tube must run ATOMIC's shorter tail,
    // not SCREEN's.
    enterViz(h)
    h.advance(300)
    assert.equal(h.crt.params.decay, want)
    h.key('e')
    h.advance(300)
    h.program.visualOverrides[h.program.lockedStation.id] = 'flowfield'
    enterViz(h)
    h.advance(300)
    assert.equal(h.crt.params.decay, VISUALS.flowfield.decay)
    h.key('e')
    h.advance(300)
    assert.equal(h.crt.params.decay, want)
  } finally { h.shutdown() }
})

test('setCrtCharacter() rebuilds crtBase in place, and a station-only key does not leak into the next', async () => {
  const h = await boot({ station: 'neon-stasis' })
  try {
    const hooks = await import(`../crt-hooks.js?v=${globalThis.SIGNAL_BUILD}`)
    const { crtBase } = hooks // the destructure every app module does
    const { SCREEN } = await import(`../config.js?v=${globalThis.SIGNAL_BUILD}`)
    hooks.setCrtCharacter(null, { crt: { decay: 0.5, onlyHere: 3 } })
    assert.equal(crtBase, hooks.crtBase, 'still the one object')
    assert.equal(crtBase.decay, 0.5)
    assert.equal(crtBase.onlyHere, 3)
    hooks.setCrtCharacter(null, null)
    assert.equal(crtBase.decay, SCREEN.decay)
    assert.equal('onlyHere' in crtBase, false, 'a key from the last station outlived it')
  } finally { h.shutdown() }
})
