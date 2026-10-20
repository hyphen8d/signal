// ATRIUM (the 'drift' effect, NEON STASIS; redrawn 2026-10-20 in pixel
// bitmaps) -- what the effect leaves on the grid, read back off it. Every
// lit cell is a putGlyph() bitmap, so a character read sees spaces: these
// tests read term.gfx (the bitmaps) and term.attrs (the beam tier).
//
// Claims: the canvas contract at three widths; no characters at all (and so
// no `≈`); the subject -- a NORMAL jet column standing out of the bowl over
// a basin, the fountain 10+ rows tall -- is the brightest thing, the
// windows and signs behind it never above MUTED; a kick SPURTS the jet
// (taller, a BRIGHT crown, drops thrown off the column) and a pulse that
// only creeps does not; the spurt settles inside a beat and is seen on a
// slow machine; level raises the jet; muted it is a trickle that still
// moves; closing time darkens a window; re-entry carries no clock; and the
// draw stays cheap.
//
// The frame loop rewrites p._au every frame (visualizer.js), so the beat is
// driven by calling the effect's draw directly with a crafted signal.
//
// Run: node --test tests/visual-drift.test.mjs

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

async function bootAtrium() {
  const h = await boot({ station: 'neon-stasis' })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  h.advance(300)
  assert.equal(h.program.activeVisualKey(), 'drift', 'NEON STASIS should land on the drift effect')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/drift.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.drift, mod }
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
const isLit = (a) => a === NORMAL || (a & BRIGHT)
function cellsWhere(h, pred) {
  const out = []
  for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) {
    const i = idx(h, x, y)
    if (h.term.gfx[i] && pred(h.term.attrs[i])) out.push({ x, y })
  }
  return out
}
/** The jet, read off the grid: the rows above the bowl in which the centre
 *  column (either of the two cells the core can straddle) is lit NORMAL or
 *  BRIGHT, counted up from the bowl until the first row that is not. */
function jetRows(h, mod) {
  const G = mod.geometry(h.term.cols)
  const c = Math.floor(G.cx / G.adv)
  const bowlRow = 1 + Math.floor((mod.BOWL_Y - 3) / 16)
  let n = 0
  for (let y = bowlRow; y >= 1; y--) {
    const hit = [c - 1, c].some((x) => h.term.gfx[idx(h, x, y)] && isLit(h.term.attrs[idx(h, x, y)]))
    if (!hit) break
    n++
  }
  return n
}
const brightCells = (h) => cellsWhere(h, (a) => a & BRIGHT).length

test('ATRIUM: repaints every canvas cell and nothing outside rows 1..21, at 60, 80 and 100 columns', async () => {
  const { h, fx } = await bootAtrium()
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
      assert.ok(term.gfx.filter(Boolean).length > 200, `${cols} cols: hardly any pixels drawn`)
    }
  } finally { h.shutdown() }
})

test('ATRIUM: a picture, not characters -- nothing but spaces in the text plane, and no ≈ ever', async () => {
  const { h, fx } = await bootAtrium()
  try {
    for (let i = 0; i < 30; i++) {
      h.advance(100)
      const text = Array.from({ length: VIZ_BOT - 1 }, (_, r) => h.row(r + 1)).join('')
      assert.equal(text.trim(), '', `characters on the canvas at frame ${i}`)
    }
    drawWith(h, fx, 30, signal({ pulse: 0 }))
    drawWith(h, fx, 30.02, signal({ pulse: 1, level: 1 }))
    const text = Array.from({ length: VIZ_BOT - 1 }, (_, r) => h.row(r + 1)).join('')
    assert.equal(text.trim(), '', 'characters on the canvas on a kick')
  } finally { h.shutdown() }
})

