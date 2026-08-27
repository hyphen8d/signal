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
    // 2026-08-26 -- the About page rebuild moved both of these. The title
    // carries VERSION_TAG now, matched by shape rather than by a literal so
    // this cannot drift on the next version bump (the same reasoning that put
    // VERSION_TAG there in the first place -- see the 28th-pass note). The
    // blank-row list is the page's actual gaps under the new layout; rows 5,
    // 11 and 21 carry content now, and 4, 6 and 17 do not.
    assert.match(h.row(1).trim(), /^SIGNAL .+ -- GUIDE$/)
    for (const y of [2, 4, 6, 13, 17, 23, 24]) {
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
    // 2026-08-27: a first-ever mobile visit boots MUTED on purpose, so the
    // legend's first line is the instruction, not the label. This is the
    // whole point of making it state-aware -- "TAP MUTE" told someone
    // looking at a silent radio nothing about how to fix it.
    assert.equal(h.program.muted, true, 'first-ever mobile visit boots muted')
    assert.ok(h.find('TAP TO UNMUTE') >= 0, 'legend instructs rather than labels while muted')
    h.tap()
    h.advance(400)
    assert.equal(h.program.muted, false)
    assert.ok(h.find('TAP MUTE') >= 0, 'and flips back to the label once unmuted')
    assert.ok(h.find('2-HOLD GUIDE') >= 0, 'guide is advertised now that touch can open it')
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

// 2026-08-26, shipped with GREEN ROOM -- the second secret station, and the
// first real exercise of the SECRET_STATIONS generalization written back on
// 2026-08-23 for a station (GREEN HOUSE) that was then pulled. Everything
// below was built and left untested against a second entry for three days:
// the dedicated key, the forced tint applying AND releasing, and the
// station staying out of every public path while locked to it.
//
// Asserted on callsign/freq rather than object identity on purpose -- the
// harness boots each module graph under its own `?v=` tag, so a station
// object imported here would be a different instance from the one the
// program is holding. See main.js on why that is by design.
test('GREEN ROOM: Shift+0 reaches the second secret station and forces its own tint', async () => {
  const h = await boot()
  try {
    h.powerOn()
    // shiftKey: true is what a real Shift+0 keydown carries. Asserted
    // explicitly because the binding is on e.key alone -- if a future pass
    // ever adds a shift guard to the main key() path (the visualizer
    // already reads e.shiftKey for Shift+C), this is the only key on the
    // roster that would silently stop working.
    h.key(')', { shiftKey: true })
    h.advance(340)
    const locked = h.program.lockedStation
    assert.ok(locked, 'Shift+0 tuned and locked something')
    assert.equal(locked.callsign, 'GREEN ROOM')
    assert.equal(locked.freq, 420.0)
    assert.equal(locked.secret, true)
    assert.equal(h.crt.phosphor, h.config.PHOSPHORS.haze, 'locked: the forced haze tint is up')
    h.advance(600)
    assert.ok(h.row(9).includes('GREEN ROOM'), 'status row names it')
    // Tuning away has to give the tint back -- applyPhosphor's 2026-08-22
    // note records the release half as the one that got missed first time.
    h.key('1')
    h.advance(400)
    assert.notEqual(h.program.lockedStation, locked, 'preset 1 moved off it')
    assert.equal(h.crt.phosphor, h.config.PHOSPHORS.matrix, 'tint released back to the display mode')
  } finally { h.shutdown() }
})

test('GREEN ROOM stays out of the presets and out of the guide', async () => {
  const h = await boot()
  try {
    h.powerOn()
    h.key(')', { shiftKey: true })
    h.advance(940)
    assert.equal(h.program.lockedStation.callsign, 'GREEN ROOM')
    // No preset key reaches it: 1-9 walk STATION_PRESET_ORDER, which it is
    // deliberately absent from.
    for (const k of '123456789') {
      h.key(k)
      h.advance(400)
      assert.notEqual(h.program.lockedStation.callsign, 'GREEN ROOM', `preset ${k} is a public station`)
    }
    // And it gets no guide page. Walked page by page rather than asserting
    // a page count, so this still catches it if a future pass changes how
    // the guide is paginated.
    h.key('g')
    h.advance(300)
    assert.equal(h.program.guideOpen, true)
    for (let i = 0; i < h.program.guideTotalPages(); i++) {
      assert.equal(h.rows().join('').includes('GREEN ROOM'), false, `guide page ${i} does not list it`)
      h.key('ArrowRight')
      h.advance(120)
    }
  } finally { h.shutdown() }
})

// 2026-08-26 -- the About page rebuild. Both assertions below are the two
// defects it fixed, written so they cannot come back quietly: neither showed
// up as an error, a warning or a failing test, only as a page that read badly.
test('guide page 1: every control row shares its group\'s column origin', async () => {
  const h = await boot()
  try {
    h.powerOn()
    h.key('g')
    h.advance(300)
    const rows = h.rows()
    const head = rows.findIndex((r) => r.includes('TUNING') && r.includes('RECEIVER') && r.includes('DISPLAY'))
    assert.ok(head > 0, 'all three group heads share one row')
    // The page this replaced centred each of its four control rows on its own
    // string, so the left edges landed at columns 16, 13, 14 and 9 and the
    // second column at 36, 33, 34 and 24. Nothing lined up. Exact-equality on
    // the origin is the whole point -- a "close enough" assertion would pass
    // the very layout being fixed.
    // Driven off the table itself rather than a copy of it -- a hardcoded key
    // list broke the moment [F] was added (issue #8) for no reason other than
    // being a duplicate. What is being asserted is the alignment, not the
    // contents.
    for (const group of h.program.GUIDE_CONTROL_GROUPS) {
      const x = rows[head].indexOf(group.head)
      assert.ok(x > 0, `${group.head} header drawn`)
      group.rows.forEach(([key], i) => {
        assert.equal(rows[head + 1 + i].indexOf(key), x, `${key} aligns under ${group.head}`)
      })
    }
  } finally { h.shutdown() }
})

test('guide page 1: [A] is its own callout, not one cell of the control grid', async () => {
  const h = await boot()
  try {
    h.powerOn()
    h.key('g')
    h.advance(300)
    const rows = h.rows()
    const y = rows.findIndex((r) => r.includes('[A] LINE IN'))
    assert.ok(y > 0, '[A] has a row of its own')
    // It used to sit third on a DIM grid row and be explained at FAINT -- the
    // same register as the ads disclaimer -- despite being the only control
    // that raises a browser permission prompt. Sharing its row with another
    // bracketed key would mean it had been folded back into the table.
    assert.equal((rows[y].match(/\[[^\]]+\]/g) || []).length, 1, 'no other control shares the [A] row')
    assert.ok(rows[y + 1].includes('Optional'), 'the consent line sits directly under it')
  } finally { h.shutdown() }
})

