// The call sites, not the counting. metrics.test.mjs proves the arithmetic
// and the opt-out guard in isolation; this proves program.js actually calls
// them, from the real state machine, on the real fake clock.
//
// The two halves are tested apart on purpose. METRICS_ENDPOINT is a
// build-time constant and the shipped value is empty, so a booted program
// never has a session at all -- which is the single most important thing
// here and is asserted first. Everything after it injects a session directly,
// which tests the wiring without pretending the feature is switched on.
import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

const MIN = 60 * 1000

/** A session on the same clock the program is running on.
 *
 *  Date.now(), NOT h.now. The harness fakes both, but they are different
 *  quantities: h.now is milliseconds since this boot, and Date.now() is a
 *  faked absolute epoch. program.js records with Date.now(), so a summary
 *  built against h.now subtracts an epoch from a relative offset, goes
 *  hugely negative, and clamps every station to zero -- a summary that is
 *  well-formed, plausible, and silently empty. Cost twenty minutes the first
 *  time; hence this note rather than a shorter one. */
async function arm(h) {
  const m = await import(`../metrics.js?v=${h.tag}`)
  h.program._metrics = m.createSession({ build: 't', mode: 'desktop', startedAt: Date.now() })
  return m
}

/** Always through this, so no test can reintroduce the clock mix above. */
const summary = (h, m) => m.buildSummary(h.program._metrics, Date.now())

/** Boot lands in STANDBY. Every test below needs the set actually switched
 *  on, and the POST readout takes ~5.5s of fake clock before it locks. */
function powerOn(h) {
  h.advance(600)
  h.key('p')
  h.advance(5000)
  assert.equal(h.program.poweredOn, true, 'test setup: the set did not power on')
  assert.equal(h.program.mode, 'locked', 'test setup: power-on should land locked')
}

/** A preset digit for a station other than the one already locked -- a fresh
 *  boot lands on a RANDOM one, and pressing the preset you are already on is
 *  a no-op flash. Same trap tests/program.test.mjs documents. */
async function otherPreset(h, avoid = []) {
  const { STATION_PRESET_ORDER } = await import(`../stations.js?v=${h.tag}`)
  const taken = new Set([h.program.lockedStation, ...avoid])
  const i = STATION_PRESET_ORDER.findIndex((st) => !taken.has(st))
  return String(i + 1)
}

// The LINE INPUT card only exists where the browser has mediaDevices at all
// (canOpenTapConsent -> tapPromptTier). boot() without `tap` has none, so
// [V] goes straight to the visualizer -- which is what the visualizer test
// wants, and why the consent test below has to boot with tap: 'mic'.

test('ships dark: a booted program has no session and cannot send', async () => {
  const h = await boot()
  assert.equal(h.program._metrics, null,
    'METRICS_ENDPOINT is empty in config.js, so nothing may be collected')
  powerOn(h)
  h.tapKey('s'); h.advance(4000)
  h.tapKey('g'); h.advance(500)
  assert.equal(h.program._metrics, null, 'still nothing after real interaction')
  // The send is a no-op rather than a throw, so a stray call cannot break a
  // page that has collection switched off.
  assert.doesNotThrow(() => h.program.sendMetrics())
})

test('locking a station starts its clock, and the next lock banks it', async () => {
  const h = await boot({ player: true })
  const m = await arm(h)
  powerOn(h)
  h.key(await otherPreset(h)); h.advance(3000)
  const first = h.program.lockedStation.id
  h.advance(10 * MIN)
  h.key(await otherPreset(h)); h.advance(3000)
  const second = h.program.lockedStation.id
  assert.notEqual(first, second)
  h.advance(5 * MIN)
  const out = summary(h, m)
  assert.ok(out.stations[first] >= 9, `expected ~10 min on ${first}, got ${out.stations[first]}`)
  assert.ok(out.stations[second] >= 4, `expected ~5 min on ${second}, got ${out.stations[second]}`)
})

test('powering off stops the station clock', async () => {
  const h = await boot({ player: true })
  const m = await arm(h)
  powerOn(h)
  h.key(await otherPreset(h)); h.advance(3000)
  const id = h.program.lockedStation.id
  h.advance(6 * MIN)
  h.tapKey('p'); h.advance(2000)          // power down
  h.advance(60 * MIN)                      // ...and the tab is left open
  const out = summary(h, m)
  assert.ok(out.stations[id] <= 7, `power-off must stop the clock, got ${out.stations[id]}`)
})

test('the key hook records the features the screen advertises', async () => {
  const h = await boot({ player: true })
  const m = await arm(h)
  powerOn(h)
  h.key(await otherPreset(h)); h.advance(2500)
  h.tapKey('s'); h.advance(3000)           // scan
  h.tapKey('w'); h.advance(500)            // weather card
  h.tapKey('w'); h.advance(500)            // and close it
  h.tapKey('g'); h.advance(500)            // guide
  h.tapKey('g'); h.advance(500)
  h.advance(2 * MIN)
  const used = summary(h, m).used
  for (const f of ['preset', 'scan', 'weather', 'guide']) {
    assert.ok(used.includes(f), `${f} was pressed and not recorded — used=${used}`)
  }
})

test('entering the visualizer is recorded once, not per keypress', async () => {
  const h = await boot({ player: true })
  const m = await arm(h)
  powerOn(h)
  h.tapKey('v'); h.advance(1000)
  assert.ok(h.program.visualizerActive, 'test is meaningless if the visualizer did not open')
  h.tapKey('v'); h.advance(1000)           // inside, [V] cycles the effect
  h.advance(2 * MIN)
  const used = summary(h, m).used
  assert.ok(used.includes('visualizer'))
  assert.equal(used.filter((u) => u === 'visualizer').length, 1, 'used is a set')
})

test('a dead video is counted as a failure', async () => {
  const h = await boot({ player: true })
  const m = await arm(h)
  powerOn(h)
  h.player.fail(); h.advance(3000)
  h.advance(2 * MIN)
  assert.equal(summary(h, m).failures, 1)
})

test('a consent answer is recorded in both directions', async () => {
  // tap: 'mic' gives the fake browser a mediaDevices, without which the card
  // correctly refuses to open at all.
  const h = await boot({ player: true, tap: 'mic' })
  const m = await arm(h)
  powerOn(h)
  h.tapKey('a'); h.advance(500)            // LINE INPUT consent card, on demand
  assert.ok(h.program.tapConsentOpen, 'test is meaningless if the card did not open')
  h.tapKey('n'); h.advance(500)            // decline
  h.advance(2 * MIN)
  assert.equal(summary(h, m).consent?.tap, 'no')
})
