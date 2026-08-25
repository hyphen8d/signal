// SIGNAL -- visualizer effect "ISOTOPE MAP". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { auMul } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2, visualizerLevelAttr } = await import(`./shared.js?v=${V}`)

// ISOTOPE MAP (52nd pass, ATOMIC), extended same pass to fill the screen
// better with 4 more scattered around -- 5 hot
// sources total, each on its own lissajous path (own frequency pair +
// phase offset so none of them move in lockstep or trace the same loop
// twice). fx/fy are the drift frequencies, ph offsets where each one
// starts along its own loop, and amp scales that source's roam radius
// relative to the shared ampX/ampY in drawIsotopeEffect -- kept close to
// 1 so every source stays a similar size, with enough spread that they
// don't all reach full amplitude at once.
export const ISOTOPE_SOURCES = [
  { fx: 0.13, fy: 0.09, ph: 0.0, amp: 1.0 },
  { fx: 0.10, fy: 0.15, ph: 1.7, amp: 0.85 },
  { fx: 0.17, fy: 0.07, ph: 3.4, amp: 0.9 },
  { fx: 0.08, fy: 0.12, ph: 5.0, amp: 0.95 },
  { fx: 0.15, fy: 0.11, ph: 2.5, amp: 0.8 },
]
// 57th pass -- Half-Life Ring tuning (ATOMIC). Life is the ring's full
// travel window; HALF_LIFE is how long its brightness takes to drop by
// half, decaying continuously rather than fading linearly, so it dims fast
// early (like a real isotope) and lingers faint near the end.
export const ISOTOPE_RING_MAX = 3
export const ISOTOPE_RING_LIFE = 1.6
export const ISOTOPE_RING_HALF_LIFE = 0.4
export const ISOTOPE_RING_SPEED = 7.5

