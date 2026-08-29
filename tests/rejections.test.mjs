// The rejection stores' merge rules (tools/lib/rejections.mjs).
//
// These exist because the bug they cover shipped and bit within a day: the
// admin server appended to both stores blindly, so Semi-Charmed Life --
// rejected by hand into station-profiles.json on 2026-08-27 and again
// through /api/reject on 2026-08-29 -- was listed twice, and audition.js
// printed "x rejected before" twice for one call. The hand-written entry had
// no youtubeId, which is the whole reason the identity test cannot be keyed
// on the id alone.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeRejection, sameTrack } from '../tools/lib/rejections.mjs'

const TODAY = '2026-08-29'
const opts = (reason) => ({ today: TODAY, reason })

test('a track not in the store is added', () => {
  const entry = { artist: 'Hive', track: 'Ultrasonic Sound', reason: 'too long', youtubeId: 'aaa' }
  const r = mergeRejection([], entry, opts('too long'))
  assert.equal(r.outcome, 'added')
  assert.equal(r.list.length, 1)
  assert.equal(r.existing, null)
})

test('the same rejection twice does not become two entries', () => {
  const entry = { artist: 'Hive', track: 'Ultrasonic Sound', reason: 'too long', youtubeId: 'aaa' }
  const once = mergeRejection([], entry, opts('too long'))
  const twice = mergeRejection(once.list, entry, opts('too long'))
  assert.equal(twice.outcome, 'skipped')
  assert.equal(twice.list.length, 1, 'still one entry')
  assert.equal(twice.list[0].reason, 'too long', 'and the reason was not doubled up')
})

test('a hand-written entry with no youtubeId is still found', () => {
  // The exact shape that caused this. A guard keyed on the id would treat
  // these as different tracks and duplicate anyway.
  const handWritten = { artist: 'Third Eye Blind', track: 'Semi-Charmed Life', reason: 'lane, not availability' }
  const viaApi = { artist: 'Third Eye Blind', track: 'Semi-Charmed Life', reason: 'lane, not availability', youtubeId: 'gjdLAsnR_Ws' }
  const r = mergeRejection([handWritten], viaApi, opts('lane, not availability'))
  assert.equal(r.outcome, 'skipped')
  assert.equal(r.list.length, 1)
})

test('identity is case- and whitespace-insensitive on artist and title', () => {
  const existing = { artist: 'The Prodigy', track: 'Mindfields', reason: 'no upload clears the licence bar' }
  const again = { artist: '  the prodigy ', track: 'MINDFIELDS', reason: 'no upload clears the licence bar' }
  assert.equal(sameTrack(existing, again), true)
  assert.equal(mergeRejection([existing], again, opts('no upload clears the licence bar')).outcome, 'skipped')
})

test('youtubeId wins over artist/title when both sides carry one', () => {
  // Two genuinely different uploads of the same song are different records:
  // one may be rejected for a narrow licence while another is fine.
  const a = { artist: 'The Prodigy', track: 'Mindfields', youtubeId: 'narrow-one' }
  const b = { artist: 'The Prodigy', track: 'Mindfields', youtubeId: 'other-one' }
  assert.equal(sameTrack(a, b), false)
  assert.equal(mergeRejection([a], b, opts('different upload')).outcome, 'added')
})

test('a NEW reason for an already-rejected track amends rather than duplicates', () => {
  const existing = { artist: 'Leftfield', track: 'Song of Life', reason: 'too downtempo for the lane' }
  const r = mergeRejection([existing], { artist: 'Leftfield', track: 'Song of Life' }, opts('and the curator does not want it'))
  assert.equal(r.outcome, 'amended')
  assert.equal(r.list.length, 1, 'one record, not an argument between two')
  assert.match(r.list[0].reason, /too downtempo for the lane/, 'the original reasoning survives')
  assert.match(r.list[0].reason, /2026-08-29: and the curator does not want it/, 'the new one is dated onto it')
})

test('amending twice with the same new reason does not stack it', () => {
  const existing = { artist: 'Leftfield', track: 'Song of Life', reason: 'too downtempo' }
  const once = mergeRejection([existing], { artist: 'Leftfield', track: 'Song of Life' }, opts('curator taste'))
  const twice = mergeRejection(once.list, { artist: 'Leftfield', track: 'Song of Life' }, opts('curator taste'))
  assert.equal(once.outcome, 'amended')
  assert.equal(twice.outcome, 'skipped')
  assert.equal(twice.list[0].reason, once.list[0].reason, 'byte-identical the second time')
})

test('the queue store is merged on its own field name', () => {
  // pending-tracks.json calls it rejectedReason, station-profiles.json calls
  // it reason. One merger has to handle both or the queue silently duplicates.
  const existing = { stationId: 'cipher', youtubeId: 'zzz', artist: 'X', title: 'Y', rejectedReason: 'first call' }
  const same = mergeRejection([existing], { stationId: 'cipher', youtubeId: 'zzz', artist: 'X', title: 'Y' }, opts('first call'))
  assert.equal(same.outcome, 'skipped')
  const fresh = mergeRejection([existing], { stationId: 'cipher', youtubeId: 'zzz', artist: 'X', title: 'Y' }, opts('second thoughts'))
  assert.equal(fresh.outcome, 'amended')
  assert.match(fresh.list[0].rejectedReason, /first call/)
  assert.match(fresh.list[0].rejectedReason, /2026-08-29: second thoughts/)
})

test('the caller list is never mutated in place', () => {
  // rejectTrack() decides whether to WRITE based on the outcome; a merger
  // that mutated would leave a skipped merge having already changed the
  // object the caller is about to not write.
  const list = [{ artist: 'A', track: 'B', reason: 'r' }]
  const snapshot = JSON.stringify(list)
  mergeRejection(list, { artist: 'C', track: 'D' }, opts('new'))
  mergeRejection(list, { artist: 'A', track: 'B' }, opts('amended reason'))
  assert.equal(JSON.stringify(list), snapshot, 'input untouched')
})

test('an undefined or missing list is treated as empty', () => {
  const r = mergeRejection(undefined, { artist: 'A', track: 'B' }, opts('r'))
  assert.equal(r.outcome, 'added')
  assert.equal(r.list.length, 1)
})
