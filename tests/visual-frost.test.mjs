// FROST / NEON HEART (COLD WAVE, rebuilt 2026-10-18 in pixel bitmaps) --
// what the effect leaves on the grid, read back off it. The heart is drawn
// through putGlyph(), so a character read sees every lit cell as a space:
// these tests read term.gfx (the bitmaps) and term.attrs (the beam tier).
//
// Claims: the canvas contract at three widths; the subject is there (a lit,
// symmetric tube along the heart curve, dark inside, a reflection under the
// curb); a kick THUMPS -- the tube goes BRIGHT and the heart grows -- and a
// pulse that only creeps up does not; the thump settles inside a beat; it
// lights thin tube, not slabs; it is seen on a slow machine; muted, the
// sign is off but the picture still moves; re-entry carries no kick clock.
//
// The frame loop rewrites p._au every frame (visualizer.js), so the beat is
// driven by calling the effect's draw directly with a crafted signal, the
// way tests/visual-dancefloor.test.mjs does.
//
// Run: node --test tests/visual-frost.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { boot } from './harness.mjs'
import { parseBDF } from '../src/bdf.js'
import { Term } from '../src/term.js'

const VIZ_BOT = 22
// Attribute bits, src/cellgrid.js. NORMAL is 0.
const BRIGHT = 1, DIM = 4, MUTED = 32, FAINT = 64
const NORMAL = 0
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000

const signal = (over = {}) => ({
  level: 0.6, bass: 0.4, mid: 0.4, treble: 0.3,
  bands9: new Array(9).fill(0.4), onset: false, pulse: 0, ...over,
})

async function bootFrost() {
  const h = await boot({ station: 'cold-wave' })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  h.advance(300)
  assert.equal(h.program.activeVisualKey(), 'frost', 'COLD WAVE should land on FROST')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/frost.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.frost, mod }
}

function drawWith(h, fx, t, A, muted = false) {
  h.program.muted = muted
  h.program._au = A
  fx.draw(h.program, { term: h.term }, t)
}
/** Settles at rest: a flat pulse for two seconds of frames. */
function settle(h, fx, t0, A = signal()) {
  for (let f = 0; f < 120; f++) drawWith(h, fx, t0 + f / 60, A)
  return t0 + 2
}
const idx = (h, x, y) => y * h.term.cols + x
const pix = (h, x, y) => { const b = h.term.gfx[idx(h, x, y)]; let n = 0; if (b) for (const w of b) for (let v = w; v; v &= v - 1) n++; return n }
const lit = (a) => a === NORMAL || a === MUTED || (a & BRIGHT)
/** Cells on the canvas carrying a bitmap, at a given attribute test. */
function cellsWhere(h, pred) {
  const out = []
  for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) {
    const i = idx(h, x, y)
    if (h.term.gfx[i] && pred(h.term.attrs[i])) out.push({ x, y })
  }
  return out
}
/** Horizontal extent of the cells lit at MUTED or above on the canvas. */
function litSpan(h) {
  const c = cellsWhere(h, lit)
  return Math.max(...c.map((p) => p.x)) - Math.min(...c.map((p) => p.x))
}

test('FROST: repaints every canvas cell and nothing outside rows 1..21, at 60, 80 and 100 columns', async () => {
  const { h, fx } = await bootFrost()
  const font = parseBDF(readFileSync(new URL('../fonts/ter-u16n.bdf', import.meta.url), 'utf8'))
  try {
    for (const cols of [60, 80, 100]) {
      const term = new Term(font, cols, 25, 6, 5)
      const hit = new Uint8Array(cols * VIZ_BOT)
      const outside = []
      for (const fn of ['put', 'putGlyph']) {
        const orig = term[fn]
        term[fn] = function (x, y, ...rest) {
          if (y < 1 || y >= VIZ_BOT || x < 0 || x >= cols) outside.push(`${x},${y}`)
          else hit[y * cols + x] = 1
          return orig.call(this, x, y, ...rest)
        }
      }
      h.program.muted = false
      fx.reset(h.program)
      h.program._au = signal({ pulse: 0 }); fx.draw(h.program, { term }, 5)
      h.program._au = signal({ pulse: 1, level: 1 }); fx.draw(h.program, { term }, 5.02)
      assert.deepEqual(outside.slice(0, 5), [], `${cols} cols: ${outside.length} puts landed outside the canvas`)
      let missed = 0
      for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      assert.equal(missed, 0, `${cols} cols: ${missed} canvas cells unpainted`)
      assert.ok(term.gfx.some(Boolean), `${cols} cols: no pixels drawn`)
    }
  } finally { h.shutdown() }
})

