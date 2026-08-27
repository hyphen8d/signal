// Unit tests for the pure helpers that became importable in the 2026-08-25
// split. No harness needed: none of these modules touch the DOM at load.
// Run: node --test tests/

import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.SIGNAL_BUILD = 'helpers'
globalThis.matchMedia = () => ({ matches: false })

const layout = await import('../layout.js?v=helpers')
const tuning = await import('../tuning.js?v=helpers')
const stations = await import('../stations.js?v=helpers')
const voice = await import('../audio/voice.js?v=helpers')
const sfx = await import('../audio/sfx.js?v=helpers')
const crt = await import('../crt-hooks.js?v=helpers')

test('freqToCol/colToFreq: band edges land on the dial edges and round-trip', () => {
  const { freqToCol, colToFreq, clampFreq, FREQ_MIN, FREQ_MAX } = tuning
  const { DIAL_X0, DIAL_X1 } = layout
  assert.equal(freqToCol(FREQ_MIN), DIAL_X0)
  assert.equal(freqToCol(FREQ_MAX), DIAL_X1)
  for (let col = DIAL_X0; col <= DIAL_X1; col++) assert.equal(freqToCol(colToFreq(col)), col)
  assert.equal(clampFreq(FREQ_MIN - 50), FREQ_MIN)
  assert.equal(clampFreq(FREQ_MAX + 50), FREQ_MAX)
})

test('nearestStation never finds a secret station; nearestSignal/nearestLockable do', () => {
  const { nearestStation, nearestSignal, nearestLockable } = tuning
  // 2026-08-26: was NIN_STATION alone; walks SECRET_STATIONS now that
  // GREEN ROOM shipped as the second entry. The three-question split is
  // the whole reason a secret station can be swept past and heard but
  // never seeked to, so it has to hold for EVERY entry, not just the
  // first one anybody wrote a test for.
  assert.ok(stations.SECRET_STATIONS.length >= 2, 'both secret stations are in the array')
  for (const secret of stations.SECRET_STATIONS) {
    assert.notEqual(nearestStation(secret.freq).station, secret, `${secret.callsign} is unreachable by seek/scan`)
    assert.equal(nearestSignal(secret.freq).station, secret, `${secret.callsign} still shows a carrier`)
    assert.equal(nearestSignal(secret.freq).dist, 0)
    assert.equal(nearestLockable(secret.freq).station, secret, `${secret.callsign} is lockable when parked on it`)
  }
  for (const st of stations.STATIONS) assert.equal(nearestStation(st.freq).station, st)
})

test('STATION_COLS: every public station has its own dial column; the secret ones are absent', () => {
  const { STATION_COLS, freqToCol } = tuning
  assert.equal(STATION_COLS.size, stations.STATIONS.length, 'no two public stations share a column')
  for (const secret of stations.SECRET_STATIONS) {
    assert.ok(!STATION_COLS.has(freqToCol(secret.freq)), `${secret.callsign} draws no dial tick`)
  }
})

// 2026-08-26, shipped with GREEN ROOM. The array/`station.secret` refactor
// (2026-08-23) exists so a second secret station needs no new call sites,
// which is only true while every entry actually carries the fields the
// generic paths read. A future entry that forgets `secret: true` would be
// seekable, and one naming a tint that isn't in PHOSPHORS would fail
// silently -- setPhosphor() no-ops on an unknown name, so the station
// would just never change colour and nothing would throw.
test('every SECRET_STATIONS entry carries what the generic secret paths read', async () => {
  const config = await import('../config.js?v=helpers')
  const presetFreqs = new Set(stations.STATION_PRESET_ORDER.map((s) => s.freq))
  for (const secret of stations.SECRET_STATIONS) {
    assert.equal(secret.secret, true, `${secret.callsign}: secret flag`)
    assert.ok(config.PHOSPHORS[secret.forcedPhosphor], `${secret.callsign}: forcedPhosphor '${secret.forcedPhosphor}' is a real tint`)
    assert.ok(!stations.STATIONS.includes(secret), `${secret.callsign} is not in the public roster`)
    assert.ok(!presetFreqs.has(secret.freq), `${secret.callsign} has no preset slot`)
    assert.ok(!secret.glyph, `${secret.callsign} draws no dial glyph`)
  }
})

