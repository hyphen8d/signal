// SIGNAL -- the first-visit boot, end to end (2026-09-13 audit, L11).
//
// Why this file exists on its own: since the harness started drawing an
// unpinned boot's station from BOTH bands (tests/harness.mjs, 2026-09-13),
// those boots arrive through ?station= and the app's random-preset fallback
// in program.js init never runs for them. Before that change six tests
// exercised the fallback by accident; after it, one -- and that one only
// checks mode, station and currentTrack. Mutated in a scratch copy, deleting
// the fallback's `this.currentTrack = this.nextTrack(ch)` failed 6 tests on
// the old tree and 1 on the new, and deleting only `this.needsTrackLoad =
// true` -- a first visit that locks a station and then plays dead air --
// was guarded by nothing that asserted playback at all.
//
// So this pins the path deliberately rather than relying on the draw: no
// saved session, no ?station=, `anyBand: false`, and a fake player, then it
// follows the boot all the way to sound. Each assertion names the half of
// the fallback it guards, so a red run says which line went missing.

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

test('a first visit powers on to a station that is actually playing', async () => {
  const h = await boot({ anyBand: false, player: true })
  try {
    const p = h.program
    // The fallback's own fields, read before power-on so nothing downstream
    // can have filled them in for it.
    assert.equal(p.mode, 'locked', 'a first visit lands locked, not seeking at FREQ_MIN')
    assert.ok(p.lockedStation, 'the fallback picked a station')
    assert.equal(p.lockedStation.band, p.band, 'the pick is on the band the dial is showing')
    assert.equal(p.freq, p.lockedStation.freq, 'the dial sits on the picked station')
    const track = p.currentTrack
    assert.ok(track && track.youtubeId, 'the fallback primed a track (nextTrack)')
    assert.ok(p.lockedStation.tracks.some((t) => t.youtubeId === track.youtubeId),
      `the primed track belongs to ${p.lockedStation.callsign}`)
    assert.equal(p.needsTrackLoad, true, 'the fallback asked powerUp() to load that track')

    h.powerOn()
    h.advance(8000)
    await h.flush()
    h.advance(400)

    // needsTrackLoad honoured: the primed track -- not some other one -- was
    // handed to the player, once, by the boot.
    const loads = h.playerCalls.filter((c) => c.startsWith('load:') || c.startsWith('cue:'))
    assert.ok(loads.length > 0, `the boot never loaded a track (player calls: ${h.playerCalls.join(', ') || 'none'})`)
    assert.equal(loads[0].slice(loads[0].indexOf(':') + 1), track.youtubeId, 'the first load is the primed track')
    assert.equal(p.needsTrackLoad, false, 'the load request was consumed')
    assert.equal(h.player.getPlayerState(), 1, 'the player reached PLAYING')

    // And the listener can see it: the NOW PLAYING title is on the grid.
    const want = track.title.slice(0, 12).toUpperCase()
    const hit = h.rows().some((r) => r.toUpperCase().includes(want))
    assert.ok(hit, `"${track.title}" is not on screen:\n${h.rows().join('\n')}`)
  } finally { h.shutdown() }
})
