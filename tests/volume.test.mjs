// Issue #67: turning the volume to 0 must silence the track that is PLAYING,
// not just the next one to load.
//
// The player's own rules make this sharper than "call setVolume(0)". Captured
// from the real IFrame player on 2026-09-22 (see the fake in harness.mjs):
// setVolume(0) reads as muted, but unMute() refuses to leave the level at
// zero -- it restores the last non-zero volume, or a floor of 5. So the order
// of the two calls decides whether a listener hears anything, and the old
// adjustVolume() ran them in the losing order: applyVolume() then unMute().
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

/** Down from 100 in 10s: ten presses land exactly on 0. */
const toZero = (h) => { for (let i = 0; i < 12; i++) h.key('ArrowDown') }

test('volume 0 silences the track already playing (#67)', async () => {
  const h = await boot({ player: true, station: 'distortion-field' })
  try {
    h.powerOn()
    h.advance(4000)
    assert.equal(h.player.audible(), true, 'the set starts audible')
    toZero(h)
    h.advance(200)
    assert.equal(h.program.volume, 0, 'the slider is at 0')
    assert.equal(h.player.audible(), false,
      `at VOL 0 nothing should be audible, but the player is at volume ${h.player.volume} muted=${h.player.muted}`)
  } finally { h.shutdown() }
})

test('and the level comes back on the way up, without a jump to the old one', async () => {
  const h = await boot({ player: true, station: 'distortion-field' })
  try {
    h.powerOn()
    h.advance(4000)
    toZero(h)
    h.advance(200)
    assert.equal(h.player.audible(), false)
    h.key('ArrowUp')
    h.advance(200)
    assert.equal(h.program.volume, 10, 'one notch up')
    assert.equal(h.player.audible(), true, 'audible again')
    // The END level only. This used to say it guarded the unMute-then-set
    // ORDER, and it does not: setVolume(10) then unMute() also ends at 10,
    // since unMute() only restores a level when the current one is zero
    // (2026-10-12 audit). What it does catch is an un-mute path that never
    // sets the slider's level at all and leaves the player's remembered one.
    assert.equal(h.player.volume, 10, `came back at ${h.player.volume}, not the slider's 10`)
  } finally { h.shutdown() }
})

test('a track loading while the slider is at 0 is silent too (the half that always worked)', async () => {
  const h = await boot({ player: true, station: 'distortion-field' })
  try {
    h.powerOn()
    h.advance(4000)
    toZero(h)
    h.advance(200)
    h.player.endTrack()          // natural end -> the next track loads
    h.advance(4000)
    assert.equal(h.player.audible(), false, 'the next track starts silent as well')
  } finally { h.shutdown() }
})

test('[M] still hard-mutes and restores the slider level, not the player\'s remembered one', async () => {
  const h = await boot({ player: true, station: 'distortion-field' })
  try {
    h.powerOn()
    h.advance(4000)
    h.key('ArrowDown')           // one notch off the default, so a restore to
    h.advance(100)               // the player's remembered level is visible
    const slider = h.program.volume
    h.key('m')
    h.advance(200)
    assert.equal(h.program.muted, true)
    assert.equal(h.player.audible(), false, 'muted is silent')
    h.key('m')
    h.advance(200)
    assert.equal(h.program.muted, false)
    assert.equal(h.player.audible(), true, 'un-muted is audible')
    assert.equal(h.player.volume, slider, `back at the slider's ${slider}, not ${h.player.volume}`)
  } finally { h.shutdown() }
})

test('a session saved at VOL 0 comes back silent, through the autoplay unmute (#67)', async () => {
  // The three autoplay paths (the PLAYING callback, loadTrack's unmute, and
  // the deferred _pendingUnmute flush on the next key) each call unMute()
  // and then applyVolume(). That order is what makes them safe at zero --
  // unMute() raises the level, applyVolume() takes it straight back down --
  // and this is the scenario that walks them.
  const h = await boot({ player: true, station: 'distortion-field', saved: { volume: 0, muted: false, tapConsent: 'no' } })
  try {
    h.powerOn()
    h.advance(6000)
    assert.equal(h.program.volume, 0, 'the saved slider is restored')
    assert.equal(h.program.muted, false, 'and this is VOL 0, not [M]')
    assert.equal(h.player.audible(), false,
      `should still be silent, but the player is at volume ${h.player.volume} muted=${h.player.muted}`)
    h.key('k') // any key: flushes a deferred unmute if one was pending
    h.advance(500)
    assert.equal(h.player.audible(), false, 'and a later keypress does not re-open it')
  } finally { h.shutdown() }
})

test('the fake player answers its own capture (harness.mjs, #67)', async () => {
  // 2026-10-12 (audit) -- the fake's comment recorded setVolume(50) ->
  // setVolume(0) -> unMute() giving 5, while the fake itself gave 50: "rebuilt
  // from the capture" was not true of it. This pins the capture's rows to the
  // fake so the two cannot drift apart again. Row 5's 70 is the level the
  // player was at before that probe began -- see the fake's note.
  const h = await boot({ player: true, station: 'distortion-field' })
  try {
    h.advance(100) // onReady
    const p = h.player
    p.setVolume(50)
    assert.deepEqual([p.volume, p.isMuted()], [50, false], 'setVolume(50)')
    p.setVolume(0)
    assert.deepEqual([p.volume, p.isMuted()], [0, true], 'setVolume(0) reads as muted')
    p.unMute()
    assert.deepEqual([p.volume, p.isMuted()], [5, false], 'unMute() after a bare zero: the floor, not the 50')
    p.setVolume(70) // the separate probe's starting level
    p.setVolume(0); p.mute()
    assert.deepEqual([p.volume, p.isMuted()], [0, true], 'setVolume(0); mute()')
    p.unMute()
    assert.deepEqual([p.volume, p.isMuted()], [70, false], 'unMute() after an explicit mute(): the pre-mute level')
  } finally { h.shutdown() }
})

