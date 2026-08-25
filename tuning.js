// SIGNAL -- the tuning model: the band, lock/near thresholds, seek/scan
// steps, frequency<->dial-column mapping, the three nearest-station
// questions, and the shuffle bag. Split out of program.js in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { DIAL_X0, DIAL_X1 } = await import(`./layout.js?v=${V}`)
const { SECRET_STATIONS, STATIONS } = await import(`./stations.js?v=${V}`)


// A wide, irregular fictional band -- not the real 88-108 FM range, and not
// clean tenths like real station assignments, on purpose (8/20: the old
// range read as too close to an actual FM dial).
export const FREQ_MIN = 100.0
export const FREQ_MAX = 900.0
// Scaled up ~40x from the old 88-108 tuning feel (20-wide band -> 800-wide).
export const LOCK_THRESHOLD = 6
export const NEAR_THRESHOLD = 24
// BUG FIXED 2026-08-20: these move distances were left at their old
// 88-108-band values (0.2 / 0.15) after the band widened 40x, so seeking
// and scanning crawled across the new range at the old range's pace --
// this, not the layout, was why arrow keys felt pointless and scanning
// felt broken. Scaled to match the thresholds above.
export const SEEK_STEP = 8
export const SCAN_STEP = 6
// 36th pass: re-locking onto a station previously resumed a different song
// every time, when a real broadcast would still be on the same song, just
// further along. Flat-cutoff fix: tryLock() remembers, per station, the
// track and position playing when you last left it. Re-locking onto that
// station within this window resumes the same track (seeked forward by
// however long you were away) instead of drawing a fresh one from the
// shuffle bag; past the window it's treated as a real gap and draws
// normally. Deliberately flat rather than duration-aware -- simpler, and
// "gone a while -> different song" is close enough to real radio without
// simulating each station's timeline continuously in the background.
export const RESUME_CUTOFF_MS = 3 * 60 * 1000

// 54th pass -- how long the warm-up drift wobbles the displayed freq/dial
// cursor after power-on before settling flat. See powerUp()'s REVEAL_DELAY
// beat (sets this._warmupUntil) and frame() (reads/decays it).
export const WARMUP_MS = 2200

// Visualizer (43rd/44th pass) -- a music screensaver shown when idle for
// awhile or when toggled; renamed from "screensaver" the same pass it
// shipped, since that name broke immersion a bit. 4:20 is a fixed pick, not
// a default worth second-guessing. Only ever armed while locked and playing
// -- see frame()'s idle check -- so there's nothing to idle into while
// seeking or scanning.
export const VISUALIZER_IDLE_MS = 4 * 60 * 1000 + 20 * 1000


export function freqToCol(f) {
  const pct = (f - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)
  return Math.round(DIAL_X0 + pct * (DIAL_X1 - DIAL_X0))
}
export function colToFreq(col) {
  const pct = (col - DIAL_X0) / (DIAL_X1 - DIAL_X0)
  return FREQ_MIN + pct * (FREQ_MAX - FREQ_MIN)
}
export function clampFreq(f) { return Math.min(FREQ_MAX, Math.max(FREQ_MIN, f)) }
// 41st pass: dial columns holding a station marker, computed once (station
// frequencies never change at runtime). frame()'s seek shimmer skips these
// so it stops erasing the markers -- see the bug note there. Declared HERE
// rather than up with STATION_PRESET_ORDER because freqToCol() reads
// DIAL_X0/DIAL_X1, which are const declarations further down the file:
// evaluating this any earlier throws a temporal-dead-zone ReferenceError and
// takes the whole module out. The secret station is deliberately absent --
// it has no marker to protect, and reserving its column would carve a
// permanently shimmer-free notch in the dial at 777.7, exactly the kind of
// tell a hidden station should not have.
export const STATION_COLS = new Set(STATIONS.map((ch) => freqToCol(ch.freq)))
// 2026-08-22 -- made it possible to lock into the station
// using the tuner by going to 777.7 even though it is a "hidden" station
// -- includes SECRET_STATIONS alongside STATIONS, so seeking/dragging/
// scanning the dial onto 777.7 can land and lock on it same as any real
// preset. It's still "hidden" in every other sense: not in
// STATION_PRESET_ORDER, so it never appears in the Guide, stations.md, the
// 1-9 preset keys, or the preset-position strip -- this is the one place
// that intentionally makes it reachable by tuning alone, on top of the
// dedicated 0 key.
// 41st pass -- the NIN station being
// discoverable by just going back and forth seeking felt wrong; it should only happen
// when you hit 0. This reverses the 2026-08-22 decision described above, but
// only halfway, which is the whole idea: the two questions the old single
// function answered got split apart.
//
//   nearestStation() -- "what can I LOCK onto from here?" Real stations
//     only. Seek, scan, drag and Enter all run through this, so none of
//     them can land on 777.7 any more. '0' still gets in (it calls
//     presetTune -> tryLock with an explicit `forced` station, bypassing
//     this entirely), and leaving means pressing '0' again.
//
//   nearestSignal() -- "what is the receiver PICKING UP from here?"
//     Includes the secret station. The SIG meter, the S/N readout, the
//     static bed and the CRT degrade all run through this, so sweeping past
//     777.7 still makes the meters climb and the hiss clear: you can feel a
//     carrier sitting there that you cannot catch. Combined with
//     applySecretTease()'s red bleed, the set is visibly and audibly
//     insisting something is there while refusing to tune it.
//
// 50th pass (third revision of this policy -- each one a real
// decision, not churn: 0-only -> fully tunable -> 0-only -> now this):
// the NIN channel needed to be something you can seek with tuning arrows and then
// have to hit enter to lock on. The 41st-pass split above already carries
// most of it; what changes is a THIRD question, split out of tryLock():
//
//   nearestLockable() -- "what can ENTER lock onto from here?" Real
//     stations AND the secret station. Only tryLock()'s un-forced path
//     (the Enter key) uses it. seekStep()'s land-on-lock and scan stay on
//     nearestStation(), so sweeping/scanning past 613.0 still refuses to
//     auto-lock -- the meters climb, the hiss clears, the red bleeds in,
//     and the set waits for a deliberate Enter. Discovery now works like a
//     real DX catch: notice the carrier, stop, and commit.
//   '0' still works too (presetTune -> tryLock forced, bypasses all of
//     this). Persistence still never restores the secret station across
//     reloads (the restore path looks stations up in STATIONS only) --
//     deliberate: the catch resets every visit.
// 2026-08-25 audit: nearestLockable() and nearestSignal() had grown into
// byte-identical functions (both walk STATIONS + SECRET_STATIONS). They stay
// two NAMES because they answer two different questions -- see the policy
// note above -- and could diverge again; only the body is shared.
export function nearestLockable(freq) { return nearestSignal(freq) }
export function nearestStation(freq) {
  let best = null, bestDist = Infinity
  for (const ch of STATIONS) {
    const d = Math.abs(ch.freq - freq)
    if (d < bestDist) { bestDist = d; best = ch }
  }
  return { station: best, dist: bestDist }
}
export function nearestSignal(freq) {
  let best = null, bestDist = Infinity
  for (const ch of [...STATIONS, ...SECRET_STATIONS]) {
    const d = Math.abs(ch.freq - freq)
    if (d < bestDist) { bestDist = d; best = ch }
  }
  return { station: best, dist: bestDist }
}

// --- shuffle bag ---------------------------------------------------------

export function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