test('ATRIUM: the fountain is the subject -- a tall jet over a basin, brightest thing on the screen', async () => {
  const { h, fx, mod } = await bootAtrium()
  try {
    settle(h, fx, 10, signal({ level: 1 }))
    const G = mod.geometry(h.term.cols)
    const jet = jetRows(h, mod)
    assert.ok(jet >= 5, `the jet stands only ${jet} rows at full level`)
    // Ten rows and more from the jet's top to the basin's foot.
    const bowlRow = 1 + Math.floor((mod.BOWL_Y - 3) / 16)
    const footRow = 1 + Math.floor(mod.BASIN_BOT / 16)
    assert.ok(footRow - (bowlRow - jet + 1) + 1 >= 10, `the fountain spans ${footRow - (bowlRow - jet + 1) + 1} rows`)
    // The basin: its rim lit across most of its width on the rim's row.
    const rimRow = 1 + Math.floor((mod.RIM_Y + G.basinRy) / 16)
    const c = Math.floor(G.cx / G.adv), half = Math.floor(G.basinRx / G.adv)
    let rim = 0
    for (let x = c - half + 1; x < c + half; x++) if (h.term.gfx[idx(h, x, rimRow)]) rim++
    assert.ok(rim >= (2 * half - 1) * 0.9, `the basin's near rim is lit on ${rim} of ${2 * half - 1} cells`)
    // Brightest: nothing at NORMAL or BRIGHT outside the fountain's own
    // columns -- the windows and signs are scenery.
    const fx0 = c - Math.ceil((G.basinRx + 4) / G.adv), fx1 = c + Math.ceil((G.basinRx + 4) / G.adv)
    const stray = cellsWhere(h, isLit).filter((p) => p.x < fx0 || p.x > fx1)
    assert.deepEqual(stray.slice(0, 5), [], `${stray.length} cells outside the fountain at NORMAL or above`)
    // And the scenery is there: three windows lit at DIM, two signs.
    for (const w of G.windows) {
      const cx = Math.floor((w.x0 + w.x1) / 2 / G.adv), cy = 1 + Math.floor((w.y0 + w.y1) / 2 / 16)
      const a = h.term.attrs[idx(h, cx, cy)]
      assert.ok(h.term.gfx[idx(h, cx, cy)] && (a & DIM), `window ${w.id} is not lit at DIM (attr ${a})`)
    }
  } finally { h.shutdown() }
})

test('ATRIUM: a kick spurts the jet -- taller, a BRIGHT crown, drops thrown -- and a creeping pulse does not', async () => {
  // Mutation-checked: with the rising-edge test in draw() made never true,
  // the jet does not rise, there is no BRIGHT and no crown, and this goes red.
  const { h, fx, mod } = await bootAtrium()
  try {
    let t = settle(h, fx, 10, signal({ pulse: 0 }))
    const rest = jetRows(h, mod)
    assert.equal(brightCells(h), 0, 'BRIGHT at rest -- a kick would have nothing to add')
    // A pulse that creeps up is not a kick.
    for (const [i, v] of [0.15, 0.3, 0.45, 0.45].entries()) drawWith(h, fx, t + i * 0.02, signal({ pulse: v }))
    assert.equal(brightCells(h), 0, 'a pulse that only creeps up spurted')
    t = settle(h, fx, t + 1, signal({ pulse: 0 }))
    const before = cellsWhere(h, () => true).length
    drawWith(h, fx, t, signal({ pulse: 1 }))
    const kicked = jetRows(h, mod)
    assert.ok(kicked >= rest + 3, `the jet rose ${rest} -> ${kicked} rows on the kick`)
    assert.ok(brightCells(h) >= 1, 'no BRIGHT crown on the kick')
    // The crown flying: 150ms on, lit cells off the jet's column in the air
    // above the bowl that were not there at rest.
    for (let f = 1; f <= 9; f++) drawWith(h, fx, t + f / 60, signal({ pulse: Math.exp(-f / 6) }))
    assert.ok(cellsWhere(h, () => true).length > before + 8, 'no spray thrown off the jet')
    // Settles inside a beat (120bpm).
    for (let f = 10; f <= 33; f++) drawWith(h, fx, t + f / 60, signal({ pulse: Math.exp(-f / 6) }))
    assert.equal(brightCells(h), 0, 'the crown outlived half a second')
    assert.ok(jetRows(h, mod) <= rest + 1, `the jet still ${jetRows(h, mod)} rows (rest ${rest}) half a second on`)
  } finally { h.shutdown() }
})

