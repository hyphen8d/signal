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

process.env.SIGNAL_ROSTER_WATCH_IMPORT = '1'
const watch = await import('../tools/roster-watch.mjs')
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
