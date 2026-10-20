// RIPPLE (CITY LIGHTS), rebuilt 2026-10-18 as TOKYO BAY: Tokyo Tower over
// the bay at night in beam-resolution pixel art (putGlyph bitmaps, FLAME's
// technique). What it leaves on the grid, read off the gfx plane -- a
// putGlyph() cell holds a space in the character plane, so a character
// reading of this effect sees nothing at all:
//  - the canvas contract (every cell repainted, by put or putGlyph; nothing
//    outside rows 1..21) and no text on the canvas;
//  - the picture: the tower is the brightest thing at rest, the city has
//    lit windows, the bay holds a reflection under the tower;
//  - THE BEAT: a kick lights the tower BRIGHT (the only BRIGHT on screen)
//    and sends a ring of light across the bay, which is still there a
//    second later -- set beside a kick-less frame the bay differs plainly;
//  - no tap: the synthetic ~0.9s pulse still kicks; muted: no kicks, no
//    rings, nothing BRIGHT, but the water still moves;
//  - re-entry carries no ring or kick clock over.
//
// The frame loop rewrites p._au every frame (visualizer.js), so everything
// about the beat is driven by calling the effect's draw directly with a
// crafted signal.
//
// Run: node --test tests/visual-ripple.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

const VIZ_BOT = 22
// Attribute bits, src/cellgrid.js.
const BRIGHT = 1, DIM = 4, MUTED = 32, FAINT = 64
// Tier of an attribute byte, dark to light: FAINT 0 .. BRIGHT 4.
const tierOf = (a) => (a & FAINT) ? 0 : (a & DIM) ? 1 : (a & MUTED) ? 2 : (a & BRIGHT) ? 4 : 3
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000

const signal = (over = {}) => ({
  level: 0.6, bass: 0.5, mid: 0.4, treble: 0.3,
  bands9: new Array(9).fill(0.45), onset: false, pulse: 0.15, ...over,
})

async function bootCity() {
  const h = await boot({ station: 'city-lights' })
  h.powerOn()
  h.key('v')
  assert.equal(h.program.activeVisualKey(), 'ripple', 'CITY LIGHTS should land on RIPPLE')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/ripple.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.ripple, mod }
}

function drawWith(h, fx, t, A, muted = false) {
  h.program.muted = muted
  h.program._au = A
  fx.draw(h.program, { term: h.term }, t)
}

/** Lit pixels in cell rows [y0, y1). */
function litPixels(h, y0, y1) {
  let n = 0
  for (let y = y0; y < y1; y++) for (let x = 0; x < h.term.cols; x++) {
    const bits = h.term.gfx[y * h.term.cols + x]
    if (!bits) continue
    for (const row of bits) { let r = row; while (r) { n += r & 1; r >>>= 1 } }
  }
  return n
}
/** The cell rows holding the bay: the row the shore falls in, and below. */
const bayRows = (h, mod) => {
  const S = mod.sceneTables(h.term.cols, h.term.font.cellW, h.term.font.cellH)
  return [Math.floor(S.HY / S.ch) + 2, VIZ_BOT]
}
/** Copy of the bay's bitmaps, for comparing frames. */
function baySnap(h, mod) {
  const [y0, y1] = bayRows(h, mod)
  const out = []
  for (let y = y0; y < y1; y++) for (let x = 0; x < h.term.cols; x++) {
    const bits = h.term.gfx[y * h.term.cols + x]
    out.push(bits ? Array.from(bits) : null)
  }
  return out
}
/** Pixels set in `b` and not in `a`. */
function newPixels(a, b) {
  let n = 0
  for (let i = 0; i < a.length; i++) {
    const rb = b[i]; if (!rb) continue
    const ra = a[i]
    for (let k = 0; k < rb.length; k++) { let d = rb[k] & ~(ra ? ra[k] : 0); while (d) { n += d & 1; d >>>= 1 } }
  }
  return n
}

test('RIPPLE: repaints every canvas cell, by put or putGlyph, and nothing outside rows 1..21', async () => {
  const { h, fx } = await bootCity()
  try {
    const origDraw = fx.draw, origPut = h.term.put, origGlyph = h.term.putGlyph, cols = h.term.cols
    const outside = []
    let hit = null, frames = 0, short = 0, glyphs = 0
    const mark = (x, y) => { if (y < 1 || y >= VIZ_BOT) outside.push(y); else if (x >= 0 && x < cols) hit[y * cols + x] = 1 }
    h.term.put = function (x, y, ...rest) { if (hit) mark(x, y); return origPut.call(this, x, y, ...rest) }
    h.term.putGlyph = function (x, y, ...rest) { if (hit) { mark(x, y); glyphs++ } return origGlyph.call(this, x, y, ...rest) }
    fx.draw = function (...args) {
      hit = new Uint8Array(cols * VIZ_BOT)
      try { return origDraw.apply(this, args) } finally {
        let missed = 0
        for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) if (!hit[y * cols + x]) missed++
        if (missed) short++
        frames++
        hit = null
      }
    }
    try { h.advance(3000) } finally { fx.draw = origDraw; h.term.put = origPut; h.term.putGlyph = origGlyph }
    assert.ok(frames > 100, `draw should have run (ran ${frames})`)
    assert.ok(glyphs > frames * 300, `only ${glyphs} bitmap cells over ${frames} frames -- the picture is not in pixels`)
    assert.deepEqual([...new Set(outside)], [], 'the effect wrote to rows outside the canvas')
    assert.equal(short, 0, `${short} of ${frames} frames left canvas cells unpainted`)
    // No text on the canvas: the old build's box-drawing outline is gone.
    for (let y = 1; y < VIZ_BOT; y++) assert.equal(h.row(y).trim(), '', `characters on canvas row ${y}: ${h.row(y)}`)
  } finally { h.shutdown() }
})