test('ATRIUM: a spurt is seen on a slow machine -- full height on the frames after a kick, a second late', async () => {
  const { h, fx, mod } = await bootAtrium()
  try {
    settle(h, fx, 10, signal({ pulse: 0 }))
    const rest = jetRows(h, mod)
    drawWith(h, fx, 13, signal({ pulse: 0 }))
    drawWith(h, fx, 14, signal({ pulse: 1 }))
    drawWith(h, fx, 15, signal({ pulse: 0.15 }))
    assert.ok(jetRows(h, mod) >= rest + 3, 'the frame after a kick, a second late, shows no spurt')
    assert.equal(mod.spurtEnv(1, 1), 1)
    assert.ok(mod.spurtEnv(0.5, 30) < 0.3)
  } finally { h.shutdown() }
})

test('ATRIUM: no tap, it spurts to the synthetic pulse', async () => {
  const { h, fx } = await bootAtrium()
  try {
    let peak = 0, trough = Infinity
    for (let f = 0; f < 180; f++) {
      h.program.muted = false; h.program._au = null
      fx.draw(h.program, { term: h.term }, 30 + f / 60)
      const b = brightCells(h)
      peak = Math.max(peak, b); trough = Math.min(trough, b)
    }
    assert.ok(peak >= 1 && trough === 0, `synthetic beat: BRIGHT cells range ${trough}..${peak}`)
  } finally { h.shutdown() }
})

test('ATRIUM: louder music raises the jet; BRIGHT never spreads past the crown', async () => {
  const { h, fx, mod } = await bootAtrium()
  try {
    settle(h, fx, 10, signal({ level: 0.05 })); settle(h, fx, 12, signal({ level: 0.05 }))
    const quiet = jetRows(h, mod)
    settle(h, fx, 14, signal({ level: 1 })); settle(h, fx, 16, signal({ level: 1 }))
    const loud = jetRows(h, mod)
    assert.ok(loud >= quiet + 2, `jet ${quiet} -> ${loud} rows from quiet to loud`)
    // Bloom cap: a kick at full level lights at most a handful of BRIGHT cells.
    let worst = 0
    for (let k = 0; k < 10; k++) {
      drawWith(h, fx, 20 + k * 0.5, signal({ level: 1, pulse: 0 }))
      drawWith(h, fx, 20.02 + k * 0.5, signal({ level: 1, pulse: 1 }))
      worst = Math.max(worst, brightCells(h))
    }
    assert.ok(worst <= 8, `${worst} BRIGHT cells on a kick -- a slab of bloom`)
  } finally { h.shutdown() }
})

test('ATRIUM: muted, the fountain is turned down to a trickle, nothing spurts, and it still moves', async () => {
  const { h, fx, mod } = await bootAtrium()
  try {
    for (let f = 0; f < 240; f++) drawWith(h, fx, 20 + f / 60, signal({ pulse: f % 30 === 0 ? 1 : 0, level: 1 }), true)
    assert.ok(jetRows(h, mod) <= 1, `a ${jetRows(h, mod)}-row jet while muted`)
    assert.equal(brightCells(h), 0, 'BRIGHT while muted')
    // The windows stay lit: the mall after the music stopped, not a blank.
    assert.ok(cellsWhere(h, (a) => a & DIM).length >= 60, 'the muted mall is dark')
    const before = h.term.gfx.map((b) => (b ? b.join(',') : ''))
    drawWith(h, fx, 25, signal(), true)
    const moved = h.term.gfx.filter((b, i) => (b ? b.join(',') : '') !== before[i]).length
    assert.ok(moved >= 5, `only ${moved} cells changed between muted frames -- dead`)
  } finally { h.shutdown() }
})

