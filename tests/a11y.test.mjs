// What a screen reader gets (2026-09-22). The set is one canvas, so without
// this a blind listener has an empty page: no station, no track, no way to
// tell whether the thing is even on. index.html carries the static half (what
// SIGNAL is, and the keys); this covers the live half.
//
// The risk these guard against is not silence, it is NOISE: a live region
// wired to a redraw would talk over itself all session, since the status row
// alone resolves and sweeps constantly.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

test('the set announces itself: on, station, track', async () => {
  const h = await boot({ player: true, station: 'city-lights' })
  try {
    h.powerOn()
    h.advance(4000)
    const said = h.announced.join(' | ')
    assert.match(said, /Receiver on/, `power-on is announced: ${said}`)
    assert.match(said, /CITY LIGHTS, 780 kilohertz\. tokyo nights, city pop dreams/,
      `the station is announced with frequency and tagline: ${said}`)
    assert.match(said, /Now playing: .+ by .+/, `the track is announced: ${said}`)
  } finally { h.shutdown() }
})

test('mute and power-off say so', async () => {
  const h = await boot({ player: true, station: 'city-lights' })
  try {
    h.powerOn()
    h.advance(3000)
    h.key('m')
    h.advance(200)
    assert.equal(h.announced.at(-1), 'Muted.')
    h.key('m')
    h.advance(200)
    assert.equal(h.announced.at(-1), 'Sound on.')
    h.key('p')
    h.advance(2000)
    assert.equal(h.announced.at(-1), 'Receiver off.')
  } finally { h.shutdown() }
})

test('a repaint does not repeat itself', async () => {
  // showStation/showTrack run again on every resolve, overlay close and
  // break. Without the dedup in announce() a listener would hear the same
  // line over and over -- worse than no live region at all.
  const h = await boot({ player: true, station: 'city-lights' })
  try {
    h.powerOn()
    h.advance(4000)
    const before = h.announced.length
    const station = h.announced.find((a) => a.startsWith('CITY LIGHTS'))
    h.key('g')          // guide up, then down: both repaint the main screen
    h.advance(600)
    h.key('Escape')
    h.advance(1500)
    h.advance(20000)    // and a good stretch of ordinary running
    const repeats = h.announced.filter((a) => a === station).length
    assert.equal(repeats, 1, `the station line was announced ${repeats} times`)
    assert.ok(h.announced.length - before <= 2,
      `quiet while nothing changes: ${h.announced.slice(before).join(' | ')}`)
  } finally { h.shutdown() }
})

test('changing station announces the new one', async () => {
  const h = await boot({ player: true, station: 'city-lights' })
  try {
    h.powerOn()
    h.advance(4000)
    const { presetOrderFor } = await import(`../stations.js?v=${globalThis.SIGNAL_BUILD}`)
    const order = presetOrderFor(h.program.band)
    const other = order.findIndex((id) => id !== h.program.lockedStation.id)
    h.key(String(other + 1))
    h.advance(6000)
    const now = h.program.lockedStation.callsign
    assert.match(h.announced.join(' | '), new RegExp(now.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `the newly tuned station is announced: ${h.announced.join(' | ')}`)
  } finally { h.shutdown() }
})
