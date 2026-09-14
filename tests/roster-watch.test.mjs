// SIGNAL -- tools/roster-watch.mjs, the scheduler around check-roster.mjs.
//
// What these guard, and it is really only one thing said four ways: A RUN
// THAT DID NOT FINISH MUST NEVER READ AS A RUN THAT FOUND NOTHING.
//
// check-roster exits 1 on real findings and 0 otherwise -- including when it
// gave up early on a 429. So the obvious implementation of a scheduled check
// (fire the tool, look at the exit code, stay quiet on 0) reports a
// throttled run as a clean bill of health. That is the same silent-pass
// shape as a rate-limited audition run, and it is exactly how the NIN
// three-country track survived being checked: not because a check failed,
// but because nothing distinguished "checked and fine" from "never got to
// it".

import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WATCH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'roster-watch.mjs')

// 2026-09-13 (audit, L10) -- main() used to fire on import unless an env var
// said otherwise, and an import that did not know about it ran a real
// 40-probe batch. So the import is proven inert in a CHILD first, carrying
// `--status --json` (reads state, prints JSON, no network, no writes), and
// only then imported here. Order matters: the first version of this test
// imported at the top of the file, and when the guard was broken on purpose
// to check the test could fail, THIS process ran a real batch -- the exact
// accident the fix is for. A broken guard now fails the file before import.
const env = { ...process.env }
delete env.SIGNAL_ROSTER_WATCH_IMPORT
const importProbe = spawnSync(process.execPath, [
  '--input-type=module', '-e',
  `await import(${JSON.stringify(pathToFileURL(WATCH).href)}); process.stdout.write('IMPORTED')`,
  'not-the-script', '--status', '--json',
], { encoding: 'utf8', env, timeout: 30000 })
if (importProbe.stdout !== 'IMPORTED') {
  throw new Error('tools/roster-watch.mjs runs main() on import -- refusing to import it here, where that would ' +
    `launch a real health batch. Child stdout:\n${importProbe.stdout}\nstderr:\n${importProbe.stderr}`)
}
const watch = await import('../tools/roster-watch.mjs')

test('importing the module runs nothing; running it as the script does', () => {
  assert.equal(importProbe.stdout, 'IMPORTED', 'an import must not run main()')

  const run = spawnSync(process.execPath, [WATCH, '--status', '--json'], { encoding: 'utf8', env, timeout: 30000 })
  assert.equal(run.status, 0, run.stderr)
  assert.ok('schedule' in JSON.parse(run.stdout), 'run as the script, main() answers --status --json')
})
const { classify, shouldNotify, bumpStreak, describe: describeRun } = watch

const summary = (over = {}) => ({
  total: 477, checked: 400, never: 0, stale: 0, unverified: 0,
  flaggedCount: 0, flagged: [], throttled: false, ...over,
})

test('a throttled run is not a clean run, however it exited', () => {
  // The whole reason this file exists. check-roster exits 0 here because it
  // found nothing wrong -- it simply never got to look.
  const out = classify({ exitCode: 0, summary: summary({ throttled: true }) })
  assert.equal(out, 'incomplete')
  assert.notEqual(out, 'clean', 'an unfinished sweep reported itself as healthy')
})

test('classify tells the four outcomes apart', () => {
  assert.equal(classify({ exitCode: 0, summary: summary() }), 'clean')
  assert.equal(classify({ exitCode: 1, summary: summary({ flaggedCount: 2, flagged: [{}, {}] }) }), 'findings')
  assert.equal(classify({ exitCode: 0, summary: summary({ throttled: true }) }), 'incomplete')
  assert.equal(classify({ exitCode: 2, summary: null, crashed: true }), 'error')
  // Unparseable output is a broken tool no matter what it exited with.
  assert.equal(classify({ exitCode: 0, summary: null }), 'error')
})

test('findings outrank an unfinished sweep', () => {
  // A real flag is worth acting on whether or not the rest of the batch got
  // through, so it must not be masked by the throttle that came after it.
  const out = classify({
    exitCode: 1,
    summary: summary({ throttled: true, flaggedCount: 1, flagged: [{ callsign: 'X', flags: ['LOGIN_REQUIRED'] }] }),
  })
  assert.equal(out, 'findings')
})

test('silence is the default, and findings always break it', () => {
  assert.equal(shouldNotify('clean', {}), false, 'a clean run must say nothing')
  assert.equal(shouldNotify('findings', {}), true)
  // One throttled run is ordinary and self-correcting; a run of them means
  // the sweep has stalled and coverage is rotting again, which is news.
  assert.equal(shouldNotify('incomplete', { incomplete: 1 }), false)
  assert.equal(shouldNotify('incomplete', { incomplete: 2 }), false)
  assert.equal(shouldNotify('incomplete', { incomplete: 3 }), true)
  // A broken tool earns attention sooner than a busy endpoint.
  assert.equal(shouldNotify('error', { error: 1 }), false)
  assert.equal(shouldNotify('error', { error: 2 }), true)
})

