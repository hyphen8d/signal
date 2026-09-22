// A flag has to be seen twice, and it gets looked at again straight away
// (2026-09-22). The bug behind both rules was live: NEON STASIS's
// "Resonance" was recorded UNPLAYABLE on 2026-09-18 and notified every day
// for five days, while the track itself probed healthy again -- the queue
// was purely oldest-first, so the row was not due for a re-probe for ~19
// days, and roster-watch re-read the same stale record each run. A daily
// notification nobody can act on is the wallpaper this tool exists to avoid.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextBatch, nextStrikes, realFlags, CONFIRM_STRIKES } from '../tools/check-roster.mjs'
import { classify, shouldNotify, describe as describeOutcome } from '../tools/roster-watch.mjs'

const day = (n) => new Date(Date.UTC(2026, 8, n)).toISOString()

test('a flagged row is re-probed before anything else', () => {
  const tracks = [
    { youtubeId: 'fresh' },   // checked today, clean
    { youtubeId: 'flagged' }, // checked today, but flagged
    { youtubeId: 'old' },     // checked long ago, clean
    { youtubeId: 'never' },   // never checked
  ]
  const records = {
    fresh: { at: day(22), flags: [] },
    flagged: { at: day(22), flags: ['UNPLAYABLE'] },
    old: { at: day(1), flags: [] },
  }
  const order = nextBatch(tracks, records, 4).map((t) => t.youtubeId)
  assert.deepEqual(order, ['flagged', 'never', 'old', 'fresh'],
    'flagged first, then never-checked, then oldest')
  // And it still gets in when the batch is only one row wide, which is the
  // case that decides whether a flag can be starved by a long queue.
  assert.deepEqual(nextBatch(tracks, records, 1).map((t) => t.youtubeId), ['flagged'])
})

test('UNVERIFIED does not push a row to the front: it is not a finding about the track', () => {
  const tracks = [{ youtubeId: 'unver' }, { youtubeId: 'old' }]
  const records = {
    unver: { at: day(22), flags: ['UNVERIFIED(no player data)'] },
    old: { at: day(1), flags: [] },
  }
  assert.equal(realFlags(['UNVERIFIED(no player data)']), false)
  assert.deepEqual(nextBatch(tracks, records, 2).map((t) => t.youtubeId), ['old', 'unver'])
})

test('strikes count consecutive real findings, and a clean probe clears them', () => {
  assert.equal(nextStrikes(0, ['UNPLAYABLE']), 1, 'first sighting')
  assert.equal(nextStrikes(1, ['UNPLAYABLE']), 2, 'same answer again: confirmed')
  assert.equal(nextStrikes(2, []), 0, 'a clean probe clears the count outright')
  // A probe that did not happen must neither confirm nor clear -- otherwise a
  // throttled run either invents a finding or wipes a real one.
  assert.equal(nextStrikes(1, ['UNVERIFIED(HTTP 429)']), 1, 'held, not advanced')
  assert.equal(nextStrikes(0, ['UNVERIFIED(HTTP 429)']), 0)
  // Records written before strikes existed have none.
  assert.equal(nextStrikes(undefined, ['UNPLAYABLE']), 1)
})

test('one sighting is not a finding; the second one is', () => {
  const once = { flaggedCount: 1, flaggedConfirmed: 0, flagged: [{ callsign: 'NEON STASIS', flags: ['UNPLAYABLE'] }], checked: 40, total: 747 }
  const twice = { flaggedCount: 1, flaggedConfirmed: 1, flagged: [{ callsign: 'NEON STASIS', flags: ['UNPLAYABLE'] }], checked: 40, total: 747 }
  assert.equal(classify({ exitCode: 1, summary: once }), 'unconfirmed')
  assert.equal(classify({ exitCode: 1, summary: twice }), 'findings')
  assert.equal(shouldNotify('unconfirmed', {}), false, 'nobody is woken for one sighting')
  assert.equal(shouldNotify('findings', {}), true, 'the confirmed one always speaks')
  // It is still recorded and still printed -- silent is not invisible.
  const d = describeOutcome('unconfirmed', once, {})
  assert.match(d.title, /flagged once/)
  assert.match(d.body, /NEON STASIS/)
})

test('a summary from an older check-roster still notifies, rather than going quiet', () => {
  // flaggedConfirmed is absent from records and summaries written before
  // 2026-09-22. Falling back to flaggedCount keeps the old behaviour: too
  // loud beats silently dropping a finding during a half-deployed tree.
  const legacy = { flaggedCount: 2, flagged: [], checked: 40, total: 747 }
  assert.equal(classify({ exitCode: 1, summary: legacy }), 'findings')
})

test('the confirmation threshold is what the record and the watch both mean by confirmed', () => {
  assert.equal(CONFIRM_STRIKES, 2)
  const atThreshold = { flaggedCount: 1, flaggedConfirmed: 1, flagged: [], checked: 1, total: 1 }
  assert.equal(classify({ exitCode: 1, summary: atThreshold }), 'findings')
})
