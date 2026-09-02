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
// that is ordinary and self-correcting. It speaks when there are findings,
// or when the SWEEP ITSELF has been stuck long enough that coverage is
// quietly rotting again.
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
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const STATE = path.join(here, 'roster-watch-state.json')

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

const emptyState = () => ({ version: 1, lastRun: null, lastOutcome: null, streak: {}, history: [] })
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
 *  is worth acting on whether or not the rest of the batch got through. */
export function classify({ exitCode, summary, crashed }) {
  if (crashed || !summary) return 'error'
  if (summary.flaggedCount > 0 || exitCode === 1) return 'findings'
  if (summary.throttled) return 'incomplete'
  return 'clean'
}

/** Does a person need to hear about this? Silence is the default. */
export function shouldNotify(outcome, streak) {
  if (outcome === 'findings') return true
  if (outcome === 'incomplete') return (streak.incomplete ?? 0) >= THROTTLE_STREAK
  if (outcome === 'error') return (streak.error ?? 0) >= ERROR_STREAK
  return false
}

/** Streaks count CONSECUTIVE outcomes, so anything else resets them. */
export function bumpStreak(streak, outcome) {
  const next = {}
  for (const k of ['incomplete', 'error']) next[k] = k === outcome ? (streak[k] ?? 0) + 1 : 0
  return next
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
export function sweepMargin(total, batch, horizonDays = 30) {
  if (!total || !batch || !horizonDays) return null
  const passDays = total / batch
  return { passDays, horizonDays, batch, status: passDays > horizonDays * 0.7 ? 'tight' : 'ok' }
}

export function describe(outcome, summary, streak) {
  const cov = summary ? `${summary.checked}/${summary.total} checked` : 'no summary'
  if (outcome === 'findings') {
    const names = summary.flagged.slice(0, 3)
      .map((f) => `${f.callsign}: ${f.flags.join(',')}`)
    const more = summary.flagged.length - names.length
    return {
      title: `SIGNAL roster: ${summary.flaggedCount} track(s) flagged`,
      body: names.join('\n') + (more > 0 ? `\n+${more} more` : '') + `\n(${cov})`,
      urgency: 'critical',
    }
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
      margin: last ? sweepMargin(last.total, BATCH, last.staleDays) : null,
    }))
    return
  }

  if (statusOnly) {
    const sched = scheduleHealth(state)
    console.log(`schedule : ${sched.status}${sched.days != null ? ` (${sched.days.toFixed(1)}d since last run)` : ''}`)
    console.log(`last run : ${state.lastRun ?? 'never'}`)
    console.log(`outcome  : ${state.lastOutcome ?? '-'}`)
    console.log(`streaks  : ${JSON.stringify(state.streak)}`)
    const lastEntry = state.history[state.history.length - 1]
    const margin = lastEntry ? sweepMargin(lastEntry.total, BATCH, lastEntry.staleDays) : null
    if (margin) console.log(`margin   : full pass ~${margin.passDays.toFixed(0)}d at batch ${margin.batch}, horizon ${margin.horizonDays}d -- ${margin.status === 'tight' ? 'TIGHT, raise the batch or the horizon' : 'ok'}`)
    console.log('history  :')
    for (const h of state.history.slice(-10)) {
      console.log(`  ${h.at}  ${String(h.outcome).padEnd(10)} ${h.checked}/${h.total} checked, ${h.flagged} flagged`)
    }
    return
  }

  if (dryRun) {
    // Deliberately no network and no writes: this exercises the wiring and
    // the message, which is the half that is awkward to check any other way.
    for (const outcome of ['clean', 'findings', 'incomplete', 'error']) {
      const fake = {
        // Deliberately round SYNTHETIC numbers -- this fixture used to
        // carry a real roster size (477) that went stale within a week of
        // being written, and a dry run that prints a plausible-but-old
        // count reads as a tool that is wrong rather than one rehearsing.
        total: 1000, checked: 900, throttled: outcome === 'incomplete',
        flaggedCount: outcome === 'findings' ? 2 : 0,
        flagged: outcome === 'findings'
          ? [{ callsign: 'NINE INCH NAILS', flags: ['NARROW-LICENCE:3'] }, { callsign: 'CIPHER', flags: ['LOGIN_REQUIRED'] }]
          : [],
      }
      const streak = { incomplete: 3, error: 2 }
      const d = describe(outcome, fake, streak)
      console.log(`--- ${outcome}  (would notify: ${shouldNotify(outcome, streak)})`)
      console.log(`    ${d.title}`)
      for (const line of d.body.split('\n')) console.log(`    ${line}`)
    }
    return
  }

  const res = await runCheck()
  const outcome = classify(res)
  const streak = bumpStreak(state.streak, outcome)
  const entry = {
    at: new Date().toISOString(),
    outcome,
    checked: res.summary?.checked ?? 0,
    total: res.summary?.total ?? 0,
    flagged: res.summary?.flaggedCount ?? 0,
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
    history: [...state.history, entry].slice(-HISTORY),
  }, null, 2) + '\n')
  renameSync(tmp, STATE)

  const d = describe(outcome, res.summary, streak)
  console.error(`${outcome.toUpperCase()}: ${d.title}`)
  if (res.stderr.trim()) console.error(res.stderr.trim())
  // A journal line, not a notification: the margin tightens over weeks of
  // curation, not overnight, and --status shows it on demand -- the rule
  // this tool exists for is that daily noise becomes wallpaper.
  const margin = sweepMargin(entry.total, BATCH, entry.staleDays)
  if (margin && margin.status === 'tight') {
    console.error(`MARGIN: a full pass now takes ~${margin.passDays.toFixed(0)}d at batch ${BATCH}, against a ${margin.horizonDays}d staleness horizon -- raise the batch or the horizon before coverage falls behind.`)
  }
  if (shouldNotify(outcome, streak)) await notify(d)

  // systemd records this. 'incomplete' is NOT a failure -- the sweep will
  // pick up where it left off -- but it is not success either, so it does
  // not get to look like a clean run in `systemctl --user status`.
  if (outcome === 'findings') process.exitCode = 1
  else if (outcome === 'error') process.exitCode = 2
}

// Importable for tests without running anything.
if (!process.env.SIGNAL_ROSTER_WATCH_IMPORT) await main()
