// SIGNAL -- the thing that remembers to run check-roster.mjs.
//
// 2026-08-30. Written the day a NIN track was found licensed in three
// countries: it had been dead for almost everyone since the day it was
// added, and the ONLY reason anyone noticed is that someone happened to run
// the deep probe by hand the evening before. check-roster.mjs already knew
// how to find that class of rot. Nothing made it look.
//
// So this is deliberately not another checker. It is the scheduling and the
// speaking-up around the checker that already works:
//
//   - runs one batch, so a sweep walks the roster over days rather than
//     throttling itself in one go (see check-roster's own header)
//   - classifies the outcome, and REMEMBERS it, which is what makes "this
//     has been failing all week" a thing anybody can know
//   - speaks up only when a person is needed
//
// The rule that shaped it: A RUN THAT DID NOT FINISH MUST NEVER READ AS A
// RUN THAT FOUND NOTHING. check-roster exits 1 on real findings and 0
// otherwise -- including when it gave up early on a 429. Keying a timer on
// the exit code alone would therefore report a throttled run as a clean
// bill of health, which is the exact confusion check-roster's header exists
// to prevent, leaked one level up. This reads the --json summary's
// `throttled` flag instead, and treats it as its own outcome.
//
// Quiet on purpose. A notification that fires after every run is wallpaper
// inside a week, and wallpaper is how the original bug survived. Clean runs
// say nothing at all; a single throttled run says nothing either, because
// that is ordinary and self-correcting. It speaks when there are NEW
// confirmed findings, or when the SWEEP ITSELF has been stuck long enough
// that coverage is quietly rotting again -- and the second is judged on its
// own, whatever else the run found (2026-10-12; see bumpStreak).
//
//   node tools/roster-watch.mjs              # one batch, notify if warranted
//   node tools/roster-watch.mjs --batch=60
//   node tools/roster-watch.mjs --dry-run    # no network, no notify, no write
//   node tools/roster-watch.mjs --status     # what the last runs did
//   node tools/roster-watch.mjs --status --json   # same, for the dashboard
//
// Installed as a systemd USER timer -- see tools/signal-health.timer, which
// carries the install commands and the reasoning for its schedule.

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, renameSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { flaggedCap } from './check-roster.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
// SIGNAL_WATCH_STATE and SIGNAL_WATCH_NOTIFY_LOG are for the suite only
// (2026-10-12, audit M5), the same shape as check-roster's
// SIGNAL_HEALTH_STORE: they let tests/health-wiring.test.mjs run this script
// end to end against a scratch state file, and read what it WOULD have
// notified from a file instead of putting it on the desktop.
const STATE = process.env.SIGNAL_WATCH_STATE || path.join(here, 'roster-watch-state.json')
const NOTIFY_LOG = process.env.SIGNAL_WATCH_NOTIFY_LOG || null

const args = process.argv.slice(2)
const flag = (n, d) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const BATCH = +flag('batch', 40)
const dryRun = args.includes('--dry-run')
const statusOnly = args.includes('--status')
const asJson = args.includes('--json')

// How many runs in a row may end without finishing before that is itself
// the news. Three throttles is ~three days of a stalled sweep on the daily
// timer -- long enough that it is not a blip, short enough that coverage
// has not gone properly stale (check-roster's STALE_DAYS is 30).
const THROTTLE_STREAK = 3
// An error is a broken tool, not a busy endpoint, so it earns a person's
// attention sooner.
const ERROR_STREAK = 2
const HISTORY = 20

const emptyState = () => ({ version: 1, lastRun: null, lastOutcome: null, streak: {}, history: [], findings: null })
function loadState() {
  if (!existsSync(STATE)) return emptyState()
  try {
    const j = JSON.parse(readFileSync(STATE, 'utf8'))
    return { ...emptyState(), ...j, streak: j.streak ?? {}, history: j.history ?? [] }
  } catch { return emptyState() }
}

