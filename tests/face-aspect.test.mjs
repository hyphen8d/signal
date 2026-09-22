// The faceplate's shape (2026-09-22). It was hard-locked to 4:3 in the
// shader, which on a 390x844 phone drew the entire radio into a 390x292
// strip -- about a third of the screen -- with the rest black. It is a
// parameter now, and the lite layout asks for 3:4.
//
// This is cheap to get wrong in a way nothing else would catch: the value
// lives in the CRT params, the shader reads it every frame, and a phone is
// the one place it matters, so a desktop test run would never show it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

test('a phone gets an upright face; a desktop gets the television', async () => {
  const phone = await boot({ mobile: true })
  try {
    const { FACE_ASPECT } = await import(`../config.js?v=${globalThis.SIGNAL_BUILD}`)
    assert.equal(phone.crt.params.aspect, FACE_ASPECT)
    assert.equal(FACE_ASPECT, 3 / 4)
    // Before power-on too: the shape must not pop when the set comes up,
    // which is what putting it in MOBILE_CRT_OVERRIDE would have done.
    assert.equal(phone.program.poweredOn, false, 'still in STANDBY here')
    assert.ok(phone.crt.params.aspect < 1,
      `the lite face must be taller than it is wide, got ${phone.crt.params.aspect}`)
  } finally { phone.shutdown() }

  const desk = await boot()
  try {
    assert.ok(Math.abs(desk.crt.params.aspect - 4 / 3) < 1e-9,
      `desktop stays 4:3, got ${desk.crt.params.aspect}`)
  } finally { desk.shutdown() }
})

test('the face survives a station tune, which rewrites every CRT param', async () => {
  // setCrtCharacter() rebuilds crtBase from SCREEN + the station's own crt
  // block, and MOBILE_CRT_OVERRIDE is applied last precisely so a station
  // cannot take the layout's legibility away. A station carrying its own
  // `aspect` would be the one way to letterbox a phone again.
  const h = await boot({ mobile: true, station: 'neon-stasis' })
  try {
    const want = h.crt.params.aspect
    h.powerOn()
    h.advance(3000)
    assert.equal(h.crt.params.aspect, want, 'still upright after the tune')
    const { STATIONS } = await import(`../stations.js?v=${globalThis.SIGNAL_BUILD}`)
    const rogue = STATIONS.filter((s) => s.crt && 'aspect' in s.crt).map((s) => s.id)
    assert.deepEqual(rogue, [], `no station may set its own face aspect: ${rogue.join(', ')}`)
  } finally { h.shutdown() }
})

test('every station\'s CRT block stays inside the parameter ranges config documents', async () => {
  // Written while adding `aspect`: the roster can set crt params per station
  // and nothing checked them, so a typo (scanMax: 35 for 0.35) would ship as
  // a blown-out screen on one station only.
  const { STATIONS } = await import(`../stations.js?v=${globalThis.SIGNAL_BUILD}`)
  const RANGE = {
    decay: [0, 0.98], brightness: [0, 3], bloomAmt: [0, 4], scanMin: [0, 1], scanMax: [0, 1],
    noise: [0, 1], flicker: [0, 1], chroma: [0, 1], maskAmt: [0, 1], beam: [0.1, 2],
    sharpen: [0, 2], curve: [0, 0.2], glass: [0, 0.2], vignette: [0, 2], snow: [0, 1],
    fill: [0.5, 1], aspect: [0.5, 2], threshold: [0, 2], noiseStreak: [0, 10],
    roll: [0, 1], rollSpeed: [0, 5], ambient: [0, 2], ambientFalloff: [0, 5], bg: [0, 1],
  }
  const bad = []
  for (const st of STATIONS) {
    for (const [k, v] of Object.entries(st.crt || {})) {
      const r = RANGE[k]
      if (!r) { bad.push(`${st.id}: unknown crt param ${k}`); continue }
      if (!(typeof v === 'number' && v >= r[0] && v <= r[1])) bad.push(`${st.id}: ${k}=${v} outside ${r[0]}..${r[1]}`)
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'))
})