test('RIPPLE: the picture reads back -- the tower brightest, lit windows, its reflection on the bay', async () => {
  const { h, fx, mod } = await bootCity()
  try {
    fx.reset(h.program)
    drawWith(h, fx, 50, signal())
    const cols = h.term.cols
    const S = mod.sceneTables(cols, h.term.font.cellW, h.term.font.cellH)
    const tcx = Math.floor(S.tx / S.cw)
    // The tower's column: lit cells from its antenna down to the shore, at
    // NORMAL -- the top tier at rest, and nothing else on screen above it.
    const shoreRow = Math.floor(S.HY / S.ch) // canvas-relative
    let towerCells = 0, worst = 0
    for (let cy = 0; cy < shoreRow; cy++) {
      const i = (cy + 1) * cols + tcx
      if (h.term.gfx[i]) { towerCells++; assert.equal(tierOf(h.term.attrs[i]), 3, `tower cell at row ${cy + 1} is not NORMAL`) }
    }
    assert.ok(towerCells >= shoreRow - 1, `the tower stands in only ${towerCells} of ${shoreRow} rows`)
    for (let i = cols; i < cols * VIZ_BOT; i++) if (h.term.gfx[i]) worst = Math.max(worst, tierOf(h.term.attrs[i]))
    assert.equal(worst, 3, 'at rest nothing outshines the tower')
    // Windows: hundreds of lit window pixels in the skyline.
    let win = 0
    for (let k = 0; k < S.winId.length; k++) if (mod.windowLit(S, k, 50)) win++
    assert.ok(win > 150, `only ${win} windows lit`)
    assert.ok(litPixels(h, 1, shoreRow + 1) > 2000, 'the sky half is nearly dark')
    // The reflection: the tower's column on the bay is lit.
    let refl = 0
    for (let y = shoreRow + 2; y < VIZ_BOT; y++) for (let x = tcx - 1; x <= tcx + 1; x++) if (h.term.gfx[y * cols + x]) refl++
    assert.ok(refl >= 8, `the tower's reflection is only ${refl} cells`)
  } finally { h.shutdown() }
})

// 2026-10-20 polish (CRITIQUE-1020: the bridge carried the tower's weight).
// One attribute per cell: a single MUTED lamp lifts the whole cell, so
// lamps in every cell drew the deck and cables at MUTED end to end. Read
// off the static scene: at most half the cells the bridge crosses may
// hold a MUTED-or-brighter bridge pixel (39% now, 70% before); the rest draw at the bridge's DIM.
test('RIPPLE: the bridge draws mostly at DIM, its lamps in about one cell in two', async () => {
  const { h, mod } = await bootCity()
  try {
    const S = mod.sceneTables(h.term.cols, h.term.font.cellW, h.term.font.cellH)
    const cells = new Map() // cell index -> brightest bridge tier in it
    for (let i = 0; i < S.sky.length; i++) {
      if (S.own[i] !== mod.OWN.BRIDGE || S.sky[i] < 0) continue
      const x = i % S.W, y = Math.floor(i / S.W)
      const c = Math.floor(y / S.ch) * S.cols + Math.floor(x / S.cw)
      cells.set(c, Math.max(cells.get(c) ?? -1, S.sky[i]))
    }
    const lit = [...cells.values()].filter((v) => v >= 2).length
    assert.ok(cells.size > 40, `the bridge crosses only ${cells.size} cells`)
    assert.ok(lit / cells.size <= 0.5, `${lit} of ${cells.size} bridge cells draw at MUTED -- the bridge is as heavy as the tower`)
  } finally { h.shutdown() }
})

