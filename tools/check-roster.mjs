// SIGNAL -- roster health: re-asks the audition questions of tracks that are
// ALREADY on the roster.
//
// 2026-08-29. The gap this closes: the strict checks only ever ran on the way
// IN. audition.js asks playabilityStatus, playableInEmbed and
// availableCountries of a candidate; verify-roster.js asks oEmbed, and only
// oEmbed, of everything on the roster -- and its own header admits oEmbed
// "confirms a video is real and embeddable AT CHECK TIME". So a track passed
// the full gauntlet once, on the day it was added, and was never asked again.
//
// All three of the things audition catches are things that CHANGE after a
// track is on the roster:
//   - the upload gets age-gated (LOGIN_REQUIRED), which the IFrame player
//     cannot satisfy, so it plays as dead air rather than failing loudly
//   - the uploader revokes embedding
//   - a re-upload narrows the licence
// The last one is the reason this exists rather than being a nice-to-have:
// it is invisible from where the curator sits. The narrow-licence trap in
// probe.mjs's comment is four tracks licensed in 1-4 countries, every one of
// them including the US. A US-based listen passes all four while they are
// dead for almost everyone else. Nothing in the loop would ever have said so.
//
// Why this is INCREMENTAL and keeps a file, rather than a sweep:
// a full pass is one watch-page fetch per track -- ~386 of them -- against an
// endpoint that starts answering 429 after a few hundred. A one-shot "check
// everything" would throttle partway through every single time and return a
// wall of UNVERIFIED indistinguishable from findings. So this checks a batch,
// remembers what it learned, and works through the roster over several runs.
// The record IS the feature: it makes "which tracks have not been looked at
// since they were added" a question with an answer.
//
//   node tools/check-roster.mjs                 # next batch: flagged rows, then oldest-checked
//   node tools/check-roster.mjs --batch=80
//   node tools/check-roster.mjs --station=cipher
//   node tools/check-roster.mjs --report        # read the record, no network
//   node tools/check-roster.mjs --json          # for tools/admin-server.mjs

import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { oembed, playability, decayFlags, mapLimit, isThrottleSignature } from './lib/probe.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
// SIGNAL_HEALTH_STORE is for the suite only (2026-09-12): it lets a test
// point this at a scratch record and prove --report leaves it byte-identical.
const STORE = process.env.SIGNAL_HEALTH_STORE || path.join(here, 'roster-health.json')

const args = process.argv.slice(2)
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const asJson = args.includes('--json')
const reportOnly = args.includes('--report')
const stationArg = flag('station')
const batchSize = +flag('batch', 40)
/** Probes in a row that must agree before a flag counts as confirmed. */
export const CONFIRM_STRIKES = 2
/** How far apart two strikes must be for the second to count.
 *
 *  2026-10-12 (audit, M4) -- "seen twice" meant two PROBES, and nothing said
 *  how far apart. The daily timer spaces them a day apart, but the
 *  dashboard's RUN BATCH re-probes flagged rows first too, so a click a few
 *  minutes after an `unconfirmed` run asked YouTube the same question while
 *  it was still giving the same transient answer -- and confirmed it. The
 *  confirmation exists to outwait a blip, so it is measured in time, not in
 *  probes. 12h rather than 24h because the timer carries
 *  RandomizedDelaySec=2h and a Persistent catch-up at boot, so two genuine
 *  scheduled runs can land well under a day apart; 12h still puts any two
 *  counted strikes in different scheduled runs. */
export const CONFIRM_SPACING_MS = 12 * 3600 * 1000
/** The share of a batch flagged rows may take.
 *
 *  2026-10-12 (audit, M4) -- flagged-first had no ceiling, so a flagged row
 *  took a slot every run for as long as it stayed flagged, and forty of them
 *  (one channel's licence change across a station would do it) would take
 *  the whole batch at 40: the sweep would stop advancing while every run
 *  still looked busy. A quarter keeps re-probing prompt for any ordinary
 *  number of flags -- ten slots at batch 40 -- and the rest of the batch
 *  still walks the roster. Flagged rows past the cap are not dropped; they
 *  queue by age with everything else and rotate through the capped slots
 *  oldest-first. sweepMargin() in roster-watch.mjs counts these slots as
 *  NOT advancing the sweep. */
