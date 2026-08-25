// Behavioural tests for program.js, driven through the headless harness.
// Run: node --test tests/
//
// Most of these replay sequences the comment history records as having
// broken at least once -- an overlay opening while a deferred draw was in
// flight -- now that every such draw lives on the frame-driven effects
// queue (2026-08-25 audit) rather than its own timer.

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

const BOX_CHARS = /[┌┐└┘│─┏┓┗┛┳┻]/

test('cold boot lands on STANDBY; the cold-open flourish clears itself', async () => {
  const h = await boot()
  try {
    assert.ok(h.find('STANDBY') >= 0, 'STANDBY label drawn')
    assert.ok(h.find('[P] POWER ON') >= 0, 'power hint drawn')
    assert.equal(h.program.poweredOn, false)
    assert.equal(h.program._powerAnimating, true, 'cold-open in progress')
    assert.ok(h.crt.params.brightness < h.config.SCREEN.brightness, 'ramp starts dim')
    h.advance(600)
    assert.equal(h.program._powerAnimating, false, 'cold-open finished on the always-queue')
    assert.equal(h.crt.params.brightness, h.config.SCREEN.brightness, 'brightness ramp settled exactly')
    assert.equal(h.program._fxAlways.length, 0, 'always-queue drained')
  } finally { h.shutdown() }
})

test('[P] runs the POST readout on the always-queue and lands locked', async () => {
  const h = await boot()
  try {
    h.advance(600)
    h.key('p')
    assert.equal(h.program._powerAnimating, true)
    h.advance(1500)
    assert.equal(h.program.poweredOn, false, 'still booting mid-readout')
    assert.ok(h.find('MODEL SG-1  SIGNAL RECEIVER') >= 0, 'readout header visible')
    h.advance(2500)
    assert.equal(h.program.poweredOn, true)
    assert.equal(h.program._powerAnimating, false)
    assert.equal(h.program.mode, 'locked')
    assert.match(h.row(0), /SIGNAL v\d/)
    assert.ok(h.row(3).includes('TUNING BAND'))
    assert.ok(h.row(12).includes('NOW PLAYING'))
    assert.match(h.row(2), /\[\s+(LOCKED|MUTED)\s+\]/)
    assert.ok(h.row(9).includes(h.program.lockedStation.callsign), 'callsign resolved on the STATION row')
  } finally { h.shutdown() }
})

test('guide opened during the boot-flicker tail is not punched through', async () => {
  // 20th-pass bug, and the 69th-pass STANDBY variant of it: playBootFlicker
  // ran ~500ms of border redraws on raw timers after the reveal.
  const h = await boot()
  try {
    h.advance(600)
    h.key('p')
    h.advance(3100) // just past REVEAL_DELAY -- flicker beats are pending
    assert.equal(h.program.poweredOn, true)
    h.key('g')
    assert.equal(h.program.guideOpen, true)
    h.advance(1500)
    assert.ok(h.row(1).includes('SIGNAL -- GUIDE'))
    for (const y of [2, 5, 11, 13, 21, 23, 24]) {
      assert.equal(h.row(y).trim(), '', `row ${y} must stay blank under the guide`)
    }
    h.key('x') // any other key closes it
    assert.equal(h.program.guideOpen, false)
    h.advance(700) // the frozen flicker beats fire now, onto the rebuilt chrome
    assert.ok(h.row(3).includes('TUNING BAND'))
    assert.ok(h.row(12).includes('NOW PLAYING'))
    assert.ok(h.row(23).includes('[ENTER] LOCK'))
  } finally { h.shutdown() }
})

test('power-off during the boot-flicker tail leaves a clean STANDBY and an empty queue', async () => {
  const h = await boot()
  try {
    h.advance(600)
    h.key('p')
    h.advance(3100)
    assert.equal(h.program.poweredOn, true)
    h.key('p')
    assert.equal(h.program.poweredOn, false)
    h.advance(1500)
    assert.ok(h.find('STANDBY') >= 0)
    for (const [y, r] of h.rows().entries()) {
      assert.ok(!BOX_CHARS.test(r), `row ${y} has box-drawing chars on STANDBY: ${JSON.stringify(r)}`)
    }
    assert.equal(h.program._fx.length, 0, 'normal queue emptied by powerDown')
  } finally { h.shutdown() }
})

test('a cancelled CRT ramp settles at its resting value instead of stranding crt.params', async () => {
  const h = await boot()
  try {
    h.powerOn()
    const { STATION_PRESET_ORDER } = await import(`../stations.js?v=${globalThis.SIGNAL_BUILD}`)
    const target = STATION_PRESET_ORDER[1]
    if (h.program.lockedStation === target) { h.key('3') } else { h.key('2') }
    h.advance(340) // preset sweep is 6 x 55ms, then tryLock -> flashFocusSnap ramps
    assert.equal(h.program.mode, 'locked')
    const st = h.program.lockedStation
    const rest = { ...h.config.SCREEN, ...(st.crt || {}) }
    assert.ok(h.program._fx.some((e) => e.tag === 'crt'), 'focus-snap ramp in flight')
    h.key('p') // power off mid-ramp -> fxCancelAll -> tweens settle
    assert.equal(h.crt.params.beam, rest.beam)
    assert.equal(h.crt.params.sharpen, rest.sharpen)
  } finally { h.shutdown() }
})

