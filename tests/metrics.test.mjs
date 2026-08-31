// The session summary: rounding, bucketing, the opt-out guard, and the
// collector's input validation. All pure -- no harness, no clock, no browser.
//
// The bias question is the one worth testing hardest. A station share that
// systematically deletes short listens would look completely plausible and be
// wrong in a direction that flatters whatever people settle on.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FEATURES, KEY_FEATURES, MIN_SESSION_MS, SCHEMA_VERSION,
  buildSummary, createSession, featureForKey,
  noteConsent, noteFailure, noteFeature, noteStation, shouldSend,
} from '../metrics.js'
import { sanitise } from '../tools/collector/worker.js'

const MIN = 60 * 1000
const sess = (t = 0) => createSession({ build: 'test', mode: 'desktop', startedAt: t })

test('a station is credited from lock to the next transition', () => {
  const s = sess()
  noteStation(s, 'cold-wave', 0)
  noteStation(s, 'cipher', 10 * MIN)
  const out = buildSummary(s, 25 * MIN)
  assert.deepEqual(out.stations, { 'cold-wave': 10, cipher: 15 })
})

// The fake clock in tests/harness.mjs starts at 0, and the first version of
// this file guarded on `!currentSince` -- which is falsy at 0, so the first
// station of every session was silently dropped. Nothing else would have
// caught it: the summary was still well-formed, just missing ten minutes.
test('a station locked at t=0 is not lost to a falsy check', () => {
  const s = sess(0)
  noteStation(s, 'atomic', 0)
  assert.equal(buildSummary(s, 12 * MIN).stations.atomic, 12)
})

test('powering off stops the clock', () => {
  const s = sess()
  noteStation(s, 'atomic', 0)
  noteStation(s, null, 5 * MIN)          // power down
  const out = buildSummary(s, 8 * 60 * MIN)  // ...and the tab sits open all night
  assert.equal(out.stations.atomic, 5)
})

test('re-locking the station you are already on neither resets nor double-counts', () => {
  const s = sess()
  noteStation(s, 'atomic', 0)
  noteStation(s, 'atomic', 4 * MIN)
  assert.equal(buildSummary(s, 10 * MIN).stations.atomic, 10)
})

// The rounding is what stops a sweep crediting the whole band, and there is
// no second guard behind it -- see metrics.js on why the floor was removed.
// 8s a station is a realistic scan; 45s is a person who stopped to listen.
test('a scan sweep credits nothing; a real pause credits a minute', () => {
  const sweep = sess()
  for (let i = 0; i < 6; i++) noteStation(sweep, `st-${i}`, i * 8000)
  noteStation(sweep, 'cipher', 48000)
  assert.deepEqual(Object.keys(buildSummary(sweep, 20 * MIN).stations), ['cipher'],
    'a station crossed in 8 seconds is tuning, not listening')

  const lingered = sess()
  noteStation(lingered, 'atomic', 0)
  noteStation(lingered, 'cipher', 45000)
  assert.equal(buildSummary(lingered, 20 * MIN).stations.atomic, 1,
    '45 seconds is someone listening, and must not be thrown away')
})

// Rounding to the nearest minute has to be unbiased in aggregate, or every
// share this feature produces is skewed. Rounding to 5 and dropping zeros --
// the obvious "coarser is safer" choice -- fails this by ~40%.
test('station rounding does not systematically lose time', () => {
  let total = 0
  for (let i = 0; i < 200; i++) {
    const ms = (3 + (i % 7)) * MIN + (i % 60) * 1000   // 3-10 min, varied seconds
    const s = sess()
    noteStation(s, 'x', 0)
    total += buildSummary(s, ms).stations.x
  }
  const truth = Array.from({ length: 200 }, (_, i) => ((3 + (i % 7)) * MIN + (i % 60) * 1000) / MIN)
    .reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(total - truth) / truth < 0.01, `drift ${total} vs ${truth}`)
})

