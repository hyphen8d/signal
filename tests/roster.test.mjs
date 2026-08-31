// The roster obeys the content-ops rules README states (see
// tools/lint-roster.js for the list). Offline; the oEmbed liveness check
// stays in tools/verify-roster.js because it needs the network.

import test from 'node:test'
import assert from 'node:assert/strict'
import { lintRoster } from '../tools/lint-roster.js'

globalThis.SIGNAL_BUILD ??= 'roster'
globalThis.matchMedia ??= () => ({ matches: false })
const { STATIONS, SECRET_STATIONS } = await import('../stations.js?v=roster')

test('stations.js passes the roster rules', async (t) => {
  const { problems, warnings, stations, tracks } = await lintRoster()
  for (const w of warnings) t.diagnostic(`roster warning: ${w}`)
  assert.deepEqual(problems, [])
  // 2026-08-26: was a hardcoded 10 (9 public + NIN) and had to be edited
  // the day GREEN ROOM shipped. Derived now, so the count that actually
  // matters is the thing asserted and adding a secret station is not a
  // test edit.
  //
  // 2026-08-31: that count is PER BAND. It was "exactly 9 public", because
  // nine was the whole dial; with two bands the limit is still the [1-9]
  // preset keys but it applies to each band separately -- a tenth station on
  // ONE band is the thing with no way to reach it, while a tenth on the
  // roster is just a second band being used. Tracks lint's own rule rather
  // than restating a number, which is what stops the two drifting.
  const { BANDS } = await import('../tuning.js?v=roster')
  for (const b of BANDS) {
    const n = STATIONS.filter((st) => st.band === b.key).length
    assert.ok(n <= 9, `${b.label} has ${n} public stations; [1-9] presets fit 9`)
  }
  assert.ok(STATIONS.every((st) => BANDS.some((b) => b.key === st.band)),
    'every public station is on a band that exists')
  assert.equal(stations, STATIONS.length + SECRET_STATIONS.length)
  assert.ok(tracks >= 250, `roster has ${tracks} tracks`)
})