test('guide page 1 on the lite grid teaches gestures, not keys', async () => {
  // Reachable by touch as of 2026-08-27 (two-finger hold), which is what
  // made this page's content wrong rather than merely unused: it rendered
  // the same bracketed [P]/[ENTER]/[<-/->] table as desktop, so the screen
  // whose whole job is explaining the controls was naming controls a phone
  // does not have.
  const h = await boot({ mobile: true })
  try {
    h.powerOn()
    h.key('g')
    h.advance(300)
    assert.equal(h.term.cols, 42)
    assert.ok(h.find('A tuning-dial radio, rendered as text.') >= 0, 'pitch not truncated')
    assert.ok(h.find('START HERE   TAP to power on') >= 0, 'start line speaks touch')
    // Matched at the column stop rather than with find(): a bare
    // find('TAP') hits the START HERE line above the block first, and
    // find('HOLD') would happily match the '2-HOLD' row. Anchoring at
    // column 2 asserts the alignment at the same time.
    const rows = h.rows()
    for (const [gesture, action] of [['SWIPE L/R', 'STATION'], ['SWIPE U/D', 'NEXT TRACK'], ['TAP', 'MUTE'], ['HOLD', 'POWER OFF'], ['2-TAP', 'COLOR'], ['2-HOLD', 'GUIDE']]) {
      const row = rows.find((r) => r.slice(2).startsWith(gesture) && r.includes(action))
      assert.ok(row, `${gesture} -> ${action} listed at the control block's column stop`)
    }
    assert.ok(h.find('SWIPE STATIONS   TAP CLOSE') >= 0, 'footer lands inside the grid and names gestures')
    // Every keyboard idiom should be gone from this tier.
    for (const y of h.rows()) {
      for (const key of ['[P]', '[ENTER]', '[<-/->]', '[A]', '[1-9]']) {
        assert.ok(!y.includes(key), `no keyboard idiom on the lite guide: ${key}`)
      }
    }
  } finally { h.shutdown() }
})

