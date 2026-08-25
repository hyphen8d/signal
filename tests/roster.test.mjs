// The roster obeys the content-ops rules README states (see
// tools/lint-roster.js for the list). Offline; the oEmbed liveness check
// stays in tools/verify-roster.js because it needs the network.

import test from 'node:test'
import assert from 'node:assert/strict'
import { lintRoster } from '../tools/lint-roster.js'

test('stations.js passes the roster rules', async (t) => {
  const { problems, warnings, stations, tracks } = await lintRoster()
  for (const w of warnings) t.diagnostic(`roster warning: ${w}`)
  assert.deepEqual(problems, [])
  assert.equal(stations, 10)
  assert.ok(tracks >= 250, `roster has ${tracks} tracks`)
})