export const FLAGGED_SHARE = 0.25
export const flaggedCap = (batch) => (batch > 0 ? Math.max(1, Math.floor(batch * FLAGGED_SHARE)) : 0)

/** Does this record carry a problem with the TRACK? UNVERIFIED is a problem
 *  with the probe, so it is neither a finding nor a clean bill. */
export function realFlags(flags) {
  return (flags ?? []).some((f) => !f.startsWith('UNVERIFIED'))
}

/** Consecutive probes that found a real problem. An UNVERIFIED probe holds
 *  the count where it is -- it did not happen, so it can neither confirm a
 *  flag nor clear one.
 *
 *  2026-10-12 (audit, M4) -- given `prevStrikeAt` and `now`, a real finding
 *  less than CONFIRM_SPACING_MS after the last counted strike HOLDS the count
 *  too: it is the same look again, not a second one. Callers without timing
 *  (the old two-argument form) keep the old behaviour.
 *
 *  Strikes add ACROSS flag types, deliberately: UNPLAYABLE one day and
 *  LOGIN_REQUIRED the next confirms. The question confirmation answers is
 *  "is this track broken for listeners", and the spacing above is what
 *  guards against transients, not flag identity. Requiring the same flag
 *  twice would let a genuinely dead video whose reported status wobbles
 *  (ERROR / UNPLAYABLE, DEAD 404 / DEAD 410, NARROW-LICENCE:3 / :5) never
 *  confirm at all -- a silent miss, which is the worse failure here: too
 *  loud beats dropping a real finding. */
export function nextStrikes(prevStrikes, flags, { prevStrikeAt, now } = {}) {
  const prev = prevStrikes ?? 0
  if (realFlags(flags)) {
    const last = prevStrikeAt ? Date.parse(prevStrikeAt) : NaN
    if (prev > 0 && now != null && Number.isFinite(last) && now - last < CONFIRM_SPACING_MS) return prev
    return prev + 1
  }
  if ((flags ?? []).some((f) => f.startsWith('UNVERIFIED'))) return prev
  return 0
}

/** The real problems a record stands for, even when its latest probe did not
 *  happen.
 *
 *  2026-10-12 (audit, M4) -- strikes were held across an UNVERIFIED probe,
 *  but `flags` was overwritten with the UNVERIFIED reason, and both the queue
 *  (rank) and summarise() read `flags`. So one truncated, non-throttle probe
 *  of a flagged row moved it to the back of the queue and off the findings
 *  list -- out of sight for a full pass (~19 days) with the track still
 *  dead. The record now keeps `lastRealFlags` through UNVERIFIED probes, and
 *  this is the one reading of it. Returns [] for a clean or never-flagged
 *  record. */
export function heldFlags(record) {
  if (!record) return []
  const flags = record.flags ?? []
  if (realFlags(flags)) return flags.filter((f) => !f.startsWith('UNVERIFIED'))
  if (flags.some((f) => f.startsWith('UNVERIFIED')) && record.lastRealFlags?.length) return record.lastRealFlags
  return []
}

/** The record a probe writes, given the record it replaces. Pure and
 *  exported (2026-10-12, audit M5) so the bookkeeping -- strikes, their
 *  spacing, the held flags -- is tested as main() actually writes it rather
 *  than only through the helpers it calls. */