// --- issue #7 -------------------------------------------------------------
test('[A] re-opens the LINE INPUT card from inside the visualizer', async () => {
  // The reported bug: decline the card on first [V] entry and there was no
  // way back to it without leaving the visualizer, because key()'s visualizer
  // branch is self-contained and had no 'a' case -- the main-screen binding
  // below it was unreachable.
  // { tap: 'tab' } is what gives tapPromptTier() something to offer -- a bare
  // boot() has no navigator.mediaDevices, so the card correctly declines to
  // open at all and there is nothing to re-open.
  const h = await boot({ tap: 'tab' })
  try {
    h.powerOn()
    h.key('v')                       // first [V] offers the card
    assert.equal(h.program.tapConsentOpen, true, 'the card is offered on first [V]')
    h.key('n')                       // decline it
    h.advance(200)
    assert.equal(h.program.visualizerActive, true, 'declining still lands in the visualizer')
    assert.equal(h.program.tapConsentOpen, false)
    h.key('a')
    assert.equal(h.program.tapConsentOpen, true, '[A] raises it again without leaving')
    h.key('n')
    h.advance(200)
    assert.equal(h.program.tapConsentOpen, false)
    assert.equal(h.program.visualizerActive, true, 'and hands back to the visualizer, not the main screen')
    assert.equal(h.find('TUNING BAND'), -1, 'no main-screen chrome bled through')
  } finally { h.shutdown() }
})

test('the visualizer is repainted, not re-entered, when the card comes down', async () => {
  // repaintVisualizerChrome() exists because enterVisualizer() early-returns
  // while active AND re-arms every effect's clocks -- replaying it here would
  // restart the effect mid-watch. _vizEnterAt is the clock that would move.
  const h = await boot({ tap: 'tab' })
  try {
    h.powerOn()
    h.key('v')
    h.key('n')
    h.advance(400)
    assert.equal(h.program.visualizerActive, true)
    const enteredAt = h.program._vizEnterAt
    h.key('a')
    h.key('n')
    h.advance(200)
    assert.equal(h.program._vizEnterAt, enteredAt, 'the effect clock did not restart')
  } finally { h.shutdown() }
})

// --- issue #8 -------------------------------------------------------------
test('[F] toggles fullscreen from the main screen and from the visualizer', async () => {
  const h = await boot({ tap: 'tab' })
  try {
    h.powerOn()
    assert.deepEqual(h.fsCalls, [])
    h.key('f')
    assert.deepEqual(h.fsCalls, ['request'])
    h.key('f')
    assert.deepEqual(h.fsCalls, ['request', 'exit'], 'the same key toggles back out')
    h.key('v')
    h.key('n')                       // clear the consent card
    h.advance(200)
    assert.equal(h.program.visualizerActive, true)
    h.key('f')
    assert.deepEqual(h.fsCalls, ['request', 'exit', 'request'], 'and works inside the visualizer')
  } finally { h.shutdown() }
})

