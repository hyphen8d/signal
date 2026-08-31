// SIGNAL -- the session summary.
//
// What this answers: which stations people actually listen to, for how long,
// and whether the features that were built ever get found. Nothing else.
//
// This file is the PURE half, split from the sending the same way weather.js
// is split from ui/weather.js, and for the same reason: a drawing bug is
// visible the moment you look at the screen, and a counting bug produces a
// number that is wrong and entirely plausible. Everything here is a function
// of its arguments -- no clock of its own, no globals, no network -- so the
// rounding and bucketing can be tested in Node. program.js owns the one
// sendBeacon call and the visibilitychange listener.
//
// WHAT IS DELIBERATELY NOT IN THE PAYLOAD, and must not be added without a
// very good reason, because each one changes what this is:
//
//   * No identifier of any kind. No session id, no visitor id, no cookie,
//     nothing written to localStorage. Two visits from the same browser are
//     unjoinable by construction, which is the property that makes the rest
//     of it defensible -- and the property a "just to dedupe" id destroys.
//   * No timestamps. Durations only. A wall-clock time of day is a location
//     hint and a schedule; a duration is neither.
//   * No track ids. Station-level is what curation decisions are made at.
//     Track-level would be a listening history, which is a different and much
//     more sensitive object.
//   * No ordering and no counts in `used`. A sorted set of feature names
//     cannot become a behavioural fingerprint the way an event sequence can.
//
// PRIVACY.md is the published version of this list. The two are meant to
// agree; if you change the payload, change that file in the same commit.

/** Bumped when the payload's SHAPE changes, so the collector can refuse a
 *  record it would otherwise mis-aggregate. Not the build stamp -- that
 *  rides along separately as `v` and moves on every deploy. */
export const SCHEMA_VERSION = 1

/** Under this, the visit sends nothing at all. A few seconds carries no
 *  information worth a network request, and the sub-minute population is
 *  mostly link previews, scrapers and people who bounced before the boot
 *  sequence finished -- none of whom are the listeners this is asking about. */
export const MIN_SESSION_MS = 60 * 1000

/** Per-station listening rounds to the nearest MINUTE, the session total to
 *  the nearest FIVE. They are deliberately different and deliberately do not
 *  sum, which is worth understanding before "fixing" it:
 *
 *    - The station figure feeds a SHARE across many sessions, so it has to be
 *      unbiased. Rounding to the nearest minute is; rounding to 5 and dropping
 *      what falls to zero is not -- it would systematically delete short
 *      listens and quietly overstate whichever stations people settle on.
 *    - The session total is a coarse "how long was the set on" and covers time
 *      that no station was locked (STANDBY, tuning between stations), so it is
 *      a different span, not a sum of the parts. Five-minute buckets keep the
 *      most re-identifiable single number in the payload blunt. */
const STATION_ROUND_MS = 60 * 1000
const SESSION_ROUND_MS = 5 * 60 * 1000

// There is deliberately NO separate floor for "too brief to count". One was
// written, set to 30s, and removed the same day: rounding to the nearest
// minute already drops everything under 30s, so a floor at that value could
// never fire, and a floor above it would start deleting real listening. The
// mutation pass is what found it -- taking the constant out left the suite
// green, which is the definition of a guard that was not guarding anything.
// A scan sweep is handled by the rounding for free: it crosses each station
// in well under half a minute, while a human who lingers 45 seconds on a
// frequency is listening, and should count.

/** A hard cap on distinct feature names, so a future caller looping over
 *  something unbounded cannot turn `used` into a high-entropy field. */
const MAX_FEATURES = 40

export function createSession({ build = 'unknown', mode = 'desktop', startedAt = 0 } = {}) {
  return {
    build,
    mode,
    startedAt,
    // The station currently accruing time, and since when. Time is banked
    // into `stations` on every transition rather than sampled per frame:
    // frame() does not run in a backgrounded tab, and a sampler there would
    // undercount exactly the "left it on while working" sessions the README's
    // whole thesis is about.
    current: null,
    // null, never 0, when nothing is accruing. The fake clock in
    // tests/harness.mjs genuinely starts at 0, so a falsy check here would
    // discard the first station of every test session and of any real
    // session unlucky enough to start on an exact epoch boundary. Found by
    // the first smoke test of this file, which silently lost ten minutes.
    currentSince: null,
    stations: new Map(),
    used: new Set(),
    consent: {},
    failures: 0,
  }
}

/** Bank whatever the current station has accrued, and start the clock on a
 *  new one. Pass null for "nothing is locked now" -- power off, or tuning
 *  away into the band. Idempotent for the same station, so a re-lock in place
 *  neither double-counts nor resets. */
export function noteStation(sess, stationId, now) {
  if (!sess) return
  if (sess.current === stationId) return
  bank(sess, now)
  sess.current = stationId || null
  sess.currentSince = stationId ? now : null
}

function bank(sess, now) {
  if (!sess.current || sess.currentSince === null) return
  const dt = Math.max(0, now - sess.currentSince)
  sess.stations.set(sess.current, (sess.stations.get(sess.current) || 0) + dt)
  sess.currentSince = now
}

/** A feature was reached. Names are a closed vocabulary (see FEATURES below)
 *  so the field cannot grow unbounded from a caller's local variable. */
export function noteFeature(sess, name) {
  if (!sess || !name) return
  if (sess.used.size >= MAX_FEATURES && !sess.used.has(name)) return
  sess.used.add(name)
}

