// SIGNAL -- visualizer effect "DREAD". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, FAINT, MUTED } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { auMul } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)

// DREAD (45th pass, the secret station) -- a coarse panel grid flickering
// erratically with occasional full-row tears, more hostile than anything
// else on the roster on purpose. Grid dims kept inside 80 cols with margin
// (14 * 5 = 70, +6 left inset = 76).
export const DREAD_CELLS_X = 14
export const DREAD_CELLS_Y = 5
export const DREAD_CELL_W = 5
export const DREAD_CELL_H = 4

export default {
  key: 'dread',
  label: 'DREAD',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    // DREAD's panel grid (45th pass, the secret station).
    p._dreadGrid = Array.from({ length: DREAD_CELLS_X * DREAD_CELLS_Y }, () => Math.random() < 0.5)
    p._dreadTear = { active: false, row: 0, until: 0 }
  },
  // DREAD effect (45th pass) -- for the secret station. The one visual on
  // the roster meant to read as a little wrong to look at: a coarse panel
  // grid flickering erratically with occasional full-row tears, matching
  // this station's own harshest CRT signature and its forced red phosphor
  // bleed on lock.
  draw(p, s, t) {
    const { term } = s
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    const tear = p._dreadTear
    // 2026-08-23 (live audio tap) -- industrial: the picture rips on the
    // kick. A hard bass onset forces a full-row tear IN ADDITION TO the
    // ambient random roll below (kept on purpose -- the wrongness must not
    // become metronomic), the panel grid churns with the level, and treble
    // hiss makes the cells fizz. The single-tear state is its own throttle
    // for back-to-back hits. (flashCrtGlitch on extreme hits was considered
    // and left OUT by default -- a whole-screen chroma/roll spike is a
    // taste call left for live QA, and that glyph of meaning currently
    // belongs to real playback errors alone.)
    const A = p._au
    const churn = auMul(A, A ? A.level : 0, 0.55, 1.45)
    const fizz = auMul(A, A ? A.treble : 0, 0.7, 1.5)
    if (!tear.active && A && A.pulse > 0.75 && A.bass > 0.5) {
      tear.active = true
      tear.row = 1 + Math.floor(Math.random() * 20)
      tear.until = t + 0.08 + A.pulse * 0.1
    }
    if (!tear.active && Math.random() < 0.012) {
      tear.active = true
      tear.row = 1 + Math.floor(Math.random() * 20)
      tear.until = t + 0.08 + Math.random() * 0.1
    }
    if (tear.active && t > tear.until) tear.active = false
    if (Math.random() < 0.4 * churn) {
      const idx = Math.floor(Math.random() * p._dreadGrid.length)
      p._dreadGrid[idx] = !p._dreadGrid[idx]
    }
    const top = 2, left = 6
    for (let gy = 0; gy < DREAD_CELLS_Y; gy++) {
      for (let gx = 0; gx < DREAD_CELLS_X; gx++) {
        const on = p._dreadGrid[gy * DREAD_CELLS_X + gx]
        const flicker = Math.random() < 0.06 * fizz
        const ch = on ? (flicker ? '▓' : '█') : (flicker ? '░' : ' ')
        if (!on && !flicker) continue
        const attr = on ? (flicker ? MUTED : BRIGHT) : FAINT
        for (let cy = 0; cy < DREAD_CELL_H - 1; cy++) {
          for (let cx = 0; cx < DREAD_CELL_W - 1; cx++) {
            const py = top + gy * DREAD_CELL_H + cy
            if (py < VIZ_BOT) term.put(left + gx * DREAD_CELL_W + cx, py, ch, attr)
          }
        }
      }
    }
    if (tear.active) {
      for (let x = 0; x < term.cols; x++) term.put(x, tear.row, Math.random() < 0.5 ? '█' : ' ', BRIGHT)
    }
  },
}
