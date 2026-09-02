// SIGNAL -- visualizer effect "FLAME". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, auMul, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { HINT_Y1, VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { DRIFT_RAMP, visualizerLevelAttr } = await import(`./shared.js?v=${V}`)

export default {
  key: 'flame',
  label: 'FLAME',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    // FLAME's heat buffer (46th pass, DISTORTION FIELD) -- one float per
    // cell across the visualizer's full row range (0..VIZ_BOT-1; row 0 is
    // unused since the effect never draws above row 1). Still sized off
    // HINT_Y1 rather than VIZ_BOT: harmlessly one row over-allocated since
    // the 50th pass shrank the canvas, and re-sizing it buys nothing.
    p._fireHeat = new Array(term.cols * HINT_Y1).fill(0)
    p._fireLastStep = 0
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // 50th pass -- fixes DISTORTION FIELD's visualizer showing just a
    // frozen frame after switching to another station and back: the
    // effect clock restarts at 0 on every entry, and this gate compares
    // against an absolute t (`t - _fireLastStep >= 0.13`) -- so after a 40s
    // visit the gate read 0 - 40 and the heat simulation never stepped
    // again while the draw loop kept rendering the last buffer. Reset on
    // entry, alongside the clock itself, so state and time start together.
    p._fireLastStep = 0
  },
  // FLAME effect (46th pass) -- for DISTORTION FIELD, replacing HOWL
  // outright (which had itself replaced FEEDBACK -- see the field notes
  // above VISUAL_METHODS). Live QA: "fire 'flame' living thing." Classic
  // bottom-up fire propagation: the floor row is reseeded hot (with
  // occasional dark gaps for flicker) every frame, and every row above
  // pulls its heat from a randomly-offset cell one row below, cooling by a
  // random amount as it rises -- the sideways randomness is what makes it
  // drift and lick rather than rise in straight columns, and the random
  // cooling is what gives it a natural tapering silhouette (dense near the
  // floor, sparse embers near the top) with zero fixed cycle -- no two
  // frames are ever the same, unlike anything else on the roster.
  // 57th pass, 2nd rewrite -- no activity if there
  // is no audio, flames should react more, and the treble
  // overlay is unneeded. Dropped the Feedback Stack overlay entirely -- back to just
  // the flame. With no live tap the physics step no longer runs at all
  // (previously `fuel` defaulted to a neutral 1 and the fire kept burning
  // on its own regardless of audio); now no tap means no simulation step,
  // rendered as a cold, motionless ember bed. With a tap, fuel's range and
  // the pulse/onset kick are both widened well past the old "modulate a
  // baseline" numbers so the flame visibly flares and dies down with the
  // track instead of just breathing a little.
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const floorY = VIZ_BOT - 1
    const heat = p._fireHeat
    // 62nd pass -- was a low, unmoving ember bed along the floor,
    // no step, no randomness with no tap. Found during live QA to read as
    // broken rather than atmospheric when a real tap isn't available,
    // so hard silence rules were relaxed in favor of a seamless fallback.
    // Falls back to syntheticAudio(t) now (see its own note near
    // auMul) -- the physics step below is unchanged, it just always has a
    // signal to read, so the fire never goes fully cold.
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    // 47th pass: live QA said "too fast, make more organic." At 60fps the
    // whole buffer recomputed fresh every render frame read as a flicker
    // rather than a living flame. Two fixes: step the physics on its own
    // slower clock independent of render rate, and ease the floor's reseed
    // toward its new target instead of snapping to it -- together that
    // turns the jitter into a slow, licking billow.
    // 48th pass: a follow-up "slow down a bit more" also dropped the
    // per-row cooling numbers (base 0.02 + spread 0.045 -> 0.015 + 0.035;
    // as a RANGE that is 0.02-0.065 dropping to 0.015-0.05 -- the old
    // shorthand here wrote the base+spread pair with a dash and read as a
    // narrower range than the code draws). That was a real
    // bug, not just a tuning choice -- with cooling that low, heat barely
    // decayed over the ~21-row climb from floor to top, so the whole
    // column stayed lit almost every frame instead of tapering. That's
    // what read as "hung" on dev: not frozen, just permanently
    // full-screen and never resolving into a flame shape. Cooling is
    // restored to the 47th-pass range here; only the step clock (now
    // 0.13, slower than 47th pass's 0.07) carries the further slowdown.
    // 50th pass: the effect clock rewinds to 0 on every visualizer entry
    // (see enterVisualizer's note), so a step time left over from a previous
    // visit sits in the future and gates this simulation off entirely.
    // enterVisualizer resets it, but this effect shouldn't depend on a
    // caller remembering to -- a clock that went backwards means "new
    // session", so re-arm rather than wait it out.
    if (t < p._fireLastStep) p._fireLastStep = 0
    if (t - p._fireLastStep >= 0.13) {
      p._fireLastStep = t
      // 57th pass -- fuel's range widened (0.55..1.45 -> 0.4..2.3) and the
      // pulse kick raised (0.35 -> 0.55) so quiet stretches genuinely bank
      // the fire down and loud ones blow it out taller, not just flicker
      // brighter. A real onset also slams the floor toward full heat for
      // one step -- a visible flare on the hit, not just a warmer glow.
      const fuel = auMul(A, A.bass, 0.4, 2.3)
      for (let x = 0; x < cols; x++) {
        const target = Math.min(1, (Math.random() < 0.12 ? Math.random() * 0.3 : 0.75 + Math.random() * 0.25) * fuel)
        const prev = heat[floorY * cols + x]
        let seed = prev * 0.6 + target * 0.4
        seed = Math.min(1, seed + A.pulse * 0.55 + (A.onset ? 0.4 : 0))
        heat[floorY * cols + x] = seed
      }
      for (let y = floorY - 1; y >= 1; y--) {
        for (let x = 0; x < cols; x++) {
          const drift = Math.floor(Math.random() * 3) - 1
          const srcX = Math.max(0, Math.min(cols - 1, x + drift))
          const below = heat[(y + 1) * cols + srcX]
          const cooling = 0.02 + Math.random() * 0.045
          heat[y * cols + x] = Math.max(0, below - cooling)
        }
      }
    }
    for (let y = 1; y <= floorY; y++) {
      for (let x = 0; x < cols; x++) {
        const v = heat[y * cols + x]
        if (v < 0.06) { term.put(x, y, ' '); continue }
        const idx = Math.min(DRIFT_RAMP.length - 1, Math.floor(v * DRIFT_RAMP.length))
        term.put(x, y, DRIFT_RAMP[idx], visualizerLevelAttr(v))
      }
    }
  },
}