test('toggleFullscreen reports false rather than throwing where the API is absent', async () => {
  // Old browsers, and the harness stub before issue #8 added one. The guard
  // matters because this runs off a keypress: an exception here would take
  // out the whole key() call, not just the fullscreen request.
  const h = await boot()
  try {
    h.powerOn()
    const real = globalThis.document.documentElement
    globalThis.document.documentElement = {}
    assert.equal(h.program.toggleFullscreen(), false)
    globalThis.document.documentElement = real
    assert.equal(h.program.toggleFullscreen(), true)
  } finally { h.shutdown() }
})

test('the volume keys ride the speaker bus, not just the player (issue #18)', async () => {
  // Reported as "Signal DJ shoutouts ignore volume controls": a liner drop
  // announced itself at full voice level over a set turned all the way
  // down. The bug was never in the liners -- the bus they share with the
  // idents, the static bed, the seek hiss and the lock tone was a
  // mute-only switch, so the volume keys moved the YouTube player and
  // nothing else. Asserting on the bus rather than on a liner is
  // deliberate: the bus is the shared quantity, and a liner is a 1-in-4
  // roll behind a 2.5s timer.
  const h = await boot()
  try {
    const sfx = await import(`../audio/sfx.js?v=${h.tag}`)
    h.powerOn()
    assert.equal(h.program.volume, 70, 'fresh boot comes up at the default')
    assert.ok(Math.abs(sfx.speakerLevel - 0.7) < 1e-9, 'and the bus is already there, not at 1')

    for (let i = 0; i < 7; i++) h.key('ArrowDown')
    assert.equal(h.program.volume, 0)
    assert.equal(sfx.speakerLevel, 0, 'turned all the way down closes the speaker')

    // Clamping, not inversion: an extra press at the bottom must not push
    // the bus negative, which would flip the phase of everything on it.
    h.key('ArrowDown')
    assert.equal(h.program.volume, 0)
    assert.equal(sfx.speakerLevel, 0)

    h.key('ArrowUp')
    assert.equal(h.program.volume, 10)
    assert.ok(Math.abs(sfx.speakerLevel - 0.1) < 1e-9, 'and back up again')

    // Mute still wins over any volume, and un-muting returns to the
    // CURRENT volume rather than to full.
    h.key('m')
    assert.equal(h.program.muted, true)
    assert.equal(sfx.speakerLevel, 0)
    h.key('m')
    assert.equal(h.program.muted, false)
    assert.ok(Math.abs(sfx.speakerLevel - 0.1) < 1e-9, 'un-mute restores the level, not 1')
  } finally { h.shutdown() }
})

test('a restored session seeds the speaker bus at its saved volume (issue #18)', async () => {
  // The bus is lazy, so at restore time there is no node to set -- the
  // level is tracked module-level precisely so the bus is born correct
  // whenever the first sound creates it. That was the 50th pass's
  // reasoning for mute; #18 made it load-bearing for volume too, or a
  // session saved quiet would get one full-level ident before the visitor
  // could touch a key.
  const h = await boot({ saved: { stationId: 'cipher', volume: 20, muted: false } })
  try {
    const sfx = await import(`../audio/sfx.js?v=${h.tag}`)
    assert.equal(h.program.volume, 20, 'volume came back off the save')
    assert.ok(Math.abs(sfx.speakerLevel - 0.2) < 1e-9, 'and the bus with it, before any key')
  } finally { h.shutdown() }
})

// --- dead-feedback audit (2026-08-27) -------------------------------------
//
// The rule these all check: a key that clicks like a command has to change
// something, and a control the screen advertises has to answer even when it
// cannot act. Both halves had drifted -- see VISUALIZER_KEYS in constants.js
// and the [B]/[N]/[V]/[A] cases in key().

/** Arrow the dial off whatever the boot locked onto, into plain SEEKING. */
const seekOffStation = (h) => {
  for (let i = 0; i < 20 && h.program.mode !== 'seeking'; i++) { h.key('ArrowRight'); h.advance(120) }
  assert.equal(h.program.mode, 'seeking', 'test setup: expected to be off-station')
  h.advance(1200)
}

