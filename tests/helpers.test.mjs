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
  const { NIN_STATION } = stations
  assert.notEqual(nearestStation(NIN_STATION.freq).station, NIN_STATION)
  assert.equal(nearestSignal(NIN_STATION.freq).station, NIN_STATION)
  assert.equal(nearestSignal(NIN_STATION.freq).dist, 0)
  assert.equal(nearestLockable(NIN_STATION.freq).station, NIN_STATION)
  for (const st of stations.STATIONS) assert.equal(nearestStation(st.freq).station, st)
})

test('STATION_COLS: every public station has its own dial column; the secret one is absent', () => {
  const { STATION_COLS, freqToCol } = tuning
  assert.equal(STATION_COLS.size, stations.STATIONS.length, 'no two public stations share a column')
  assert.ok(!STATION_COLS.has(freqToCol(stations.NIN_STATION.freq)))
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