/** What did this run actually amount to?
 *
 *  Order matters: findings outrank an unfinished sweep, because a real flag
 *  is worth acting on whether or not the rest of the batch got through.
 *
 *  2026-10-12 (audit, M3) -- but the ORDER only picks the label. It used to
 *  pick the streak too: bumpStreak zeroed `incomplete` for any outcome but
 *  'incomplete', so with one flag on the record every throttled run was
 *  labelled findings/unconfirmed and the stall counter never left zero --
 *  six throttled days in a row, simulated, notified nothing. A flag that
 *  never clears (the live state that day) hid a stalled sweep forever,
 *  which is the exact "unfinished run reads as fine" failure this file
 *  exists to prevent. The stall is now counted from summary.throttled
 *  directly; see bumpStreak and notifications. */
export function classify({ exitCode, summary, crashed }) {
  if (crashed || !summary) return 'error'
  // 2026-09-22 -- a flag has to be seen TWICE before it wakes anyone.
  // check-roster now re-probes flagged rows first, so the second look is the
  // next run rather than ~19 days later, and a transient answer clears
  // itself before it is ever reported. The failure this fixes was real: one
  // UNPLAYABLE on a NEON STASIS track notified daily for five days while the
  // track itself had already come back, which is exactly the wallpaper this
  // tool exists to avoid. `unconfirmed` is recorded and printed; it is not
  // notified. See shouldNotify.
  if ((summary.flaggedConfirmed ?? summary.flaggedCount) > 0) return 'findings'
  if (summary.flaggedCount > 0 || exitCode === 1) return 'unconfirmed'
  if (summary.throttled) return 'incomplete'
  return 'clean'
}

/** The flagged rows that count as findings: confirmed by two spaced probes.
 *  A row without `confirmed` comes from a check-roster older than strikes and
 *  counts, for the same too-loud-beats-silent reason as classify's fallback. */
export const confirmedRows = (summary) => (summary?.flagged ?? []).filter((f) => f.confirmed !== false)
export const unconfirmedRows = (summary) => (summary?.flagged ?? []).filter((f) => f.confirmed === false)

/** Confirmed findings that were not confirmed at the last run.
 *
 *  2026-10-12 (audit, M4) -- a confirmed finding used to notify at
 *  `critical` EVERY day until it was fixed, and a track kept on purpose (an
 *  accepted narrow licence, say) would have notified forever: the wallpaper
 *  the header warns about, at the loudest urgency there is. Now a finding is
 *  news once -- the run that first confirms it -- and again only if it
 *  clears and comes back. It stays visible where a person goes to look:
 *  `--status` lists it and the dashboard's findings panel renders it from
 *  the record. `prevIds` null (no record of the last run's findings: a fresh
 *  state file or one written before this field existed) means everything is
 *  new, so an upgrade re-announces rather than swallows what is there.
 *
 *  An explicit per-track "acknowledged" mark was the alternative and was not
 *  built: notify-on-change already silences an accepted track after one
 *  notification, and an ack is a second list someone has to keep in step
 *  with the roster. If a kept track ever needs to vanish from the panel too,
 *  that is where to add it. */
export function newFindings(summary, prevIds) {
  const prev = new Set(prevIds ?? [])
  return confirmedRows(summary).map((f) => f.youtubeId).filter((id) => prevIds == null || !prev.has(id))
}

/** Does a person need to hear about this? Silence is the default.
 *  `ctx.newConfirmed` is how many confirmed findings are new this run; a
 *  caller that does not say (the pre-2026-10-12 form) gets the old answer. */
export function shouldNotify(outcome, streak, ctx = {}) {
  if (outcome === 'findings') return ctx.newConfirmed == null ? true : ctx.newConfirmed > 0
  // Deliberately silent: the next run re-probes it first and will either
  // confirm it (findings, notified) or clear it.
  if (outcome === 'unconfirmed') return false
  if (outcome === 'incomplete') return (streak.incomplete ?? 0) >= THROTTLE_STREAK
  if (outcome === 'error') return (streak.error ?? 0) >= ERROR_STREAK
  return false
}

