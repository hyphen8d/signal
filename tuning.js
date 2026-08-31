// SIGNAL -- the tuning model: the band, lock/near thresholds, seek/scan
// steps, frequency<->dial-column mapping, the three nearest-station
// questions, and the shuffle bag. Split out of program.js in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { DIAL_X0, DIAL_X1 } = await import(`./layout.js?v=${V}`)
const { SECRET_STATIONS, STATIONS } = await import(`./stations.js?v=${V}`)


// --- the two bands (2026-08-31) ----------------------------------------
//
// Both are wide, irregular and fictional -- not the real 88-108 FM range, and
// not clean tenths like real station assignments, on purpose (8/20: the old
// range read as too close to an actual FM dial).
//
// WHY A SECOND BAND AT ALL, since the obvious ask was "more presets": the
// preset keys were never the ceiling, the DIAL is. A station's NEAR_THRESHOLD
// zone is +/-24 units, and the dial is 71 columns (DIAL_X0 4 -> DIAL_X1 75)
// carrying 800 units, so that zone is 4.26 COLUMNS wide on screen. 71 / 4.26
// is about 16.7 stations before every point on the dial sits inside
// something's near zone. Past that there is no static anywhere, and because
// tuning distance is one shared quantity (see staticGainForDist, the S/N
// readout and crtDegradeForDist) that takes out what you hear, what you read
// and what the tube does, all at once. Nine more preset keys would have been
// nine more ways to REACH stations there was nowhere to PUT.
//
// Note the ceiling is a property of the SCREEN, not of these numbers: making
// the band wider just compresses everything into the same 71 columns, and at
// 1600 units the lock zone drops under one column, where "locked" and "near"
// stop being visually distinguishable. Columns are the scarce resource.
//
// WHY NOT FM/AM, which is what the issue asked for. FM/AM is a promise about
// SOUND -- real AM is narrower, noisier, mono, and fades. This second band is
// deliberately "the same radio, more room": no higher static floor, no
// narrower lock, no phosphor lean. Labelling it AM would write a cheque the
// set does not cash for anyone who knows radio. A fake pair promises only
// "this set has two bands", which is exactly what is true, and the
// frequencies here have been fiction since the 8/20 pass anyway.
//
// WHY THESE LETTERS. The trailing M reads as "modulation", so `?M` parses as
// a band designation on sight; Y and Z sit nowhere near F or A, so neither
// reads as a typo for the real thing. They ASCEND WITH FREQUENCY -- YM is the
// low band, ZM the high one -- which is the whole reason they are these two
// letters rather than an arbitrary pair.
//
// WHY THE RANGES DO NOT OVERLAP. The first sketch put the second band at real
// AM's 530-1700, which collides with YM between 530 and 900 -- and CITY
// LIGHTS already sits at 780.0, so "780.0" would have named a station on
// either band. Held apart, every YM frequency is three digits and every ZM
// one is four, so the DIGIT COUNT alone identifies the band even where the
// label is cropped out. Today's highest is HACKBACK at 808.
export const BANDS = [
  { key: 'ym', label: 'YM', freqMin: 100.0, freqMax: 900.0 },
  { key: 'zm', label: 'ZM', freqMin: 1000.0, freqMax: 1800.0 },
]
export const DEFAULT_BAND = 'ym'
// Falls back to the first band rather than throwing, deliberately: a bad key
// reaching here means persisted state from a build that spelled the bands
// differently, and landing a returning listener on YM is a better answer than
// a receiver that will not boot. lint-roster refuses an unknown band in the
// ROSTER, which is where a typo can actually be fixed.
export const bandFor = (key) => BANDS.find((b) => b.key === key) ?? BANDS[0]