test('off-station, the advertised controls answer instead of going dead', async () => {
  const h = await boot({})
  try {
    h.powerOn()
    seekOffStation(h)
    // [N] NEXT TRACK -- named on the Guide's RECEIVER list, and skip() is a
    // no-op unless locked.
    h.key('n')
    assert.equal(h.program._statusText, 'NO SIGNAL')
    h.advance(400)
    assert.ok(h.find('NO SIGNAL') >= 0, '[N] off-station says so on the status row')
    h.advance(1200)
    // [V] VISUALIZER -- same, and the case's own comment used to describe
    // the silence as deliberate.
    h.key('v')
    assert.equal(h.program._statusText, 'NO SIGNAL')
    assert.equal(h.program.visualizerActive, false)
    h.advance(1200)
    // [B] BACK -- on the footer's top row, dead for a whole first session.
    h.program.history.length = 0
    h.key('b')
    assert.equal(h.program._statusText, 'NO HISTORY')
    h.advance(400)
    assert.ok(h.find('NO HISTORY') >= 0, '[B] with an empty history says so')
  } finally { h.shutdown() }
})

test('[B] still steps back when there IS history', async () => {
  const h = await boot({})
  try {
    h.powerOn()
    h.key('3'); h.advance(2500)
    const first = h.program.lockedStation
    h.key('5'); h.advance(2500)
    assert.notEqual(h.program.lockedStation, first, 'test setup: two different stations')
    h.key('b'); h.advance(2500)
    assert.equal(h.program.lockedStation, first, '[B] returned to the previous station')
    assert.notEqual(h.program._statusText, 'NO HISTORY')
  } finally { h.shutdown() }
})

test('the visualizer clicks only for keys it actually answers', async () => {
  const h = await boot({})
  try {
    h.powerOn()
    h.key('3'); h.advance(3000)
    h.key('v'); h.advance(1600)
    assert.equal(h.program.visualizerActive, true, 'test setup: in the visualizer')
    // The footer legend's own set, plus volume and the exits.
    for (const k of ['n', 'N', 'm', 'M', 'c', 'C', 'v', 'V', 'e', 'E', 'f', 'F', 'Escape', 'ArrowUp', 'ArrowDown']) {
      assert.ok(h.program.isMappedKey({ key: k }), `[${k}] is a visualizer command and should click`)
    }
    // Real commands elsewhere, deliberate no-ops in here since the 64th
    // pass -- and keys this app does not own at all.
    for (const k of ['p', 'P', 'g', 'G', 's', 'S', 'b', 'B', 'Enter', 'ArrowLeft', 'ArrowRight', '1', '0', ')', 'x', ' ']) {
      assert.ok(!h.program.isMappedKey({ key: k }), `[${k}] does nothing in the visualizer and must not click`)
    }
    // [L] follows the same availability the legend dims itself on -- no
    // lyrics are reachable in the harness (fetch rejects), so it is silent.
    assert.ok(!h.program.isMappedKey({ key: 'l' }), '[L] with no lyrics must not click')
    // ...and none of the silent ones may drop the visualizer either.
    h.key('p'); h.key('1'); h.key('x'); h.advance(200)
    assert.equal(h.program.visualizerActive, true, 'a swallowed key is still swallowed')
    assert.equal(h.program.poweredOn, true)
  } finally { h.shutdown() }
})