test('RIPPLE: a kick lights the tower BRIGHT and sends a ring across the bay that is still there a second later', async () => {
  // The same timeline twice, with and without one kick: everything else in
  // the picture (swell, glints, windows) is a function of the clock, so what
  // differs on the bay away from the tower's own reflection is the ring.
  // Mutation-checked 2026-10-18: neutering the kick's edge (BEAT_RISE out of
  // reach) fails the BRIGHT half; skipping the ring draw fails the bay half
  // (a first version compared against an earlier frame instead, and the
  // swell alone passed it).
  const { h, fx, mod } = await bootCity()
  try {
    const S = mod.sceneTables(h.term.cols, h.term.font.cellW, h.term.font.cellH)
    const tcx = Math.floor(S.tx / S.cw)
    const brightCells = (near) => {
      let n = 0
      for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) {
        const i = y * h.term.cols + x
        if (h.term.gfx[i] && (h.term.attrs[i] & BRIGHT) && (Math.abs(x - tcx) <= 5) === near) n++
      }
      return n
    }
    const run = (kick, check) => {
      fx.reset(h.program)
      h.program._rippleLvl = 0.7
      let t = 100
      // Loud and steady, no edge: the LOUD tile.
      for (let i = 0; i < 40; i++) { drawWith(h, fx, t, signal({ level: 0.7 })); t += 1 / 30 }
      assert.equal(brightCells(true) + brightCells(false), 0, 'BRIGHT on screen with no kick')
      drawWith(h, fx, t, signal({ level: 0.7, pulse: kick ? 1 : 0.15, onset: kick })); t += 1 / 30
      for (let i = 0; i < 5; i++) { drawWith(h, fx, t, signal({ level: 0.7 })); t += 1 / 30 }
      check?.()
      for (let i = 0; i < 30; i++) { drawWith(h, fx, t, signal({ level: 0.7 })); t += 1 / 30 }
      return baySnap(h, mod)
    }
    const loud = run(false)
    const kick = run(true, () => {
      const near = brightCells(true), off = brightCells(false)
      assert.ok(near >= 8, `the kick lit only ${near} tower cells BRIGHT`)
      assert.equal(off, 0, `${off} BRIGHT cells off the tower -- only the tower may flare`)
    })
    // A second on: the tower is back to NORMAL, the ring is out on the water.
    assert.equal(brightCells(true) + brightCells(false), 0, 'the flare held past a second -- a strobe at any real tempo')
    const away = (snap) => snap.map((b, i) => (Math.abs((i % h.term.cols) - tcx) <= 6 ? null : b))
    // Crest gained plus trough cleared: the ring is both.
    const moved = newPixels(away(loud), away(kick)) + newPixels(away(kick), away(loud))
    assert.ok(moved >= 100, `a second after the kick only ${moved} bay pixels changed away from the tower -- the ring is not visible`)
  } finally { h.shutdown() }
})

test('RIPPLE: with no tap the synthetic ~0.9s pulse still kicks the tower', async () => {
  const { h } = await bootCity()
  try {
    const s0 = h.program._rippleStep
    h.advance(4000)
    const steps = h.program._rippleStep - s0
    assert.ok(steps >= 3 && steps <= 6, `${steps} kicks in 4s on syntheticAudio's ~0.9s pulse`)
  } finally { h.shutdown() }
})

test('RIPPLE: muted, no kick, no ring and nothing BRIGHT -- but the water still moves', async () => {
  const { h, fx, mod } = await bootCity()
  try {
    fx.reset(h.program)
    let t = 200
    const s0 = h.program._rippleStep
    let bright = 0
    const snaps = []
    for (let i = 0; i < 60; i++) {
      drawWith(h, fx, t, signal({ pulse: i % 10 ? 0 : 1, onset: true }), true); t += 1 / 30
      for (let k = h.term.cols; k < h.term.cols * VIZ_BOT; k++) if (h.term.gfx[k] && (h.term.attrs[k] & BRIGHT)) bright++
      if (i % 20 === 0) snaps.push(baySnap(h, mod))
    }
    assert.equal(h.program._rippleStep, s0, 'a kick landed while muted')
    assert.equal(bright, 0, 'BRIGHT cells while muted')
    assert.ok(newPixels(snaps[0], snaps[2]) > 50, 'the bay froze while muted')
    assert.ok(litPixels(h, 1, VIZ_BOT) > 2000, 'muted went dark rather than faint')
  } finally { h.shutdown() }
})

test('RIPPLE: re-entry after a long visit carries no kick clock or ring from the previous visit', async () => {
  const { h } = await bootCity()
  try {
    // Any clock left over sits far in the restarted one's future, and the
    // assertions allow 0.05s past a clock at ~0.1s. 2026-10-20 (test-speed
    // pass): was 30s, which was 2.3s of the suite's CPU; 8s still leaves
    // every stale kick and ring ~6s ahead. Mutation-checked: deleting
    // reset()'s _rippleKickAt line, or its startT loop, still goes red.
    h.advance(8000)
    h.key('e'); h.advance(500)
    h.key('v'); h.advance(100)
    const t = effectT(h)
    assert.ok(h.program._rippleKickAt <= t + 0.05, `kick clock ${h.program._rippleKickAt} on a clock at ${t}`)
    for (const r of h.program._ripples) assert.ok(r.startT <= t + 0.05, `a ring starts at ${r.startT} on a clock at ${t}`)
    const s0 = h.program._rippleStep
    h.advance(2500)
    assert.ok(h.program._rippleStep > s0, 'no kick landed after re-entry')
  } finally { h.shutdown() }
})
