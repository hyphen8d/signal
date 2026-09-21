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