test('streaks count consecutive runs and anything else resets them', () => {
  let s = {}
  s = bumpStreak(s, 'incomplete'); assert.equal(s.incomplete, 1)
  s = bumpStreak(s, 'incomplete'); assert.equal(s.incomplete, 2)
  // A clean run in the middle means the sweep is moving again -- the streak
  // must not resume counting from two.
  s = bumpStreak(s, 'clean')
  assert.equal(s.incomplete, 0, 'a recovered sweep kept its old streak')
  s = bumpStreak(s, 'incomplete'); assert.equal(s.incomplete, 1)
  s = bumpStreak(s, 'error'); assert.equal(s.error, 1)
  assert.equal(s.incomplete, 0, 'a different outcome must reset the other streak')
})

test('the findings notification names what was found', () => {
  // A notification that only said "problems found" would send you to a
  // terminal to learn anything at all, which is friction at the exact
  // moment the thing is trying to be useful.
  const d = describeRun('findings', summary({
    flaggedCount: 2,
    flagged: [
      { callsign: 'NINE INCH NAILS', flags: ['NARROW-LICENCE:3'] },
      { callsign: 'CIPHER', flags: ['LOGIN_REQUIRED'] },
    ],
  }), {})
  assert.match(d.title, /2 track\(s\) flagged/)
  assert.match(d.body, /NINE INCH NAILS/)
  assert.match(d.body, /NARROW-LICENCE:3/)
  assert.match(d.body, /CIPHER/)
})

test('a long findings list is summarised rather than truncated silently', () => {
  const flagged = Array.from({ length: 7 }, (_, i) => ({ callsign: `ST${i}`, flags: ['NO-EMBED'] }))
  const d = describeRun('findings', summary({ flaggedCount: 7, flagged }), {})
  assert.match(d.body, /\+4 more/, 'the count beyond the named ones must be visible')
})

test('a stopped schedule is detectable, because nothing else would say so', () => {
  // The dashboard's coverage bars render the RECORD. A timer that got
  // disabled and a timer with nothing to report leave that record looking
  // identical -- so a stopped checker would go on reporting a clean roster
  // forever. This is the same silent-pass shape as a throttled run reading
  // as a clean one, one level further out.
  const { scheduleHealth } = watch
  const now = Date.parse('2026-08-30T12:00:00Z')
  const at = (iso) => ({ lastRun: iso })

  assert.equal(scheduleHealth(at('2026-08-30T11:00:00Z'), now).status, 'ok', 'an hour ago is fine')
  assert.equal(scheduleHealth(at('2026-08-29T12:00:00Z'), now).status, 'ok', 'yesterday is the normal case')
  // Daily timer with Persistent=true catches a missed day at the next boot,
  // so two days is the point where something has actually stopped.
  assert.equal(scheduleHealth(at('2026-08-27T11:00:00Z'), now).status, 'late')
  assert.equal(scheduleHealth(null, now).status, 'never')
  assert.equal(scheduleHealth({ lastRun: null }, now).status, 'never')
  // Junk in the state file must not read as healthy.
  assert.equal(scheduleHealth({ lastRun: 'not a date' }, now).status, 'never')

  const late = scheduleHealth(at('2026-08-25T12:00:00Z'), now)
  assert.equal(late.status, 'late')
  assert.equal(Math.round(late.days), 5, 'the panel prints this number')
})

test('sweepMargin says so while there is still time, not after (2026-09-02 audit)', () => {
  // The margin consumed itself silently once already: the timer's
  // reasoning was written at 477 tracks (~12d) and the roster reached 593
  // (~15d) with nothing saying so. 'tight' fires at 70% of the horizon --
  // loud while raising the batch still fixes it.
  const { sweepMargin } = watch
  assert.equal(sweepMargin(593, 40, 30).status, 'ok', "today's roster is inside the margin")
  assert.equal(Math.round(sweepMargin(593, 40, 30).passDays), 15)
  assert.equal(sweepMargin(841, 40, 30).status, 'tight', '70% of a 30d horizon is 21d = 840 tracks')
  assert.equal(sweepMargin(840, 40, 30).status, 'ok', 'the boundary itself is still ok')
  // Absent inputs are an absent answer, never a guess: an old state entry
  // has no staleDays and no total yet.
  assert.equal(sweepMargin(0, 40, 30), null)
  assert.equal(sweepMargin(593, 0, 30), null)
  // ...but a missing horizon falls back to the documented 30.
  assert.equal(sweepMargin(593, 40).horizonDays, 30)
})