test('a visit under a minute reports nothing at all', () => {
  const s = sess()
  noteStation(s, 'atomic', 0)
  assert.equal(buildSummary(s, MIN_SESSION_MS - 1), null)
  assert.notEqual(buildSummary(s, MIN_SESSION_MS + 1), null)
})

test('the payload carries no identifier, timestamp or track', () => {
  const s = sess()
  noteStation(s, 'cipher', 0)
  noteFeature(s, 'scan')
  noteConsent(s, 'tap', 'yes')
  noteFailure(s)
  const out = buildSummary(s, 30 * MIN)
  assert.deepEqual(Object.keys(out).sort(),
    ['consent', 'failures', 'mins', 'mode', 's', 'stations', 'used', 'v'].sort())
  const flat = JSON.stringify(out)
  assert.ok(!/\d{10,}/.test(flat), 'a timestamp-shaped number reached the payload')
})

test('used is a sorted set, so it carries no ordering', () => {
  const s = sess()
  noteStation(s, 'x', 0)
  for (const f of ['weather', 'scan', 'weather', 'guide']) noteFeature(s, f)
  assert.deepEqual(buildSummary(s, 10 * MIN).used, ['guide', 'scan', 'weather'])
})

test('every key-mapped feature name is a declared one', () => {
  for (const name of Object.values(KEY_FEATURES)) assert.ok(FEATURES.includes(name), name)
})

test('featureForKey folds case and ignores keys with no feature', () => {
  assert.equal(featureForKey('S'), 'scan')
  assert.equal(featureForKey('ArrowLeft'), 'seek')
  assert.equal(featureForKey('Enter'), null)
  assert.equal(featureForKey(undefined), null)
})

// The guard is the part that must never quietly stop working, so it is
// tested from the outside rather than trusted.
test('nothing is sent without an endpoint, or against an opt-out', () => {
  const nav = { sendBeacon() {} }
  assert.equal(shouldSend(nav, ''), false, 'no endpoint is the default and means off')
  assert.equal(shouldSend(nav, 'https://x/collect'), true)
  assert.equal(shouldSend({ ...nav, globalPrivacyControl: true }, 'https://x/collect'), false)
  assert.equal(shouldSend({ ...nav, doNotTrack: '1' }, 'https://x/collect'), false)
  assert.equal(shouldSend({}, 'https://x/collect'), false, 'no sendBeacon, no send')
})

// --- the collector's trust boundary -----------------------------------
test('the collector rebuilds the record and refuses junk', () => {
  assert.equal(sanitise(null), null)
  assert.equal(sanitise({ s: SCHEMA_VERSION + 99, mins: 5 }), null, 'wrong schema version')
  assert.equal(sanitise({ s: SCHEMA_VERSION }), null, 'no mins')
  assert.equal(sanitise({ s: SCHEMA_VERSION, mins: 999999 }), null, 'absurd duration')

  const dirty = sanitise({
    s: SCHEMA_VERSION,
    v: '<script>alert(1)</script>',
    mode: 'nonsense',
    mins: 10,
    stations: { 'ok-id': 5, 'bad id!!': 3, negative: -9 },
    used: ['scan', 'scan', 42, 'x'.repeat(99), 'has space'],
    consent: { tap: 'maybe', weather: 'no' },
    failures: 3,
    extra: 'should not survive',
  })
  assert.equal(dirty.extra, undefined, 'unknown fields must not pass through')
  assert.ok(!dirty.v.includes('<'), 'markup survived into a stored field')
  assert.equal(dirty.mode, 'desktop', 'an unknown mode falls back rather than being stored')
  assert.deepEqual(Object.keys(dirty.stations), ['ok-id'])
  // 42 is not a string, the 99-char name is over length, and 'has space' is
  // not a clean key -- all three are dropped rather than coerced into
  // plausible-looking feature names.
  assert.deepEqual(dirty.used, ['scan'])
  assert.deepEqual(dirty.consent, { weather: 'no' }, 'a non yes/no answer is dropped')
})
