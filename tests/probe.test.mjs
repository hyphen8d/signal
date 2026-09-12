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
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decayFlags, isThrottleSignature, playability, NARROW_LICENCE_MAX } from '../tools/lib/probe.mjs'

test('playability reads the throttle off WHERE the answer came from', async () => {
  // 2026-09-12 (audit, L5). fetch follows the 429's redirect, so the final
  // URL is the tell. Stubbed at the fetch boundary: the shapes below are the
  // two the live endpoint produces (captured 2026-08-26 / 2026-08-30), an
  // empty sorry page and an empty youtube.com page.
  const realFetch = globalThis.fetch
  const answer = (url, status = 200) => async () => ({ url, status, text: async () => '<html></html>' })
  try {
    globalThis.fetch = answer('https://www.google.com/sorry/index?continue=...')
    const sorry = await playability('dQw4w9WgXcQ')
    assert.equal(sorry.probed, false)
    assert.equal(sorry.throttled, true, 'a redirect to google.com/sorry is the throttle')
    assert.ok(isThrottleSignature(sorry))

    globalThis.fetch = answer('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    const odd = await playability('dQw4w9WgXcQ')
    assert.equal(odd.probed, false)
    assert.equal(odd.reason, 'no player data')
    assert.equal(odd.throttled, false, 'an empty page from youtube.com itself is not throttling')
    assert.ok(!isThrottleSignature(odd), 'and must be recorded as UNVERIFIED rather than skipped')
    assert.equal(decayFlags({ ok: true }, odd)[0], 'UNVERIFIED(no player data)')

    globalThis.fetch = answer('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 429)
    assert.ok(isThrottleSignature(await playability('dQw4w9WgXcQ')), 'a bare 429 still is')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('check-roster --report leaves the record byte-identical', () => {
  // 2026-09-12 (audit, L4). The dashboard's GET /api/health runs --report,
  // and a GET is the one request a cross-origin page can make without the
  // X-Signal-Admin preflight -- so --report pruning orphans was a file write
  // reachable from any tab. A record with an orphan in it is the sharp
  // fixture: the prune, if it still ran here, would delete that row.
  const here = path.dirname(fileURLToPath(import.meta.url))
  const dir = mkdtempSync(path.join(tmpdir(), 'signal-health-'))
  const store = path.join(dir, 'roster-health.json')
  const before = JSON.stringify({ version: 1, records: { zzzzzzzzzzz: { at: '2026-09-01T00:00:00.000Z', flags: [], status: 'OK', stationId: 'nowhere' } } }, null, 2) + '\n'
  writeFileSync(store, before)
  const r = spawnSync(process.execPath, [path.join(here, '..', 'tools', 'check-roster.mjs'), '--report', '--json'], {
    env: { ...process.env, SIGNAL_HEALTH_STORE: store }, encoding: 'utf8', timeout: 30000,
  })
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotThrow(() => JSON.parse(r.stdout), 'the report still produces its JSON summary')
  assert.equal(readFileSync(store, 'utf8'), before, '--report wrote to the record')
})

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
  assert.ok(isThrottleSignature({ probed: false, reason: 'no player data (google.com/sorry)', throttled: true }))
  // 2026-09-12 (audit, L5) -- but "no player data" from youtube.com ITSELF
  // is a real answer about an odd video (a live stream, a removed-with-shell
  // page), not the endpoint going away. Treating it as throttling skipped
  // that track every batch, kept it at the queue front, and counted it
  // toward the "sweep is stuck" alarm for a reason that was not throttling.
  assert.ok(!isThrottleSignature({ probed: false, reason: 'no player data', throttled: false }))
  assert.ok(!isThrottleSignature({ probed: false, reason: 'no player data' }))
  assert.ok(!isThrottleSignature({ probed: true, reason: undefined }))
  // A genuine network error is not throttling and must not stop a run.
  assert.ok(!isThrottleSignature({ probed: false, reason: 'fetch failed' }))
})

// --- the health record's orphan prune, 2026-08-30 ------------------------
// Retiring DRIFT MODE stranded its 50 track records in roster-health.json,
// and nothing had ever removed one, so the file grew with every curation
// pass. Harmless -- summarise() walks the roster and looks records up, never
// the reverse -- which is why it survived unnoticed. What matters here is the
// two ways the cleanup can go wrong, both of which delete real history.
import { orphanIds } from '../tools/check-roster.mjs'

test('orphan prune drops records for tracks that left the roster, and only those', () => {
  const live = new Set(['keep1', 'keep2'])
  assert.deepEqual(orphanIds(['keep1', 'gone1', 'keep2', 'gone2'], live), ['gone1', 'gone2'])
  assert.deepEqual(orphanIds(['keep1', 'keep2'], live), [], 'a correct record drops nothing')
})

test('an empty roster is "cannot tell", not "nothing is live"', () => {
  // The dangerous case, and the reason this returns a sentinel rather than an
  // empty array. A new station is committed with `tracks: []` before it is
  // filled (the audition chicken-and-egg in CLAUDE.md), and stations.js is
  // mid-edit for real stretches -- the daily timer firing in that window must
  // not read "no live tracks" as licence to delete the entire record.
  assert.equal(orphanIds(['a', 'b'], new Set()), null)
  // And the two answers must not be confusable: [] is falsy-adjacent enough
  // that `if (!gone)` would treat an empty result as the skip case, so the
  // caller checks for null specifically and this pins the difference.
  assert.notEqual(orphanIds(['a'], new Set(['a'])), null)
})
