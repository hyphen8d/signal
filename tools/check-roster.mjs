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
//   node tools/check-roster.mjs                 # next batch, oldest-checked first
//   node tools/check-roster.mjs --batch=80
//   node tools/check-roster.mjs --station=cipher
//   node tools/check-roster.mjs --report        # read the record, no network
//   node tools/check-roster.mjs --json          # for tools/admin-server.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { oembed, playability, decayFlags, mapLimit, isThrottleSignature } from './lib/probe.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const STORE = path.join(here, 'roster-health.json')

const args = process.argv.slice(2)
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const asJson = args.includes('--json')
const reportOnly = args.includes('--report')
const stationArg = flag('station')
const batchSize = +flag('batch', 40)
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
const saveStore = (store) => writeFileSync(STORE, JSON.stringify(store, null, 2) + '\n')

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

/** The summary the dashboard renders and the terminal prints -- one shape. */
function summarise(tracks, records) {
  const rows = tracks.map((t) => {
    const r = records[t.youtubeId]
    return {
      ...t,
      checkedAt: r?.at ?? null,
      flags: r?.flags ?? [],
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
  const bad = rows.filter((r) => r.flags.length && !r.flags.some((f) => f.startsWith('UNVERIFIED')))
  return {
    total: rows.length,
    checked: rows.length - never.length,
    never: never.length,
    stale: stale.length,
    unverified: unver.length,
    flaggedCount: bad.length,
    staleDays: STALE_DAYS,
    flagged: bad.map((r) => ({
      youtubeId: r.youtubeId, title: r.title, artist: r.artist,
      stationId: r.stationId, callsign: r.callsign,
      flags: r.flags, countries: r.countries, status: r.status,
      embeddable: r.embeddable, checkedAt: r.checkedAt,
    })),
    byStation: [...new Set(rows.map((r) => r.stationId))].map((id) => {
      const mine = rows.filter((r) => r.stationId === id)
      return {
        stationId: id,
        callsign: mine[0].callsign,
        total: mine.length,
        checked: mine.filter((r) => r.checkedAt).length,
        flagged: mine.filter((r) => r.flags.length && !r.flags.some((f) => f.startsWith('UNVERIFIED'))).length,
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

async function main() {
  const tracks = await rosterTracks()
  const store = loadStore()
  const prune = await pruneOrphans(store)
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
    const queue = [...tracks].sort((a, b) => {
      const ra = store.records[a.youtubeId], rb = store.records[b.youtubeId]
      if (!ra && !rb) return 0
      if (!ra) return -1
      if (!rb) return 1
      return Date.parse(ra.at) - Date.parse(rb.at)
    }).slice(0, Math.max(0, batchSize))

    if (!queue.length) say('Nothing to check.')
    else {
      say(`Checking ${queue.length} of ${tracks.length} track(s) -- least recently checked first.`)
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
        store.records[t.youtubeId] = {
          at: new Date().toISOString(),
          flags,
          status: p.status ?? null,
          countries: p.countries ?? null,
          embeddable: p.embeddable ?? null,
          seconds: p.seconds ?? null,
          title: e.title ?? t.title,
          channel: e.channel ?? null,
          stationId: t.stationId,
        }
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
    say(`  ${f.callsign.padEnd(17)} ${f.flags.join(' ').padEnd(28)} ${f.artist} -- ${f.title}`)
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
