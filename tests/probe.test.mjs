// tools/lib/probe.mjs -- the shared YouTube probe. Pure-function half only:
// decayFlags() and isThrottleSignature() take already-fetched shapes, so this
// runs offline like the rest of the suite.
//
// The point of these is the THRESHOLDS. decayFlags is now the single
// definition of "playable" for both audition.js (tracks coming in) and
// check-roster.mjs (tracks already on the roster), so a change here silently
// changes what both tools accept. NARROW_LICENCE_MAX especially: 20 was
// chosen because observed counts split cleanly (1-8 bad, 115-249 healthy),
// and a track licensed in nine countries including the US is the exact
// failure nobody can hear from the curator's chair.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decayFlags, isThrottleSignature, NARROW_LICENCE_MAX } from '../tools/lib/probe.mjs'

const OK_EMBED = { ok: true, status: 200, title: 'A Song', channel: 'A Channel' }
const healthy = { probed: true, seconds: 200, countries: 200, us: true, embeddable: true, status: 'OK' }

test('a healthy track flags nothing', () => {
  assert.deepEqual(decayFlags(OK_EMBED, healthy), [])
})

test('a dead oEmbed short-circuits to DEAD and nothing else', () => {
  const flags = decayFlags({ ok: false, status: 404 }, {})
  assert.equal(flags.length, 1)
  assert.match(flags[0], /^DEAD 404/)
})

test('age-gating is flagged -- the IFrame player cannot satisfy a login', () => {
  assert.ok(decayFlags(OK_EMBED, { ...healthy, status: 'LOGIN_REQUIRED' }).includes('LOGIN_REQUIRED'))
})

test('embed-blocked is flagged', () => {
  assert.ok(decayFlags(OK_EMBED, { ...healthy, embeddable: false }).includes('NO-EMBED'))
})

test('a narrow licence is caught even when the US is in it', () => {
  // The whole reason the check is a COUNT and not a "is the US in it".
  const flags = decayFlags(OK_EMBED, { ...healthy, countries: 9, us: true })
  assert.ok(flags.includes('NARROW-LICENCE:9'), `expected a narrow-licence flag, got ${flags}`)
  assert.ok(!flags.includes('NOT-US'), 'a US-available track must not read as NOT-US')
})

test('the narrow-licence boundary is exclusive at the threshold', () => {
  assert.deepEqual(decayFlags(OK_EMBED, { ...healthy, countries: NARROW_LICENCE_MAX }), [])
  assert.ok(decayFlags(OK_EMBED, { ...healthy, countries: NARROW_LICENCE_MAX - 1 })
    .includes(`NARROW-LICENCE:${NARROW_LICENCE_MAX - 1}`))
})

test('an unknown country count is not treated as narrow', () => {
  // null means "we could not read it", which is not the same as "few".
  assert.ok(!decayFlags(OK_EMBED, { ...healthy, countries: null, us: null })
    .some((f) => f.startsWith('NARROW-LICENCE')))
})

test('UNVERIFIED comes first, so a row cannot read as checked-and-fine', () => {
  // Needs a SECOND flag present, or "first" is vacuous and the assertion
  // passes no matter how the pushes are ordered -- which is precisely what
  // this test looked like on its first draft.
  const flags = decayFlags(OK_EMBED, {
    probed: false, reason: 'no player data', countries: 4, us: false, embeddable: false, status: 'ERROR',
  })
  assert.ok(flags.length > 1, 'need more than one flag for ordering to mean anything')
  assert.equal(flags[0], 'UNVERIFIED(no player data)')
})

test("a '?' status is not reported as a finding", () => {
  // '?' means unparsed, and that is already said by UNVERIFIED.
  assert.ok(!decayFlags(OK_EMBED, { ...healthy, status: '?' }).includes('?'))
})

test('the throttle signature matches what a 429 actually looks like', () => {
  // YouTube answers 429 and redirects to google.com/sorry, a page carrying
  // none of the player fields -- so it surfaces as either shape.
  assert.ok(isThrottleSignature({ probed: false, reason: 'HTTP 429' }))
  assert.ok(isThrottleSignature({ probed: false, reason: 'no player data' }))
  assert.ok(!isThrottleSignature({ probed: true, reason: undefined }))
  // A genuine network error is not throttling and must not stop a run.
  assert.ok(!isThrottleSignature({ probed: false, reason: 'fetch failed' }))
})