test('shuffledIndices is a permutation', () => {
  for (let n = 1; n <= 30; n++) {
    const arr = tuning.shuffledIndices(n)
    assert.deepEqual([...arr].sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i))
  }
})

test('truncate marks the cut with three periods and never exceeds maxLen', () => {
  const { truncate } = layout
  assert.equal(truncate('hello', 10), 'hello')
  assert.equal(truncate('hello world', 8), 'hello...')
  assert.equal(truncate('hello', 3), 'hel')
  for (let n = 0; n < 12; n++) assert.ok(truncate('a long track title here', n).length <= n)
})

test('wrapLines fills greedily, caps at maxLines, and marks overflow', () => {
  const { wrapLines } = layout
  assert.deepEqual(wrapLines('synthetic hearts, borrowed neon', 36, 2), ['synthetic hearts, borrowed neon'])
  assert.deepEqual(wrapLines('synthetic hearts, borrowed neon', 18, 2), ['synthetic hearts,', 'borrowed neon'])
  const over = wrapLines('one two three four five six seven eight nine ten', 12, 2)
  assert.equal(over.length, 2)
  assert.ok(over[1].endsWith('...'), `overflow marked: ${JSON.stringify(over)}`)
  assert.ok(over.every((l) => l.length <= 12))
  assert.deepEqual(wrapLines('supercalifragilistic', 8, 2), ['super...'], 'a single over-wide word is truncated')
})

test('wordWrap breaks only on spaces and keeps every word', () => {
  const text = 'Big beat and breakbeat electronica for late-night infiltration runs'
  const lines = layout.wordWrap(text, 20)
  assert.ok(lines.every((l) => l.length <= 20))
  assert.equal(lines.join(' '), text)
})

test('primaryArtist collapses collaboration credits; sampleTracks never repeats an artist', () => {
  const { primaryArtist, sampleTracks } = layout
  assert.equal(primaryArtist('Brian Eno / Orchestra of the Swan'), primaryArtist('Brian Eno'))
  assert.equal(primaryArtist('The Chemical Brothers'), 'chemical brothers')
  assert.equal(primaryArtist('A feat. B'), 'a')
  const tracks = [
    { artist: 'Brian Eno' }, { artist: 'Brian Eno / Orchestra of the Swan' }, { artist: 'Arvo Pärt' },
    { artist: 'The Eno' }, { artist: 'Eno' },
  ]
  const sample = sampleTracks(tracks, 6)
  // 'The Eno' and 'Eno' collapse to one credit ('eno'); 'Brian Eno' is its own.
  assert.deepEqual(sample.map((t) => t.artist), ['Brian Eno', 'Arvo Pärt', 'The Eno'])
})

test('mobileLayout: the worst case (2-line tagline, 2-line title) still clears the hint rows', () => {
  const { mobileLayout, MHINT_Y1 } = layout
  for (const tag of [1, 2]) for (const trk of [1, 2]) {
    const L = mobileLayout(tag, trk)
    assert.ok(L.widgetRow2 < MHINT_Y1, `(${tag},${trk}) widgetRow2 ${L.widgetRow2} < hints ${MHINT_Y1}`)
    assert.ok(L.stationBot < L.npTop && L.npBot < L.widgetRow, 'boxes stack in order')
    assert.equal(L.stationTag2 != null, tag === 2)
    assert.equal(L.npTrack2 != null, trk === 2)
  }
})

test('formatClock is always 11 characters', () => {
  assert.equal(layout.formatClock(new Date(2026, 0, 5, 3, 7)), '01/05 03:07')
  assert.equal(layout.formatClock(new Date(2026, 11, 25, 23, 59)).length, 11)
})