test('[P] does not click while a power sequence is already running', async () => {
  const h = await boot({})
  try {
    // init()'s cold-open flourish holds _powerAnimating for its first 500ms.
    h.advance(100)
    assert.equal(h.program._powerAnimating, true, 'test setup: mid cold-open')
    assert.ok(!h.program.isMappedKey({ key: 'p' }), '[P] cannot act yet, so it must not click')
    // And through the boot animation, which is what an impatient double-tap
    // actually lands in (see powerUp()'s 50th-pass guard).
    h.advance(600)
    h.key('p')
    h.advance(1500)
    assert.equal(h.program.poweredOn, false, 'test setup: still booting')
    assert.ok(!h.program.isMappedKey({ key: 'p' }), 'the second press of a double-tap must not click')
    h.advance(4000)
    assert.equal(h.program.poweredOn, true)
    assert.ok(h.program.isMappedKey({ key: 'p' }), 'and [P] is a live command again once it lands')
  } finally { h.shutdown() }
})

test('mobile: a skip swipe off-station answers, since touch has no click at all', async () => {
  const h = await boot({ mobile: true })
  try {
    h.powerOn()
    h.advance(1000)
    h.program.enterSeeking(h.screen)
    h.advance(1200)
    h.touch(100, 200, 100, 60) // vertical swipe == [N]
    assert.equal(h.program._statusText, 'NO SIGNAL')
    h.advance(400)
    assert.ok(h.find('NO SIGNAL') >= 0, 'the lite status row carries it too')
  } finally { h.shutdown() }
})

/** Open the guide and step to the station index (page 2). */
async function openIndex(h) {
  h.key('g'); h.advance(200)
  h.key('ArrowRight'); h.advance(200)
}

test('guide index: every station row shares the same column stops', async () => {
  // The About page's rebuild existed because four rows each centred on their
  // own string made the key column wander. The index had the same disease in
  // a different form -- rows joined as `CALLSIGN -- tagline`, so the tagline
  // started 10 columns further right for DISTORTION FIELD than for CIPHER.
  // This is the assertion that stops it coming back.
  const h = await boot()
  try {
    h.powerOn()
    await openIndex(h)
    const C = h.program.GUIDE_INDEX_COLS
    const { STATION_PRESET_ORDER } = await import(`../stations.js?v=${h.tag}`)
    STATION_PRESET_ORDER.forEach((ch, i) => {
      const row = h.row(5 + i)
      const num = `[${String(i + 1).padStart(2, '0')}]`
      const freq = ch.freq.toFixed(1)
      assert.equal(row.slice(C.preset, C.preset + num.length), num, `${ch.callsign}: preset stop`)
      assert.equal(row[C.glyph], ch.glyph, `${ch.callsign}: glyph stop`)
      assert.equal(row.slice(C.freq, C.freq + freq.length), freq, `${ch.callsign}: dial stop`)
      assert.equal(row.slice(C.callsign, C.callsign + ch.callsign.length), ch.callsign, `${ch.callsign}: station stop`)
      assert.equal(row.slice(C.tagline, C.tagline + ch.tagline.length), ch.tagline, `${ch.callsign}: lane stop`)
    })
    // The lane column has to actually hold what lint permits, or the rule and
    // the layout have drifted apart again.
    const { TAGLINE_MAX } = await import('../tools/lint-roster.js')
    assert.equal(TAGLINE_MAX, h.term.cols - C.tagline, 'lint budget matches the LANE column width')
  } finally { h.shutdown() }
})

test('guide index: the on-air marker points at the locked station, and only it', async () => {
  const h = await boot()
  try {
    h.powerOn()
    await openIndex(h)
    const C = h.program.GUIDE_INDEX_COLS
    const { STATION_PRESET_ORDER } = await import(`../stations.js?v=${h.tag}`)
    const idx = STATION_PRESET_ORDER.indexOf(h.program.lockedStation)
    assert.ok(idx >= 0, 'powered on and locked to a public station')
    STATION_PRESET_ORDER.forEach((ch, i) => {
      const mark = h.row(5 + i)[C.mark]
      assert.equal(mark, i === idx ? '>' : ' ', `${ch.callsign}: marker only on the locked row`)
    })
    assert.ok(h.find('the station you are tuned to right now') >= 0, 'and the marker is explained')
  } finally { h.shutdown() }
})

