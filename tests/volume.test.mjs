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
    // unMute() restores a remembered level; the app must set the level it
    // means AFTER that, or the set comes back at its old loudness.
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
