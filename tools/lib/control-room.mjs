// SIGNAL network ops -- the control room's pure half (2026-11-02).
//
// tools/network.html dresses the dashboard as a radio network's master
// control room: an ON AIR lamp, a programme meter that moves with a task's
// output, a suite readout, and SHIP as a transmitter key you hold down. The
// parts of that with a rule in them -- when a held key fires, how the meter
// rises and falls, what a suite line counts as, what the lamp says -- live
// here as plain functions, so tests/control-room.test.mjs can hold them
// without a browser. Same split as weather.js / ui/weather.js: a drawing bug
// shows the moment you look; a key that fires on a tap does not, until the
// day it ships something.
//
// Imported by the PAGE (served under the tools/lib/*.mjs allowlist rule), so
// like roster.mjs it has no node: imports. Add one and the dashboard's
// module script never runs.

// ---- the transmitter key -------------------------------------------------
// SHIP is minutes of stamp/lint/suite and then a push to production. A click
// is the cheapest gesture a page has, and it is the one a stray Enter in the
// commit-message box or a double-click on the wrong panel produces. Holding
// a key for 1.2s is not: it is long enough that nobody does it by accident
// and short enough that it costs nothing when meant. What the hold does NOT
// do is replace anything -- the page still asks its two confirm()s and the
// server still refuses on every blocker; this only makes the reach for the
// button deliberate. That ordering is the whole contract (CLAUDE.md, admin
// backend): the key is in FRONT of the confirmations, never instead of them.
export const TX_HOLD_MS = 1200

/** A hold-to-fire key, clocked by whatever `t` the caller passes (ms).
 *  press() starts a hold (a repeat while held is ignored -- keydown
 *  auto-repeats); tick() returns true exactly once, the moment a hold
 *  completes; release() ends a hold and says how: 'fired' if it had
 *  completed (including a completion no tick saw -- a starved frame loop
 *  must not turn a full hold into a cancel), 'cancelled' if it had not,
 *  null if nothing was held. A key that has fired stays fired until
 *  reset(): one hold, one transmission. */
export function createHoldKey(holdMs = TX_HOLD_MS) {
  let downAt = null
  let fired = false
  return {
    get holding() { return downAt != null },
    get fired() { return fired },
    press(t) {
      if (downAt != null || fired) return false
      downAt = t
      return true
    },
    progress(t) {
      if (fired) return 1
      if (downAt == null) return 0
      return Math.max(0, Math.min(1, (t - downAt) / holdMs))
    },
    tick(t) {
      if (downAt == null || fired || t - downAt < holdMs) return false
      fired = true
      downAt = null
      return true
    },
    release(t) {
      if (downAt == null) return null
      const done = t - downAt >= holdMs
      downAt = null
      if (done) { fired = true; return 'fired' }
      return 'cancelled'
    },
    reset() { downAt = null; fired = false },
  }
}

// ---- the programme meter --------------------------------------------------
// Driven by the one honest signal a streamed task gives off: how fast its
// output arrives. Not a progress bar -- a line rate says "something is
// talking", nothing about how far along it is -- which is exactly what a VU
// needle says about a programme, and why a meter is the right instrument
// and a bar would have been a lie.

/** Lines that arrived in the last `windowMs`, per second. `stamps` is any
 *  array of arrival times (ms); the caller trims it. */
export function lineRate(stamps, now, windowMs = 500) {
  let n = 0
  for (let i = stamps.length - 1; i >= 0 && now - stamps[i] <= windowMs; i--) n++
  return n * 1000 / windowMs
}

/** Line rate -> needle target in 0..1. Logarithmic, like a meter's dB
 *  scale: a lint run emitting 10 lines/s and a suite emitting 200 should
 *  both visibly move it, and a linear scale pins the second and leaves the
 *  first on the stop. FULL is roughly the suite in full flow. */
export const VU_FULL_RATE = 240
export function vuTarget(linesPerSec) {
  if (!(linesPerSec > 0)) return 0
  return Math.min(1, Math.log10(1 + linesPerSec) / Math.log10(1 + VU_FULL_RATE))
}

