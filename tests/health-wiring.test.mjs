// The health watch's bookkeeping, driven the way it actually runs.
//
// 2026-10-12 (audit, M3-M5). tests/health-alarm.test.mjs and
// tests/roster-watch.test.mjs cover the pure helpers on hand-written
// summaries, and the audit found that was not enough: mutating
// check-roster's summary to `flaggedConfirmed: bad.length` (cry-wolf back)
// or storing `strikes: 0` on every record (real findings never notify) left
// every one of them green, because neither mutation is in a helper those
// tests call. So the second half of this file runs the REAL scripts --
// check-roster.mjs's main() and roster-watch.mjs's main() -- against a
// scratch record, a scratch state file, and tests/fake-youtube.mjs standing
// in for the network. The first half covers the four holes the audit found
// in the strike bookkeeping (M4) and the stall a flag could hide (M3).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  recordProbe, nextBatch, summarise, heldFlags, flaggedCap,
  CONFIRM_SPACING_MS, CONFIRM_STRIKES,
} from '../tools/check-roster.mjs'
import { bumpStreak, notifications, newFindings, sweepMargin, classify, describe as describeRun } from '../tools/roster-watch.mjs'
import { STATIONS } from '../stations.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const TOOLS = path.join(here, '..', 'tools')
const FAKE = pathToFileURL(path.join(here, 'fake-youtube.mjs')).href
const HOUR = 3600 * 1000
const T0 = Date.parse('2026-10-12T09:00:00Z')

// --- M4(d): strikes need spacing ------------------------------------------

test('a second strike counts only from a probe at least CONFIRM_SPACING_MS later', () => {
  assert.equal(CONFIRM_SPACING_MS, 12 * HOUR)
  const first = recordProbe(undefined, { flags: ['UNPLAYABLE'], now: T0 })
  assert.equal(first.strikes, 1)
  // The dashboard's RUN BATCH minutes after the timer's run: the same look
  // again, not a second one. This is what used to confirm a transient.
  const soon = recordProbe(first, { flags: ['UNPLAYABLE'], now: T0 + 10 * 60 * 1000 })
  assert.equal(soon.strikes, 1, 'a re-probe minutes later confirmed a transient')
  assert.equal(soon.strikeAt, first.strikeAt, 'a held re-probe must not push the window forward')
  // ...and a held re-probe that moved the window would have made this fail.
  const nextDay = recordProbe(soon, { flags: ['UNPLAYABLE'], now: T0 + 13 * HOUR })
  assert.equal(nextDay.strikes, CONFIRM_STRIKES, 'two spaced sightings confirm')
})

test('strikes add across flag types (a wobbling dead video still confirms)', () => {
  const a = recordProbe(undefined, { flags: ['UNPLAYABLE'], now: T0 })
  const b = recordProbe(a, { flags: ['LOGIN_REQUIRED'], now: T0 + 24 * HOUR })
  assert.equal(b.strikes, 2)
  // A clean probe still clears outright.
  assert.equal(recordProbe(b, { flags: [], now: T0 + 48 * HOUR }).strikes, 0)
})

test('a legacy record (strikes, no strikeAt) spaces from its own `at`', () => {
  const legacy = { at: new Date(T0).toISOString(), flags: ['UNPLAYABLE'], strikes: 1 }
  assert.equal(recordProbe(legacy, { flags: ['UNPLAYABLE'], now: T0 + HOUR }).strikes, 1)
  assert.equal(recordProbe(legacy, { flags: ['UNPLAYABLE'], now: T0 + 13 * HOUR }).strikes, 2)
})

// --- M4(c): UNVERIFIED must not drop a flag off the alarm ------------------

