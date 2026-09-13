// Paint guards for the overlays that leave the receiver running underneath
// them (2026-09-12 audit, H3 / M11 / M12 / L9 / L10).
//
// The guide, the LINE INPUT card and the weather card all sit on a set
// that keeps playing: tracks end, scans lock, the YouTube state callback
// fires. frame() and the fx queue both bail while an overlay is up, so
// every painter that rides THEM is safe by construction. The ones here are
// reached from outside both -- a real timer, a player callback, a
// synchronous first tick -- and each of these tests drives one of those
// paths under an overlay and asserts the overlay came out byte-identical.
// "No noise glyph on the row" would be a weaker check: the playback bar
// that overwrote the [Y]/[N] line contained no noise at all.

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

const RESOLVE_NOISE = /[▓▒░#%&*]/
/** The row with the text it is SUPPOSED to show blanked out, so a noise check
 *  only looks at what is left. Each string is removed whole, and otherwise by
 *  its longest leading run of at least 3 characters on the row -- the
 *  receiver truncates a long title/artist to the box, so the drawn text can be
 *  a prefix. Blanked with spaces, not deleted, so columns stay where they were. */
const withoutText = (row, ...texts) => {
  let out = row
  for (const t of texts) {
    if (!t) continue
    for (let n = t.length; n >= 3; n--) {
      const i = out.indexOf(t.slice(0, n))
      if (i !== -1) { out = out.slice(0, i) + ' '.repeat(n) + out.slice(i + n); break }
    }
  }
  return out
}
const powerOnLocked = (h) => { h.powerOn(); h.advance(2000) }
const snapshot = (h, y0, y1) => { const out = []; for (let y = y0; y <= y1; y++) out.push(h.row(y)); return out }

test('a track ending under the weather card leaves the card untouched, and the row redraws on close (H3)', async () => {
  const h = await boot({ player: true, weather: true })
  try {
    powerOnLocked(h)
    h.key('w')
    assert.equal(h.program.weatherOpen, true)
    assert.ok(h.row(14).includes('[Y] ALLOW'), 'consent face is up on row 14')
    const before = snapshot(h, 8, 16)
    h.player.endTrack(); h.advance(1200)
    assert.deepEqual(snapshot(h, 8, 16), before, 'the card rows changed under a track end')
    // The playState was still recorded; the row comes back once the card is
    // down, from redrawWeatherRegion -> redrawLockState -> setPlayState.
    h.key('w'); h.advance(700)
    assert.equal(h.program.weatherOpen, false)
    assert.ok(h.row(14).includes('PLAYING'), `playback row did not redraw after close: ${h.row(14)}`)
    // 2026-09-13 -- the noise check discounts the text the row is SUPPOSED to
    // show. RESOLVE_NOISE is the scramble set ('▓▒░#%&*', ui/desktop.js), and
    // '&' is also in half the artist credits on the dial: this failed ~1 run
    // in 20 for two weeks, on a row that had resolved perfectly -- every
    // failure caught was an artist like "Eric B. & Rakim" or "Echo & the
    // Bunnymen", drawn exactly right and read as noise. A leftover scramble
    // glyph anywhere else on the row still fails.
    const { title, artist } = h.program.currentTrack
    assert.ok(!RESOLVE_NOISE.test(withoutText(h.row(13), title, artist)), `track row still unsettled after close: ${h.row(13)}`)
    assert.ok(h.row(13).includes(h.program.currentTrack.title.slice(0, 12)), `track did not re-resolve after close: ${h.row(13)}`)
  } finally { h.shutdown() }
})

test('a track ending under the LINE INPUT card leaves the card untouched (H3)', async () => {
  const h = await boot({ player: true, tap: 'tab' })
  try {
    powerOnLocked(h)
    h.key('v')
    assert.equal(h.program.tapConsentOpen, true)
    assert.ok(h.row(13).includes('ANALYSIS ONLY'), 'the card copy is on row 13')
    const before = h.rows()
    h.player.endTrack(); h.advance(1200)
    assert.deepEqual(h.rows(), before, 'the card changed under a track end')
  } finally { h.shutdown() }
})

test('a track ending under the guide leaves the guide untouched (H3)', async () => {
  const h = await boot({ player: true })
  try {
    powerOnLocked(h)
    h.key('g')
    assert.equal(h.program.guideOpen, true)
    const before = h.rows()
    h.player.endTrack(); h.advance(1200)
    assert.deepEqual(h.rows(), before, 'the guide changed under a track end')
  } finally { h.shutdown() }
})

test('a lock announced under the weather card is refused, not painted (H3)', async () => {
  // The scan no longer runs under the card (L9 below), so this drives the
  // station painters directly -- they are the defence for whatever path
  // reaches them next, and a guard nobody exercises is the one that rots.
  const h = await boot({ player: true, weather: true })
  try {
    powerOnLocked(h)
    h.key('w')
    const before = snapshot(h, 8, 16)
    const other = h.program.bandPresets().find((st) => st !== h.program.lockedStation)
    h.program.showStation(h.screen, other)
    h.program.showTrack(h.screen, other.tracks[0])
    h.program.clearStation(h.screen)
    h.program.clearTrack(h.screen)
    h.advance(300)
    assert.deepEqual(snapshot(h, 8, 16), before, 'a station painter wrote through the card')
    assert.equal(h.program.overlayUp(), true)
  } finally { h.shutdown() }
})

test('opening the weather card stops a running scan and the status row says so (L9)', async () => {
  const h = await boot({ player: true, weather: true })
  try {
    powerOnLocked(h)
    h.key('s'); h.advance(50)
    assert.equal(h.program.scanning, true)
    h.key('w')
    assert.equal(h.program.scanning, false, 'the scan kept running under the card')
    assert.ok(h.row(2).includes('SEEKING'), `status row under the card: ${h.row(2)}`)
    assert.ok(!h.row(2).includes('SCANNING'), `a stopped scan still reads SCANNING: ${h.row(2)}`)
    h.advance(4000)
    // Nothing locked, nothing painted: the rows the card covers are the
    // card's, and the dial rows above it carry no station noise either.
    for (const y of [9, 10, 13]) assert.ok(!RESOLVE_NOISE.test(h.row(y)), `row ${y} carries resolve noise: ${h.row(y)}`)
    assert.equal(h.program.mode, 'seeking')
  } finally { h.shutdown() }
})

test('the weather card names a browser with no location service, not the connection (L10)', async () => {
  // A weather boot has a geolocation; this one deliberately does not, and
  // claims a secure context -- the shape of a browser with the API missing
  // on https, where "this page is on http" is the wrong sentence.
  const h = await boot({ player: true })
  globalThis.isSecureContext = true
  try {
    powerOnLocked(h)
    h.key('w'); h.key('y'); h.advance(200)
    await h.flush(); h.advance(200)
    assert.equal(h.program.weatherOpen, true)
    assert.notEqual(h.find('This browser has no location service.'), -1, 'the NO LOCATION copy is not on the card')
    assert.equal(h.find('This page is on http'), -1, 'the http sentence is on the card of a secure page')
    // Not a refusal: consent stays 'yes', so the next visit asks again.
    assert.equal(h.program.weatherConsent, 'yes')
  } finally { delete globalThis.isSecureContext; h.shutdown() }
})

test('mobile: a station swipe during the held reveal leaves NOW PLAYING blank, not churning (M11)', async () => {
  const h = await boot({ mobile: true, player: true })
  try {
    h.advance(600); h.tap(); h.advance(4000)
    assert.equal(h.program.mode, 'locked')
    h.player.endTrack(); h.advance(100)
    const L = h.program._mLayout
    assert.equal(h.program.revealHeld(h.program.currentTrack), true, 'the reveal should be held until the music starts')
    h.swipe(1)
    let checked = 0
    for (const ms of [20, 100, 200]) {
      h.advance(ms)
      if (h.program.mode !== 'seeking') break
      checked++
      for (const y of [L.npTrack1, L.npArtist]) {
        assert.ok(!RESOLVE_NOISE.test(h.row(y)), `+${ms}ms row ${y} is churning: ${h.row(y)}`)
      }
    }
    assert.ok(checked > 0, 'the swipe never left the set seeking long enough to look')
  } finally { h.shutdown() }
})

test('mobile: the narrow guide index keeps a space between a ZM frequency and the callsign (M12)', async () => {
  const h = await boot({ mobile: true })
  try {
    h.advance(600); h.tap(); h.advance(4000)
    h.swipe2(1); h.advance(200)
    assert.equal(h.program.band, 'zm')
    h.program.openGuide(h.screen, false)
    h.program.stepGuidePage(h.screen, 1)
    h.program.bandPresets().forEach((ch, i) => {
      const row = h.row(3 + i)
      assert.ok(row.includes(`${ch.freq.toFixed(1)} ${ch.callsign}`), `row ${3 + i}: ${row}`)
    })
  } finally { h.shutdown() }
})