// 2026-10-12 (audit, M7) -- the two below assert the CALL SEQUENCE, not where
// it ends. Both bugs ended in the right place: a blip is an intermediate state
// by definition, so a test reading h.player.audible() afterwards passes it.
// h.player.levels is every mute/unMute/setVolume/pause in order, with the
// level heard straight after each.
const trail = (levels) => levels.map((l) => `${l.call}=${l.heard}`).join(' ')

test('a session saved at VOL 0 never passes through an audible level on the way up (M7)', async () => {
  // The reveal beat ran unMute() and THEN applyVolume(). At VOL 0 that is
  // unMute -> setVolume(0) -> mute: right at the end, but the unMute()
  // restored the player's remembered level first. Every level this player
  // is ever asked for, from boot to well after the reveal, must be silence.
  const h = await boot({ player: true, station: 'distortion-field', saved: { volume: 0, muted: false, tapConsent: 'no' } })
  try {
    h.powerOn()
    h.advance(6000)
    h.key('k') // the deferred-unmute flush, the other bare unMute() M7 removed
    h.advance(500)
    const loud = h.player.levels.filter((l) => l.heard > 0)
    assert.equal(loud.length, 0, `audible for a moment at VOL 0: ${trail(h.player.levels)}`)
  } finally { h.shutdown() }
})

test('the sleep timer running out pauses before anything raises the level (M7)', async () => {
  // powerDown() used to clear the fade and the duck -- both put the level
  // back to the slider's -- and only THEN pause, so a set faded to a whisper
  // sent setVolume(70) to a playing track as it switched itself off.
  const h = await boot({ player: true, station: 'distortion-field' })
  try {
    h.powerOn()
    h.advance(3000)
    for (let i = 0; i < 3; i++) h.key('t') // 60 -> 30 -> 15
    assert.equal(h.program._sleepMinutes, 15, 'a sleep timer is armed')
    // Backdated rather than waited for: 15 minutes is ~56k frames.
    h.program._sleepUntil = Date.now() + 4000
    h.advance(3500) // deep in the fade
    const from = h.player.levels.length
    const faded = h.player.levels.at(-1).heard
    assert.ok(faded > 0 && faded < 10, `the fade has the set nearly silent: ${faded}`)
    h.advance(3000) // expiry
    assert.equal(h.program.poweredOn, false, 'the timer switched the set off')
    const after = h.player.levels.slice(from)
    const pause = after.findIndex((l) => l.call === 'pause')
    assert.ok(pause >= 0, `the set paused: ${trail(after)}`)
    const before = after.slice(0, pause)
    let level = faded
    for (const l of before) {
      assert.ok(l.heard <= level, `the level ROSE before the pause: ${trail(after)}`)
      level = l.heard
    }
  } finally { h.shutdown() }
})

test('[M] off and on again at VOL 0 never opens the level (M7)', async () => {
  // toggleMute() un-muted with a bare unMute() before applyVolume(): from an
  // explicit mute() at zero that restores the player's remembered level, and
  // the setVolume(0) after it is a moment too late.
  const h = await boot({ player: true, station: 'distortion-field', saved: { volume: 0, muted: false, tapConsent: 'no' } })
  try {
    h.powerOn()
    h.advance(3000)
    const from = h.player.levels.length
    h.key('m')
    h.advance(300)
    h.key('m')
    h.advance(300)
    assert.equal(h.program.muted, false, 'un-muted again')
    const loud = h.player.levels.slice(from).filter((l) => l.heard > 0)
    assert.equal(loud.length, 0, `audible for a moment at VOL 0: ${trail(h.player.levels.slice(from))}`)
  } finally { h.shutdown() }
})

test('at VOL 0, the other un-mute paths stay silent too: a scan lock, and the deferred flush (M7)', async () => {
  // M7's other bare unMute() calls. A scan's lock loads outside any gesture
  // from a set that was not playing, so it takes loadTrack()'s autoplay
  // un-mute: immediately on desktop, deferred to the next touch or key on
  // the lite layout -- and those two flushes are separate code (ui/mobile.js's
  // onTouchStart, program.js's key()).
  for (const how of ['desktop', 'tap', 'key']) {
    const mobile = how !== 'desktop'
    const h = await boot({ mobile, player: true, station: 'distortion-field', saved: { volume: 0, muted: false, tapConsent: 'no' } })
    try {
      if (mobile) { h.advance(600); h.tap() } else h.powerOn()
      h.advance(6000)
      h.key('s')
      h.advance(15000)
      assert.equal(h.program.mode, 'locked', `${how}: the scan locked a station`)
      if (mobile) {
        assert.equal(h.program._pendingUnmute, true, `${how}: the un-mute was deferred, so the flush is what this walks`)
        if (how === 'tap') h.tap(); else h.key('k')
        h.advance(500)
        assert.equal(h.program._pendingUnmute, false, `${how}: and flushed`)
      }
      const loud = h.player.levels.filter((l) => l.heard > 0)
      assert.equal(loud.length, 0, `${how}: audible for a moment at VOL 0: ${trail(h.player.levels)}`)
    } finally { h.shutdown() }
  }
})
