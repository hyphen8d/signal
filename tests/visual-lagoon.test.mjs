// LAGOON (TRADEWINDS), rebuilt 2026-10-20 in beam-resolution pixel art
// (putGlyph bitmaps, FLAME's technique; TOKYO BAY's packer). What it leaves
// on the grid, read off the gfx plane -- a putGlyph() cell holds a space in
// the character plane, so a character reading of this effect sees nothing:
//  - the canvas contract (every cell repainted, by put or putGlyph; nothing
//    outside rows 1..21) and no text on the canvas;
//  - the picture: a round full moon, its glitter path on the water UNDER it,
//    the palm, and the torches as the only NORMAL at rest;
//  - THE BEAT: a kick doubles both flames (read as their height in lit
//    pixels), lights their cores BRIGHT -- the only BRIGHT on screen -- and
//    lets go within a second;
//  - level sets the resting height; no tap: the synthetic ~0.9s pulse still
//    kicks; muted: no kicks, nothing BRIGHT, flames low but burning, water
//    still moving;
//  - re-entry carries no kick clock over.
//
// The frame loop rewrites p._au every frame (visualizer.js), so everything
// about the beat is driven by calling the effect's draw directly with a
// crafted signal, as tests/visual-ripple.test.mjs does.
//
// Run: node --test tests/visual-lagoon.test.mjs

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

async function bootLagoon() {
  const h = await boot({ station: 'tradewinds' })
  h.powerOn()
  h.key('v')
  assert.equal(h.program.activeVisualKey(), 'lagoon', 'TRADEWINDS should land on LAGOON')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/lagoon.js?v=${globalThis.SIGNAL_BUILD}`)
  const S = mod.sceneTables(h.term.cols, h.term.font.cellW, h.term.font.cellH)
  return { h, fx: VISUALS.lagoon, mod, S }
}

function drawWith(h, fx, t, A, muted = false) {
  h.program.muted = muted
  h.program._au = A
  fx.draw(h.program, { term: h.term }, t)
}

/** Is canvas pixel (x, y) lit, and at what tier (-1 = dark)? Canvas pixel
 *  row 0 is the top of grid row 1. */
function px(h, x, y) {
  const { cellW, cellH } = h.term.font
  const cx = Math.floor(x / cellW), cy = Math.floor(y / cellH) + 1
  const i = cy * h.term.cols + cx
  const bits = h.term.gfx[i]
  if (!bits) return -1
  return (bits[y % cellH] >> (cellW - 1 - (x % cellW))) & 1 ? tierOf(h.term.attrs[i]) : -1
}

/** A flame's height: the topmost pixel row above its cup holding at least
 *  three lit MUTED-or-brighter pixels within the fire box's width. Sparks
 *  are 2px wide, so a lone spark does not count. */
function flameHeight(h, S, ti) {
  const { tx, cupY } = S.torches[ti]
  let top = cupY
  for (let y = cupY - 1; y >= 0; y--) {
    let n = 0
    for (let x = tx - 24; x <= tx + 24; x++) if (px(h, x, y) >= 2) n++
    if (n >= 3) top = y
  }
  return cupY - top
}

function brightCells(h) {
  let n = 0
  for (let i = h.term.cols; i < h.term.cols * VIZ_BOT; i++) if (h.term.gfx[i] && tierOf(h.term.attrs[i]) === 4) n++
  return n
}

/** Copy of the water's bitmaps, for comparing frames. */
function waterSnap(h, S) {
  const out = []
  for (let y = Math.floor(S.HY / S.ch) + 2; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) {
    const bits = h.term.gfx[y * h.term.cols + x]
    out.push(bits ? Array.from(bits) : null)
  }
  return out
}
function changedPixels(a, b) {
  let n = 0
  for (let i = 0; i < a.length; i++) {
    const ra = a[i], rb = b[i]
    for (let k = 0; k < 16; k++) { let d = (ra ? ra[k] : 0) ^ (rb ? rb[k] : 0); while (d) { n += d & 1; d >>>= 1 } }
  }
  return n
}

test('LAGOON: repaints every canvas cell, by put or putGlyph, and nothing outside rows 1..21', async () => {
  const { h, fx } = await bootLagoon()
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
    // No text on the canvas: the old build's '/' palm, '▓' island and
    // '▄▀▌▐' moon are gone, and so is every '~'/'≈' (they raster as NNNN).
    for (let y = 1; y < VIZ_BOT; y++) assert.equal(h.row(y).trim(), '', `characters on canvas row ${y}: ${h.row(y)}`)
  } finally { h.shutdown() }
})

test('LAGOON: the picture reads back -- a round full moon, its glitter path under it, a palm, the torches brightest', async () => {
  const { h, fx, S } = await bootLagoon()
  try {
    fx.reset(h.program)
    let t = 50
    for (let i = 0; i < 30; i++) { drawWith(h, fx, t, signal()); t += 1 / 30 }
    const { W, HY, mx, my, R } = S
    // The moon: lit pixels fill a disc (not a ring, not a slab), and its
    // extent is round once the pixel aspect is allowed for.
    let x0 = W, x1 = 0, y0 = HY, y1 = 0, inside = 0, lit = 0
    // Above the island shoulder, whose rim runs under the moon at the horizon.
    for (let y = 0; y < HY - 24; y++) for (let x = mx - R - 4; x <= mx + R + 4; x++) {
      const v = px(h, x, y)
      const inDisc = (x - mx) ** 2 + ((y - my) * 1.2) ** 2 < (R - 2) ** 2
      if (inDisc) { inside++; if (v >= 1) lit++ }
      if (v >= 1) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    }
    const share = lit / inside
    assert.ok(share > 0.3 && share < 0.7, `the moon's face is ${(share * 100).toFixed(0)}% lit -- a dithered disc, neither ring nor slab`)
    const aspect = ((x1 - x0 + 1) / (y1 - y0 + 1)) / 1.2
    assert.ok(Math.abs(aspect - 1) < 0.12, `the moon is ${x1 - x0 + 1}x${y1 - y0 + 1} px: not round on the tube (${aspect.toFixed(2)})`)
    // The glitter path: MUTED water pixels, centred under the moon.
    let sum = 0, n = 0
    // (Within 100px of it: the torch cups and flames are MUTED too.)
    for (let y = HY + 1; y < S.H; y++) for (let x = mx - 100; x <= mx + 100; x++) if (px(h, x, y) === 2) { sum += x; n++ }
    assert.ok(n > 300, `only ${n} MUTED glitter pixels on the water`)
    assert.ok(Math.abs(sum / n - mx) < 12, `the glitter path is centred at ${(sum / n).toFixed(0)}, the moon at ${mx}`)
    // The palm: a trunk and fronds in the left third, above the horizon.
    let palm = 0
    for (let y = 0; y < HY; y++) for (let x = 0; x < W * 0.32; x++) if (px(h, x, y) >= 0) palm++
    assert.ok(palm > 2500, `only ${palm} lit pixels where the palm stands`)
    // At rest the flames are the top tier, and nothing else reaches it.
    let worst = 0, normalOff = 0
    for (let cy = 1; cy < VIZ_BOT; cy++) for (let cx = 0; cx < h.term.cols; cx++) {
      const i = cy * h.term.cols + cx
      if (!h.term.gfx[i]) continue
      const tr = tierOf(h.term.attrs[i])
      worst = Math.max(worst, tr)
      const near = S.torches.some(({ tx }) => Math.abs(cx * S.cw + 4 - tx) <= 30)
      if (tr >= 3 && !near) normalOff++
    }
    assert.equal(worst, 3, `at rest the flames are NORMAL and nothing is BRIGHT (top tier ${worst})`)
    assert.equal(normalOff, 0, `${normalOff} NORMAL cells away from the torches -- only the fire may lead`)
    for (let ti = 0; ti < S.torches.length; ti++) assert.ok(flameHeight(h, S, ti) >= 12, `torch ${ti} is not burning`)
  } finally { h.shutdown() }
})