/** Streaks count CONSECUTIVE outcomes, so anything else resets them.
 *
 *  2026-10-12 (audit, M3) -- `incomplete` counts THROTTLED RUNS, read from
 *  the summary, not runs labelled 'incomplete': a run that is labelled
 *  findings because a flag is on the record still did not finish its batch,
 *  and must still move the stall counter. Only a run that got through
 *  (or a crash, which has its own streak) resets it. */
export function bumpStreak(streak, outcome, summary) {
  const throttled = outcome === 'incomplete' || (outcome !== 'error' && summary?.throttled === true)
  return {
    incomplete: throttled ? (streak.incomplete ?? 0) + 1 : 0,
    error: outcome === 'error' ? (streak.error ?? 0) + 1 : 0,
  }
}

/** Every notification this run warrants, in order. Usually none.
 *
 *  2026-10-12 (audit, M3/M4) -- a list, because a run can warrant two: new
 *  findings AND a stalled sweep are separate news, and the second used to be
 *  impossible to reach whenever the first label won. The stall notice fires
 *  on the streak alone, whatever this run was labelled. */
export function notifications(outcome, summary, streak, prevIds) {
  const out = []
  const fresh = outcome === 'findings' ? newFindings(summary, prevIds) : []
  if (outcome === 'findings' && shouldNotify(outcome, streak, { newConfirmed: fresh.length })) {
    out.push(describe(outcome, summary, streak, { newIds: fresh }))
  }
  if (outcome === 'error' && shouldNotify(outcome, streak)) out.push(describe(outcome, summary, streak))
  if ((streak.incomplete ?? 0) >= THROTTLE_STREAK) out.push(describe('incomplete', summary, streak))
  return out
}

// How long the record may go without a run before the SCHEDULE itself is
// the thing that is broken. The timer is daily and Persistent=true, so a
// missed day is caught at the next boot; two full days without a run means
// something stopped, and nothing else would ever say so -- a disabled timer
// looks exactly like a quiet one from inside the state file.
const SCHEDULE_GRACE_DAYS = 2

/** Is the scheduled check still happening at all?
 *
 *  Separate from whether the ROSTER is healthy, and the more important of
 *  the two: a stopped checker reports a clean roster forever. This is the
 *  same class of mistake as a throttled run reading as a clean one, one
 *  level further out. */
export function scheduleHealth(state, nowMs = Date.now()) {
  if (!state || !state.lastRun) return { status: 'never', days: null }
  const days = (nowMs - Date.parse(state.lastRun)) / 86400000
  if (!Number.isFinite(days)) return { status: 'never', days: null }
  return { status: days > SCHEDULE_GRACE_DAYS ? 'late' : 'ok', days }
}

/** 2026-09-02 (audit) -- is the sweep OUTGROWING its own horizon? A full
 *  pass takes total/batch days, and the whole design only works while that
 *  stays comfortably inside check-roster's staleness horizon (30d -- read
 *  off the run summary's own staleDays, not restated here). The margin was
 *  consuming itself silently: the timer's reasoning was written at 477
 *  tracks (~12 days), the roster hit 593 (~15) without anything saying so,
 *  and at ~1,100+ tracks the sweep can no longer visit every track before
 *  it goes stale -- at which point "clean" quietly stops meaning "checked".
 *  'tight' at 70% of the horizon: loud while there is still time to raise
 *  the batch or accept a longer horizon, not after coverage already fell
 *  behind. */
//
// 2026-10-12 (audit, M4) -- `flagged` rows go to the front of every batch
// (up to check-roster's flaggedCap) and re-probing them does not advance
// the sweep, so the pass is total / (batch - flagged slots). Leaving them out
// overstated the margin by exactly the amount a bad week makes it matter.
export function sweepMargin(total, batch, horizonDays = 30, flagged = 0) {
  if (!total || !batch || !horizonDays) return null
  const flaggedSlots = Math.min(flagged ?? 0, flaggedCap(batch))
  const sweeping = batch - flaggedSlots
  const passDays = sweeping > 0 ? total / sweeping : Infinity
  return { passDays, horizonDays, batch, flaggedSlots, status: passDays > horizonDays * 0.7 ? 'tight' : 'ok' }
}

