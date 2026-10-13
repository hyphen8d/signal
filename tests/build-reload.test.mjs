// A tab left playing across a deploy picks the new build up at the next
// power-off (program.js tickBuild, 2026-09-21). Every claim here is about
// WHEN it reloads, because the failure worth fearing is a reload at the
// wrong moment: under a listener, or over the guide they are reading.
//
// The poll is 30 minutes of fake clock -- ~110k frames -- so these backdate
// the last check instead of advancing to it. That skips nothing tickBuild
// itself does; it only skips waiting.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

async function pollNow(h) {
  const { BUILD_POLL_MS } = await import(`../program.js?v=${globalThis.SIGNAL_BUILD}`)
  // The first clock tick only records the time (main.js has just fetched
  // build.json), so there must have been one before backdating means anything.
  if (!h.program._buildCheckedAt) h.advance(1100)
  h.program._buildCheckedAt -= BUILD_POLL_MS + 1
  h.advance(1100) // one clock tick fires the fetch
  await h.flush()
  h.advance(1100) // and the next one acts on the answer
}

test('no deploy: a power cycle does not reload', async () => {
  const h = await boot({ build: true })
  try {
    h.powerOn()
    await pollNow(h)
    h.key('p')
    h.advance(3000)
    assert.equal(h.program.poweredOn, false)
    assert.deepEqual(h.reloads, [])
  } finally { h.shutdown() }
})

test('a deploy under a playing set waits for the power-off, then reloads once, without the query', async () => {
  // A ?station= link, so there is a query to drop. (Not ?game=1: the game
  // opening on power-on takes [P] for itself, which is a different test.)
  const h = await boot({ build: true, station: 'tradewinds' })
  try {
    h.powerOn()
    h.deploy('2099-01-01.1')
    await pollNow(h)
    assert.equal(h.program._buildPending, '2099-01-01.1', 'the new stamp was noticed')
    h.advance(5000)
    assert.deepEqual(h.reloads, [], 'never under a listener')
    h.key('p')
    h.advance(3000)
    assert.deepEqual(h.reloads, ['/signal/'], 'reloaded at STANDBY, and the link\'s query is not carried into it')
  } finally { h.shutdown() }
})

test('a deploy found while already in STANDBY reloads straight away -- but not over the guide', async () => {
  const h = await boot({ build: true })
  try {
    h.advance(600) // out of the cold-open flourish
    h.key('g')
    assert.equal(h.program.guideOpen, true)
    h.deploy('2099-01-01.1')
    await pollNow(h)
    h.advance(3000)
    assert.deepEqual(h.reloads, [], 'the guide is not yanked out from under a reader')
    h.key('Escape')
    assert.equal(h.program.guideOpen, false)
    h.advance(1100)
    assert.deepEqual(h.reloads, ['/signal/'])
  } finally { h.shutdown() }
})

test('a failed check is not a deploy', async () => {
  const h = await boot({ build: true })
  try {
    h.powerOn()
    const realFetch = globalThis.fetch
    globalThis.fetch = () => Promise.reject(new Error('offline'))
    await pollNow(h)
    globalThis.fetch = realFetch
    h.key('p')
    h.advance(3000)
    assert.equal(h.program._buildPending ?? null, null)
    assert.deepEqual(h.reloads, [])
  } finally { h.shutdown() }
})

// 2026-10-12 (audit, LOW) -- the three guards below were each mutation-run
// and each left this file green: the 30-minute poll gate (removed, every open
// tab fetches build.json every second), the save before the reload, and the
// _powerAnimating half of tickBuild's condition. Plus the one this audit
// added, the key guard once a reload is under way.

/** Count build.json requests from here on. */
function countBuildFetches() {
  const real = globalThis.fetch
  const counter = { n: 0, restore: () => { globalThis.fetch = real } }
  globalThis.fetch = (url, ...rest) => {
    if (String(url).includes('build.json')) counter.n++
    return real(url, ...rest)
  }
  return counter
}

test('the build check is one fetch per BUILD_POLL_MS, not one per clock tick', async () => {
  const h = await boot({ build: true })
  const fetches = countBuildFetches()
  try {
    h.powerOn()
    h.advance(20_000) // twenty clock ticks
    await h.flush()
    assert.equal(fetches.n, 0, `the first ticks make no request at all (main.js just fetched it): ${fetches.n}`)
    await pollNow(h)
    h.advance(20_000)
    await h.flush()
    assert.equal(fetches.n, 1, `one check when the poll is due, then quiet again: ${fetches.n}`)
  } finally { fetches.restore(); h.shutdown() }
})

test('what the set was left in is saved before the reload, not after', async () => {
  // The reload IS the end of this page, so anything not in localStorage at
  // location.replace() is gone. Changed behind saveSignalState's back here on
  // purpose: every ordinary control saves as it goes, so only a write in
  // reloadForBuild() itself can be what this sees.
  const h = await boot({ build: true })
  try {
    const { STORAGE_KEY } = await import(`../state.js?v=${h.tag}`)
    let atReload = null
    const replace = globalThis.location.replace
    globalThis.location.replace = (u) => { atReload = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) || 'null'); replace(u) }
    h.powerOn()
    h.key('p')
    h.advance(3000)
    h.program.volume = 37
    h.deploy('2099-01-01.1')
    await pollNow(h)
    assert.deepEqual(h.reloads, ['/signal/'])
    assert.equal(atReload?.volume, 37, `the stored state at the moment of reload: ${JSON.stringify(atReload)}`)
  } finally { h.shutdown() }
})

test('no reload mid-animation: the power-off collapse finishes first', async () => {
  const h = await boot({ build: true })
  try {
    h.powerOn()
    h.key('p') // powerDown(): poweredOn false at once, the collapse ~130ms
    assert.equal(h.program._powerAnimating, true)
    h.program._buildPending = '2099-01-01.1'
    // tickBuild() runs off the 1s clock, whose phase against a keypress is
    // arbitrary, so the window is hit directly rather than hoped for.
    h.program.tickBuild(h.screen)
    assert.deepEqual(h.reloads, [], 'not while the collapse is still drawing')
    h.advance(1500)
    assert.deepEqual(h.reloads, ['/signal/'], 'and straight after it lands')
  } finally { h.shutdown() }
})

test('once a reload is under way, [P] does not boot the set and spend the gesture', async () => {
  // location.replace() takes real time to commit; in that window a [P] used
  // to power on -- spending the keypress that is the page's autoplay
  // gesture -- and then the page went, landing in STANDBY wanting another.
  // The harness's replace() never navigates, which is exactly that window
  // held open for as long as the test likes.
  const h = await boot({ build: true })
  try {
    h.advance(600)
    h.deploy('2099-01-01.1')
    await pollNow(h)
    assert.deepEqual(h.reloads, ['/signal/'], 'the reload was ordered from STANDBY')
    const said = h.announced.length
    h.key('p')
    h.advance(6000)
    assert.equal(h.program.poweredOn, false, 'the set stayed off')
    assert.equal(h.program._powerAnimating, false, 'and did not start booting')
    assert.equal(h.announced.length, said, 'and announced nothing')
    h.key('g') // nor anything else: a guide opened now is yanked away mid-read
    h.advance(600)
    assert.equal(h.program.guideOpen, false, 'key() takes nothing once the page is leaving')
    // The lite layout powers on from a tap, which reaches powerUp() without
    // going through key() -- so powerUp() refuses on its own as well.
    h.program.powerUp(h.screen)
    h.advance(6000)
    assert.equal(h.program.poweredOn, false, 'powerUp() refuses directly too')
  } finally { h.shutdown() }
})
