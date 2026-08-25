// SIGNAL -- visualizer effect "FROST". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, auMul, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)

// 57th pass, 2nd rewrite -- Neon Grid Decay grid resolution (COLD WAVE).
// Fixed regardless of terminal width; drawFrostEffect maps it onto
// cols/COLD_GRID_COLS spacing every frame.
export const COLD_GRID_COLS = 16
export const COLD_GRID_ROWS = 9

export default {
  key: 'frost',
  label: 'FROST',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    // 57th pass, 2nd rewrite -- Neon Grid Decay is now COLD WAVE's actual
    // core visual, rather than a small corner overlay on the old FROST
    // automaton, which this replaces outright. A full-screen wireframe grid, node
    // brightness 0..1 per intersection, ignited by the tap and decaying
    // back out on its own -- "neon signage losing power," not ice growing.
    // Grid resolution is independent of term.cols (positions are
    // recomputed from cols/COLD_GRID_COLS every frame), so this array is a
    // fixed size regardless of terminal width.
    p._coldGridCells = new Float32Array(COLD_GRID_COLS * COLD_GRID_ROWS)
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // 57th pass, 2nd rewrite -- COLD WAVE's neon grid starts fully dark on
    // every visualizer entry.
    p._coldGridCells.fill(0)
  },
  // 57th pass, 2nd rewrite -- Neon Grid Decay, COLD WAVE's core visual now,
  // rebuilt from scratch. This replaces the old FROST dendrite automaton
  // outright rather than layering the grid on top of it. A wireframe grid
  // spans the whole screen; the connecting lines are static geometry (the
  // glass), and each intersection is a neon node that a real treble hit or
  // onset ignites to full brightness, decaying back out on its own -- "the
  // sign losing power," which is the whole "decay" in the name.
  // 62nd pass -- was a dim, motionless wire with
  // unlit nodes and no ignitions without a tap; found during live QA to
  // read as broken rather than atmospheric when a real tap isn't available,
  // so hard silence rules were relaxed in favor of a seamless fallback.
  // Falls back to syntheticAudio(t) now (see its own note near auMul) --
  // the ignition logic below is unchanged, it just always has a signal to
  // read.
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) term.put(x, y, ' ')
    const gCols = COLD_GRID_COLS, gRows = COLD_GRID_ROWS
    const cellW = cols / gCols, cellH = (VIZ_BOT - 2) / gRows
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    {
      // Treble drives the ambient ignition rate; a real onset always lands
      // a small burst of ignitions even on a quiet passage, so the grid
      // never goes fully dead mid-track.
      // 65th pass -- widened 0.02-0.28 -> 0.015-0.5 and the onset burst
      // from 1 cell to 3: a loud treble passage barely moved the needle at
      // the old ceiling, and a single onset cell was easy to miss against
      // a 144-cell field.
      const flashRate = auMul(A, A.treble, 0.015, 0.5)
      for (let i = 0; i < p._coldGridCells.length; i++) {
        if (p._coldGridCells[i] > 0) p._coldGridCells[i] = Math.max(0, p._coldGridCells[i] - 0.05)
        else if (Math.random() < flashRate) p._coldGridCells[i] = 1
      }
      if (A.onset) {
        for (let k = 0; k < 3; k++) p._coldGridCells[Math.floor(Math.random() * p._coldGridCells.length)] = 1
      }
    }
    // Wireframe: dotted lines connecting every intersection. A live tap
    // nudges the line brightness with overall level.
    // 65th pass -- was a single DIM/FAINT threshold at 0.55, which meant
    // most of a real track's dynamic range only ever showed FAINT; three
    // tiers instead so a loud passage visibly lights the whole wireframe.
    const lineAttr = !A ? FAINT : A.level > 0.7 ? NORMAL : A.level > 0.35 ? DIM : FAINT
    for (let gy = 0; gy <= gRows; gy++) {
      const y = Math.round(1 + gy * cellH)
      if (y < 1 || y >= VIZ_BOT) continue
      for (let x = 0; x < cols; x += 2) term.put(x, y, '·', lineAttr)
    }
    for (let gx = 0; gx <= gCols; gx++) {
      const x = Math.round(gx * cellW)
      if (x < 0 || x >= cols) continue
      for (let y = 1; y < VIZ_BOT; y += 2) term.put(x, y, '·', lineAttr)
    }
    // Nodes on top -- always visible (dim unlit, bright when ignited), so
    // the grid reads as a structure of lit points rather than a hatch.
    for (let gy = 0; gy <= gRows; gy++) {
      const y = Math.round(1 + gy * cellH)
      if (y < 1 || y >= VIZ_BOT) continue
      for (let gx = 0; gx <= gCols; gx++) {
        const x = Math.round(gx * cellW)
        if (x < 0 || x >= cols) continue
        const idx = (gy % gRows) * gCols + (gx % gCols)
        const bright = p._coldGridCells[idx]
        if (bright > 0.05) term.put(x, y, bright > 0.55 ? '◆' : '+', bright > 0.55 ? BRIGHT : NORMAL)
        else term.put(x, y, '+', MUTED)
      }
    }
  },
}