export function describe(outcome, summary, streak, { newIds } = {}) {
  const cov = summary ? `${summary.checked}/${summary.total} checked` : 'no summary'
  if (outcome === 'findings') {
    // 2026-10-12 (audit, M4) -- counts and names CONFIRMED rows only. It
    // used to say "N track(s) flagged" off flaggedCount and list the first
    // three of every flag, so a seen-once row could be one of the three
    // names in a critical notification about confirmed problems. New ones
    // first, since they are why this notification exists; the seen-once
    // rows get one line of their own.
    const fresh = new Set(newIds ?? [])
    const rows = confirmedRows(summary)
    const ordered = [...rows.filter((f) => fresh.has(f.youtubeId)), ...rows.filter((f) => !fresh.has(f.youtubeId))]
    const names = ordered.slice(0, 3)
      .map((f) => `${fresh.has(f.youtubeId) ? 'NEW ' : ''}${f.callsign}: ${f.flags.join(',')}`)
    const more = ordered.length - names.length
    const once = unconfirmedRows(summary).length
    return {
      title: `SIGNAL roster: ${rows.length} track(s) flagged` + (fresh.size && fresh.size < rows.length ? ` (${fresh.size} new)` : ''),
      body: names.join('\n') + (more > 0 ? `\n+${more} more` : '') +
        (once ? `\n(${once} more seen once, re-checking)` : '') + `\n(${cov})`,
      urgency: 'critical',
    }
  }
  if (outcome === 'unconfirmed') return {
    title: `SIGNAL roster: ${summary.flaggedCount} track(s) flagged once, re-checking next run`,
    body: summary.flagged.slice(0, 3).map((f) => `${f.callsign}: ${f.flags.join(',')}`).join('\n') + `\n(${cov})`,
    urgency: 'low',
  }
  if (outcome === 'incomplete') return {
    title: 'SIGNAL roster: the sweep is stuck',
    body: `Throttled ${streak.incomplete} run(s) in a row, so coverage is not advancing.\n${cov}`,
    urgency: 'normal',
  }
  if (outcome === 'error') return {
    title: 'SIGNAL roster: the health check is failing',
    body: `check-roster.mjs has failed ${streak.error} run(s) in a row.\nRun it by hand: npm run health`,
    urgency: 'critical',
  }
  return { title: 'SIGNAL roster: clean', body: cov, urgency: 'low' }
}

function runCheck() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['tools/check-roster.mjs', '--json', `--batch=${BATCH}`], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = '', err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', () => resolve({ crashed: true, exitCode: -1, summary: null, stderr: 'spawn failed' }))
    child.on('close', (code) => {
      let summary = null
      try { summary = JSON.parse(out.trim()) } catch {}
      // exit 2 is check-roster's own crash path; anything unparseable is a
      // crash from here regardless of what it exited with.
      resolve({ crashed: code === 2 || !summary, exitCode: code, summary, stderr: err })
    })
  })
}

function notify({ title, body, urgency }) {
  if (NOTIFY_LOG) {
    writeFileSync(NOTIFY_LOG, JSON.stringify({ title, body, urgency }) + '\n', { flag: 'a' })
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    const child = spawn('notify-send', ['-a', 'SIGNAL', '-u', urgency, title, body], { stdio: 'ignore' })
    child.on('error', () => resolve(false))   // no desktop session: not an error
    child.on('close', () => resolve(true))
  })
}