test('FROST: the subject is on the grid -- a lit, symmetric heart, dark inside, reflected under the curb', async () => {
  const { h, fx, mod } = await bootFrost()
  try {
    settle(h, fx, 10)
    const tube = mod.tubeCellsFor(h.term)
    const unlit = tube.filter(({ x, y }) => !h.term.gfx[idx(h, x, y)] || !lit(h.term.attrs[idx(h, x, y)]))
    // A few cells may be the buzzing stretch on its off slot, or straddle
    // a cell's blank ninth column.
    assert.ok(unlit.length <= tube.length * 0.1, `${unlit.length}/${tube.length} points of the heart curve are not lit tube`)
    // Thin tube, not filled glyphs: the tube's cells are mostly dark pixels.
    const area = tube.reduce((n, { x, y }) => n + pix(h, x, y), 0) / tube.length
    assert.ok(area > 8 && area < 80, `tube cells average ${area.toFixed(0)} lit pixels of 128`)
    // Dark inside: the cell at the heart's middle carries nothing above FAINT.
    const ys = tube.map((p) => p.y), xs = tube.map((p) => p.x)
    const mx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2), my = Math.round((Math.min(...ys) + Math.max(...ys)) / 2)
    assert.ok(!h.term.gfx[idx(h, mx, my)] || h.term.attrs[idx(h, mx, my)] & (FAINT | DIM), 'the inside of the heart is lit')
    // Symmetric: the lit cells mirror about the centre column (the rain is
    // FAINT and excluded by asking for MUTED and above).
    const cells = cellsWhere(h, lit)
    const set = new Set(cells.map((p) => `${p.x},${p.y}`))
    const axis = (Math.min(...cells.map((p) => p.x)) + Math.max(...cells.map((p) => p.x))) / 2
    const mirrored = cells.filter((p) => set.has(`${Math.round(2 * axis - p.x)},${p.y}`) || set.has(`${Math.round(2 * axis - p.x) + 1},${p.y}`) || set.has(`${Math.round(2 * axis - p.x) - 1},${p.y}`))
    assert.ok(mirrored.length >= cells.length * 0.9, `only ${mirrored.length}/${cells.length} lit cells have a mirror`)
    // The reflection: pixels under the heart's point, below the curb, dimmer
    // than the tube.
    const below = cellsWhere(h, () => true).filter((p) => p.y > Math.max(...ys) + 1 && p.x >= Math.min(...xs) && p.x <= Math.max(...xs))
    assert.ok(below.length >= 30, `only ${below.length} cells of reflection`)
    assert.ok(below.every((p) => !lit(h.term.attrs[idx(h, p.x, p.y)]) || pix(h, p.x, p.y) < 40), 'the reflection outshines the tube')
    // No characters on the canvas at all: it is a picture.
    const text = Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1)).join('')
    assert.equal(text.trim(), '', 'characters on the canvas')
  } finally { h.shutdown() }
})

test('FROST: a kick thumps the heart -- BRIGHT and bigger; no rising edge, no thump', async () => {
  const { h, fx, mod } = await bootFrost()
  try {
    let t = settle(h, fx, 10)
    assert.equal(cellsWhere(h, (a) => a & BRIGHT).length, 0, 'BRIGHT at rest -- a kick would have nothing to add')
    const restSpan = litSpan(h)
    // A held-high pulse, and one that creeps up, are not kicks.
    drawWith(h, fx, t, signal({ pulse: 0.15 }))
    drawWith(h, fx, t + 0.02, signal({ pulse: 0.3 }))
    drawWith(h, fx, t + 0.04, signal({ pulse: 0.45 }))
    drawWith(h, fx, t + 0.06, signal({ pulse: 0.45 }))
    assert.equal(cellsWhere(h, (a) => a & BRIGHT).length, 0, 'a pulse that only creeps up thumped')
    t = settle(h, fx, t + 1, signal({ pulse: 0 }))
    // The kick.
    drawWith(h, fx, t, signal({ pulse: 1 }))
    const bright = cellsWhere(h, (a) => a & BRIGHT).length
    assert.ok(bright >= 40, `only ${bright} BRIGHT cells on the kick -- the thump is not visible`)
    assert.ok(litSpan(h) >= restSpan + 2, `the heart did not grow on the kick (${restSpan} -> ${litSpan(h)} columns)`)
    // Thin tube even at BRIGHT: no slab of bloom.
    const brightCells = cellsWhere(h, (a) => a & BRIGHT)
    const area = brightCells.reduce((n, p) => n + pix(h, p.x, p.y), 0) / brightCells.length
    assert.ok(area < 70, `BRIGHT cells average ${area.toFixed(0)} lit pixels of 128 -- a slab`)
    // Settles inside a beat: half a second on, the tube is back under BRIGHT
    // and back to its rest size.
    for (let f = 1; f <= 33; f++) drawWith(h, fx, t + f / 60, signal({ pulse: Math.exp(-f / 6) }))
    assert.equal(cellsWhere(h, (a) => a & BRIGHT).length, 0, 'the thump outlived a 120bpm beat')
    assert.ok(Math.abs(litSpan(h) - restSpan) <= 1, 'the heart did not shrink back')
    assert.ok(mod.thump(0.55, 30) < 0.1)
  } finally { h.shutdown() }
})