test('an UNVERIFIED re-probe keeps the last real flags, in the queue and the summary', () => {
  const flagged = recordProbe(undefined, { flags: ['NO-EMBED'], now: T0 })
  const unver = recordProbe(flagged, { flags: ['UNVERIFIED(no player data)'], now: T0 + 24 * HOUR })
  assert.equal(unver.strikes, 1, 'held, not advanced')
  assert.deepEqual(unver.lastRealFlags, ['NO-EMBED'])
  assert.deepEqual(heldFlags(unver), ['NO-EMBED'])
  // Twice in a row: still held -- it is carried from record to record.
  const again = recordProbe(unver, { flags: ['UNVERIFIED(no player data)'], now: T0 + 48 * HOUR })
  assert.deepEqual(heldFlags(again), ['NO-EMBED'])
  // A real clean answer is what lets it go.
  assert.deepEqual(heldFlags(recordProbe(again, { flags: [], now: T0 + 72 * HOUR })), [])

  const tracks = [{ youtubeId: 'old' }, { youtubeId: 'held' }]
  const records = { old: { at: new Date(T0 - 99 * 24 * HOUR).toISOString(), flags: [] }, held: again }
  assert.deepEqual(nextBatch(tracks, records, 1).map((t) => t.youtubeId), ['held'],
    'the held row lost its place at the front of the queue')
  const sum = summarise(tracks.map((t) => ({ ...t, callsign: 'X', stationId: 'x' })), records)
  assert.equal(sum.flaggedCount, 1, 'the held row dropped off the findings list')
  assert.equal(sum.flagged[0].heldOver, true)
  assert.deepEqual(sum.flagged[0].flags, ['NO-EMBED'])
  assert.equal(sum.unverified, 1, 'it is still counted as a probe that did not happen')
})

// --- M4(b): flagged-first is capped ---------------------------------------

test('flagged rows take at most a quarter of the batch, so the sweep keeps moving', () => {
  assert.equal(flaggedCap(40), 10)
  assert.equal(flaggedCap(1), 1, 'a one-row batch still re-probes a flag')
  const at = (h) => new Date(T0 - h * HOUR).toISOString()
  const tracks = [], records = {}
  for (let i = 0; i < 50; i++) { tracks.push({ youtubeId: `f${i}` }); records[`f${i}`] = { at: at(i), flags: ['NARROW-LICENCE:3'] } }
  for (let i = 0; i < 50; i++) tracks.push({ youtubeId: `n${i}` })
  const batch = nextBatch(tracks, records, 40)
  const flaggedIn = batch.filter((t) => t.youtubeId.startsWith('f'))
  assert.equal(flaggedIn.length, 10, `50 flagged rows took ${flaggedIn.length} of 40 slots`)
  assert.deepEqual(batch.slice(0, 10).map((t) => t.youtubeId), ['f49', 'f48', 'f47', 'f46', 'f45', 'f44', 'f43', 'f42', 'f41', 'f40'],
    'the capped slots go to the flags waiting longest, so they rotate')
  assert.ok(batch.slice(10).every((t) => t.youtubeId.startsWith('n')), 'the rest of the batch walks the roster')
})

test('sweepMargin counts flagged slots as not advancing the sweep', () => {
  assert.equal(sweepMargin(600, 40, 30).status, 'ok', '15d with no flags')
  const m = sweepMargin(600, 40, 30, 50)
  assert.equal(m.flaggedSlots, 10)
  assert.equal(m.passDays, 20, '600 / (40 - 10)')
  assert.equal(sweepMargin(700, 40, 30, 50).status, 'tight', '700/30 = 23d > 21d')
  assert.equal(sweepMargin(700, 40, 30, 0).status, 'ok', 'same roster with no flags')
})

// --- M3: a flag must not hide a stalled sweep -----------------------------