async function main() {
  const state = loadState()

  if (statusOnly && asJson) {
    // Spawned by tools/admin-server.mjs. Same discipline every other tool
    // here follows: --json owns stdout and there is ONE code path, so the
    // dashboard and the terminal cannot disagree about what a run did.
    const sched = scheduleHealth(state)
    const last = state.history[state.history.length - 1]
    process.stdout.write(JSON.stringify({
      lastRun: state.lastRun, lastOutcome: state.lastOutcome,
      streak: state.streak, history: state.history,
      schedule: sched.status, daysSinceRun: sched.days,
      graceDays: SCHEDULE_GRACE_DAYS,
      // Confirmed findings as of the last run -- notified once, listed here
      // for as long as they last (2026-10-12).
      findings: state.findings ?? [],
      margin: last ? sweepMargin(last.total, BATCH, last.staleDays, last.flagged) : null,
    }))
    return
  }

  if (statusOnly) {
    const sched = scheduleHealth(state)
    console.log(`schedule : ${sched.status}${sched.days != null ? ` (${sched.days.toFixed(1)}d since last run)` : ''}`)
    console.log(`last run : ${state.lastRun ?? 'never'}`)
    console.log(`outcome  : ${state.lastOutcome ?? '-'}`)
    console.log(`streaks  : ${JSON.stringify(state.streak)}`)
    // The one place a confirmed finding stays loud after its one
    // notification (2026-10-12) -- that, and the dashboard's panel.
    const findings = state.findings ?? []
    console.log(`findings : ${findings.length ? `${findings.length} confirmed` : 'none confirmed'}`)
    for (const f of findings) console.log(`  ${String(f.callsign).padEnd(17)} ${f.youtubeId}  ${(f.flags ?? []).join(' ')}`)
    const lastEntry = state.history[state.history.length - 1]
    const margin = lastEntry ? sweepMargin(lastEntry.total, BATCH, lastEntry.staleDays, lastEntry.flagged) : null
    if (margin) console.log(`margin   : full pass ~${margin.passDays.toFixed(0)}d at batch ${margin.batch}${margin.flaggedSlots ? ` (${margin.flaggedSlots} slot(s) re-probing flags)` : ''}, horizon ${margin.horizonDays}d -- ${margin.status === 'tight' ? 'TIGHT, raise the batch or the horizon' : 'ok'}`)
    console.log('history  :')
    for (const h of state.history.slice(-10)) {
      console.log(`  ${h.at}  ${String(h.outcome).padEnd(10)} ${h.checked}/${h.total} checked, ${h.flagged} flagged`)
    }
    return
  }

  if (dryRun) {
    // Deliberately no network and no writes: this exercises the wiring and
    // the message, which is the half that is awkward to check any other way.
    for (const outcome of ['clean', 'findings', 'unconfirmed', 'incomplete', 'error']) {
      const fake = {
        // Deliberately round SYNTHETIC numbers -- this fixture used to
        // carry a real roster size (477) that went stale within a week of
        // being written, and a dry run that prints a plausible-but-old
        // count reads as a tool that is wrong rather than one rehearsing.
        total: 1000, checked: 900, throttled: outcome === 'incomplete',
        flaggedCount: outcome === 'findings' ? 2 : outcome === 'unconfirmed' ? 1 : 0,
        flaggedConfirmed: outcome === 'findings' ? 2 : 0,
        flagged: outcome === 'findings'
          ? [{ youtubeId: 'aaaaaaaaaaa', callsign: 'NINE INCH NAILS', flags: ['NARROW-LICENCE:3'], confirmed: true },
            { youtubeId: 'bbbbbbbbbbb', callsign: 'CIPHER', flags: ['LOGIN_REQUIRED'], confirmed: true }]
          : outcome === 'unconfirmed'
            ? [{ youtubeId: 'ccccccccccc', callsign: 'NEON STASIS', flags: ['UNPLAYABLE'], confirmed: false }]
            : [],
      }
      const streak = { incomplete: outcome === 'incomplete' ? 3 : 0, error: outcome === 'error' ? 2 : 0 }
      // Rehearsed as the run that first confirms them: one is new.
      const notes = notifications(outcome, fake, streak, ['bbbbbbbbbbb'])
      const d = notes[0] ?? describe(outcome, fake, streak)
      console.log(`--- ${outcome}  (would notify: ${notes.length > 0})`)
      console.log(`    ${d.title}`)
      for (const line of d.body.split('\n')) console.log(`    ${line}`)
    }
    return
  }

  const res = await runCheck()
  const outcome = classify(res)
  const streak = bumpStreak(state.streak, outcome, res.summary)
  // What the previous run had confirmed; null when this state file has
  // never recorded it, which newFindings() reads as "all of it is new".
  const prevIds = Array.isArray(state.findings) ? state.findings.map((f) => f.youtubeId) : null
  const notes = notifications(outcome, res.summary, streak, prevIds)
  // A crashed run learned nothing about the roster, so it keeps the last
  // known findings rather than forgetting them (which would re-announce
  // every one of them the run after).
  const findings = res.summary
    ? confirmedRows(res.summary).map((f) => ({ youtubeId: f.youtubeId, callsign: f.callsign, flags: f.flags }))
    : state.findings
  const entry = {
    at: new Date().toISOString(),
    outcome,
    checked: res.summary?.checked ?? 0,
    total: res.summary?.total ?? 0,
    flagged: res.summary?.flaggedCount ?? 0,
    confirmed: res.summary ? confirmedRows(res.summary).length : undefined,
    throttled: res.summary?.throttled === true,
    // The horizon the run itself was measured against, for sweepMargin() --
    // check-roster's summary carries its own STALE_DAYS, so the margin math
    // here can never disagree with the tool that owns the number. Old
    // entries without the field fall back to sweepMargin's default.
    staleDays: res.summary?.staleDays,
  }
  // 2026-09-02 (audit, L9) -- temp + rename, so a crash mid-write cannot
  // truncate the state file. loadState() fails soft to empty, which sounds
  // harmless until you notice what empties WITH it: the streaks, which are
  // the notification trigger -- a corrupted state file silently reset the
  // "stalled sweep" and "broken checker" counters to zero.
  const tmp = `${STATE}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify({
    version: 1,
    lastRun: entry.at,
    lastOutcome: outcome,
    streak,
    findings: findings ?? null,
    history: [...state.history, entry].slice(-HISTORY),
  }, null, 2) + '\n')
  renameSync(tmp, STATE)

  const d = notes[0] ?? describe(outcome, res.summary, streak)
  console.error(`${outcome.toUpperCase()}: ${d.title}`)
  if (outcome === 'findings' && !notes.some((n) => n.urgency === 'critical')) {
    console.error('  (no new confirmed findings since the last run -- not notified; see --status)')
  }
  if (res.stderr.trim()) console.error(res.stderr.trim())
  // A journal line, not a notification: the margin tightens over weeks of
  // curation, not overnight, and --status shows it on demand -- the rule
  // this tool exists for is that daily noise becomes wallpaper.
  const margin = sweepMargin(entry.total, BATCH, entry.staleDays, entry.flagged)
  if (margin && margin.status === 'tight') {
    console.error(`MARGIN: a full pass now takes ~${margin.passDays.toFixed(0)}d at batch ${BATCH}, against a ${margin.horizonDays}d staleness horizon -- raise the batch or the horizon before coverage falls behind.`)
  }
  for (const n of notes) await notify(n)

  // systemd records this. 'incomplete' is NOT a failure -- the sweep will
  // pick up where it left off -- but it is not success either, so it does
  // not get to look like a clean run in `systemctl --user status`.
  if (outcome === 'findings') process.exitCode = 1
  else if (outcome === 'error') process.exitCode = 2
}

// Importable without running anything.
//
// 2026-09-13 (audit, L10) -- this was an OPT-OUT, `SIGNAL_ROSTER_WATCH_IMPORT`,
// so any import that did not know to set it ran a real batch: 40 watch-page
// probes, a rewritten roster-health.json and a new state file. An audit
// agent did exactly that to read sweepMargin(). Now main() runs only when
// this file IS the script node was started with; realpath because node
// resolves a symlinked entry before it becomes import.meta.url.
const isEntryScript = (() => {
  try { return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href } catch { return false }
})()
if (isEntryScript) await main()
