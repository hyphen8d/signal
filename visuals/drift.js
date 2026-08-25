// SIGNAL -- visualizer effect "DRIFT". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { auMul } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { DRIFT_RAMP, visualizerLevelAttr } = await import(`./shared.js?v=${V}`)

export default {
  key: 'drift',
  label: 'DRIFT',
  // DRIFT effect -- rows 1-22 (between the title bar and the info footer).
  // Four overlapping sine terms (a horizontal drift, a vertical drift, a
  // diagonal drift, and a slow ripple out from a fixed center) rather than
  // one -- a single sine field reads as stripes; layering a few at different
  // angles and speeds is what makes it read as weather instead of wallpaper.
  draw(p, s, t) {
    const { term } = s
    const cx = term.cols / 2
    const cy = 11.5
    // 2026-08-23 (live audio tap) -- originally the ONE deliberately subtle
    // mapping on the roster: only the radial ripple's AMPLITUDE bred with
    // overall loudness. 57th pass -- keeps this exact effect but makes it
    // react more/actually to the audio, widening that to all four terms,
    // each tied to its own band so the field genuinely tracks the mix
    // rather than swelling as one blob -- but every mapping still only
    // touches AMPLITUDE, never a `t *` frequency (which would teleport the
    // whole field), and there's still no onset hook or bloom pulse: this
    // station stays ambient, nothing about it thumps.
    const A = p._au
    const hSwell = auMul(A, A ? A.bass : 0, 0.75, 1.3)
    const vSwell = auMul(A, A ? A.mid : 0, 0.75, 1.3)
    const dSwell = auMul(A, A ? A.treble : 0, 0.7, 1.4)
    const swell = auMul(A, A ? A.level : 0, 0.7, 1.3)
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < term.cols; x++) {
        let v = Math.sin(x * 0.16 + t * 0.7) * hSwell
        v += Math.sin(y * 0.32 - t * 0.5) * vSwell
        v += Math.sin((x + y) * 0.11 + t * 0.35) * dSwell
        const dx = x - cx, dy = (y - cy) * 2.1
        v += Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.28 - t * 0.9) * swell
        v = (v + 4) / 8 // normalize the 4-term sum (range -4..4) to ~0..1
        if (v < 0.08) { term.put(x, y, ' '); continue }
        const idx = Math.min(DRIFT_RAMP.length - 1, Math.floor(v * DRIFT_RAMP.length))
        const ch = DRIFT_RAMP[idx]
        term.put(x, y, ch, visualizerLevelAttr(v))
      }
    }
  },
}
