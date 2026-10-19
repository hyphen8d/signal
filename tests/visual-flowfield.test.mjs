// LAVA LAMP (key 'flowfield', GREEN ROOM, rebuilt in pixels 2026-10-18) --
// what the effect leaves on the grid, read back off the gfx plane: it draws
// through putGlyph() bitmaps, so a character-reading test sees every lit
// cell as a space (CLAUDE.md, FLAME's note). Covered: the canvas contract
// at three widths; nothing on the canvas but bitmaps and blanks (no
// characters, so no shade blocks); that the picture is there (a lamp
// standing on a shelf, wax inside the glass, haze in the room); that a KICK
// is plainly different from a LOUD frame and comes back down; that only a
// rising edge kicks; that it kicks with no tap; that MUTED is dim but never
// blank, never kicks and still moves; that a change of level changes the
// wax's speed and the lamp's reach but never jumps the haze or the wax; that
// re-entry carries no kick clock; and that BRIGHT stays on the wax.
//
// The frame loop rewrites p._au every frame (visualizer.js), so the audio is
// driven by calling the effect's draw directly with a crafted signal, as
// tests/visual-boombap.test.mjs does.
//
// Run: node --test tests/visual-flowfield.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from './harness.mjs'
import { parseBDF } from '../src/bdf.js'
import { Term, BRIGHT, DIM, FAINT, MUTED } from '../src/term.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const VIZ_BOT = 22
const CELL_W = 8, CELL_H = 16

// Steady and loud, between beats: the viz-sheet's LOUD state.
const signal = (over = {}) => ({
  level: 0.7, bass: 0.45, mid: 0.6, treble: 0.5,
  bands9: new Array(9).fill(0.5), onset: false, pulse: 0.15, ...over,
})
const KICK = { pulse: 1, onset: true, level: 0.95, bass: 1 }

async function bootLamp() {
  const h = await boot({ station: 'green-room' })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  assert.equal(h.program.activeVisualKey(), 'flowfield', 'GREEN ROOM should land on its own effect')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/flowfield.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.flowfield, mod }
}

function drawWith(h, fx, t, A, term = h.term, muted = false) {
  h.program.muted = muted
  h.program._au = A
  fx.draw(h.program, { term }, t)
}

const popcount = (v) => { let n = 0; while (v) { n += v & 1; v >>>= 1 } return n }
/** Lit pixels in the canvas cells for which `pick(x, y)` is true. */
function litPixels(term, pick = () => true) {
  let n = 0
  for (let y = 1; y < VIZ_BOT; y++) {
    for (let x = 0; x < term.cols; x++) {
      if (!pick(x, y)) continue
      const g = term.gfx[y * term.cols + x]
      if (g) for (const row of g) n += popcount(row)
    }
  }
  return n
}
/** Canvas cells whose attribute has `bit` (NORMAL is 0: pass null for it). */
function cellsWith(term, bit, pick = () => true) {
  let n = 0
  for (let y = 1; y < VIZ_BOT; y++) {
    for (let x = 0; x < term.cols; x++) {
      const i = y * term.cols + x
      if (!term.gfx[i] || !pick(x, y)) continue
      const a = term.attrs[i]
      if (bit === null ? !(a & (BRIGHT | MUTED | DIM | FAINT)) : (a & bit)) n++
    }
  }
  return n
}
/** Every canvas cell's attribute and bitmap CONTENT (the references
 *  alternate every render, so comparing them would say everything moved). */
function snapshot(term, pick = () => true) {
  const out = []
  for (let y = 1; y < VIZ_BOT; y++) {
    for (let x = 0; x < term.cols; x++) {
      if (!pick(x, y)) continue
      const i = y * term.cols + x
      const g = term.gfx[i]
      out.push(term.attrs[i] + ':' + (g ? Array.from(g).join(',') : term.chars[i]))
    }
  }
  return out
}
const diffCount = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n }

/** Steady frames until the breath has settled and any kick has gone. */
function settle(h, fx, t0, A = signal(), muted = false) {
  let t = t0
  for (let i = 0; i < 60; i++) { t += 0.05; drawWith(h, fx, t, A, h.term, muted) }
  return t
}