export function recordProbe(prev, { flags, e = {}, p = {}, track = {}, now = Date.now() }) {
  const strikes = nextStrikes(prev?.strikes, flags, {
    // A record from before strikeAt existed: its `at` was the last probe,
    // and if it carries strikes that probe was one.
    prevStrikeAt: prev?.strikeAt ?? (prev?.strikes ? prev.at : undefined),
    now,
  })
  const at = new Date(now).toISOString()
  const real = realFlags(flags)
  // The time of the last COUNTED strike: moved only when the count moved,
  // so a held re-probe cannot keep pushing the spacing window forward.
  const strikeAt = strikes === 0 ? undefined
    : strikes !== (prev?.strikes ?? 0) ? at
      : (prev?.strikeAt ?? prev?.at)
  // Carried only through a probe that did not happen: a real finding is its
  // own record, and a clean probe clears everything.
  const unverified = !real && (flags ?? []).some((f) => f.startsWith('UNVERIFIED'))
  const lastRealFlags = unverified ? heldFlags(prev) : undefined
  const rec = {
    at,
    flags,
    strikes,
    status: p.status ?? null,
    countries: p.countries ?? null,
    embeddable: p.embeddable ?? null,
    seconds: p.seconds ?? null,
    title: e.title ?? track.title,
    channel: e.channel ?? null,
    stationId: track.stationId,
  }
  if (strikeAt) rec.strikeAt = strikeAt
  if (lastRealFlags?.length) rec.lastRealFlags = lastRealFlags
  return rec
}

/** The order the roster is worked through: flagged rows first (up to
 *  flaggedCap of the batch), then never-checked, then least-recently-checked.
 *  Pure, and exported, because the ordering is the whole behaviour -- a flag
 *  that waits its turn is a flag that gets re-reported daily for the length
 *  of a full pass (~19 days at batch 40 over 747 tracks). See the note at
 *  its call site. A row whose last probe was UNVERIFIED still counts as
 *  flagged if it was before (heldFlags). */
export function nextBatch(tracks, records, batchSize) {
  const size = Math.max(0, batchSize)
  const byAge = (a, b) => {
    const ra = records[a.youtubeId], rb = records[b.youtubeId]
    if (!ra && !rb) return 0
    if (!ra) return -1
    if (!rb) return 1
    return Date.parse(ra.at) - Date.parse(rb.at)
  }
  const flagged = tracks.filter((t) => heldFlags(records[t.youtubeId]).length).sort(byAge)
  const first = flagged.slice(0, flaggedCap(size))
  const taken = new Set(first.map((t) => t.youtubeId))
  const rest = tracks.filter((t) => !taken.has(t.youtubeId)).sort(byAge)
  return [...first, ...rest].slice(0, size)
}
// Every human line goes to stderr so --json owns stdout, exactly as
// audition.js does it -- one code path, so the dashboard and the terminal
// cannot disagree about a flag.
const say = (...a) => console.error(...a)

// A record older than this is worth refreshing. Not a correctness threshold,
// just the point where "we checked it once" stops being reassuring.
const STALE_DAYS = 30
// Consecutive throttle-shaped misses before the run gives up. The point is
// that a throttled run must not masquerade as a clean one, so it stops and
// says so rather than spending the rest of the batch manufacturing
// UNVERIFIED rows. See probe.mjs isThrottleSignature().
const THROTTLE_GIVE_UP = 3