/** One frame of meter ballistics: a fast attack and a slow release, the
 *  way a PPM rides a programme (and the way the app's own audio tap
 *  smooths levels). Frame-rate independent -- `dtMs` is the real gap. */
export function vuStep(level, target, dtMs, attackMs = 45, releaseMs = 650) {
  const tau = target > level ? attackMs : releaseMs
  return level + (target - level) * (1 - Math.exp(-Math.max(0, dtMs) / tau))
}

/** How many of `segments` are lit for a level, and which colour zone the
 *  top one is in -- green to 70%, amber to 88%, red above, as a meter
 *  bridge is painted. */
export function vuSegments(level, segments = 24) {
  const lit = Math.round(Math.max(0, Math.min(1, level)) * segments)
  return { lit, zone: (i) => (i / segments < 0.7 ? 'g' : i / segments < 0.88 ? 'a' : 'r') }
}

// ---- the suite readout ----------------------------------------------------
// A real count, against a real reference: each finished test is one line
// the runner prints at column 0 (✔ pass, ✖ fail, ﹣ skip/todo -- the spec
// reporter node --test uses when piped), and the reference is the count
// the LAST complete run reached, counted the same way and remembered by
// the page. So "~412/1180" means 412 tests have actually finished and the
// last run had 1180; the tilde is there because the suite may have grown
// or shrunk since. With no previous run there is no denominator and the
// readout says only what has happened. No timer, no guess.
//
// The runner's end-of-run summary re-prints every failure ("✖ failing
// tests:" then each one again), so counting stops at the summary's first
// `ℹ` line -- otherwise every failure counts twice.
export function createSuiteCounter() {
  let passed = 0, failed = 0, skipped = 0, closed = false, total = null
  return {
    feed(line) {
      const s = String(line ?? '')
      if (closed) return false
      if (/^ℹ /.test(s)) { closed = true; total = passed + failed + skipped; return false }
      if (s.startsWith('✔ ')) { passed++; return true }
      if (s.startsWith('✖ ')) { failed++; return true }
      if (s.startsWith('﹣ ')) { skipped++; return true }
      return false
    },
    get done() { return passed + failed + skipped },
    get passed() { return passed },
    get failed() { return failed },
    /** The finished run's count, or null if the summary never arrived (a
     *  killed or crashed run is no reference for the next one). */
    get total() { return total },
  }
}

/** -> { frac: 0..1 | null, text } for a suite in flight. `frac` is null
 *  when there is nothing honest to divide by. It stops at 0.99 while
 *  running: past the old total it is still not done. */
export function suiteReadout(done, failed, prevTotal, finished = false) {
  const fails = failed ? ` · ${failed} FAIL` : ''
  if (finished) return { frac: 1, text: `${done} tests${fails}` }
  if (!(prevTotal > 0)) return { frac: null, text: `${done} done${fails}` }
  const frac = Math.min(0.99, done / prevTotal)
  return { frac, text: `~${done}/${prevTotal}${fails}` }
}

// ---- the ON AIR lamp ------------------------------------------------------
/** /api/on-air's answer -> what the lamp says under itself. The server's
 *  own lock names its holder in prose ('SHIP', 'task "lint"', 'a track
 *  save'); a health batch from outside the server has only a pid. */
export function onAirCaption(s) {
  if (!s || !s.onAir) return 'off air'
  if (s.busy) return String(s.busy).replace(/^(a|an) /, '').replace(/"/g, '')
  if (s.healthBatch) return `health batch · pid ${s.healthBatch}`
  return 'on air'
}

// ---- the transmitter sequence --------------------------------------------
/** SHIP's steps as lamps, in the order the server runs them. Keyed by the
 *  task names the server streams (`step`/`step-done` events carry them),
 *  so a lamp lights from the server's own word rather than from the page's
 *  guess at where it has got to. */
export function txLamps(includeNetwork = false) {
  return [
    ['stamp', 'STAMP'],
    ['stations', 'STATIONS'],
    ['lint', 'LINT'],
    ['test', 'SUITE'],
    ...(includeNetwork ? [['verify', 'VERIFY']] : []),
    ['staging', 'ADD'],
    ['committing', 'COMMIT'],
    ['pushing', 'PUSH'],
  ]
}