test('FROST: a thump is seen on a slow machine -- full strength on the frame after the kick even 1s later', async () => {
  // At a frame or so a second (the Haswell box, headless swiftshader) a
  // clock-timed thump fell entirely between frames.
  const { h, fx, mod } = await bootFrost()
  try {
    settle(h, fx, 10)
    drawWith(h, fx, 13, signal({ pulse: 0 }))
    drawWith(h, fx, 14, signal({ pulse: 1 }))
    drawWith(h, fx, 15, signal({ pulse: 0.15 }))
    assert.ok(cellsWhere(h, (a) => a & BRIGHT).length >= 40, 'the second frame after a kick, a second late, shows no thump')
    assert.equal(mod.thump(1, 1), 1)
    assert.equal(mod.thump(1, mod.THUMP_MIN_FRAMES), Math.exp(-(1 - mod.THUMP_HOLD_S) / mod.THUMP_TAU_S))
  } finally { h.shutdown() }
})

test('FROST: louder glows brighter at rest; muted, the sign is off but the picture still moves', async () => {
  const { h, fx, mod } = await bootFrost()
  try {
    const tube = mod.tubeCellsFor(h.term)
    const tierCount = (pred) => tube.filter(({ x, y }) => h.term.gfx[idx(h, x, y)] && pred(h.term.attrs[idx(h, x, y)])).length
    settle(h, fx, 10, signal({ level: 0.05 })); settle(h, fx, 12, signal({ level: 0.05 }))
    const quietNormal = tierCount((a) => a === NORMAL)
    settle(h, fx, 14, signal({ level: 1 })); settle(h, fx, 16, signal({ level: 1 }))
    const loudNormal = tierCount((a) => a === NORMAL)
    assert.ok(loudNormal > quietNormal + tube.length * 0.5, `loud ${loudNormal} vs quiet ${quietNormal} NORMAL tube cells`)
    // Muted: kicks do nothing, nothing above FAINT/DIM anywhere on the canvas.
    for (let f = 0; f < 240; f++) drawWith(h, fx, 20 + f / 60, signal({ pulse: f % 30 === 0 ? 1 : 0, level: 1 }), true)
    assert.equal(cellsWhere(h, (a) => !(a & (FAINT | DIM))).length, 0, 'a muted sign still glows above DIM')
    // ...and still the outline of the glass.
    const glass = tube.filter(({ x, y }) => h.term.gfx[idx(h, x, y)]).length
    assert.ok(glass >= tube.length * 0.8, `the switched-off tube is not there (${glass}/${tube.length})`)
    // Alive: rain and ripples move between two muted frames.
    const before = h.term.gfx.map((b) => (b ? b.join(',') : ''))
    drawWith(h, fx, 25, signal(), true)
    const moved = h.term.gfx.filter((b, i) => (b ? b.join(',') : '') !== before[i]).length
    assert.ok(moved >= 5, `only ${moved} cells changed between muted frames -- dead`)
  } finally { h.shutdown() }
})

test('FROST: no tap, it beats to the synthetic pulse', async () => {
  const { h, fx } = await bootFrost()
  try {
    h.program._au = null
    let peak = 0, trough = Infinity
    for (let f = 0; f < 180; f++) {
      h.program.muted = false; h.program._au = null
      fx.draw(h.program, { term: h.term }, 30 + f / 60)
      const b = cellsWhere(h, (a) => a & BRIGHT).length
      peak = Math.max(peak, b); trough = Math.min(trough, b)
    }
    assert.ok(peak >= 40 && trough === 0, `synthetic beat: BRIGHT cells range ${trough}..${peak}`)
  } finally { h.shutdown() }
})