/** The cell rows/columns the lamp's glass spans on this grid. */
function glassCells(mod, cols) {
  const cx = (cols * CELL_W) >> 1
  return {
    x0: Math.floor((cx - 48) / CELL_W), x1: Math.floor((cx + 48) / CELL_W),
    y0: 1 + Math.floor(mod.GLASS_TOP / CELL_H), y1: 1 + Math.floor((mod.GLASS_BOT - 1) / CELL_H),
  }
}

test('LAVA LAMP: paints the whole canvas and nothing outside it, at 60, 80 and 100 columns', async () => {
  const { h, fx } = await bootLamp()
  try {
    const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
    for (const cols of [60, 80, 100]) {
      const term = new Term(font, cols, 25, 6, 5)
      fx.reset(h.program)
      const { put, putGlyph } = term
      const outside = []
      let missed = 0
      for (let f = 0; f < 20; f++) {
        const hit = new Uint8Array(cols * VIZ_BOT)
        const mark = (x, y) => {
          if (y < 1 || y >= VIZ_BOT || x < 0 || x >= cols) outside.push([x, y])
          else hit[y * cols + x] = 1
        }
        term.put = function (x, y, ...rest) { mark(x, y); return put.call(this, x, y, ...rest) }
        term.putGlyph = function (x, y, ...rest) { mark(x, y); return putGlyph.call(this, x, y, ...rest) }
        try { drawWith(h, fx, 2 + f / 5, signal({ pulse: f % 6 === 0 ? 1 : 0 }), term) } finally {
          term.put = put; term.putGlyph = putGlyph
        }
        for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      }
      assert.deepEqual(outside.slice(0, 3), [], `${cols} cols: wrote outside the canvas`)
      assert.equal(missed, 0, `${cols} cols: ${missed} cell-frames left unpainted`)
      // And the lamp is centred on every width.
      const mid = cols >> 1
      assert.ok(term.gfx[8 * cols + mid], `${cols} cols: nothing drawn at the centre of the glass`)
    }
  } finally { h.shutdown() }
})

test('LAVA LAMP: the canvas is bitmaps and blanks only -- no characters, so no shade blocks', async () => {
  const { h, fx } = await bootLamp()
  try {
    let t = 1
    for (let i = 0; i < 120; i++) {
      t += 0.07
      drawWith(h, fx, t, signal({ pulse: i % 9 === 0 ? 1 : 0.1 }), h.term, i > 90)
      for (let y = 1; y < VIZ_BOT; y++) {
        for (let x = 0; x < h.term.cols; x++) {
          const k = y * h.term.cols + x
          assert.ok(h.term.gfx[k] || h.term.chars[k] === 32, `a character at ${x},${y}`)
        }
      }
    }
  } finally { h.shutdown() }
})

test('LAVA LAMP: the picture is there -- a lamp on a shelf, wax in the glass, haze in the room', async () => {
  const { h, fx, mod } = await bootLamp()
  try {
    settle(h, fx, 1)
    const term = h.term, cols = term.cols, mid = cols >> 1
    // The lamp stands as one unbroken column of drawn cells from the cap
    // down to the base: every row it spans has a lit cell at its centre or
    // its rims.
    const yTop = 1 + Math.floor(mod.CAP_TOP / CELL_H), yBot = 1 + Math.floor((mod.BASE_BOT - 1) / CELL_H)
    for (let y = yTop; y <= yBot; y++) {
      let n = 0
      for (let x = mid - 7; x <= mid + 7; x++) if (term.gfx[y * cols + x]) n++
      assert.ok(n >= 2, `the lamp is broken at row ${y}`)
    }
    // Its silhouette: wider at the bulge of the glass than at the cap, and
    // the base flares wider than the collar above it.
    const width = (py) => mod.lampRow(py)[1]
    assert.ok(width(200) > width(40) * 1.6, 'the glass bulges below the cap')
    assert.ok(width(mod.BASE_BOT - 2) > width(mod.GLASS_BOT + 2) * 1.3, 'the base flares')
    // Wax: NORMAL cells, and only inside the glass.
    const G = glassCells(mod, cols)
    const inGlass = (x, y) => x >= G.x0 && x <= G.x1 && y >= G.y0 && y <= G.y1
    const wax = cellsWith(term, null, inGlass)
    assert.ok(wax >= 10, `only ${wax} cells of wax in the glass`)
    assert.equal(cellsWith(term, null, (x, y) => !inGlass(x, y)), 0, 'NORMAL outside the glass: the wax is the subject')
    // The shelf: a line across under the lamp, well wider than it.
    const shelfRow = 1 + Math.floor(mod.SHELF_Y / CELL_H)
    let shelf = 0
    for (let x = 0; x < cols; x++) if (term.gfx[shelfRow * cols + x]) shelf++
    assert.ok(shelf >= 40, `the shelf spans only ${shelf} cells`)
    // Haze: lit pixels out in the room, away from the lamp on both sides.
    const leftRoom = litPixels(term, (x, y) => x < mid - 12 && y < shelfRow)
    const rightRoom = litPixels(term, (x, y) => x > mid + 12 && y < shelfRow)
    assert.ok(leftRoom > 300 && rightRoom > 300, `no haze in the room (${leftRoom} / ${rightRoom} px)`)
  } finally { h.shutdown() }
})

