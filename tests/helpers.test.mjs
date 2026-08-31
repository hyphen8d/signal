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

// 2026-08-31 -- the same three claims asked of EVERY band rather than of the
// one that used to be the only one. The default-argument seam means the test
// above passes whether or not freqToCol understands bands at all, so on its
// own it would go on being green through a broken second band.
test('freqToCol/colToFreq/clampFreq: every band maps onto the same dial', () => {
  const { BANDS, freqToCol, colToFreq, clampFreq } = tuning
  const { DIAL_X0, DIAL_X1 } = layout
  assert.ok(BANDS.length >= 2, 'there is more than one band to check')
  for (const b of BANDS) {
    assert.equal(freqToCol(b.freqMin, b.key), DIAL_X0, `${b.label} starts at the dial's left edge`)
    assert.equal(freqToCol(b.freqMax, b.key), DIAL_X1, `${b.label} ends at the dial's right edge`)
    for (let col = DIAL_X0; col <= DIAL_X1; col++) {
      assert.equal(freqToCol(colToFreq(col, b.key), b.key), col, `${b.label} round-trips column ${col}`)
    }
    assert.equal(clampFreq(b.freqMin - 50, b.key), b.freqMin, `${b.label} clamps below`)
    assert.equal(clampFreq(b.freqMax + 50, b.key), b.freqMax, `${b.label} clamps above`)
  }
})

// The load-bearing half of the dual-band change: a station on the band you
// are not tuned to is unreachable, not distant. Written against ZM while ZM
// is still EMPTY, which is what makes it discriminating -- drop the band
// filter from nearestStation and these stop being null, because the whole
// roster is on YM and every one of them is "nearest" to anything asked.
test('the nearest-* questions do not see across bands', () => {
  const { BANDS, nearestStation, nearestSignal, nearestLockable } = tuning
  const all = [...stations.STATIONS, ...stations.SECRET_STATIONS]
  assert.ok(new Set(all.map((s) => s.band)).size >= 2, 'the roster spans more than one band')
  // The claim is band MEMBERSHIP, not null. An earlier version of this test
  // asserted null, which only held while ZM was empty -- the moment a station
  // moved there, "nearest" started returning it for any frequency asked, and
  // the test failed while the code was right. What is actually invariant is
  // that an answer, when there is one, is always on the band that was asked
  // about; that survives any arrangement of the roster.
  for (const st of all) {
    for (const b of BANDS) {
      for (const [name, fn] of [['nearestStation', nearestStation], ['nearestSignal', nearestSignal], ['nearestLockable', nearestLockable]]) {
        const got = fn(st.freq, b.key).station
        if (got) assert.equal(got.band, b.key, `${name}(${st.callsign}'s freq, ${b.label}) answered with a ${got.band} station`)
      }
    }
  }
  // A band with nothing on it answers rather than throwing -- every caller
  // already handles the no-station case, and a band is committed before it is
  // filled. Exercised through a key no station carries, since every real band
  // now has residents.
  assert.equal(nearestStation(1400, 'no-such-band').station, null)
  assert.equal(nearestStation(1400, 'no-such-band').dist, Infinity)
})

test('nearestStation never finds a secret station; nearestSignal/nearestLockable do', () => {
  const { nearestStation, nearestSignal, nearestLockable } = tuning
  // 2026-08-26: was NIN_STATION alone; walks SECRET_STATIONS now that
  // GREEN ROOM shipped as the second entry. The three-question split is
  // the whole reason a secret station can be swept past and heard but
  // never seeked to, so it has to hold for EVERY entry, not just the
  // first one anybody wrote a test for.
  assert.ok(stations.SECRET_STATIONS.length >= 2, 'both secret stations are in the array')
  // 2026-08-31 -- every question is asked ON THE STATION'S OWN BAND. These
  // used to take the default, which was right while there was one band and
  // silently wrong the moment SYNAPSE and CIRCUIT CRUSH crossed to ZM: the
  // test would have been asking whether a ZM station is the nearest thing on
  // YM, which is not the claim it is making.
  for (const secret of stations.SECRET_STATIONS) {
    assert.notEqual(nearestStation(secret.freq, secret.band).station, secret, `${secret.callsign} is unreachable by seek/scan`)
    assert.equal(nearestSignal(secret.freq, secret.band).station, secret, `${secret.callsign} still shows a carrier`)
    assert.equal(nearestSignal(secret.freq, secret.band).dist, 0)
    assert.equal(nearestLockable(secret.freq, secret.band).station, secret, `${secret.callsign} is lockable when parked on it`)
  }
  for (const st of stations.STATIONS) assert.equal(nearestStation(st.freq, st.band).station, st)
})

