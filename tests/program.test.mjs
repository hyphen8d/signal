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

// --- the LINE INPUT consent card (2026-08-25, the consent pass) ----------
//
// The pass's whole claim is about WHEN a browser permission prompt can be
// raised, so that's what these assert: h.tapCalls is the record of every
// getDisplayMedia/getUserMedia the program made, and most of these tests
// are about it staying empty.

test('consent pass: power-on raises no capture prompt at all', async () => {
  const h = await boot({ tap: 'tab' })
  try {
    h.powerOn()
    // The regression this pass exists to prevent: a tab-share picker landing
    // over the boot readout, three seconds into a first visit.
    assert.deepEqual(h.tapCalls, [], 'nothing prompted during power-on')
    assert.equal(h.program.tapConsentOpen, false, 'and no card either')
  } finally { h.shutdown() }
})

test('consent pass: first [V] opens the card instead of the visualizer', async () => {
  const h = await boot({ tap: 'tab' })
  try {
    h.powerOn()
    h.key('v')
    assert.equal(h.program.tapConsentOpen, true, 'card took the screen')
    assert.equal(h.program.visualizerActive, false, 'visualizer held back')
    assert.deepEqual(h.tapCalls, [], 'the card alone prompts nothing')
    assert.ok(h.find('SIGNAL -- LINE INPUT') >= 0, 'card header drawn')
    // It has to name the dialog this browser will actually raise.
    assert.ok(h.find('share this tab') >= 0, 'tab tier names the tab picker')
    assert.ok(h.find('Nothing is recorded') >= 0, 'privacy posture is on the card')
    assert.ok(h.find('[Y] PATCH IN') >= 0, 'both answers offered')
  } finally { h.shutdown() }
})

test('consent pass: the mic tier names the microphone, not the tab picker', async () => {
  const h = await boot({ tap: 'mic' })
  try {
    h.powerOn()
    h.key('v')
    assert.equal(h.program.tapConsentOpen, true)
    assert.ok(h.find('asks for the microphone') >= 0, 'mic tier names the mic')
    assert.equal(h.find('share this tab'), -1, 'and does not promise a tab picker')
  } finally { h.shutdown() }
})

test('consent pass: only [Y]/[N]/Escape answer the card; strays are swallowed', async () => {
  const h = await boot({ tap: 'tab' })
  try {
    h.powerOn()
    h.key('v')
    // Every one of these closes the GUIDE. On a permission card, a stray
    // keypress must not be able to answer in either direction.
    for (const k of ['g', 'c', 'p', 'ArrowRight', '3', 'x']) {
      h.key(k)
      assert.equal(h.program.tapConsentOpen, true, `[${k}] left the card up`)
    }
    assert.deepEqual(h.tapCalls, [], 'and prompted nothing')
    assert.equal(h.program.tapConsent, null, 'and answered nothing')
  } finally { h.shutdown() }
})

test('consent pass: [N] declines, remembers it, and hands off to the visualizer', async () => {
  const h = await boot({ tap: 'tab' })
  try {
    h.powerOn()
    h.key('v')
    h.key('n')
    assert.deepEqual(h.tapCalls, [], 'a decline prompts nothing')
    assert.equal(h.program.tapConsent, 'no')
    assert.equal(h.program.tapConsentOpen, false, 'card came down')
    assert.equal(h.program.visualizerActive, true, '[V] still got its visualizer')
    assert.equal(JSON.parse(globalThis.localStorage.getItem('signal:state:v1')).tapConsent, 'no',
      'the answer is persisted, so the card is put to a visitor once')
  } finally { h.shutdown() }
})

test('consent pass: [Y] raises exactly one prompt, and a declined picker never reaches for the mic', async () => {
  const h = await boot({ tap: 'tab' })
  try {
    h.powerOn()
    h.key('v')
    h.key('y')
    h.advance(200) // let the rejected getDisplayMedia settle
    // THE regression: tier 1's .catch used to chain straight into
    // startMicCapture(), so saying "no, don't watch my screen" was answered
    // with "then may I have your microphone?".
    assert.deepEqual(h.tapCalls, ['getDisplayMedia'], 'declining ends it -- no mic escalation')
    assert.equal(h.program.tapConsent, 'yes', 'they did agree to be asked')
    assert.equal(h.program.visualizerActive, true)
  } finally { h.shutdown() }
})

test('consent pass: an answered visitor goes straight into the visualizer next visit', async () => {
  const h = await boot({ tap: 'tab', saved: { tapConsent: 'no', volume: 60, muted: true } })
  try {
    h.powerOn()
    h.key('v')
    assert.equal(h.program.tapConsentOpen, false, 'no second card')
    assert.equal(h.program.visualizerActive, true)
    assert.deepEqual(h.tapCalls, [], 'and still no prompt')
  } finally { h.shutdown() }
})