test('a throttled run moves the stall counter whatever it is labelled', () => {
  const withFlag = (confirmed) => ({
    total: 747, checked: 700, throttled: true, flaggedCount: 1, flaggedConfirmed: confirmed ? 1 : 0,
    flagged: [{ youtubeId: 'aaaaaaaaaaa', callsign: 'X', flags: ['UNPLAYABLE'], confirmed }],
  })
  for (const confirmed of [false, true]) {
    const sum = withFlag(confirmed)
    const outcome = classify({ exitCode: 1, summary: sum })
    assert.equal(outcome, confirmed ? 'findings' : 'unconfirmed', 'the label is still the flag')
    let streak = {}
    for (let day = 1; day <= 3; day++) streak = bumpStreak(streak, outcome, sum)
    assert.equal(streak.incomplete, 3, `three throttled ${outcome} runs counted ${streak.incomplete}`)
    const notes = notifications(outcome, sum, streak, ['aaaaaaaaaaa'])
    assert.ok(notes.some((n) => /stuck/.test(n.title)), `a stalled sweep behind ${outcome} said nothing`)
  }
  // A run that finished resets it, flag or no flag.
  assert.equal(bumpStreak({ incomplete: 5 }, 'findings', { throttled: false }).incomplete, 0)
})

// --- M4(a)/(e): a finding is news once, and only confirmed rows are it ------

test('a confirmed finding notifies when it is new, not every day', () => {
  const sum = (ids) => ({
    total: 747, checked: 700, throttled: false, flaggedCount: ids.length + 1, flaggedConfirmed: ids.length,
    flagged: [
      ...ids.map((id) => ({ youtubeId: id, callsign: `ST-${id}`, flags: ['LOGIN_REQUIRED'], confirmed: true })),
      { youtubeId: 'once', callsign: 'ONCE', flags: ['UNPLAYABLE'], confirmed: false },
    ],
  })
  assert.deepEqual(newFindings(sum(['a']), null), ['a'], 'no record of the last run: all of it is new')
  assert.equal(notifications('findings', sum(['a']), {}, null).length, 1)
  assert.equal(notifications('findings', sum(['a']), {}, ['a']).length, 0, 'the same finding notified again')
  assert.equal(notifications('findings', sum([]), {}, ['a']).length, 0, 'a cleared finding is not news')
  const grew = notifications('findings', sum(['a', 'b']), {}, ['a'])
  assert.equal(grew.length, 1, 'a new confirmed finding must notify')

  // And what it says counts and names CONFIRMED rows, new first.
  const d = grew[0]
  assert.match(d.title, /2 track\(s\) flagged \(1 new\)/)
  assert.match(d.body.split('\n')[0], /^NEW ST-b/)
  assert.doesNotMatch(d.body, /ONCE/, 'a seen-once row was named in a confirmed-findings notification')
  assert.match(d.body, /1 more seen once/)
  const plain = describeRun('findings', sum(['a']), {}, { newIds: ['a'] })
  assert.match(plain.title, /1 track\(s\) flagged$/, 'flaggedCount (2) leaked into the title')
})

// --- M5: the real scripts, end to end -------------------------------------

const scratch = () => mkdtempSync(path.join(tmpdir(), 'signal-health-wiring-'))
const runNode = (script, args, env) => spawnSync(process.execPath, [path.join(TOOLS, script), ...args], {
  encoding: 'utf8', timeout: 60000,
  env: { ...process.env, NODE_OPTIONS: `--import=${FAKE}`, ...env },
})
const cipher = STATIONS.find((s) => s.id === 'cipher')
const [A, B, C] = cipher.tracks.map((t) => t.youtubeId)
const iso = (ms) => new Date(ms).toISOString()

