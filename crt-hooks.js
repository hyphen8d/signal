// SIGNAL -- live CRT parameter hooks: per-station character, the tuning-
// distance degrade, ramps, glitch/bloom/focus-snap pulses. Everything here
// drives crt.params (a plain object the engine reads every frame). Split
// out of program.js in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { MOBILE_LITE, SCREEN } = await import(`./config.js?v=${V}`)
const { NEAR_THRESHOLD, nearestSignal } = await import(`./tuning.js?v=${V}`)

// --- CRT visual hooks (32nd pass) -----------------------------------------
//
// The engine (src/crt.js) reads its whole SCREEN param set fresh every
// frame off `crt.params` -- a plain, live-mutable object -- but until this
// pass nothing after page load ever touched it: every visual param
// (chroma, noise, snow, roll, brightness, bg, ...) sat exactly at whatever
// config.js set once at boot for the entire session. setPhosphor() was the
// only engine hook program.js ever called. These three hooks are the first
// things to actually drive the picture live, using signals the app already
// computes for other reasons (tuning distance, the power sequence beats,
// the existing dead-video safety net) rather than adding new state.

/** Same falloff shape as staticGainForDist() (see above), against visual
 *  params instead of a gain value -- so the picture degrades at the same
 *  rate the static hiss does while seeking/scanning, and clears the same
 *  moment a lock does (dist is exactly 0 at a station's own freq,
 *  including right after tryLock() calls retune(s, station.freq), so this
 *  self-resets to a clean picture with no separate "reset" call needed). */
// 41st pass -- per-station CRT character. config.js's SCREEN is still the nominal set; crtBase is
// SCREEN with the locked station's own `crt` overrides merged in, and it is
// what every hook below now treats as "clean picture" instead of SCREEN
// directly. Without this indirection the existing hooks would quietly undo
// each station's character: the distance degrade would restore SCREEN's
// chroma on lock, the ident bloom pulse would settle to SCREEN's bloom, the
// focus snap would land on SCREEN's beam, and the power-on ramp would climb
// to SCREEN's brightness -- each one erasing whatever the station asked for
// a few hundred ms after it was applied.
// 45th pass -- live phone QA found some effects needed to turn down
// to make it easier to read on mobile. Grain, scanlines, chroma
// fringing and bloom all read fine on a desktop monitor at native size, but
// mobile's characters are already smaller and get photographed/viewed at a
// steeper angle -- the same effects stack into real illegibility rather
// than texture. Applied on top of (and after, so it always wins over) any
// per-station crt override, since legibility matters more on this layout
// than any one station's specific character. First-pass numbers, not
// re-measured against a phone the way the visualizer rounds were -- expect
// to retune these live same as everything else got tuned.
export const MOBILE_CRT_OVERRIDE = {
  noise: 0.04,
  noiseStreak: 3,
  snow: 0.001,
  scanMin: 0.2,
  scanMax: 0.35,
  chroma: 0.05,
  bloomAmt: 0.7,
  threshold: 0.6,
  sharpen: 0.4,
  flicker: 0.03,
  maskAmt: 0.35,
  // 2026-08-22 -- the black above and below the tube needed a
  // different color or texture. The tube is hard-locked to 4:3, so a
  // portrait phone letterboxes above/below it in shader-computed black
  // (crt.js's `uPhosphor * uAmbient * exp(-uAmbientFalloff * length(p))`).
  // Rather than a fake CSS overlay, just let the real phosphor glow reach
  // further into that space -- lower falloff, same tint, same physics.
  ambientFalloff: 0.6,
}
export let crtBase = { ...SCREEN }
export function setCrtCharacter(s, station) {
  crtBase = { ...SCREEN, ...((station && station.crt) || {}), ...(MOBILE_LITE ? MOBILE_CRT_OVERRIDE : {}) }
  if (!s?.crt?.params) return
  Object.assign(s.crt.params, crtBase)
}
export function crtDegradeForDist(dist) {
  const pct = dist == null ? 1 : Math.min(1, dist / NEAR_THRESHOLD)
  return {
    chroma: crtBase.chroma + (0.9 - crtBase.chroma) * pct,
    snow: crtBase.snow + (0.035 - crtBase.snow) * pct,
    roll: crtBase.roll + (0.5 - crtBase.roll) * pct,
  }
}
export function setCrtDegradation(s, dist) {
  if (!s?.crt?.params) return
  Object.assign(s.crt.params, crtDegradeForDist(dist))
}

