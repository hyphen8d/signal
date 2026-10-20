// OUTRUN (CIRCUIT CRUSH) -- what the effect leaves on the grid, read back
// off it. Since the 2026-10-20 polish the sun, the skyline, the grid and
// the palms are pixel bitmaps (putGlyph), so these tests read term.gfx and
// term.attrs; only the stars and birds are characters.
//
// Claims: the canvas contract; no character soup (no roadside scatter, no
// `=====` rungs, no `\ /` rails); brightness order (the sun is the one
// BRIGHT thing, the floor no brighter than MUTED); the rails are unbroken
// lines and the rungs run the full width; the sun's slices thicken toward
// the horizon; the skyline is one continuous band; a kick swells the sun;
// muted, the sun drops off BRIGHT and the road still drives.
//
// The frame loop rewrites p._au every frame (visualizer.js), so the beat
// is driven by calling the effect's draw directly with a crafted signal,
// the way tests/visual-frost.test.mjs does.
//
// Run: node --test tests/visual-outrun.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

const VIZ_BOT = 22
// Attribute bits, src/cellgrid.js. NORMAL is 0.
const BRIGHT = 1, DIM = 4, MUTED = 32, FAINT = 64

const signal = (over = {}) => ({
  level: 0.6, bass: 0.5, mid: 0.4, treble: 0.3,
  bands9: new Array(9).fill(0.4), onset: false, pulse: 0, ...over,
})

async function bootOutrun() {
  const h = await boot({ station: 'circuit-crush' })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  h.advance(300)
  assert.equal(h.program.activeVisualKey(), 'outrun', 'CIRCUIT CRUSH should land on OUTRUN')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/outrun.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.outrun, mod }
}

function drawWith(h, fx, t, A, muted = false) {
  h.program.muted = muted
  h.program._au = A
  fx.draw(h.program, { term: h.term }, t)
}
/** Settles at rest: a flat signal for two seconds of frames. */
function settle(h, fx, t0, A = signal()) {
  for (let f = 0; f < 120; f++) drawWith(h, fx, t0 + f / 60, A)
  return t0 + 2
}

/** Is canvas framebuffer pixel (X, Y) lit? Canvas pixel row 0 is the top
 *  of grid row 1; each cell is 8 lit columns plus a blank ninth. */
function litPx(h, X, Y) {
  const { cellW, cellH } = h.term.font
  const adv = cellW + 1
  const c = Math.floor(X / adv), px = X - c * adv
  if (px >= cellW) return false
  const y = 1 + Math.floor(Y / cellH), py = Y - (y - 1) * cellH
  const b = h.term.gfx[y * h.term.cols + c]
  return !!b && ((b[py] >> (cellW - 1 - px)) & 1) === 1
}
const cellsWhere = (h, pred) => {
  const out = []
  for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) {
    const i = y * h.term.cols + x
    if (h.term.gfx[i] && pred(h.term.attrs[i])) out.push({ x, y })
  }
  return out
}
const pixCount = (h, cells) => {
  let n = 0
  for (const { x, y } of cells) for (const w of h.term.gfx[y * h.term.cols + x]) for (let v = w; v; v &= v - 1) n++
  return n
}

test('OUTRUN: paints every canvas cell each frame, and nothing outside rows 1..21', async () => {
  const { h, fx } = await bootOutrun()
  try {
    const outside = []
    let short = 0
    for (let f = 0; f < 60; f++) {
      const seen = new Set()
      const put = h.term.put, putGlyph = h.term.putGlyph
      const watch = (fn) => function (x, y, ...rest) {
        if (y < 1 || y >= VIZ_BOT) outside.push(`${x},${y}`)
        else seen.add(y * 1000 + x)
        return fn.call(this, x, y, ...rest)
      }
      h.term.put = watch(put)
      h.term.putGlyph = watch(putGlyph)
      try { drawWith(h, fx, 5 + f / 60, signal()) } finally { h.term.put = put; h.term.putGlyph = putGlyph }
      if (seen.size < (VIZ_BOT - 1) * h.term.cols) short++
    }
    assert.deepEqual(outside.slice(0, 5), [], `${outside.length} puts landed outside the canvas`)
    assert.equal(short, 0, `${short} frames left canvas cells unpainted`)
  } finally { h.shutdown() }
})