test('ATRIUM: closing time -- a store goes dark and its window with it', async () => {
  const { h, fx, mod } = await bootAtrium()
  try {
    const G = mod.geometry(h.term.cols)
    const w = G.windows[0]
    let tDark = -1, tLit = -1
    for (let t = 0; t < 600 && (tDark < 0 || tLit < 0); t += 0.5) {
      if (mod.storeDark(w.id, t)) { if (tDark < 0) tDark = t } else if (tLit < 0) tLit = t
    }
    assert.ok(tDark >= 0 && tLit >= 0, 'test setup: the store is both open and shut in ten minutes')
    const cx = Math.floor((w.x0 + w.x1) / 2 / G.adv), cy = 1 + Math.floor((w.y0 + w.y1) / 2 / 16)
    drawWith(h, fx, tLit, signal()); drawWith(h, fx, tLit + 0.02, signal())
    assert.ok(h.term.gfx[idx(h, cx, cy)], 'the open store\'s window is dark')
    drawWith(h, fx, tDark, signal()); drawWith(h, fx, tDark + 0.02, signal())
    assert.ok(!h.term.gfx[idx(h, cx, cy)], 'the closed store\'s window is still lit')
  } finally { h.shutdown() }
})

test('ATRIUM: closing time is a pure function of the clock, and rare', async () => {
  const { h, mod } = await bootAtrium()
  h.shutdown()
  for (const id of [3, 8, 14, 0, 1, 101, 205]) {
    let dark = 0, flips = 0, prev = mod.storeDark(id, 0)
    for (let t = 0; t < 600; t += 0.5) {
      const d = mod.storeDark(id, t)
      if (d) dark++
      if (d !== prev) flips++
      prev = d
      assert.equal(d, mod.storeDark(id, t), 'same answer for the same moment')
    }
    assert.ok(dark < 1200 * 0.5, `store ${id} dark ${((dark / 1200) * 100).toFixed(0)}% of ten minutes`)
    assert.ok(flips <= 30, `store ${id} flickered ${flips} times in ten minutes`)
  }
  // The three windows are all lit for the first half-minute of a visit.
  const G = mod.geometry(80)
  for (const w of G.windows) for (let t = 0; t < 30; t += 0.5) assert.ok(!mod.storeDark(w.id, t), `store ${w.id} dark at ${t}s`)
})

test('ATRIUM: re-entry after a long visit carries no clock from the previous one', async () => {
  // Mutation-checked: with reset() emptied, the clock assertions go red.
  const { h, fx } = await bootAtrium()
  try {
    drawWith(h, fx, 500, signal({ pulse: 0 }))
    drawWith(h, fx, 500.02, signal({ pulse: 1 }))
    assert.ok(h.program._driftSpurtAt > 400, 'test setup: a spurt late in a long visit')
    h.key('e'); h.advance(200)
    h.key('v'); if (h.program.tapConsentOpen) h.key('n')
    h.advance(300)
    const t = effectT(h)
    assert.ok(t < 5, `effect clock should have restarted (t=${t.toFixed(1)})`)
    for (const k of ['_driftSpurtAt', '_driftPrevSpurtAt', '_driftLastT']) {
      assert.ok(!(h.program[k] > t + 0.05), `${k} ${h.program[k]} on a clock at ${t}`)
    }
  } finally { h.shutdown() }
})

test('ATRIUM: the draw stays cheap -- per frame near FLAME\'s, first frame under the hitch budget', async () => {
  // The harness fakes performance.now; hrtime is real. The bounds are a
  // guard against a several-fold regression (a per-frame rebuild, say), not
  // a measurement: the dev box shares two cores with whatever else is
  // running, and under a loaded suite a tight bound is a flake. The measured
  // numbers are in visuals/drift.js's header.
  const { h, fx } = await bootAtrium()
  const now = () => Number(process.hrtime.bigint()) / 1e6
  try {
    h.program._drift = null
    let t0 = now()
    drawWith(h, fx, 1, signal())
    const first = now() - t0
    for (let f = 0; f < 60; f++) drawWith(h, fx, 1 + f / 60, signal({ pulse: f % 30 === 0 ? 1 : 0 }))
    t0 = now()
    for (let f = 0; f < 120; f++) drawWith(h, fx, 2 + f / 60, signal({ pulse: f % 30 === 0 ? 1 : 0 }))
    const per = (now() - t0) / 120
    assert.ok(first < 1500, `first frame ${first.toFixed(0)}ms`)
    assert.ok(per < 40, `${per.toFixed(1)}ms per frame`)
  } finally { h.shutdown() }
})
