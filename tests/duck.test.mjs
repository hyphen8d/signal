// The voice duck: the music drops under a station ID or a liner drop and
// comes back up.
//
// Driven through the harness's fake clock, so the ramp is stepped
// deterministically rather than waited on. What matters here is not the exact
// curve but four properties that are each a real bug if broken: it goes down,
// it comes back ALL the way up, it never stacks below its floor, and it does
// not outlive the set.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'
import { DUCK_LEVEL, DUCK_IN_MS, DUCK_OUT_MS, DUCK_TICK_MS } from '../constants.js'

/** Volumes the program actually pushed to the player, in order. */
const volumes = (h) => h.playerCalls.filter((c) => c.startsWith('volume:')).map((c) => +c.slice(7))
const lastVolume = (h) => volumes(h).at(-1)

test('a duck drops the music and returns it to full level', async () => {
  const h = await boot({ player: true })
  await h.powerOn()
  h.program.volume = 80
  h.program.applyVolume()
  assert.equal(lastVolume(h), 80, 'baseline is the volume the listener set')

  h.program.duckFor(1000)
  h.advance(DUCK_IN_MS + DUCK_TICK_MS)
  const ducked = lastVolume(h)
  assert.ok(ducked <= 80 * DUCK_LEVEL + 1, `expected ~${80 * DUCK_LEVEL}, got ${ducked}`)

  // Past the hold, plus the whole ramp back.
  h.advance(1000 + DUCK_OUT_MS + DUCK_TICK_MS * 2)
  assert.equal(lastVolume(h), 80, 'the music did not come back to full level')
})

test('the ramp is stepped, not a jump', async () => {
  const h = await boot({ player: true })
  await h.powerOn()
  h.program.volume = 100
  h.program.applyVolume()
  const before = volumes(h).length

  h.program.duckFor(600)
  h.advance(DUCK_IN_MS)
  const steps = volumes(h).slice(before)
  // DISTINCT levels, not call count. The first version of this asserted on
  // the number of setVolume calls and passed against a hard jump, because the
  // timer called applyVolume() every tick whether the level had moved or not.
  const distinct = [...new Set(steps)]
  assert.ok(distinct.length >= 3,
    `a 50% drop over ${DUCK_IN_MS}ms should pass through intermediate levels, saw ${JSON.stringify(distinct)}`)
  assert.ok(distinct.some((v) => v < 100 && v > 100 * DUCK_LEVEL),
    `no level between full and the floor -- this is a jump, not a ramp: ${JSON.stringify(distinct)}`)
  // Monotonic on the way down -- no overshoot past the floor and back.
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] <= steps[i - 1])
})

test('overlapping clips extend the duck, they do not deepen it', async () => {
  const h = await boot({ player: true })
  await h.powerOn()
  h.program.volume = 100
  h.program.applyVolume()

  h.program.duckFor(500)
  h.advance(DUCK_IN_MS + DUCK_TICK_MS)
  const floor = lastVolume(h)
  // A second clip lands while the first is still ducking.
  h.program.duckFor(500)
  h.advance(DUCK_IN_MS + DUCK_TICK_MS)
  assert.equal(lastVolume(h), floor,
    'a second duck stacked below the floor -- two drops in a row would mute the set')
  assert.ok(h.program._duck >= DUCK_LEVEL - 1e-9)
})

test('the deadline extends rather than being replaced by a shorter one', async () => {
  const h = await boot({ player: true })
  await h.powerOn()
  h.program.volume = 100
  h.program.applyVolume()

  h.program.duckFor(4000)          // a long clip
  h.advance(100)
  h.program.duckFor(200)           // a short one lands underneath it
  h.advance(600 + DUCK_OUT_MS)
  assert.ok(h.program._duck <= DUCK_LEVEL + 1e-9,
    'the short clip cut the long one short -- the music came up under a voice still talking')
})

test('powering down clears a duck in flight', async () => {
  const h = await boot({ player: true })
  await h.powerOn()
  h.program.volume = 90
  h.program.applyVolume()
  h.program.duckFor(10000)
  h.advance(DUCK_IN_MS)
  assert.ok(h.program._duck < 1)

  h.key('p')                        // power down mid-duck
  h.advance(50)
  assert.equal(h.program._duck, 1, 'the duck outlived the set that was ducking')
  assert.equal(h.program._duckTimer, null, 'a timer was left running against a dead player')
})

test('the duck multiplies the sleep fade rather than replacing it', async () => {
  // Both scale the same level. If one overwrote the other, the last thirty
  // seconds before the set sleeps would be at full volume, or a duck during
  // them would undo the fade.
  const h = await boot({ player: true })
  await h.powerOn()
  h.program.volume = 100
  h.program._sleepFade = 0.5
  h.program.applyVolume()
  assert.equal(lastVolume(h), 50)

  h.program.duckFor(1000)
  h.advance(DUCK_IN_MS + DUCK_TICK_MS)
  assert.ok(lastVolume(h) <= 100 * 0.5 * DUCK_LEVEL + 1,
    'the duck and the sleep fade are not compounding')
})