test('LAVA LAMP: a KICK is plainly visible against a LOUD frame, and settles back', async () => {
  const { h, fx } = await bootLamp()
  try {
    let t = settle(h, fx, 1)
    t += 0.034; drawWith(h, fx, t, signal())
    const loud = snapshot(h.term)
    const loudRoom = litPixels(h.term)
    assert.equal(cellsWith(h.term, BRIGHT), 0, 'nothing is BRIGHT between beats')
    t += 0.016; drawWith(h, fx, t, signal(KICK))
    const kick = snapshot(h.term)
    // The haze and wax drift a little between two frames 50ms apart on their
    // own; the kick has to dwarf that. Measured: ~700 of 1680 cells (the wax
    // to BRIGHT, the liquid lit, the halo blown out across the haze).
    const changed = diffCount(loud, kick)
    assert.ok(changed >= 300, `a kick changed only ${changed} cells against the LOUD frame`)
    const bright = cellsWith(h.term, BRIGHT)
    assert.ok(bright >= 15, `only ${bright} BRIGHT cells on the kick -- the wax should flare`)
    const lit = litPixels(h.term)
    assert.ok(lit > loudRoom * 1.3, `the kick lit ${lit} px against LOUD's ${loudRoom} -- the light should blow out`)
    // Still flared a few frames later (a 60Hz pop that is gone in one frame
    // is invisible), down well before the next beat at 100bpm.
    t += 0.1; drawWith(h, fx, t, signal({ pulse: 0.8 }))
    assert.ok(cellsWith(h.term, BRIGHT) >= 15, 'the flare should hold for a few frames')
    for (let i = 0; i < 30; i++) { t += 0.02; drawWith(h, fx, t, signal()) }
    assert.equal(cellsWith(h.term, BRIGHT), 0, 'the wax comes back down after the kick')
  } finally { h.shutdown() }
})

test('LAVA LAMP: only a rising edge is a kick -- a pulse held high flares once', async () => {
  const { h, fx } = await bootLamp()
  try {
    let t = settle(h, fx, 1)
    let kicks = 0, last = h.program._lavaKickAt
    for (let i = 0; i < 60; i++) {
      t += 0.016
      drawWith(h, fx, t, signal({ pulse: 1 }))
      if (h.program._lavaKickAt !== last) { kicks++; last = h.program._lavaKickAt }
    }
    assert.equal(kicks, 1, `a held pulse fired ${kicks} kicks`)
  } finally { h.shutdown() }
})

test('LAVA LAMP: with no tap it still breathes and kicks, on syntheticAudio', async () => {
  const { h } = await bootLamp()
  try {
    assert.equal(h.program._au, null, 'test setup: no tap')
    const seen = new Set()
    for (let i = 0; i < 200; i++) { h.advance(16); seen.add(h.program._lavaKickAt) }
    assert.ok(seen.size >= 3, `only ${seen.size - 1} kicks in 3.2s without a tap`)
    assert.ok(cellsWith(h.term, null) + cellsWith(h.term, BRIGHT) >= 10, 'no lit wax without a tap')
  } finally { h.shutdown() }
})