test('OUTRUN: no character soup -- the floor and sun are pixels; no scatter, no ==== rungs (polish)', async () => {
  // 2026-10-20 -- the critique: the grid's `\` `/` marks and the roadside
  // `' , "` read as rain, and the `=====` rungs and horizon as text
  // underlines. Below the sky, every cell is a bitmap or blank.
  const { h, fx, mod } = await bootOutrun()
  try {
    let t = 5
    for (let i = 0; i < 6; i++) {
      t = settle(h, fx, t, signal({ level: 0.3 + 0.1 * i }))
      for (let y = mod.HORIZON_Y; y < VIZ_BOT; y++) {
        assert.equal(h.row(y).trim(), '', `row ${y} carries characters: ${JSON.stringify(h.row(y).trim())}`)
      }
      for (let y = 1; y < mod.HORIZON_Y; y++) {
        assert.ok(/^[ .^v]*$/.test(h.row(y)), `sky row ${y} carries more than stars and birds: ${JSON.stringify(h.row(y).trim())}`)
      }
    }
    assert.ok(cellsWhere(h, () => true).length > 400, 'the picture should be mostly bitmaps')
  } finally { h.shutdown() }
})

test('OUTRUN: brightness order -- the sun is the only BRIGHT thing; the floor is MUTED at most', async () => {
  const { h, fx, mod } = await bootOutrun()
  try {
    let t = 5
    for (let i = 0; i < 4; i++) {
      t = settle(h, fx, t, signal({ level: 0.9, bass: 0.9 }))
      const bright = cellsWhere(h, (a) => a & BRIGHT)
      assert.ok(bright.length > 40, `the sun should be BRIGHT (${bright.length} cells)`)
      for (const { x, y } of bright) {
        assert.ok(y < mod.HORIZON_Y && Math.abs(x + 0.5 - h.term.cols / 2) < 22, `BRIGHT cell ${x},${y} outside the sun`)
      }
      const floor = cellsWhere(h, () => true).filter(({ y }) => y > mod.HORIZON_Y)
      for (const { x, y } of floor) {
        const a = h.term.attrs[y * h.term.cols + x]
        assert.ok(a === MUTED || a === DIM || a === FAINT, `floor cell ${x},${y} is drawn at ${a}, above MUTED`)
      }
    }
  } finally { h.shutdown() }
})

test('OUTRUN: the grid is continuous -- unbroken rails, full-width rungs (polish)', async () => {
  // The old rails were `\` `/` with 2-3 row gaps. Mutation-checked: drawing
  // each rail as one pixel per row (no span fill) breaks the shallow rail
  // and goes red.
  const { h, fx, mod } = await bootOutrun()
  try {
    settle(h, fx, 5)
    const G = mod.geometry(h.term)
    const a = mod.RAIL_SPACING / G.pxW
    for (const k of [-3, -1, 1, 3]) {
      let rows = 0, hit = 0
      for (let Y = G.hY + 40; Y < G.FH; Y++) {
        const X = Math.round(G.cx + k * a * (Y - G.hY))
        if (X < 2 || X >= G.FW - 2) continue
        rows++
        let found = false
        for (let dx = -3; dx <= 3 && !found; dx++) for (let dy = -1; dy <= 1 && !found; dy++) if (litPx(h, X + dx, Y + dy)) found = true
        if (found) hit++
      }
      assert.ok(rows > 50, `rail ${k} should cross the floor`)
      assert.ok(hit / rows > 0.95, `rail ${k} is broken: lit on ${hit} of ${rows} rows`)
    }
    // A steep outer rail crosses several pixels per row: each row must
    // light the whole span, or the rail is dashes (the old `\` `/` look).
    let want = 0, got = 0
    for (const k of [-7, 7]) {
      for (let Y = G.hY + 20; Y < G.FH; Y++) {
        const d = Y - G.hY
        const x0 = G.cx + k * a * (d - 0.5), x1 = G.cx + k * a * (d + 0.5)
        for (let X = Math.ceil(Math.min(x0, x1)); X <= Math.floor(Math.max(x0, x1)); X++) {
          if (X < 0 || X >= G.FW || X % G.adv === G.cellW) continue
          want++
          if (litPx(h, X, Y)) got++
        }
      }
    }
    assert.ok(want > 200, `outer rails should cross the floor (${want} px)`)
    assert.ok(got / want > 0.85, `outer rails are dashed: ${got} of ${want} span pixels lit`)
    // Rungs: pixel rows lit across nearly the whole width.
    let rungRows = 0
    for (let Y = G.hY + 30; Y < G.FH; Y++) {
      let n = 0
      for (let X = 0; X < G.FW; X += 3) if (litPx(h, X, Y)) n++
      if (n > (G.FW / 3) * 0.6) rungRows++
    }
    assert.ok(rungRows >= 4, `only ${rungRows} full-width rung rows on the floor`)
  } finally { h.shutdown() }
})