test('FROST: re-entry after a long visit carries no kick clock from the last one', async () => {
  const { h, fx } = await bootFrost()
  try {
    drawWith(h, fx, 500, signal({ pulse: 0 }))
    drawWith(h, fx, 500.02, signal({ pulse: 1 }))
    assert.ok(h.program._frostKickAt > 400, 'test setup: a kick late in a long visit')
    h.key('e'); h.advance(200)
    h.key('v'); h.advance(300)
    const t = effectT(h)
    assert.ok(h.program._frostKickAt <= t + 0.05, `_frostKickAt ${h.program._frostKickAt} on a clock at ${t}`)
    assert.ok(h.program._frostLastT <= t + 0.05, `_frostLastT ${h.program._frostLastT} on a clock at ${t}`)
  } finally { h.shutdown() }
})

// 2026-10-20 polish (CRITIQUE-1020). Three notes, each read back here:
//  - the reflection was a stair-stepped "moustache": it is now the heart's
//    own width, drawn as horizontal dashes -- every third pixel row under
//    the curb dark (TOKYO BAY's swell gaps);
//  - muted, the tube was a hollow double line (a cookie cutter): it is a
//    solid tube at DIM now -- unlit glass, not an outline;
//  - the hang wires were ticks: the heart hangs lower, so they run at
//    at least 26 pixels down from the canvas top (they ran 20 before).
// Mutation-checked: the swell gap removed, the muted tube back at 108 (the
// old FAINT walls), or HEART_TOP back at 22 each go red.
const litRow = (h, py, x0, x1) => {
  // Is any pixel lit on framebuffer row py (canvas-relative) between cells x0..x1?
  const cy = 1 + Math.floor(py / 16), r = py % 16
  for (let x = x0; x <= x1; x++) { const b = h.term.gfx[idx(h, x, cy)]; if (b && b[r]) return true }
  return false
}
test('FROST: the reflection is the heart\'s width in dashes; the muted tube is solid; the wires hang', async () => {
  const { h, fx, mod } = await bootFrost()
  try {
    settle(h, fx, 10)
    const tube = mod.tubeCellsFor(h.term)
    const xs = tube.map((p) => p.x)
    const hx0 = Math.min(...xs), hx1 = Math.max(...xs)
    const { curbY, FH } = h.program._frost
    // Width: nothing in the water outside the heart's own columns (+1 for
    // the swell and the halo).
    const curbRow = 1 + Math.floor(curbY / 16)
    const water = cellsWhere(h, () => true).filter((p) => p.y > curbRow)
    assert.ok(water.length >= 30, `only ${water.length} cells of reflection`)
    const wx0 = Math.min(...water.map((p) => p.x)), wx1 = Math.max(...water.map((p) => p.x))
    assert.ok(wx0 >= hx0 - 1 && wx1 <= hx1 + 1, `reflection spans ${wx0}..${wx1}, the heart ${hx0}..${hx1}`)
    // Dashes: the swell gaps are dark across the whole heart, the rows
    // between them mostly lit.
    let gaps = 0, gapLit = 0, rows = 0, rowsLit = 0
    for (let py = curbY + 2; py < FH; py++) {
      const on = litRow(h, py, hx0 - 1, hx1 + 1)
      if ((py - curbY) % 3 === 0) { gaps++; if (on) gapLit++ } else { rows++; if (on) rowsLit++ }
    }
    assert.equal(gapLit, 0, `${gapLit}/${gaps} swell gaps carry light -- the reflection is not drawn in dashes`)
    assert.ok(rowsLit >= rows * 0.6, `only ${rowsLit}/${rows} reflection rows are lit`)
    // The wires: lit pixels from the canvas top down at the lobes' columns.
    const G = h.program._frost
    const wc = Math.floor(Math.round(G.cx + G.lobeDX) / G.adv)
    let wire = 0
    for (let py = 0; py < mod.HEART_TOP; py++) if (litRow(h, py, wc, wc)) wire++
    assert.ok(wire >= 26, `the wires light only ${wire} of the top ${mod.HEART_TOP} pixel rows`)
    // Muted: the tube is a solid DIM line, not FAINT walls.
    for (let f = 0; f < 120; f++) drawWith(h, fx, 20 + f / 60, signal(), true)
    const dim = tube.filter(({ x, y }) => h.term.gfx[idx(h, x, y)] && h.term.attrs[idx(h, x, y)] === DIM).length
    assert.ok(dim >= tube.length * 0.8, `only ${dim}/${tube.length} muted tube cells are DIM glass`)
  } finally { h.shutdown() }
})