test('guide index from STANDBY claims nothing is on air', async () => {
  // openGuide(fromStandby) means the set is OFF underneath. A marker there
  // would assert a station is playing when the tube is dark.
  const h = await boot()
  try {
    h.advance(600) // let the cold-open flourish finish; [G] is gated on it
    h.key('g'); h.advance(200)
    assert.equal(h.program.poweredOn, false, 'still in STANDBY')
    h.key('ArrowRight'); h.advance(200)
    const C = h.program.GUIDE_INDEX_COLS
    const { STATION_PRESET_ORDER } = await import(`../stations.js?v=${h.tag}`)
    STATION_PRESET_ORDER.forEach((ch, i) => {
      assert.equal(h.row(5 + i)[C.mark], ' ', `${ch.callsign}: no marker with the set off`)
    })
    assert.equal(h.find('the station you are tuned to right now'), -1, 'and no legend for a marker that is not drawn')
  } finally { h.shutdown() }
})

test('guide station page counts its sample against the real tracklist', async () => {
  const h = await boot()
  try {
    h.powerOn()
    await openIndex(h)
    h.key('ArrowRight'); h.advance(200) // first station detail page
    const { STATION_PRESET_ORDER } = await import(`../stations.js?v=${h.tag}`)
    const ch = STATION_PRESET_ORDER[0]
    assert.ok(ch.tracks.length > 6, 'this station has more than the page samples')
    assert.ok(h.find(`SAMPLE TRACKS (6 OF ${ch.tracks.length})`) >= 0,
      'six tracks with no denominator reads as the whole tracklist')
  } finally { h.shutdown() }
})

test('guide station header: tagline joins the callsign on the wide grid, stacks on the lite one', async () => {
  // The header was three stacked left-aligned lines and the lower two --
  // tagline and freqNote -- bled together once both sat at MUTED. Wide grids
  // fix it by moving the tagline up onto the name row. Lite grids cannot:
  // 42 columns joined them into stubs ("a", "tok") too short for truncate()
  // to even mark, so narrow keeps the stack and keeps the weight split that
  // held those rows apart.
  const wide = await boot()
  try {
    wide.powerOn()
    await openIndex(wide)
    wide.key('ArrowRight'); wide.advance(200)
    const { STATION_PRESET_ORDER } = await import(`../stations.js?v=${wide.tag}`)
    const ch = STATION_PRESET_ORDER[0]
    const row3 = wide.row(3)
    assert.ok(row3.includes(ch.callsign), 'callsign on the header row')
    assert.ok(row3.includes(ch.tagline), 'and the tagline joins it there')
    assert.equal(wide.row(4).trim(), '', 'nothing left stacked underneath')
  } finally { wide.shutdown() }

  const lite = await boot({ mobile: true })
  try {
    lite.powerOn()
    await openIndex(lite)
    lite.key('ArrowRight'); lite.advance(200)
    const { STATION_PRESET_ORDER } = await import(`../stations.js?v=${lite.tag}`)
    const ch = STATION_PRESET_ORDER[0]
    assert.ok(lite.row(3).includes(ch.callsign), 'callsign still whole on 42 cols')
    assert.ok(!lite.row(3).includes('...'), 'and the header row never truncates')
    assert.ok(lite.row(4).trim().length > 0, 'tagline stacks below instead')
  } finally { lite.shutdown() }
})

/** A two-finger gesture held for `dt` ms. Not in the harness because only
 *  these tests need it: two fingers means touchend fires TWICE (real fingers
 *  never lift in sync), and the second one -- the event where touches.length
 *  finally reaches 0 -- is the one that resolves the gesture. */
function twoFinger(h, dt) {
  const ev = (touches, changed) => ({ touches, changedTouches: changed, target: null, preventDefault() {} })
  const a = { clientX: 100, clientY: 100 }
  const b = { clientX: 140, clientY: 100 }
  h.program.onTouchStart(h.screen, ev([a, b], []))
  h.advance(dt)
  h.program.onTouchEnd(h.screen, ev([a], [b]))
  h.program.onTouchEnd(h.screen, ev([], [a]))
  h.advance(200)
}