function loadStore() {
  if (!existsSync(STORE)) return { version: 1, records: {} }
  try {
    const j = JSON.parse(readFileSync(STORE, 'utf8'))
    return { version: 1, records: j.records ?? {} }
  } catch (err) {
    say(`! ${path.basename(STORE)} is unreadable (${err.message}); starting a fresh record.`)
    return { version: 1, records: {} }
  }
}
// 2026-09-02 (audit, L9) -- temp + rename: this store is the sweep's whole
// memory, and a crash mid-write used to be able to truncate ~600 tracks of
// verification history in one stroke.
const saveStore = (store) => {
  const tmp = `${STORE}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n')
  renameSync(tmp, STORE)
}

const daysSince = (iso) => (Date.now() - Date.parse(iso)) / 86400000

/** Every track on the roster, flattened, with the station it belongs to. */
async function rosterTracks() {
  const { STATIONS, SECRET_STATIONS } = await import('../stations.js?v=health')
  const all = [...STATIONS, ...(SECRET_STATIONS ?? [])]
  const picked = stationArg ? all.filter((s) => s.id === stationArg) : all
  if (stationArg && !picked.length) {
    say(`No station "${stationArg}". Known ids: ${all.map((s) => s.id).join(', ')}`)
    process.exit(2)
  }
  return picked.flatMap((st) =>
    st.tracks.map((t) => ({
      youtubeId: t.youtubeId,
      title: t.title ?? '',
      artist: t.artist ?? '',
      stationId: st.id,
      callsign: st.callsign,
    })))
}

/** The summary the dashboard renders and the terminal prints -- one shape.
 *  Exported (2026-10-12, audit M5) so the confirmed/unconfirmed split is
 *  tested where it is computed, not on hand-written summaries. */
export function summarise(tracks, records) {
  const rows = tracks.map((t) => {
    const r = records[t.youtubeId]
    const held = heldFlags(r)
    return {
      ...t,
      checkedAt: r?.at ?? null,
      flags: r?.flags ?? [],
      held,
      // The latest probe did not happen; `held` is the finding before it.
      heldOver: !!r && held.length > 0 && !realFlags(r.flags),
      strikes: r?.strikes ?? 0,
      status: r?.status ?? null,
      countries: r?.countries ?? null,
      embeddable: r?.embeddable ?? null,
      seconds: r?.seconds ?? null,
      stale: r ? daysSince(r.at) > STALE_DAYS : false,
    }
  })
  const never = rows.filter((r) => !r.checkedAt)
  const stale = rows.filter((r) => r.checkedAt && r.stale)
  // UNVERIFIED is not a finding about the track -- it means the probe itself
  // did not happen, so it is counted apart from real problems rather than
  // inflating them.
  const unver = rows.filter((r) => r.flags.some((f) => f.startsWith('UNVERIFIED')))
  // 2026-10-12 (audit, M4) -- by held flags, so an UNVERIFIED re-probe of a
  // flagged row keeps it on this list instead of hiding it for a full pass.
  const bad = rows.filter((r) => r.held.length)
  return {
    total: rows.length,
    checked: rows.length - never.length,
    never: never.length,
    stale: stale.length,
    unverified: unver.length,
    flaggedCount: bad.length,
    // Flagged by at least two probes in a row. A record written before
    // strikes existed has none, so its first re-probe under this build
    // counts as strike 1 and it confirms on the run after -- one quiet day,
    // not a lost finding.
    flaggedConfirmed: bad.filter((r) => (r.strikes ?? 0) >= CONFIRM_STRIKES).length,
    staleDays: STALE_DAYS,
    flagged: bad.map((r) => ({
      youtubeId: r.youtubeId, title: r.title, artist: r.artist,
      stationId: r.stationId, callsign: r.callsign,
      flags: r.held, heldOver: r.heldOver, lastProbe: r.heldOver ? r.flags : undefined,
      countries: r.countries, status: r.status,
      embeddable: r.embeddable, checkedAt: r.checkedAt,
      strikes: r.strikes ?? 0, confirmed: (r.strikes ?? 0) >= CONFIRM_STRIKES,
    })),
    byStation: [...new Set(rows.map((r) => r.stationId))].map((id) => {
      const mine = rows.filter((r) => r.stationId === id)
      return {
        stationId: id,
        callsign: mine[0].callsign,
        total: mine.length,
        checked: mine.filter((r) => r.checkedAt).length,
        flagged: mine.filter((r) => r.held.length).length,
      }
    }),
  }
}

/** Records for tracks that are no longer on the roster anywhere.
 *
 *  Retiring a station strands its whole tracklist in here: DRIFT MODE's 50
 *  went orphaned in a single commit on 2026-08-30, and nothing had ever
 *  removed one, so this file grew monotonically with every curation pass.
 *  Nothing was WRONG as a result -- summarise() walks the roster and looks
 *  records up, never the reverse, so an orphan cannot reach a coverage bar
 *  or a finding. That is exactly why it went unnoticed for the life of the
 *  tool.
 *
 *  Two things this must not do, both of which are easy to write by accident:
 *
 *  - Prune against `tracks`. That list honours --station, so pruning against
 *    it would wipe every OTHER station's history the first time anyone
 *    checked a single station. It reads the whole roster itself instead.
 *  - Prune when the roster is empty. A new station is committed with
 *    `tracks: []` before it is filled (see CLAUDE.md on the audition
 *    chicken-and-egg), and stations.js is mid-edit for real stretches; a
 *    sweep firing in that window would delete the entire record. An empty
 *    roster means "cannot tell", not "nothing is live".
 *
 *  It is a delete, so it says what it did. The file is committed, which is
 *  the actual undo. */
export function orphanIds(recordIds, liveIds) {
  // null, not [] -- "cannot tell" and "nothing to drop" must not be the same
  // answer, since one of them means do nothing and the other means the record
  // is already correct.
  if (!liveIds.size) return null
  return recordIds.filter((id) => !liveIds.has(id))
}

async function pruneOrphans(store) {
  const { STATIONS, SECRET_STATIONS } = await import('../stations.js?v=health-prune')
  const live = new Set([...STATIONS, ...(SECRET_STATIONS ?? [])]
    .flatMap((st) => st.tracks.map((t) => t.youtubeId)))
  const gone = orphanIds(Object.keys(store.records), live)
  if (!gone) return { dropped: 0, skipped: true }
  for (const id of gone) delete store.records[id]
  return { dropped: gone.length, skipped: false }
}

// 2026-10-15 (admin audit, C-L1) -- one batch at a time. The store is
// loaded once and the in-memory copy saved after every probe, so two runs at
// once (the dashboard's RUN BATCH overlapping the daily timer) were last-
// writer-wins: one batch's records vanished, and both re-probed the same
// flagged rows first. A second run now WAITS for the first and then loads
// what it wrote -- waiting rather than failing, because a failure here is an
// "error" outcome to roster-watch, and two of those notify. A lock whose
// owner is gone (a crash, a process.exit) is stale and taken over. Lives
// beside the store, dot-prefixed and gitignored, so SHIP never commits one.
// --report takes no lock: it only reads.
const LOCK = path.join(path.dirname(STORE), `.${path.basename(STORE)}.lock`)
const LOCK_WAIT_MS = 20 * 60_000
const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
async function acquireLock() {
  const deadline = Date.now() + LOCK_WAIT_MS
  let said = false
  for (;;) {
    try { writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); return }
    catch (e) { if (e.code !== 'EEXIST') throw e }
    const owner = Number(readFileSync(LOCK, 'utf8')) || 0
    if (!owner || !alive(owner)) { try { unlinkSync(LOCK) } catch (e) {} ; continue }
    if (Date.now() > deadline) throw new Error(`another health batch (pid ${owner}) has held ${path.basename(LOCK)} for over ${LOCK_WAIT_MS / 60_000} minutes`)
    if (!said) { say(`Waiting for another health batch (pid ${owner}) to finish...`); said = true }
    await new Promise((r) => setTimeout(r, 2000))
  }
}
const releaseLock = () => {
  try { if (Number(readFileSync(LOCK, 'utf8')) === process.pid) unlinkSync(LOCK) } catch (e) {}
}

async function main() {
  if (reportOnly) return runMain()
  await acquireLock()
  try { return await runMain() } finally { releaseLock() }
}

async function runMain() {
  const tracks = await rosterTracks()
  const store = loadStore()
  // 2026-09-12 (audit, L4) -- `--report` is READ-ONLY, prune included. The
  // dashboard's GET /api/health runs this, and a GET is the one request a
  // cross-origin page can make without the X-Signal-Admin preflight -- so a
  // prune here was a file write reachable from any tab, and mid-edit (one
  // station at `tracks: []` while the rest are populated) a panel poll
  // dropped that station's whole verification history. The record only
  // moves on a real run; reading it must not.
  const prune = reportOnly ? { dropped: 0, skipped: false } : await pruneOrphans(store)
  if (prune.skipped) {
    say('! The roster reports no tracks at all, so no records were pruned -- that')
    say('  reads as stations.js being mid-edit rather than as an empty roster.')
  } else if (prune.dropped) {
    saveStore(store)
    say(`Pruned ${prune.dropped} record(s) for tracks no longer on the roster.`)
  }

  let throttled = false
  if (!reportOnly) {
    // Oldest first, never-checked before that: the queue orders itself, so
    // repeated runs walk the whole roster without anyone tracking position.
    // 2026-09-22 -- a FLAGGED row goes to the front, ahead of never-checked
    // and oldest. Before this the queue was purely oldest-first, so a flag
    // was not re-tested until its turn came round again: at batch 40 over
    // 747 tracks that is ~19 days, and roster-watch re-reported the same
    // row from the record every single day in between. That is how NEON
    // STASIS's "Resonance" cried wolf five days running over a transient
    // UNPLAYABLE that had already cleared. Re-probing a flag first is what
    // makes it either confirm (worth acting on) or disappear, and it costs
    // one row of the batch per flag.
    // 2026-10-12 (audit, M4) -- up to a quarter of the batch; see
    // FLAGGED_SHARE for why flagged-first needed a ceiling.
    const queue = nextBatch(tracks, store.records, batchSize)

    if (!queue.length) say('Nothing to check.')
    else {
      say(`Checking ${queue.length} of ${tracks.length} track(s) -- flagged rows first, then least recently checked.`)
      let throttleHits = 0
      let stopped = false
      // Concurrency 6, matching verify-roster.js -- polite to the endpoint.
      await mapLimit(queue, 6, async (t) => {
        if (stopped) return
        const e = await oembed(t.youtubeId)
        const p = e.ok ? await playability(t.youtubeId) : {}
        if (e.ok && isThrottleSignature(p)) {
          if (++throttleHits >= THROTTLE_GIVE_UP) stopped = true
          return // deliberately NOT recorded: this says nothing about the track
        }
        const flags = decayFlags(e, p)
        // Consecutive probes that found a real problem with this track.
        // UNVERIFIED says the probe did not happen, so it neither counts nor
        // clears. One strike is a report YouTube gave once; two is a problem
        // reported by probes at least CONFIRM_SPACING_MS apart, which is
        // what roster-watch waits for before it wakes anyone (see
        // shouldNotify). recordProbe() owns all of it -- strikes, their
        // spacing, and the real flags an UNVERIFIED probe must not erase.
        store.records[t.youtubeId] = recordProbe(store.records[t.youtubeId], { flags, e, p, track: t, now: Date.now() })
        if (flags.length) say(`  ${t.youtubeId}  ${t.callsign.padEnd(17)} ${flags.join(' ')}  ${e.title ?? t.title}`)
      })
      saveStore(store)
      throttled = stopped
      if (stopped) {
        say('')
        say('! THROTTLED -- YouTube stopped answering the watch endpoint, so this run')
        say('  stopped early rather than filling the record with UNVERIFIED rows that')
        say('  say nothing about the tracks. Nothing was recorded for the tracks it')
        say('  gave up on; they stay at the front of the queue. The limit clears on')
        say('  its own in tens of minutes -- wait, then run it again.')
      }
    }
  }

  const summary = { ...summarise(tracks, store.records), throttled }
  if (asJson) { process.stdout.write(JSON.stringify(summary)); return }

  say('')
  say(`Roster health: ${summary.checked}/${summary.total} checked, ${summary.never} never, ` +
      `${summary.stale} stale (>${STALE_DAYS}d), ${summary.flaggedCount} flagged.`)
  for (const f of summary.flagged) {
    say(`  ${f.callsign.padEnd(17)} ${f.flags.join(' ').padEnd(28)} ${f.artist} -- ${f.title}${f.confirmed ? '' : '  (seen once)'}${f.heldOver ? '  (last probe unverified; held)' : ''}`)
  }
  // Nonzero exit on real findings so this can gate something later; an
  // incomplete record is not a failure, just unfinished work.
  if (summary.flaggedCount) process.exitCode = 1
}

// Only when RUN, never when imported. tests/probe.test.mjs imports
// orphanIds() from here, and until 2026-08-30 that import fired a live
// network sweep as a side effect -- the suite silently checked 40 tracks
// against YouTube and rewrote the committed record every time it ran. An
// entry-point check rather than roster-watch.mjs's opt-out env var, because
// this way an importer cannot forget: that is precisely what went wrong.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { say(String(err?.stack ?? err)); process.exit(2) })
}
