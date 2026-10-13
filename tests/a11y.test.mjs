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

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('changing station announces the new one', async () => {
  // 2026-10-12 (audit, M2) -- from ANY starting station. This compared the
  // preset order's station OBJECTS to an id, so findIndex always answered 0
  // and the test always pressed [1] -- passing only because CITY LIGHTS is
  // not YM's preset 1. Unpinned now (the harness draws from both bands), and
  // the digit is one that is not the station already up.
  const h = await boot({ player: true })
  try {
    h.powerOn()
    h.advance(4000)
    const { presetOrderFor } = await import(`../stations.js?v=${h.tag}`)
    const order = presetOrderFor(h.program.band)
    const from = h.program.lockedStation
    const other = order.findIndex((st) => st.id !== from.id)
    assert.ok(other >= 0)
    h.key(String(other + 1))
    h.advance(6000)
    const now = h.program.lockedStation
    assert.notEqual(now.id, from.id, `the preset actually re-tuned (from ${from.id})`)
    assert.match(h.announced.join(' | '), new RegExp(esc(now.callsign)),
      `the newly tuned station is announced: ${h.announced.join(' | ')}`)
  } finally { h.shutdown() }
})

// 2026-10-12 (audit, M2) -- the four ways the announcer lied or went quiet.
// Each one is "the per-kind dedup could not tell a repaint from the same
// thing happening again", or an announcement made above the guard that then
// refused the action it announced.

test('a power cycle to the same station announces the station and track again', async () => {
  const h = await boot({ player: true, station: 'city-lights' })
  try {
    h.powerOn()
    h.advance(4000)
    h.key('p')
    h.advance(2000)
    assert.equal(h.program.poweredOn, false)
    const from = h.announced.length
    h.key('p')
    h.advance(6000)
    const said = h.announced.slice(from).join(' | ')
    assert.match(said, /^Receiver on\./, `power-on first: ${said}`)
    assert.match(said, /CITY LIGHTS, 780 kilohertz/, `the same station, said again: ${said}`)
    assert.match(said, /Now playing: .+ by .+/, `and the track: ${said}`)
  } finally { h.shutdown() }
})

test('losing a lock says so once, and re-locking the same station announces it again', async () => {
  const h = await boot({ player: true, station: 'city-lights' })
  try {
    h.powerOn()
    h.advance(4000)
    const from = h.announced.length
    h.key('ArrowRight') // one step off: the lock is lost
    h.advance(400)
    h.key('ArrowRight') // and another through empty band
    h.advance(400)
    assert.equal(h.program.mode, 'seeking')
    const lost = h.announced.slice(from)
    assert.deepEqual(lost, ['Signal lost.'], `said once, not per step: ${lost.join(' | ')}`)
    h.key('ArrowLeft')
    h.advance(400)
    h.key('ArrowLeft') // back onto it
    h.advance(5000)
    assert.equal(h.program.mode, 'locked')
    const said = h.announced.slice(from).join(' | ')
    assert.match(said, /Signal lost\. \| CITY LIGHTS, 780 kilohertz/, `re-locked and announced: ${said}`)
    assert.match(said, /Now playing: /, `the track too: ${said}`)
  } finally { h.shutdown() }
})

test('a station whose every track is dead says it is off air', async () => {
  // The OFF AIR fall-back drops the lock with nothing else to say it: the
  // status row reads OFF AIR, and without this a listener heard silence.
  const h = await boot({ player: true, station: 'city-lights' })
  try {
    h.powerOn()
    h.advance(3000)
    const n = h.program.lockedStation.tracks.length
    for (let i = 0; i <= n && h.program.mode === 'locked'; i++) {
      h.player.fail()
      h.advance(300)
    }
    assert.equal(h.program.mode, 'seeking', 'the dead station dropped its lock')
    assert.equal(h.announced.at(-1), 'Off air.', `said so: ${h.announced.slice(-3).join(' | ')}`)
  } finally { h.shutdown() }
})

test('[P] inside the cold-open flourish says nothing, and the real power-on is still announced', async () => {
  const h = await boot({ player: true, station: 'city-lights' })
  try {
    h.advance(100) // inside init()'s 500ms flourish, which refuses [P]
    h.key('p')
    h.advance(300)
    assert.equal(h.program.poweredOn, false)
    assert.deepEqual(h.announced, [], `a refused [P] announced: ${h.announced.join(' | ')}`)
    h.advance(400)
    h.key('p')
    h.advance(6000)
    assert.equal(h.program.poweredOn, true)
    assert.equal(h.announced[0], 'Receiver on.', `the real power-on: ${h.announced.join(' | ')}`)
    // And the collapse: [P] inside powerDown()'s ~130ms is refused as well.
    h.key('p')
    h.advance(50)
    h.key('p')
    h.advance(2000)
    assert.equal(h.program.poweredOn, false)
    assert.equal(h.announced.at(-1), 'Receiver off.', `a refused [P] in the collapse: ${h.announced.join(' | ')}`)
  } finally { h.shutdown() }
})

test('forget() re-arms one kind, even when its line was the last thing said', async () => {
  // Unit-level, because in the running set a forgotten line is never the
  // most recent one (a re-lock says the station before the track), so the
  // `last` half of forget() is unreachable from a scenario today -- and would
  // be the first thing to bite if an announcement order ever changed.
  const a11y = await import(`../a11y.js?v=forget-unit`)
  const writes = []
  const realDoc = globalThis.document
  globalThis.document = { getElementById: () => ({ set textContent(v) { if (v) writes.push(v) } }) }
  try {
    a11y.resetAnnouncements()
    a11y.announce('Now playing: X', 'track')
    a11y.announce('Now playing: X', 'track')
    assert.deepEqual(writes, ['Now playing: X'], 'a repeat is deduped')
    a11y.forget('track')
    a11y.announce('Now playing: X', 'track')
    assert.deepEqual(writes, ['Now playing: X', 'Now playing: X'], 'after forget() the same line is said again')
    a11y.forget('station') // forgetting another kind touches nothing here
    a11y.announce('Now playing: X', 'track')
    assert.equal(writes.length, 2)
  } finally {
    if (realDoc === undefined) delete globalThis.document; else globalThis.document = realDoc
  }
})

test('M, volume up, M announces both mutes', async () => {
  // Touching the volume un-mutes. It used to do it silently, so the second
  // "Muted." matched what the mute kind remembered and was swallowed.
  const h = await boot({ player: true, station: 'city-lights' })
  try {
    h.powerOn()
    h.advance(3000)
    const from = h.announced.length
    h.key('m')
    h.advance(200)
    h.key('ArrowUp')
    h.advance(200)
    h.key('ArrowUp') // an ordinary notch says nothing
    h.advance(200)
    h.key('m')
    h.advance(200)
    assert.deepEqual(h.announced.slice(from), ['Muted.', 'Sound on.', 'Muted.'])
  } finally { h.shutdown() }
})
