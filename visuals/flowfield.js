// SIGNAL -- visualizer effect "FLOW FIELD". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { auMul } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { visualizerLevelAttr } = await import(`./shared.js?v=${V}`)

// 57th pass, 3rd rewrite -- Flow Field glyph set (MOMENTUM). Picked by the
// local direction angle to suggest which way the current runs at that cell.
export const FLOW_GLYPHS = ['-', '\\', '|', '/']

export default {
  key: 'flowfield',
  label: 'FLOW FIELD',
  // 65th pass -- CLOUDS (ATOMIC's old Geiger-counter-replacement effect,
  // drifting metaball clouds via makeCloudShape()) permanently removed.
  // See the 65th-pass note above VISUAL_METHODS for why.
  // 57th pass, 3rd rewrite -- Flow Field, MOMENTUM's visual rebuilt from
  // scratch, chasing a scene that reacts to the music -- just a fun
  // visual, doesn't
  // have to be on theme"). Drops the crane-skyline concept and its Focus
  // Pulse HUD entirely -- this is a wind/current map instead: every cell
  // carries a direction (a slowly drifting angle field) and a magnitude (a
  // traveling wave riding that direction), rendered as a short streak
  // glyph so the whole screen reads as flowing current lines rather than a
  // static texture. Fully stateless, same reasoning as ISOTOPE/OUTRUN's
  // roadside texture -- a pure function of (x, y, t, this frame's bus
  // reading), nothing to reset on re-entry. No tap: the field still flows
  // (this one keeps its baseline motion, deliberately -- a wind map
  // standing dead still doesn't read as "idle," it reads as broken), just
  // slow and calm; a live tap speeds it up, roughens it, and clumps it
  // into streaks that thin out to nothing between hits.
  // 59th pass -- unassigned (was MOMENTUM). See VISUAL_METHODS' note on
  // 'skyline'/'flowfield' -- towers are back on MOMENTUM, kept here as the
  // steady flowing-field alternative in case a future pass wants it again.
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const A = p._au
    const speed = auMul(A, A ? A.level : 0, 0.5, 1.9)
    const chaos = auMul(A, A ? A.treble : 0, 0.6, 2.4)
    const swirl = auMul(A, A ? A.mid : 0, 0.7, 1.6)
    const pulse = A ? A.pulse : 0
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        const nx = x * 0.09, ny = y * 0.17
        // The direction field: where the current points at this cell,
        // itself drifting slowly over time.
        const angle = Math.sin(nx * 1.3 + t * 0.12 * speed) * 1.7
          + Math.cos(ny * swirl - t * 0.09 * speed) * 1.4
        // A wave traveling along that direction is what actually reads as
        // FLOWING rather than a fixed direction map.
        const wave = Math.sin(nx * 2.2 * chaos + ny * 1.6 + angle * 1.3 - t * 1.1 * speed)
        let mag = (wave + 1) / 2
        mag = Math.max(0, mag - 0.42) / 0.58   // threshold -> streaks over black, not wallpaper
        mag = Math.min(1, mag + pulse * 0.3)
        if (mag < 0.05) { term.put(x, y, ' '); continue }
        const dir = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
        const gi = Math.floor((dir / (Math.PI * 2)) * FLOW_GLYPHS.length) % FLOW_GLYPHS.length
        term.put(x, y, FLOW_GLYPHS[gi], visualizerLevelAttr(mag))
      }
    }
  },
}