test('mobile: hold powers the set off, tap still only mutes', async () => {
  // The gap that actually failed "would a real radio have this?" -- touch
  // could switch the set on and never off. Hold and tap are the same
  // gesture separated by duration, so the tap path has to stay intact.
  const h = await boot({ mobile: true })
  try {
    h.powerOn()
    assert.equal(h.program.poweredOn, true)
    const muted = h.program.muted
    h.touch(100, 100, 100, 100, 80)   // quick tap
    h.advance(300)
    assert.equal(h.program.poweredOn, true, 'a tap must not power the set down')
    assert.equal(h.program.muted, !muted, 'a tap still toggles mute')
    h.touch(100, 100, 100, 100, 700)  // held
    h.advance(3000)
    assert.equal(h.program.poweredOn, false, 'a held press powers off')
    assert.ok(h.find('STANDBY') >= 0, 'and lands on STANDBY')
    h.touch(100, 100, 100, 100, 700)  // held, from off
    h.advance(4000)
    assert.equal(h.program.poweredOn, true, 'a held press powers back on -- no way to get stuck off')
  } finally { h.shutdown() }
})

test('mobile: two-finger hold opens the guide, two-finger tap still cycles colour', async () => {
  const h = await boot({ mobile: true })
  try {
    h.powerOn()
    const mode = h.program.displayModeIndex
    twoFinger(h, 120)
    assert.equal(h.program.guideOpen, false, 'a quick two-finger tap is still colour')
    assert.notEqual(h.program.displayModeIndex, mode, 'and it cycled')
    twoFinger(h, 700)
    assert.equal(h.program.guideOpen, true, 'held, it opens the guide')
    h.tap()
    h.advance(300)
    assert.equal(h.program.guideOpen, false, 'and a tap closes it again')
  } finally { h.shutdown() }
})

test('mobile: swiping pages the guide, and running off the end does not dismiss it', async () => {
  // Opening the guide was only half a feature: [<-]/[->] page it on
  // desktop, so without this touch reached page 1 and nothing else -- the
  // index and all nine station pages were unreachable from a phone.
  const h = await boot({ mobile: true })
  try {
    h.powerOn()
    twoFinger(h, 700)
    assert.equal(h.program.guidePage, 1)
    h.swipe(1); h.advance(200)
    assert.equal(h.program.guidePage, 2, 'swipe right pages forward')
    h.swipe(-1); h.advance(200)
    assert.equal(h.program.guidePage, 1, 'swipe left pages back')
    // At page 1 there is nowhere left to go. An ARROW here closes the guide
    // (it is "any other key"); a swipe must not -- it reads as a scroll
    // that hit the end, and dismissing for it would feel like a misfire.
    h.swipe(-1); h.advance(200)
    assert.equal(h.program.guideOpen, true, 'a swipe off the end leaves the guide up')
    assert.equal(h.program.guidePage, 1)
  } finally { h.shutdown() }
})

test('guide index and station pages keep their footers on the lite grid', async () => {
  // The index footer and the station-page footer were both hardcoded to row
  // 22 on a grid that is 22 ROWS (0-21), so both fell off entirely and the
  // lite guide had no nav hint below page 1. Same fault page 1 already fixed.
  const h = await boot({ mobile: true })
  try {
    h.powerOn()
    assert.equal(h.term.rows, 22)
    await openIndex(h)
    assert.ok(h.row(h.term.rows - 1).includes('TAP CLOSE'), 'index footer lands inside the grid')
    for (const cs of ['CIPHER', 'DISTORTION FIELD', 'HACKBACK']) {
      assert.ok(h.find(cs) >= 0, `${cs} not truncated on the lite index`)
    }
    h.key('ArrowRight'); h.advance(200)
    assert.ok(h.row(h.term.rows - 1).includes('TAP CLOSE'), 'station footer lands inside the grid')
  } finally { h.shutdown() }
})