test('OUTRUN: the sun is sliced, the gaps thickening toward the horizon', async () => {
  const { h, fx, mod } = await bootOutrun()
  try {
    settle(h, fx, 5, signal({ bass: 0.5 }))
    const G = mod.geometry(h.term)
    const X = Math.round(G.cx)
    // Walk up the sun's centre column from the horizon: runs of dark pixels.
    const gaps = []
    let run = 0
    const top = G.hY - Math.round(mod.SUN_R * G.cellH * mod.SLICE_FRAC)
    for (let Y = G.hY - 1; Y >= top; Y--) {
      if (!litPx(h, X, Y) && !litPx(h, X + 1, Y)) run++
      else if (run) { gaps.push(run); run = 0 }
    }
    if (run) gaps.push(run)
    assert.ok(gaps.length >= 3, `the sun should carry several slices (saw ${gaps.length})`)
    assert.ok(gaps[0] >= gaps[gaps.length - 1] + 2, `slices should thicken toward the horizon: ${gaps.join(',')}`)
    // Above the band the sun is solid.
    let solid = 0, n = 0
    for (let Y = top - 4; Y > G.hY - mod.SUN_R * G.cellH + 4; Y--) { n++; if (litPx(h, X, Y) || litPx(h, X + 1, Y)) solid++ }
    assert.ok(solid / n > 0.95, 'the sun\'s upper half should be solid')
  } finally { h.shutdown() }
})

test('OUTRUN: the skyline is one continuous band either side of the sun (polish)', async () => {
  // 2026-10-20 -- it was four isolated ▓ posts. Every pixel column clear of
  // the sun has a lit roofline somewhere in the band.
  const { h, fx, mod } = await bootOutrun()
  try {
    settle(h, fx, 5)
    const G = mod.geometry(h.term)
    const clear = ((mod.SUN_R + mod.SUN_SWELL + 0.4) * G.cellH) / G.pxW + 2 * G.adv + 2
    let cols = 0, hit = 0
    for (let X = 0; X < G.FW; X++) {
      if (X % G.adv === G.cellW) continue // the blank ninth column
      if (Math.abs(X + 0.5 - G.cx) < clear) continue
      cols++
      for (let Y = G.hY - 48; Y < G.hY - 4; Y++) if (litPx(h, X, Y)) { hit++; break }
    }
    assert.ok(cols > 200, `skyline columns: ${cols}`)
    assert.ok(hit / cols > 0.97, `skyline broken: ${cols - hit} of ${cols} columns have no roofline`)
  } finally { h.shutdown() }
})

test('OUTRUN: a kick swells the sun', async () => {
  // Mutation-checked: with SUN_SWELL at 0 this goes red.
  const { h, fx } = await bootOutrun()
  try {
    const t = settle(h, fx, 5, signal({ pulse: 0 }))
    const sun = () => pixCount(h, cellsWhere(h, (a) => a & BRIGHT))
    const rest = sun()
    drawWith(h, fx, t, signal({ pulse: 1, onset: true }))
    drawWith(h, fx, t + 1 / 60, signal({ pulse: 0.9 }))
    const kicked = sun()
    assert.ok(kicked > rest * 1.15, `kicked sun ${kicked}px against ${rest}px at rest -- no swell`)
  } finally { h.shutdown() }
})

test('OUTRUN: muted, the sun drops off BRIGHT and the road still drives', async () => {
  const { h, fx } = await bootOutrun()
  try {
    let t = settle(h, fx, 5, signal(), true)
    for (let f = 0; f < 120; f++) drawWith(h, fx, t + f / 60, signal(), true)
    assert.equal(cellsWhere(h, (a) => a & BRIGHT).length, 0, 'muted sun should not be BRIGHT')
    const before = h.program._outrunPhase
    t += 2
    for (let f = 0; f < 60; f++) drawWith(h, fx, t + f / 60, signal(), true)
    assert.ok(h.program._outrunPhase > before, 'the road should still drive muted')
    assert.ok(cellsWhere(h, () => true).length > 400, 'muted picture should stay up')
  } finally { h.shutdown() }
})