test('LAGOON: a kick doubles both flames, lights them BRIGHT and throws sparks, then lets go', async () => {
  // The same timeline twice, with and without one kick. Mutation-checked
  // 2026-10-20: with the kick's edge out of reach (BEAT_RISE 2) this, the
  // no-tap test and the re-entry test go red; with the plume() call
  // removed (the kick left to propagation alone) the doubling does --
  // 20px at rest, 22px just after -- which is the KICK tile's whole story.
  const { h, fx, S } = await bootLagoon()
  const rnd = Math.random
  try {
    // Seeded, the same seed both runs: the fire is random, and two runs on
    // different draws differ by a tongue or two -- the kick has to show
    // against the SAME fire without it, not against luck.
    const seed = () => { let a = 0x2545f491; Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
    const heights = () => S.torches.map((_, ti) => flameHeight(h, S, ti))
    const avg = (rows) => rows[0].map((_, ti) => rows.reduce((s, r) => s + r[ti], 0) / rows.length)
    const run = (kick) => {
      seed()
      fx.reset(h.program)
      h.program._lagoonLvl = 0.6
      let t = 100
      const restRows = []
      for (let i = 0; i < 60; i++) { drawWith(h, fx, t, signal()); t += 1 / 60; if (i >= 50) restRows.push(heights()) }
      assert.equal(brightCells(h), 0, 'BRIGHT on screen with no kick')
      // The kick frame, then 0.02-0.07s after it: the KICK tile.
      drawWith(h, fx, t, signal({ pulse: kick ? 1 : 0.15, onset: kick })); t += 1 / 60
      const earlyRows = []
      let bright = 0
      for (let i = 0; i < 4; i++) { drawWith(h, fx, t, signal()); t += 1 / 60; earlyRows.push(heights()); bright = Math.max(bright, brightCells(h)) }
      for (let i = 0; i < 5; i++) { drawWith(h, fx, t, signal()); t += 1 / 60 }
      const sparks = h.program._lagoon.sparks.length
      for (let i = 0; i < 70; i++) { drawWith(h, fx, t, signal()); t += 1 / 60 }
      return { rest: avg(restRows), early: avg(earlyRows), bright, sparks, after: brightCells(h) }
    }
    const loud = run(false)
    const kick = run(true)
    S.torches.forEach((_, ti) => {
      assert.ok(kick.early[ti] >= 1.7 * kick.rest[ti], `torch ${ti}: ${kick.rest[ti].toFixed(0)}px at rest, ${kick.early[ti].toFixed(0)}px just after the kick -- not doubled`)
      assert.ok(kick.early[ti] >= 1.5 * loud.early[ti], `torch ${ti}: ${kick.early[ti].toFixed(0)}px kicked vs ${loud.early[ti].toFixed(0)}px on the same timeline without`)
    })
    assert.ok(kick.bright >= 2, `the kick lit only ${kick.bright} cells BRIGHT`)
    assert.equal(loud.bright, 0, 'BRIGHT with no kick')
    assert.ok(kick.sparks >= 8, `only ${kick.sparks} sparks in the air 0.15s after the kick`)
    assert.equal(kick.after, 0, 'the flare held past a second -- a strobe at any real tempo')
  } finally { Math.random = rnd; h.shutdown() }
})

test('LAGOON: level sets the resting height -- a loud passage burns taller than a quiet one', async () => {
  const { h, fx, S } = await bootLagoon()
  try {
    const settle = (level) => {
      fx.reset(h.program)
      let t = 300
      for (let i = 0; i < 240; i++) { drawWith(h, fx, t, signal({ level })); t += 1 / 60 }
      // Averaged over a second: the fire is random, one frame is not a height.
      let sum = 0
      for (let i = 0; i < 30; i++) { drawWith(h, fx, t, signal({ level })); t += 1 / 30; sum += flameHeight(h, S, 1) }
      return sum / 30
    }
    const quiet = settle(0.1), loud = settle(0.95)
    assert.ok(loud > quiet * 1.3, `near torch: ${quiet.toFixed(0)}px quiet, ${loud.toFixed(0)}px loud`)
  } finally { h.shutdown() }
})

test('LAGOON: with no tap the synthetic ~0.9s pulse still kicks the torches', async () => {
  const { h } = await bootLagoon()
  try {
    const s0 = h.program._lagoonStep
    h.advance(4000)
    const steps = h.program._lagoonStep - s0
    assert.ok(steps >= 3 && steps <= 6, `${steps} kicks in 4s on syntheticAudio's ~0.9s pulse`)
  } finally { h.shutdown() }
})

test('LAGOON: muted, no kick and nothing BRIGHT -- but the torches burn low and the water moves', async () => {
  const { h, fx, S } = await bootLagoon()
  try {
    fx.reset(h.program)
    let t = 200
    const s0 = h.program._lagoonStep
    let bright = 0
    const snaps = []
    const fh = S.torches.map(() => 0)
    for (let i = 0; i < 90; i++) {
      drawWith(h, fx, t, signal({ pulse: i % 10 ? 0 : 1, onset: true }), true); t += 1 / 30
      bright += brightCells(h)
      if (i % 30 === 0) snaps.push(waterSnap(h, S))
      // Averaged over the last second: one frame's tongue is not a height.
      if (i >= 60) S.torches.forEach((_, ti) => { fh[ti] += flameHeight(h, S, ti) / 30 })
    }
    assert.equal(h.program._lagoonStep, s0, 'a kick landed while muted')
    assert.equal(bright, 0, 'BRIGHT cells while muted')
    assert.ok(changedPixels(snaps[0], snaps[2]) > 200, 'the lagoon froze while muted')
    fh.forEach((v, ti) => assert.ok(v >= 8 && v <= 36, `muted torch ${ti} burns ${v.toFixed(0)}px -- should be low but alight`))
  } finally { h.shutdown() }
})

test('LAGOON: re-entry after a long visit carries no kick clock from the previous visit', async () => {
  const { h } = await bootLagoon()
  try {
    // Any clock left over sits far in the restarted one's future (the
    // 2026-09-12 audit's M5 shape). Mutation-checked: deleting reset()'s
    // _lagoonKickAt line goes red.
    h.advance(8000)
    h.key('e'); h.advance(500)
    h.key('v'); h.advance(100)
    const t = effectT(h)
    assert.ok(t < 1, `effect clock should have restarted (t=${t.toFixed(2)})`)
    assert.ok(h.program._lagoonKickAt <= t + 0.05, `kick clock ${h.program._lagoonKickAt} on a clock at ${t}`)
    assert.ok(h.program._lagoonSimT <= t + 0.05, `fire clock ${h.program._lagoonSimT} on a clock at ${t}`)
    const s0 = h.program._lagoonStep
    h.advance(2500)
    assert.ok(h.program._lagoonStep > s0, 'no kick landed after re-entry')
  } finally { h.shutdown() }
})