test('fmtTime and centerX', () => {
  assert.equal(layout.fmtTime(0), '0:00')
  assert.equal(layout.fmtTime(65.9), '1:05')
  assert.equal(layout.fmtTime(-3), '0:00')
  assert.equal(layout.centerX(80, 'abcd'), 38)
  assert.equal(layout.centerX(10, 'a'.repeat(30)), 0, 'never negative')
})

test('parseLRC keeps timed, non-blank lines in time order', () => {
  const lines = voice.parseLRC('[00:12.50]second\n[00:01.00]first\n[00:05.00]\nno tag\n[01:00.25]last')
  assert.deepEqual(lines, [
    { time: 1, text: 'first' }, { time: 12.5, text: 'second' }, { time: 60.25, text: 'last' },
  ])
})

test('the tuning-distance curves agree: static gain and CRT degrade both max out at NEAR_THRESHOLD', () => {
  const { NEAR_THRESHOLD } = tuning
  const g0 = sfx.staticGainForDist(0), gFar = sfx.staticGainForDist(NEAR_THRESHOLD)
  assert.ok(g0 < gFar)
  assert.equal(sfx.staticGainForDist(NEAR_THRESHOLD * 5), gFar, 'clamped past the threshold')
  const d0 = crt.crtDegradeForDist(0), dFar = crt.crtDegradeForDist(NEAR_THRESHOLD)
  assert.ok(d0.chroma < dFar.chroma && d0.snow < dFar.snow && d0.roll < dFar.roll)
  assert.deepEqual(crt.crtDegradeForDist(NEAR_THRESHOLD * 5), dFar)
})

test('speakerGain: mute wins, the slider scales linearly, junk clamps (issue #18)', () => {
  const { speakerGain } = sfx
  // Linear in volume/100 on purpose -- it has to match what the player
  // side does (applyVolume -> setVolume, linear on the media element), or
  // the sounds over a track drift against it as the knob moves.
  assert.equal(speakerGain(false, 100), 1)
  assert.equal(speakerGain(false, 70), 0.7)
  assert.equal(speakerGain(false, 0), 0)
  // Mute is absolute, whatever the slider says -- the whole point of the
  // hard-mute bus.
  assert.equal(speakerGain(true, 100), 0)
  assert.equal(speakerGain(true, 0), 0)
  // Out of range clamps rather than inverting: a negative bus gain would
  // flip the phase of every sound on it instead of just being quiet.
  assert.equal(speakerGain(false, -40), 0)
  assert.equal(speakerGain(false, 400), 1)
  assert.equal(speakerGain(false, undefined), 1, 'a missing volume is full, not silent')
  assert.equal(speakerGain(false, NaN), 1)
})

test('every public station has a liner pool; every secret one has none', () => {
  // MIDNIGHT NEON had neither, and not on purpose. The 57th pass folded the
  // general one-liners into "every station's pool"; the 60th pass retired
  // MOMENTUM by deleting its key from STATION_LINER_FILES, and since
  // LINER_FILES is built by iterating that map, deleting the key removed the
  // station from the general pool too. maybePlayLinerDrop() then bailed on
  // the missing entry, so one station played no liners at all and nothing
  // said so.
  //
  // The two halves matter equally: secret stations rely on the SAME missing
  // key to opt out (GREEN ROOM is meant to be silent here), which is why the
  // fix is an explicit empty array rather than a general-pool fallback --
  // and why the absence is asserted rather than just the presence.
  const { LINER_FILES, GENERAL_LINER_FILES } = voice
  for (const st of stations.STATIONS) {
    const pool = LINER_FILES[st.id]
    assert.ok(Array.isArray(pool) && pool.length > 0, `${st.callsign}: has a liner pool`)
    for (const g of GENERAL_LINER_FILES) {
      assert.ok(pool.includes(g), `${st.callsign}: general one-liners ride its pool (${g})`)
    }
  }
  for (const st of stations.SECRET_STATIONS) {
    assert.equal(LINER_FILES[st.id], undefined, `${st.callsign}: stays out of the liner rotation`)
  }
})