/** 'tap' | 'weather' -> 'yes' | 'no'. The accept rate on the two consent
 *  cards is the only way to know whether those features exist for anybody. */
export function noteConsent(sess, kind, answer) {
  if (!sess || (answer !== 'yes' && answer !== 'no')) return
  sess.consent[kind] = answer
}

/** A track failed to play. Counted because a dead or region-locked upload
 *  shows up here days before anyone files an issue about it -- which pairs
 *  with the daily health sweep rather than duplicating it: that one asks
 *  YouTube, this one reports what listeners actually hit. */
export function noteFailure(sess) {
  if (!sess) return
  sess.failures++
}

/** The names program.js is allowed to pass to noteFeature(). Exported so the
 *  test can assert the wiring only ever uses these -- a typo'd name would
 *  otherwise be invisible, arriving at the collector as a real-looking
 *  feature nobody ever finds. */
export const FEATURES = Object.freeze([
  'scan', 'preset', 'seek', 'back',
  // No 'visualizer-idle': the idle auto-entry was retired 2026-08-30 and
  // [V] is now the only way in on desktop, so there is no second trigger to
  // tell apart. If it ever comes back, this is where the split goes.
  'visualizer', 'effect', 'lyrics',
  'weather', 'sleep', 'guide', 'mute', 'colour', 'fullscreen', 'tap',
  // The two deliberately undocumented things. Counting them is the only way
  // to find out whether hiding them worked or worked too well; the payload
  // says a secret was reached, never which one.
  'secret-station', 'game',
])

/** Key -> feature name, for the single hook in program.js's key(). Keyed on
 *  the lowercased e.key.
 *
 *  One map rather than a noteFeature() call scattered through twelve case
 *  branches: the scattered version is the shape that drifts, exactly the way
 *  isMappedKey() drifted out of sync with key() for four passes. It hangs off
 *  the isMappedKey() gate, so it counts a key this build treats as a command
 *  in the current mode -- and it counts the PRESS, not the effect. Pressing
 *  [L] where there are no lyrics still means the listener found the lyrics
 *  key, which is the question being asked; whether it then had anything to
 *  say is what NO LYRICS AVAILABLE is for.
 *
 *  Volume and Enter are absent on purpose. Neither is a feature anyone can
 *  fail to find, so counting them would add noise and entropy for nothing. */
export const KEY_FEATURES = Object.freeze({
  s: 'scan', b: 'back', l: 'lyrics', w: 'weather', t: 'sleep',
  g: 'guide', m: 'mute', c: 'colour', f: 'fullscreen', a: 'tap',
  arrowleft: 'seek', arrowright: 'seek',
  1: 'preset', 2: 'preset', 3: 'preset', 4: 'preset', 5: 'preset',
  6: 'preset', 7: 'preset', 8: 'preset', 9: 'preset',
  // The two secret-station keys. The payload records that a secret was
  // reached, never which one -- see featureForKey().
  0: 'secret-station', ')': 'secret-station',
})

/** The feature a keypress means, or null. Case-folded here rather than at the
 *  call site so the one caller cannot get it subtly wrong. */
export function featureForKey(key) {
  if (typeof key !== 'string') return null
  return KEY_FEATURES[key.toLowerCase()] ?? null
}

/** Build the record, or null if this visit should not report at all.
 *  Returning null rather than an empty object is deliberate: the caller's
 *  only job is then `if (!summary) return`, with no second rule about what
 *  counts as empty. */
export function buildSummary(sess, now) {
  if (!sess) return null
  bank(sess, now)
  const elapsed = Math.max(0, now - sess.startedAt)
  if (elapsed < MIN_SESSION_MS) return null

  const stations = {}
  for (const [id, ms] of sess.stations) {
    const mins = Math.round(ms / STATION_ROUND_MS)
    if (mins > 0) stations[id] = mins
  }

  const out = {
    s: SCHEMA_VERSION,
    v: sess.build,
    mode: sess.mode,
    mins: Math.round(elapsed / SESSION_ROUND_MS) * 5,
    stations,
    // Sorted so the field has no ordering information in it at all, and so
    // two identical sessions serialise identically.
    used: [...sess.used].sort(),
  }
  if (Object.keys(sess.consent).length) out.consent = { ...sess.consent }
  if (sess.failures) out.failures = sess.failures
  return out
}

/** Whether this visit may report, given the endpoint config and the visitor's
 *  own signals. Pure and separated from the send so it is testable without a
 *  browser -- the guard is the part that must never quietly stop working.
 *
 *  An unset endpoint is the DEFAULT and means the whole feature is off: no
 *  listener attached, no beacon, no request. Shipping it dark is deliberate,
 *  so that merging this collects nothing anywhere until a collector exists
 *  and someone deliberately points at it.
 *
 *  Global Privacy Control is honoured as an opt-out because it is the signal
 *  a person actually sets, and because a set that already asks before it
 *  listens to your microphone or looks up where you are should not need to be
 *  argued into respecting it. navigator.doNotTrack is checked too -- largely
 *  vestigial, effectively free to support. */
export function shouldSend(nav, endpoint) {
  if (!endpoint) return false
  if (!nav) return false
  if (nav.globalPrivacyControl === true) return false
  if (nav.doNotTrack === '1' || nav.doNotTrack === 'yes') return false
  if (typeof nav.sendBeacon !== 'function') return false
  return true
}