test('check-roster main(): strikes, spacing and held flags land in the record and the summary', () => {
  const dir = scratch()
  try {
    const store = path.join(dir, 'roster-health.json')
    const now = Date.now()
    writeFileSync(store, JSON.stringify({ version: 1, records: {
      [A]: { at: iso(now - 48 * HOUR), strikeAt: iso(now - 48 * HOUR), flags: ['LOGIN_REQUIRED'], strikes: 1 },
      [B]: { at: iso(now - 5 * 60000), strikeAt: iso(now - 5 * 60000), flags: ['UNPLAYABLE'], strikes: 1 },
      [C]: { at: iso(now - 48 * HOUR), strikeAt: iso(now - 48 * HOUR), flags: ['NO-EMBED'], strikes: 1 },
    } }))
    const r = runNode('check-roster.mjs', ['--json', '--station=cipher', '--batch=40'], {
      SIGNAL_HEALTH_STORE: store,
      SIGNAL_FAKE_YT: JSON.stringify({ default: 'ok', ids: { [A]: 'LOGIN_REQUIRED', [B]: 'UNPLAYABLE', [C]: 'unverified' } }),
    })
    // --json returns before the findings exit code is set: the summary is the answer.
    assert.equal(r.status, 0, r.stderr)
    const summary = JSON.parse(r.stdout)
    const rec = JSON.parse(readFileSync(store, 'utf8')).records

    assert.equal(summary.throttled, false)
    assert.equal(summary.checked, 40, 'the three seeded rows plus 37 never-checked, one batch')
    assert.equal(rec[A].strikes, 2, 'a second sighting two days on did not confirm (strikes stored wrong?)')
    assert.equal(rec[B].strikes, 1, 'a re-probe five minutes on confirmed a transient')
    assert.equal(rec[C].strikes, 1)
    assert.deepEqual(rec[C].lastRealFlags, ['NO-EMBED'], 'UNVERIFIED erased the finding it re-probed')
    assert.equal(rec[cipher.tracks[5].youtubeId].strikes, 0, 'a clean track carries no strikes')

    assert.equal(summary.flaggedCount, 3, 'A confirmed, B seen once, C held over')
    assert.equal(summary.flaggedConfirmed, 1, 'flaggedConfirmed must count confirmed rows only')
    const byId = Object.fromEntries(summary.flagged.map((f) => [f.youtubeId, f]))
    assert.equal(byId[A].confirmed, true)
    assert.equal(byId[B].confirmed, false)
    assert.equal(byId[C].heldOver, true)
    assert.deepEqual(byId[C].flags, ['NO-EMBED'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('roster-watch main(): a finding notifies once, and a stall behind it still speaks', () => {
  const dir = scratch()
  try {
    const store = path.join(dir, 'roster-health.json')
    const state = path.join(dir, 'roster-watch-state.json')
    const log = path.join(dir, 'notify.log')
    const now = Date.now()
    // One CONFIRMED finding on the record, and an endpoint that throttles
    // every run: the live shape on 2026-10-12, where the label (findings)
    // used to zero the stall counter every day.
    writeFileSync(store, JSON.stringify({ version: 1, records: {
      [A]: { at: iso(now - 24 * HOUR), strikeAt: iso(now - 24 * HOUR), flags: ['LOGIN_REQUIRED'], strikes: 2 },
    } }))
    const env = {
      SIGNAL_HEALTH_STORE: store, SIGNAL_WATCH_STATE: state, SIGNAL_WATCH_NOTIFY_LOG: log,
      SIGNAL_FAKE_YT: JSON.stringify({ default: 'throttle' }),
    }
    const notes = []
    for (let run = 1; run <= 3; run++) {
      if (existsSync(log)) rmSync(log)
      const r = runNode('roster-watch.mjs', ['--batch=40'], env)
      assert.ok(r.status === 1, `run ${run} exit ${r.status}\n${r.stderr}`)
      notes.push(existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])
    }
    const st = JSON.parse(readFileSync(state, 'utf8'))
    assert.equal(st.lastOutcome, 'findings')
    assert.equal(st.streak.incomplete, 3, 'throttled runs labelled findings did not count toward the stall')
    assert.deepEqual(st.findings.map((f) => f.youtubeId), [A])

    assert.deepEqual(notes[0].map((n) => n.urgency), ['critical'], 'run 1: the new confirmed finding')
    assert.deepEqual(notes[1], [], 'run 2: the same finding again is not news')
    assert.equal(notes[2].length, 1, 'run 3: exactly the stall')
    assert.match(notes[2][0].title, /stuck/)

    // And --status keeps the finding visible after its one notification.
    const s = runNode('roster-watch.mjs', ['--status', '--json'], env)
    assert.deepEqual(JSON.parse(s.stdout).findings.map((f) => f.youtubeId), [A])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