export default {
  key: 'isotope',
  label: 'ISOTOPE MAP',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    // 57th pass -- Half-Life Ring, off the visualizer-lab mock's
    // "half-life ring" concept for ATOMIC. A strong bass onset spawns a ring at
    // one of the isotope sources' current position; it expands and its
    // brightness decays on an actual half-life curve (see drawIsotopeEffect's
    // tail end). Capped at ISOTOPE_RING_MAX concurrent so a busy passage
    // doesn't clutter the field.
    p._isotopeRings = []
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    p._isotopeRings = []
  },
  // ISOTOPE MAP (52nd pass, ATOMIC) -- shelved unassigned since the 57th
  // pass, promoted back to ATOMIC's default in the 65th when GEIGER,
  // CLOUDS, and the rest of the old roster got removed for good (see the
  // 65th-pass note above VISUAL_METHODS). Every cell on the grid flickers
  // on its own independent sine cycle (its own phase and frequency), and
  // hotter regions drift across the field in lissajous paths, brightening
  // whatever they currently sit over. No needle, no gauge, no scripted
  // event -- "a field of sources" rather than a single detector, which
  // suits an atomic-age station better than one instrument does. Started
  // as a single source; same pass, expanded to fill the
  // screen -- now ISOTOPE_SOURCES.length independent ones (see that
  // constant), each cell taking the max heat across all of them so
  // overlapping sources don't blow out to solid white noise.
  // Fully stateless like OUTRUN's roadside texture: each cell's phase/freq
  // come from hash2(x,y) recomputed every frame rather than a stored
  // per-cell buffer, so there's no persistent state to reset on re-entry
  // and nothing here can hit the FLAME-class re-entry-freeze bug (see
  // Design Notes) -- the whole effect is a pure function of (x, y, t).
  // 65th pass -- promotion to ATOMIC's default came with a note that it
  // "looks cool, just needs more reactivity": the 52nd/57th-pass tuning
  // barely moved with the music (glow radius swing was 0.7-1.3, the click
  // bump was a flat +0.1, and rings needed a hard A.bass > 0.45 onset).
  // Widened the same way CIPHER/COLD WAVE/CIRCUIT CRUSH were earlier this
  // pass: a much wider glow-radius swing so sources visibly bloom and
  // shrink with level, a stronger pulse click, a lower onset bar so rings
  // fire more readily, and a second ring on a hard hit so a big onset
  // reads as two sources going critical at once instead of one.
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const cy = (1 + VIZ_BOT) / 2
    // Each source roams a slow lissajous loop, kept clear of the edges by
    // a margin so its glow never clips against the frame. dy is weighted
    // 2.1x the same way DRIFT's radial term is, since a character cell
    // reads roughly twice as tall as it is wide -- without that weighting
    // the "hot region" would look like a flattened horizontal smear
    // instead of a roughly round glow.
    const ampX = Math.max(6, cols / 2 - 12)
    const ampY = Math.max(3, (VIZ_BOT - 1) / 2 - 5)
    // 2026-08-23 (live audio tap) -- the sources run hotter with the band
    // (glow radius follows level) and a transient blinks the whole
    // background flicker field up ~a tier for the pulse window: a click
    // registering across the field. Note this stays exactly as re-entry-
    // safe as before: nothing is stored -- the effect is now a pure
    // function of (x, y, t, this-frame's bus reading), which preserves the
    // property the statelessness note above actually cares about.
    const A = p._au
    const rMul = auMul(A, A ? A.level : 0, 0.5, 1.9)
    const click = A ? A.pulse * 0.28 : 0
    const sources = ISOTOPE_SOURCES.map((src) => ({
      hx: cols / 2 + Math.sin(t * src.fx + src.ph) * ampX * src.amp,
      hy: cy + Math.cos(t * src.fy + src.ph) * ampY * src.amp,
    }))
    // 57th pass -- Half-Life Ring. A strong bass onset spawns a ring at a
    // random source's current position (reads as that source "going
    // critical"); the ring then just carries its own fixed spawn position
    // and time, independent of the sources' ongoing roam. 65th pass --
    // threshold lowered so rings fire on more onsets, and a hard hit
    // (bass > 0.7) spawns a second ring at a different source the same
    // frame, same "growCount" idea BLAST FIELD uses for its own onsets.
    if (A && A.onset && A.bass > 0.28) {
      const ringCount = A.bass > 0.7 ? 2 : 1
      for (let i = 0; i < ringCount; i++) {
        const src = sources[Math.floor(Math.random() * sources.length)]
        p._isotopeRings.push({ x: src.hx, y: src.hy, spawnT: t })
        if (p._isotopeRings.length > ISOTOPE_RING_MAX) p._isotopeRings.shift()
      }
    }
    p._isotopeRings = p._isotopeRings.filter((r) => t - r.spawnT < ISOTOPE_RING_LIFE)
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        let heat = 0
        for (const src of sources) {
          const dx = x - src.hx, dy = (y - src.hy) * 2.1
          const d = Math.sqrt(dx * dx + dy * dy)
          const sh = Math.max(0, 1 - d / (9 * rMul))
          if (sh > heat) heat = sh
        }
        let ring = 0
        for (const r of p._isotopeRings) {
          const age = t - r.spawnT
          const radius = age * ISOTOPE_RING_SPEED
          const dx = x - r.x, dy = (y - r.y) * 2.1
          const dist = Math.sqrt(dx * dx + dy * dy)
          const band = Math.max(0, 1 - Math.abs(dist - radius) / 1.4)
          const decay = Math.pow(0.5, age / ISOTOPE_RING_HALF_LIFE)
          if (band * decay > ring) ring = band * decay
        }
        const phase = hash2(x, y) * Math.PI * 2
        const freq = 0.6 + hash2(y, x) * 2.2   // args swapped from phase's hash to decorrelate
        const base = 0.5 + 0.5 * Math.sin(t * freq + phase)
        const v = Math.max(base * (0.1 + click + heat * 0.95), ring * 0.95)
        if (v < 0.1) { term.put(x, y, ' '); continue }
        const ch = ring > 0.5 ? 'O' : v > 0.85 ? '▓' : v > 0.6 ? '▒' : v > 0.4 ? '+' : v > 0.22 ? ':' : '·'
        term.put(x, y, ch, visualizerLevelAttr(v))
      }
    }
  },
}
