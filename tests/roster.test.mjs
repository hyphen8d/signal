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
  // matters -- exactly 9 public, which is lint's own rule and the 1-9
  // preset keys -- is the thing asserted, and adding a third secret
  // station is not a test edit.
  assert.equal(STATIONS.length, 9, 'nine public stations, one per preset key')
  assert.equal(stations, STATIONS.length + SECRET_STATIONS.length)
  assert.ok(tracks >= 250, `roster has ${tracks} tracks`)
})