/** Linear-ramps a set of crt.params keys from `from` to `to` over
 *  durationMs. Used for the power-on "tube warming up" ramp below, the focus
 *  snap, the idle roll event, and the grind stabs. */
// 2026-08-25 audit: was a dozen discrete setTimeout steps, each re-checking
// poweredOn/_powerAnimating/guideOpen so a ramp queued by a momentary effect
// couldn't keep painting into STANDBY or the guide after the fact. Now a
// per-frame tween on the program's effects queue (see program.fxTween) --
// the normal queue simply doesn't tick while the set is off or the guide is
// up, so there is nothing to guard, and a ramp the power-off cancels settles
// straight to its `to` value rather than stranding crt.params mid-way.
// `respectPower` (default true) keeps its old meaning by picking the queue:
// false puts the ramp on the always-queue, for the power-cycle sequences
// that ARE the transition and must run while `poweredOn` is still false.
export function rampCrtParams(s, from, to, durationMs, startDelay = 0, respectPower = true) {
  if (!s?.crt?.params || !s.program) return
  const params = s.crt.params
  s.program.fxTween('crt', durationMs, (k) => {
    for (const key in to) params[key] = from[key] + (to[key] - from[key]) * k
  }, { delay: startDelay, always: !respectPower })
}

/** One-shot ~150ms chroma/roll spike for a genuine playback error (used
 *  from the YT player's onError handler, see initPlayer() below) -- a
 *  visual "broadcast hiccup" alongside the existing dead-video auto-skip,
 *  so a dead track reads as a glitch in the signal rather than a silent
 *  swap you only notice by ear. Restores to whatever crtDegradeForDist
 *  says the CURRENT tuning distance calls for, not necessarily nominal, so
 *  it can't accidentally clear a real off-station degrade already active
 *  (though in practice onError only fires while locked, i.e. dist 0). */
export function flashCrtGlitch(s) {
  if (!s?.crt?.params) return
  const { dist } = nearestSignal(s.program.freq)
  const restore = crtDegradeForDist(dist)
  Object.assign(s.crt.params, { chroma: 2.4, roll: 0.5 })
  s.program.fxAfter('crt', 150, () => Object.assign(s.crt.params, restore))
}

// 38th pass: bloom bump, used per ident note (see playIdent). bloomAmt is
// not one of the params crtDegradeForDist() drives, so restoring straight
// to SCREEN's nominal here can't fight the tuning-distance degrade the way
// a chroma/snow/roll bump would.
export function pulseBloom(s, amt = 0.5, ms = 90) {
  if (!s?.crt?.params || !s.program) return
  // Attack-and-decay, not hold-then-drop. FIRST CUT OF THIS WAS WRONG and
  // it's worth recording why: it set bloom high and restored it on a
  // setTimeout, with each new note clearing the previous timer. Verified
  // live, that made the ident read as ONE long bloom held flat across all
  // four notes (sampled: 1.94 for the whole motif, then back to 1.44) --
  // the notes were 110ms apart and the hold was 120ms, so it never got a
  // chance to fall between them. Ramping down from the peak instead, over
  // a window deliberately shorter than the note gap, is what actually
  // makes the glow breathe in time with the motif.
  // 2026-08-25 audit: a per-frame tween on the effects queue (was a 16ms
  // setInterval with its own power/guide guard). A new pulse cancels the
  // previous one, and a cancelled tween settles at k=1, i.e. crtBase --
  // same landing the old guard restored by hand.
  const params = s.crt.params
  s.program.fxCancel('bloom')
  s.program.fxTween('bloom', ms, (k) => { params.bloomAmt = crtBase.bloomAmt + amt * (1 - k) })
}

/** 38th pass: focus snap, fired on lock. The spot blooms wide and
 *  unpeaked for an instant (a receiver that hasn't caught the carrier
 *  yet), overshoots sharper than nominal, then settles -- the picture
 *  visibly pulling into focus rather than simply being in focus already.
 *  Only touches beam/sharpen, so it composes with crtDegradeForDist()'s
 *  chroma/snow/roll rather than overwriting any of it. */
export function flashFocusSnap(s) {
  if (!s?.crt?.params) return
  const soft = { beam: Math.min(2, crtBase.beam * 2), sharpen: crtBase.sharpen * 0.2 }
  const over = { beam: crtBase.beam * 0.78, sharpen: Math.min(2, crtBase.sharpen * 1.6) }
  const home = { beam: crtBase.beam, sharpen: crtBase.sharpen }
  Object.assign(s.crt.params, soft)
  rampCrtParams(s, soft, over, 130)
  rampCrtParams(s, over, home, 180, 140)
}