// YM's edges under the names they had when there was only one band. Derived
// rather than repeated so the two cannot drift apart.
//
// EVERY REMAINING READER OF THESE IS A YM ASSUMPTION waiting to be found. The
// seek/scan wraparound and the guide's "BAND : 100.0 - 900.0 KHZ" line both
// still read them, which is correct while YM is the only band anyone can
// reach and wrong the moment ZM is switchable -- seeking off the top of ZM
// would wrap to 100.0, a frequency that band does not contain. Those call
// sites move to bandFor(this.band) when the switch lands; these two stay for
// the things that genuinely mean "the original band", if any survive.
export const FREQ_MIN = BANDS[0].freqMin
export const FREQ_MAX = BANDS[0].freqMax
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


// 2026-08-31 -- these three, and the three nearest-* questions below, take
// the band as a trailing argument that DEFAULTS to YM. The default is what
// makes adding a second band a change nothing has to notice yet: every
// existing caller keeps asking the question it was already asking, about the
// band that was the only one, and the seam for phase 3 exists without a
// hundred call sites moving in the same commit as the arithmetic.
//
// The dial is always 71 columns wide whatever band is on it, so a band with a
// wider range simply has coarser columns -- ZM's 800 units across the same
// span as YM's 800 means they happen to be identical today, which is a
// coincidence of the ranges chosen and not something to rely on.
export function freqToCol(f, bandKey = DEFAULT_BAND) {
  const b = bandFor(bandKey)
  const pct = (f - b.freqMin) / (b.freqMax - b.freqMin)
  return Math.round(DIAL_X0 + pct * (DIAL_X1 - DIAL_X0))
}
export function colToFreq(col, bandKey = DEFAULT_BAND) {
  const b = bandFor(bandKey)
  const pct = (col - DIAL_X0) / (DIAL_X1 - DIAL_X0)
  return b.freqMin + pct * (b.freqMax - b.freqMin)
}
export function clampFreq(f, bandKey = DEFAULT_BAND) {
  const b = bandFor(bandKey)
  return Math.min(b.freqMax, Math.max(b.freqMin, f))
}
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
// 2026-08-31 -- per band, and memoised per band rather than computed once,
// because "station frequencies never change at runtime" is still true but
// "there is one set of them" stopped being. A plain STATION_COLS spanning the
// whole roster would have protected ZM's columns from YM's shimmer: the
// numbers collide freely between bands (both are 71 columns wide), so a
// station at ZM 1400 and one at YM 500 can share a column index while sharing
// nothing a listener can see.
const stationColsCache = new Map()
export function stationColsFor(bandKey = DEFAULT_BAND) {
  let cols = stationColsCache.get(bandKey)
  if (!cols) {
    cols = new Set(STATIONS.filter((ch) => ch.band === bandKey).map((ch) => freqToCol(ch.freq, bandKey)))
    stationColsCache.set(bandKey, cols)
  }
  return cols
}
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
// 2026-08-31 -- all three now answer WITHIN ONE BAND. This is the part of the
// dual-band change that is load-bearing rather than cosmetic: a station on
// the band you are not tuned to is not distant, it is unreachable, and a
// nearest-* that could see across bands would put its carrier in the SIG
// meter, clear the hiss for it and let Enter lock something that is not on
// the dial in front of you. Filtering here rather than at the call sites is
// what makes that impossible to forget in one of the three.
//
// Returns { station: null, dist: Infinity } for a band with nothing on it,
// which every caller already handles -- that was the state of the roster
// before any station existed, and the null path never went away.
export function nearestLockable(freq, bandKey = DEFAULT_BAND) { return nearestSignal(freq, bandKey) }
export function nearestStation(freq, bandKey = DEFAULT_BAND) {
  let best = null, bestDist = Infinity
  for (const ch of STATIONS) {
    if (ch.band !== bandKey) continue
    const d = Math.abs(ch.freq - freq)
    if (d < bestDist) { bestDist = d; best = ch }
  }
  return { station: best, dist: bestDist }
}
export function nearestSignal(freq, bandKey = DEFAULT_BAND) {
  let best = null, bestDist = Infinity
  for (const ch of [...STATIONS, ...SECRET_STATIONS]) {
    if (ch.band !== bandKey) continue
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