test('stationColsFor: every public station has its own dial column; the secret ones are absent', () => {
  const { BANDS, stationColsFor, freqToCol } = tuning
  for (const b of BANDS) {
    const cols = stationColsFor(b.key)
    const onBand = stations.STATIONS.filter((st) => st.band === b.key)
    assert.equal(cols.size, onBand.length, `${b.label}: no two public stations share a column`)
    for (const secret of stations.SECRET_STATIONS.filter((st) => st.band === b.key)) {
      assert.ok(!cols.has(freqToCol(secret.freq, b.key)), `${secret.callsign} draws no dial tick`)
    }
  }
  // A band's set holds only its OWN stations. Column INDICES collide freely
  // between bands -- every band is drawn on the same 71 columns -- so a set
  // spanning the roster would have let one band's shimmer guard protect
  // another band's markers, which share nothing a listener can see.
  // Each band's set holds exactly its own residents, and no band's set is
  // the whole roster. That second claim is what an unfiltered stationColsFor
  // would break, and it stays checkable however the roster is split.
  const total = stations.STATIONS.length
  for (const b of BANDS) {
    const n = stations.STATIONS.filter((st) => st.band === b.key).length
    assert.equal(stationColsFor(b.key).size, n, `${b.label} protects its own markers and no others`)
    if (n < total) assert.notEqual(stationColsFor(b.key).size, total, `${b.label} is not carrying the whole roster`)
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

test('parseLRC keeps timed lines in order, blank tags included as sentinels', () => {
  // Changed deliberately 2026-08-30: the blank-tag line at 00:05 used to be
  // DROPPED here, and that is what left the previous line lit at full
  // brightness through an instrumental, still claiming to be the words
  // playing now. An empty tag is an LRC's end-of-passage marker, so it is
  // kept and drawLyricsView renders it as nothing lit. Untagged text is
  // still dropped -- it carries no time and cannot be placed.
  const lines = voice.parseLRC('[00:12.50]second\n[00:01.00]first\n[00:05.00]\nno tag\n[01:00.25]last')
  assert.deepEqual(lines, [
    { time: 1, text: 'first' },
    { time: 5, text: '' },
    { time: 12.5, text: 'second' },
    { time: 60.25, text: 'last' },
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

// --- lyrics matching (2026-08-30) ----------------------------------------
// The measured half of the lyrics work. tools/lyrics-audit.mjs found the
// shipping lookup resolving 59% of a 101-track roster sample and the search
// fallback taking it to 76%; these pin the two pieces of judgment that
// fallback needs, because a search result list is NOT a match.

test('pickLyricMatch prefers the recording that is actually playing', () => {
  const { pickLyricMatch } = voice
  const rows = [
    // What lrclib.net really returns first for several roster tracks: a
    // popular LIVE cut, ahead of the album version. Taking rows[0] is how
    // you get lyrics whose timings fit nothing.
    { duration: 288, syncedLyrics: '[00:01.00]live' },
    { duration: 264, syncedLyrics: '[00:01.00]album' },
  ]
  assert.equal(pickLyricMatch(rows, 265).duration, 264, 'ranked by closeness to the playing length')
  assert.equal(pickLyricMatch(rows, 290).duration, 288, 'and the other way round')
  // With no duration known there is nothing to rank on, so the server's own
  // order stands and the gate downstream is what catches a bad pick.
  assert.equal(pickLyricMatch(rows, 0).duration, 288)
})

test('pickLyricMatch ignores rows with no synced lyrics at all', () => {
  const { pickLyricMatch } = voice
  // Plain text is useless here -- the whole feature is following the line
  // playing right now -- so a plain-only row must never win on duration.
  const rows = [
    { duration: 214, plainLyrics: 'words', syncedLyrics: null },
    { duration: 300, syncedLyrics: '[00:01.00]timed' },
  ]
  assert.equal(pickLyricMatch(rows, 214).duration, 300, 'a plain-text row won on closeness')
  assert.equal(pickLyricMatch([{ duration: 214, plainLyrics: 'words' }], 214), null)
  assert.equal(pickLyricMatch([], 214), null)
  assert.equal(pickLyricMatch(null, 214), null, 'a 404 body must not throw')
})

test('lyricDurationOk refuses a different recording but never guesses', () => {
  const { lyricDurationOk, LYRIC_DURATION_TOLERANCE: TOL } = voice
  assert.equal(lyricDurationOk(214, 214), true)
  assert.equal(lyricDurationOk(214, 214 + TOL), true, 'the tolerance itself is inside')
  assert.equal(lyricDurationOk(214, 214 + TOL + 1), false)
  // Real pairs the audit flagged: these were rendering as confident drift.
  assert.equal(lyricDurationOk(277, 166), false, 'The Safety Dance case')
  assert.equal(lyricDurationOk(224, 416), false, 'Cola case')
  // Unknown on either side is not evidence of anything, and an unprovable
  // objection must not withhold lyrics that may be perfectly good.
  assert.equal(lyricDurationOk(0, 214), true)
  assert.equal(lyricDurationOk(214, 0), true)
  assert.equal(lyricDurationOk(undefined, undefined), true)
})

test('a dropped request is retried; a real "no match" is not', async () => {
  // Before 2026-08-30 both wrote 'unavailable' into a cache keyed by
  // youtubeId and never looked again, so ONE flaky request meant that track
  // had no lyrics for the rest of the session -- on a feature whose whole
  // job is to be there when you press [L]. These are now different states.
  const { ensureLyricsFetched, lyricsStateFor, lyricsCache } = voice
  const realFetch = globalThis.fetch
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)) }
  const row = (lrc) => ({ ok: true, json: async () => ({ duration: 200, syncedLyrics: lrc }) })
  try {
    // 1. The network drops. Not a verdict on the song.
    const flaky = { youtubeId: 'retry-case', title: 'T', artist: 'A' }
    globalThis.fetch = async () => { throw new Error('network down') }
    ensureLyricsFetched(flaky, 200)
    await settle()
    assert.equal(lyricsStateFor(flaky), 'unavailable', 'reads as unavailable to the UI')
    assert.equal(lyricsCache['retry-case'].state, 'error', 'but is held as retryable underneath')

    // 2. The network comes back, and asking again now works.
    globalThis.fetch = async () => row('[00:01.00]back again')
    ensureLyricsFetched(flaky, 200)
    await settle()
    assert.equal(lyricsStateFor(flaky), 'available', 'a retry never happened')

    // 3. A genuine miss is final: asking again must not re-fetch.
    const absent = { youtubeId: 'absent-case', title: 'T', artist: 'A' }
    let calls = 0
    globalThis.fetch = async () => { calls++; return { ok: true, json: async () => null } }
    ensureLyricsFetched(absent, 200)
    await settle()
    const afterFirst = calls
    assert.equal(lyricsStateFor(absent), 'unavailable')
    ensureLyricsFetched(absent, 200)
    await settle()
    assert.equal(calls, afterFirst, 'a settled "no lyrics" was asked again')
  } finally { globalThis.fetch = realFetch }
})

test('an answer found with no duration is refined once the real one is known', async () => {
  // loadTrack fires the lookup while getDuration() still answers 0, so the
  // first answer is ranked and gated against nothing. The PLAYING handler
  // asks again with the real length; this is the upgrade, and it must
  // happen exactly once rather than on every ask.
  const { ensureLyricsFetched, lyricsCache } = voice
  const realFetch = globalThis.fetch
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)) }
  try {
    const t = { youtubeId: 'refine-case', title: 'T', artist: 'A' }
    let calls = 0
    // Both endpoints modelled the way lrclib.net really answers: /api/get
    // returns ONE object, /api/search returns an ARRAY. A stub that gives
    // the same shape to both sends the search path down the "not an array"
    // branch and quietly tests nothing.
    const hit = { duration: 500, syncedLyrics: '[00:01.00]x' }
    globalThis.fetch = async (url) => {
      calls++
      const search = String(url).includes('/api/search')
      return { ok: true, json: async () => (search ? [hit] : hit) }
    }
    ensureLyricsFetched(t, 0)          // blind: no duration to gate against
    await settle()
    assert.equal(lyricsCache['refine-case'].state, 'available', 'blind answer stands on its own')
    const blindCalls = calls

    ensureLyricsFetched(t, 200)        // informed: 500s against a 200s track
    await settle()
    assert.ok(calls > blindCalls, 'the blind answer was never revisited')
    assert.equal(lyricsCache['refine-case'].state, 'unavailable', 'the gate did not apply on the refine')
    assert.equal(lyricsCache['refine-case'].reason, 'duration')

    const settledCalls = calls
    ensureLyricsFetched(t, 200)        // asked again: must be a cache hit now
    await settle()
    assert.equal(calls, settledCalls, 'a refined answer was fetched twice')
  } finally { globalThis.fetch = realFetch }
})