test('status flash reverts to the persistent status', async () => {
  const h = await boot()
  try {
    h.powerOn()
    const before = h.row(2)
    h.key('ArrowUp')
    h.advance(200)
    assert.ok(h.row(2).includes('VOL 80'), `flash visible: ${h.row(2).trim()}`)
    h.advance(1000)
    assert.equal(h.row(2), before, 'reverted to the status the row rested on')
  } finally { h.shutdown() }
})

test('preset sweep locks and the callsign resolves out of noise', async () => {
  const h = await boot()
  try {
    h.powerOn()
    const { STATION_PRESET_ORDER } = await import(`../stations.js?v=${globalThis.SIGNAL_BUILD}`)
    const idx = h.program.lockedStation === STATION_PRESET_ORDER[3] ? 5 : 4
    h.key(String(idx))
    h.advance(340)
    assert.equal(h.program.lockedStation, STATION_PRESET_ORDER[idx - 1])
    h.advance(600)
    assert.ok(h.row(9).includes(h.program.lockedStation.callsign))
    assert.ok(h.row(10).includes(h.program.lockedStation.tagline))
    assert.equal(h.program._fx.filter((e) => e.tag.startsWith('resolve:')).length, 0, 'resolves finished and left the queue')
  } finally { h.shutdown() }
})

test('setPhosphor identity: same-tint transitions do not clear persistence', async () => {
  // The pre-audit build cleared the persistence buffer on every lock,
  // unlock and colour cycle because three config.js instances made the
  // engine's identity check fail (see main.js).
  const h = await boot()
  try {
    h.powerOn()
    const base = h.crt.clears
    h.key('ArrowRight'); h.advance(100)
    h.key('ArrowLeft'); h.advance(300)
    assert.equal(h.crt.clears, base, 'seek off + re-lock: no persistence clear')
    h.key('c'); h.advance(50)
    assert.equal(h.crt.clears, base + 1, '[C] changes the tint: exactly one clear')
  } finally { h.shutdown() }
})

test('visualizer: every effect draws without throwing and exits back to the main screen', async () => {
  const h = await boot()
  try {
    h.powerOn()
    // The idle-visualizer trigger needs playState === 'playing', which the
    // stubbed player never reports; enter manually with [V] instead.
    h.key('v')
    assert.equal(h.program.visualizerActive, true)
    const seen = []
    for (let i = 0; i < 12; i++) {
      h.advance(500) // several frames of the effect at its own clock
      const key = h.program.activeVisualKey()
      seen.push(key)
      const canvas = h.rows().slice(1, 22).join('')
      assert.ok(canvas.trim().length > 0, `${key}: effect canvas is not blank`)
      assert.ok(h.row(22).includes(h.program.lockedStation.callsign), `${key}: footer names the station`)
      h.key('v') // cycle to the next effect
    }
    assert.ok(new Set(seen).size >= 11, `cycled through every effect: ${seen.join(',')}`)
    h.key('e')
    assert.equal(h.program.visualizerActive, false)
    h.advance(400)
    assert.ok(h.row(3).includes('TUNING BAND'))
    assert.ok(h.row(12).includes('NOW PLAYING'))
    assert.ok(h.row(9).includes(h.program.lockedStation.callsign))
  } finally { h.shutdown() }
})

test('mobile lite: 42x22 grid, tap powers on, swipe steps the station', async () => {
  const h = await boot({ mobile: true })
  try {
    assert.equal(h.term.cols, 42)
    assert.equal(h.term.rows, 22)
    assert.equal(h.program.mobile, true)
    assert.ok(h.find('TAP TO POWER ON') >= 0)
    h.advance(600)
    h.tap()
    h.advance(4000)
    assert.equal(h.program.poweredOn, true)
    assert.ok(h.row(0).includes('SIGNAL v'), 'mobile title bar')
    assert.ok(h.find('STATION') >= 0 && h.find('NOW PLAYING') >= 0, 'mobile boxes')
    assert.ok(h.find('TAP MUTE') >= 0, 'touch legend')
    const before = h.program.lockedStation
    h.swipe(1)
    h.advance(400)
    assert.notEqual(h.program.lockedStation, before, 'swipe right steps to the next station')
    h.advance(600)
    assert.ok(h.find(h.program.lockedStation.callsign) >= 0, 'new callsign drawn')
    for (const [y, r] of h.rows().entries()) assert.ok(!/[�?]{3,}/.test(r), `row ${y} has no glyph fallbacks`)
  } finally { h.shutdown() }
})

test('a tab that never gets a frame still completes the cold-open and a power-on (fallback ticker)', async () => {
  // Found on the live site the day the queue shipped: Chrome throttles rAF
  // for a background WINDOW while visibilityState stays 'visible' on
  // Wayland, so a document.hidden-gated fallback never fired and [P] was
  // ignored. The ticker keys on frame() going quiet instead.
  const h = await boot()
  try {
    assert.equal(h.program._powerAnimating, true)
    h.idle(1000) // timers only -- no frame() at all
    assert.equal(h.program._powerAnimating, false, 'cold-open cleared by the fallback ticker')
    h.key('p')
    assert.equal(h.program._powerAnimating, true, 'power-on accepted')
    h.idle(4500)
    assert.equal(h.program.poweredOn, true, 'boot completed with rAF starved')
    h.advance(200) // first real frames after the window comes forward
    assert.ok(h.row(3).includes('TUNING BAND'))
    assert.ok(h.row(9).includes(h.program.lockedStation.callsign))
  } finally { h.shutdown() }
})