test('consent pass: a consenting visitor gets the picker re-raised once per power cycle', async () => {
  const h = await boot({ tap: 'tab', saved: { tapConsent: 'yes', volume: 60, muted: true } })
  try {
    h.powerOn()
    // getDisplayMedia has no silent resume -- it raises its picker every
    // time -- so a stored yes re-raises it at [V], the moment of value,
    // never at power-on.
    assert.deepEqual(h.tapCalls, [], 'still nothing at power-on')
    h.key('v')
    h.advance(200)
    assert.deepEqual(h.tapCalls, ['getDisplayMedia'], 'raised on [V] instead')
    assert.equal(h.program.visualizerActive, true)
    h.key('e')
    h.key('v')
    h.advance(200)
    assert.deepEqual(h.tapCalls, ['getDisplayMedia'], 'a dismissed picker does not come back on the next [V]')
  } finally { h.shutdown() }
})

test('consent pass: [A] re-opens the card after a decline', async () => {
  const h = await boot({ tap: 'tab', saved: { tapConsent: 'no', volume: 60, muted: true } })
  try {
    h.powerOn()
    h.key('a')
    assert.equal(h.program.tapConsentOpen, true, '[A] re-opens it on demand')
    assert.ok(h.find('SIGNAL -- LINE INPUT') >= 0)
    h.key('Escape')
    assert.equal(h.program.tapConsentOpen, false)
    assert.equal(h.program.visualizerActive, false, '[A] is not a way into the visualizer')
    assert.ok(h.find('TUNING BAND') >= 0, 'main screen rebuilt underneath')
  } finally { h.shutdown() }
})

test('consent pass: nothing paints through the card', async () => {
  const h = await boot({ tap: 'tab' })
  try {
    h.powerOn()
    h.key('v')
    const before = h.rows().join('\n')
    // The guide has been punched through by a deferred draw at least twice in
    // this file's history; the card takes the same bail in frame()/_tickFx.
    h.advance(3000)
    assert.equal(h.rows().join('\n'), before, 'card is pixel-identical after 3s of frames')
    assert.equal(h.find('TUNING BAND'), -1, 'no main-screen chrome bleeding through')
  } finally { h.shutdown() }
})

test('consent pass: mobile never asks for the microphone', async () => {
  const h = await boot({ mobile: true, tap: 'mic' })
  try {
    h.advance(600)
    h.tap()
    h.advance(4000)
    assert.equal(h.program.poweredOn, true)
    // Mobile's only tap consumer is the shape of the VU trace, which is not
    // worth a microphone permission -- and mobile can't reach [V] to be
    // offered the card, so it is never asked at all.
    assert.deepEqual(h.tapCalls, [], 'no mic prompt anywhere in a mobile session')
    assert.equal(h.program.tapConsentOpen, false)
  } finally { h.shutdown() }
})

test('visualizer: [V] in the lyrics view returns to the effect instead of cycling under it', async () => {
  const h = await boot()
  try {
    h.powerOn()
    h.key('v')
    assert.equal(h.program.visualizerActive, true)
    const effect = h.program.activeVisualKey()
    // Driven through the flag rather than [L]: lyricsStateFor() needs a
    // resolved LRCLIB lookup and the harness has no network, so [L] itself
    // can never open the view here. The defect was in the key handler, and
    // this is the state that handler sees. No advance() between the two
    // presses -- drawVisualizerFrame's own per-tick check would close the
    // view on an unavailable lookup and hide the thing being tested.
    h.program.lyricsViewOpen = true
    h.key('v')
    assert.equal(h.program.lyricsViewOpen, false, '[V] came back to the effect')
    assert.equal(h.program.activeVisualKey(), effect, 'and did not cycle underneath it')
    h.key('v')
    assert.notEqual(h.program.activeVisualKey(), effect, 'the next [V] cycles as it always did')
    assert.equal(h.program.visualizerActive, true, 'neither press exited the visualizer')
  } finally { h.shutdown() }
})

test('visualizer: Shift+C in the lyrics view drops the view AND cycles', async () => {
  const h = await boot()
  try {
    h.powerOn()
    h.key('v')
    const effect = h.program.activeVisualKey()
    h.program.lyricsViewOpen = true
    h.key('C', { shiftKey: true })
    // Unlike [V], cycling is all Shift+C does, so it lands on the new
    // effect rather than merely back on the old one.
    assert.equal(h.program.lyricsViewOpen, false)
    assert.notEqual(h.program.activeVisualKey(), effect, 'cycled, and visibly so')
  } finally { h.shutdown() }
})
