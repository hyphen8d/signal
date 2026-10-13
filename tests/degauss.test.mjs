// The degauss coil's two timing rules, asked of the real code paths rather
// than of degaussDue() alone (2026-10-12, audit M8). helpers.test.mjs pins
// the pure rule; deleting the call to it inside scheduleDegauss() left the
// whole suite green, because nothing ever got as far as scheduling a coil.
// tests/fake-audio.mjs is what makes these reachable -- read its header for
// what it models and, as importantly, what it does not.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'
import { installFakeAudio } from './fake-audio.mjs'

let sfxCount = 0
async function freshSfx(clock) {
  globalThis.window = globalThis
  globalThis.SIGNAL_BUILD ??= 'degauss'
  globalThis.matchMedia ??= () => ({ matches: false })
  const audio = installFakeAudio({ clock })
  // A fresh module instance per test: actx and the re-arm clock are
  // module-level state.
  const sfx = await import(`../audio/sfx.js?v=degauss${++sfxCount}`)
  return { audio, sfx }
}

test('scheduleDegauss honours the 30s re-arm: on, off, straight back on is one thunk', async () => {
  let now = 10
  const { audio, sfx } = await freshSfx(() => now)
  try {
    audio.unlock()
    sfx.playDegauss()
    assert.equal(audio.coils.length, 1, 'a running context degausses')
    now += 5
    sfx.playDegauss()
    assert.equal(audio.coils.length, 1, 'still warm: no second coil inside the re-arm window')
    now += sfx.DEGAUSS_REARM_S
    sfx.playDegauss()
    assert.equal(audio.coils.length, 2, 'cooled: it fires again')
  } finally { audio.uninstall() }
})

test('a deferred degauss lands with the resume, and asks stillWanted when it does', async () => {
  const { audio, sfx } = await freshSfx(() => 3)
  try {
    let wanted = false
    sfx.playDegauss(undefined, () => wanted)
    assert.equal(audio.coils.length, 0, 'nothing schedules on a suspended context')
    audio.unlock()
    await audio.flush()
    assert.equal(audio.coils.length, 0, 'an unwanted request landed anyway')
    // ...and, refused, it armed nothing: the next one plays at once.
    sfx.playDegauss()
    assert.equal(audio.coils.length, 1, 'a refused deferral used up the re-arm window')
  } finally { audio.uninstall() }
})

test('a deferred degauss that is still wanted plays when the resume lands', async () => {
  const { audio, sfx } = await freshSfx(() => 3)
  try {
    sfx.playDegauss(undefined, () => true)
    sfx.playDegauss() // a gesture's own request: no predicate
    audio.unlock()
    await audio.flush()
    assert.equal(audio.coils.length, 1, 'one thunk for two requests at the same moment')
  } finally { audio.uninstall() }
})

// The scenario M8 is about, end to end through program.js. A visitor whose
// first key is [G] in STANDBY unlocks audio there; the degauss the cold-open
// flourish left pending must not thunk with the set off, and must not use up
// the re-arm window the real [P] needs.
test('[G] first in STANDBY: no coil with the set off, and the [P] after it still degausses', async () => {
  const audio = installFakeAudio({ clock: () => Date.now() / 1000 })
  const h = await boot({ station: 'distortion-field' })
  try {
    h.advance(2000) // the flourish is long over
    h.key('g')
    audio.unlock() // the first gesture
    await audio.flush()
    h.advance(200)
    assert.equal(h.program.poweredOn, false)
    assert.equal(audio.coils.length, 0, 'the coil thunked in STANDBY')
    if (h.program.guideOpen) h.key('g')
    h.advance(1000)
    h.key('p')
    await audio.flush()
    h.advance(5000)
    assert.equal(h.program.poweredOn, true)
    assert.equal(audio.coils.length, 1, 'the real power-on lost its degauss')
  } finally { h.shutdown(); audio.uninstall() }
})

test('[P] as the first gesture degausses exactly once', async () => {
  const audio = installFakeAudio({ clock: () => Date.now() / 1000 })
  const h = await boot({ station: 'distortion-field' })
  try {
    h.advance(1500)
    h.key('p')
    audio.unlock()
    await audio.flush()
    h.advance(5000)
    assert.equal(h.program.poweredOn, true)
    assert.equal(audio.coils.length, 1, 'cold-open\'s pending request and [P]\'s own must make one thunk, not zero or two')
  } finally { h.shutdown(); audio.uninstall() }
})
