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

// 2026-09-12 (audit, L17 / M13 / M14) -- the rules that exist to be LOUD
// when prose drifts. Each has a "could not find X -- update the regex"
// branch, and until this pass none of those branches had ever fired in the
// suite: a green run exercises only the happy path, so the one thing the
// rule is for -- noticing that it silently stopped checking -- was itself
// unchecked. lintRoster() takes text overrides so drift can be handed in.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const readme = readFileSync(path.join(here, '..', 'README.md'), 'utf8')
const shoot = readFileSync(path.join(here, '..', 'tools', 'shoot.mjs'), 'utf8')
const form = readFileSync(path.join(here, '..', '.github', 'ISSUE_TEMPLATE', 'track_suggestion.yml'), 'utf8')
const only = (problems, re) => problems.filter((p) => re.test(p))

test('a reworded screenshot caption is reported, not silently unchecked', async () => {
  const drifted = readme.replace('SIGNAL, locked onto COLD WAVE', 'SIGNAL, tuned in to COLD WAVE')
  assert.notEqual(drifted, readme, 'the fixture must actually change the caption')
  const { problems } = await lintRoster({ readmeText: drifted })
  assert.equal(only(problems, /could not find the hero screenshot caption/).length, 1, problems.join('\n'))
})

test('a reshaped shoot.mjs recipe is reported, not silently unchecked', async () => {
  const drifted = shoot.replaceAll('tuneTo(api, ', 'tuneToPreset(api, ')
  assert.notEqual(drifted, shoot)
  const { problems } = await lintRoster({ shootText: drifted })
  assert.ok(only(problems, /could not read the preset the "hero" recipe tunes to/).length, problems.join('\n'))
})

test("README's opening station count is asserted, every copy of it", async () => {
  const drifted = readme.replace(/(\d+) curated stations across two bands/, '13 curated stations across two bands')
  assert.notEqual(drifted, readme)
  const { problems } = await lintRoster({ readmeText: drifted })
  assert.equal(only(problems, /README says 13 curated stations, roster has/).length, 1, problems.join('\n'))
  const gone = readme.replace(/\d+ curated stations across two bands/g, 'a handful of stations')
  const missing = await lintRoster({ readmeText: gone })
  assert.equal(only(missing.problems, /README: lost its "N curated stations/).length, 1)
})

test('the track-suggestion form is asserted against the roster', async () => {
  // The exact shape of the drift it sat in: a retired station still listed,
  // a current one absent.
  const ghost = form.replace('RISE UP', 'MIDNIGHT NEON')
  assert.notEqual(ghost, form)
  const { problems } = await lintRoster({ issueFormText: ghost })
  assert.equal(only(problems, /no dropdown option starting "YM-5 RISE UP -- "/).length, 1, problems.join('\n'))
  assert.equal(only(problems, /option "YM-5 MIDNIGHT NEON -- .*" names no current station/).length, 1, problems.join('\n'))
  // The ceiling prose.
  const flat = form.replace('the ceiling is nine per band', 'nine is the ceiling')
  assert.notEqual(flat, form)
  const p2 = (await lintRoster({ issueFormText: flat })).problems
  assert.equal(only(p2, /no longer says the ceiling is per band/).length, 1, p2.join('\n'))
  // A restructured form must fail loudly rather than stop checking.
  const p3 = (await lintRoster({ issueFormText: form.replace('id: station', 'id: which') })).problems
  assert.equal(only(p3, /could not find the "station" dropdown/).length, 1, p3.join('\n'))
})