test('LAVA LAMP: MUTED is dim but never blank, never kicks, and still moves', async () => {
  const { h, fx, mod } = await bootLamp()
  try {
    let t = settle(h, fx, 1, signal(), true)
    // A pulse edge under mute must not flare anything.
    t += 0.034; drawWith(h, fx, t, signal({ pulse: 0 }), h.term, true)
    t += 0.034; drawWith(h, fx, t, signal(KICK), h.term, true)
    assert.equal(cellsWith(h.term, BRIGHT), 0, 'a pulse edge lit something while muted')
    // Dim: no NORMAL anywhere -- the wax drops to MUTED...
    assert.equal(cellsWith(h.term, null), 0, 'NORMAL wax under mute')
    // ...but the lamp is still on: wax at MUTED, a tier that shows on every
    // tint, inside the glass.
    const G = glassCells(mod, h.term.cols)
    const wax = cellsWith(h.term, MUTED, (x, y) => x >= G.x0 && x <= G.x1 && y >= G.y0 && y <= G.y1)
    assert.ok(wax >= 10, `only ${wax} MUTED cells in the glass under mute`)
    const lit = litPixels(h.term)
    assert.ok(lit >= 3000, `only ${lit} lit pixels under mute -- it reads as blank`)
    // Still moving: the wax and the haze do not need the music.
    const a = snapshot(h.term)
    t += 1.5; drawWith(h, fx, t, signal(), h.term, true)
    const changed = diffCount(a, snapshot(h.term))
    assert.ok(changed >= 50, `only ${changed} cells moved in 1.5s under mute`)
  } finally { h.shutdown() }
})

test('LAVA LAMP: a change of level never jumps the wax or the haze', async () => {
  // The old FLOW FIELD scaled `t *` frequency terms by level, so a louder
  // bar jumped the whole field. Here level sets the wax's SPEED through an
  // accumulated phase, and the haze is a pure function of time.
  const { h, fx } = await bootLamp()
  try {
    let t = settle(h, fx, 1, signal({ level: 0.2 }))
    const ph0 = h.program._lavaPhase
    t += 0.05; drawWith(h, fx, t, signal({ level: 0.95 }))
    const step = h.program._lavaPhase - ph0
    assert.ok(step > 0 && step < 0.05, `one frame moved the wax's phase by ${step}`)
    // Far from the lamp the halo never reaches, so a quiet and a loud frame
    // at the same instant draw the same haze there.
    const far = (x) => x < 10 || x >= h.term.cols - 10
    settle(h, fx, 1, signal({ level: 0.2 }))
    drawWith(h, fx, 9, signal({ level: 0.2 }))
    const quiet = snapshot(h.term, far)
    settle(h, fx, 1, signal({ level: 0.95 }))
    drawWith(h, fx, 9, signal({ level: 0.95 }))
    assert.deepEqual(snapshot(h.term, far), quiet, 'the haze moved with the level')
  } finally { h.shutdown() }
})

test('LAVA LAMP: re-entry after a long visit carries no kick clock', async () => {
  const { h, fx } = await bootLamp()
  try {
    h.program._lavaKickAt = 600
    h.program._lavaLastT = 600
    h.program._lavaRenderT = 600
    h.program._lavaPrevPulse = 1
    fx.reset(h.program)
    drawWith(h, fx, 0.5, signal({ pulse: 0 }))
    drawWith(h, fx, 0.52, signal({ pulse: 1 }))
    assert.equal(h.program._lavaKickAt, 0.52, 'the first kick after entry lands')
    assert.ok(cellsWith(h.term, BRIGHT) > 0, 'and flares the wax')
  } finally { h.shutdown() }
})

test('LAVA LAMP: BRIGHT stays on the wax (tube bloom)', async () => {
  const { h, fx, mod } = await bootLamp()
  try {
    const G = glassCells(mod, h.term.cols)
    const outside = (x, y) => !(x >= G.x0 && x <= G.x1 && y >= G.y0 - 1 && y <= G.y1 + 1)
    let t = 1
    for (let f = 0; f < 120; f++) {
      t += 0.05
      drawWith(h, fx, t, signal({ pulse: f % 8 === 0 ? 1 : 0, level: 0.95, bass: 0.95 }))
      assert.equal(cellsWith(h.term, BRIGHT, outside), 0, `BRIGHT outside the glass at frame ${f}`)
    }
  } finally { h.shutdown() }
})
