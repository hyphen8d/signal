// DANCEFLOOR (MIRRORBALL, 2026-09-13) -- what the effect actually leaves on
// the grid, read back off it the way tests/visuals.test.mjs reads BREACH's
// words: the canvas contract, that it moves, that re-entry after a long
// visit carries no beat clock from the previous one, that the ball is round
// and faceted, that the lit-tile floor steps on a beat and ONLY on a beat --
// in time with syntheticAudio's pulse when there is no tap -- that the spots
// travel as one rotation rather than as sparkle, that the frame stays dark
// (the '█' and BRIGHT caps are the tube-bloom lesson from UPRISING and KEEP,
// which the text grid otherwise cannot see), and that mute settles it.
//
// 2026-10-20 (polish) -- the ball and the floor are cell BITMAPS now
// (putGlyph), so everything about them is read off term.gfx and the
// attribute plane: a character-reading test sees a pixel cell as a space.
// The panel geometry the floor is checked against comes from the module
// (panelAtPixel), and what is asserted is what the critique saw on the tube:
// a lit tile that fills its panel and nothing outside it (no staircase, no
// two tiles fused), a round mosaic ball whose bright glints sit on its rim.
//
// The frame loop rewrites p._au every frame (visualizer.js), so everything
// about the beat is driven by calling the effect's draw directly with a
// crafted signal.
//
// Run: node --test tests/visual-dancefloor.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from './harness.mjs'
import { parseBDF } from '../src/bdf.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const VIZ_BOT = 22
// Attribute bits, src/cellgrid.js. NORMAL is 0.
const BRIGHT = 1, DIM = 4, MUTED = 32, FAINT = 64
const ADV = 9, CELL_W = 8, CELL_H = 16
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000
const canvasRows = (h) => Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1))
const attrAt = (h, x, y) => h.term.attrs[y * h.term.cols + x]
const gfxAt = (h, x, y) => h.term.gfx[y * h.term.cols + x]
/** Cells holding something: a non-space character or a bitmap. */
const inked = (h) => {
  let n = 0
  for (let y = 1; y < VIZ_BOT; y++) {
    const r = h.row(y)
    for (let x = 0; x < h.term.cols; x++) if (r[x] !== ' ' || gfxAt(h, x, y)) n++
  }
  return n
}
const popcount = (bits) => {
  let n = 0
  for (let y = 0; y < bits.length; y++) { let w = bits[y]; while (w) { n += w & 1; w >>= 1 } }
  return n
}
/** Whether framebuffer pixel (px, py) is lit in its cell's bitmap. */
const pixelOn = (h, px, py) => {
  const c = Math.floor(px / ADV), r = Math.floor(py / CELL_H), bx = px % ADV
  if (bx >= CELL_W) return false
  const g = gfxAt(h, c, r)
  return !!g && ((g[py % CELL_H] >> (CELL_W - 1 - bx)) & 1) === 1
}

const signal = (over = {}) => ({
  level: 0.6, bass: 0.4, mid: 0.4, treble: 0.3,
  bands9: new Array(9).fill(0.4), onset: false, pulse: 0, ...over,
})

async function bootFloor() {
  const h = await boot({ station: 'mirrorball' })
  h.powerOn()
  h.key('v')
  assert.equal(h.program.activeVisualKey(), 'dancefloor', 'MIRRORBALL should land on DANCEFLOOR')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/dancefloor.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.dancefloor, mod }
}

/** Draws one frame directly with a crafted signal. */
function drawWith(h, fx, t, A) {
  h.program.muted = false
  h.program._au = A
  fx.draw(h.program, { term: h.term }, t)
}

/** Per tile: how many of its panel pixels are lit, out of how many, read
 *  off the bitmaps -- skipping the cells a fleck was painted into this
 *  frame, which light whatever they cross. Also counts lit pixels in the
 *  joints (outside every panel) the same way. */
function panelCover(h, mod) {
  const on = new Map(), total = new Map()
  let jointOn = 0
  const spots = h.program._dancefloorSpotCells || new Set()
  const cols = h.term.cols
  for (let py = mod.FLOOR_TOP * CELL_H; py < VIZ_BOT * CELL_H; py++) {
    for (let px = 0; px < cols * ADV; px++) {
      if (px % ADV >= CELL_W) continue
      if (spots.has(Math.floor(py / CELL_H) * cols + Math.floor(px / ADV))) continue
      const k = mod.panelAtPixel(px, py)
      const lit = pixelOn(h, px, py)
      if (k < 0) { if (lit) jointOn++; continue }
      total.set(k, (total.get(k) || 0) + 1)
      if (lit) on.set(k, (on.get(k) || 0) + 1)
    }
  }
  return { on, total, jointOn }
}

/** The set of lit tiles, read off the bitmaps: a tile is lit when well over
 *  the dark panels' coverage of its pixels are on. */
function litTiles(h, mod) {
  const { on, total } = panelCover(h, mod)
  const lit = []
  for (const [k, n] of total) if ((on.get(k) || 0) / n > 0.3) lit.push(k)
  return lit.sort((a, b) => a - b).join(',')
}

/** The ball read back off its bitmaps: its lit pixel rows, extents and
 *  coverage. Returns a reason string on failure, or null. */
function ballProblem(h, mod) {
  const { BALL_X0, BALL_Y0, BALL_W, BALL_H, BALL_CX } = mod
  if (h.row(1)[BALL_CX] !== '│') return 'no cord over the ball'
  const rows = []
  let lit = 0, area = 0
  for (let py = BALL_Y0 * CELL_H; py < (BALL_Y0 + BALL_H + 1) * CELL_H; py++) {
    let l = -1, r = -1
    for (let px = BALL_X0 * ADV; px < (BALL_X0 + BALL_W) * ADV; px++) {
      if (pixelOn(h, px, py)) { if (l < 0) l = px; r = px }
    }
    if (l >= 0) rows.push({ py, l, r })
  }
  if (rows.length < 60) return `the ball is only ${rows.length} pixel rows tall`
  const height = rows[rows.length - 1].py - rows[0].py + 1
  // The widest rows, by median of the top few, so a glint's arm sticking
  // past the rim cannot set the width on its own.
  const widths = rows.map((r) => r.r - r.l + 1).sort((a, b) => b - a)
  const width = widths[Math.min(5, widths.length - 1)]
  // Round on the face: the pixel aspect is (4/3) / (720/400).
  const aspect = (4 / 3) / ((h.term.cols * ADV) / (h.term.rows * CELL_H))
  const roundness = (width * aspect) / height
  if (roundness < 0.88 || roundness > 1.12) return `the ball is not round (w ${width}px x h ${height}px, ${roundness.toFixed(2)})`
  // Centred on the cord, within a few pixels.
  const mid = rows[Math.floor(rows.length / 2)]
  const cx = BALL_CX * ADV + CELL_W / 2
  if (Math.abs((mid.l + mid.r) / 2 - cx) > 4) return `the ball is off its cord (${mid.l}..${mid.r} about ${cx})`
  // Facets, not a solid disc and not an empty ring: inside the rim, a
  // mosaic of lit dither and dark joints.
  for (const r of rows) {
    for (let px = r.l + 6; px <= r.r - 6; px++) {
      if (px % ADV >= CELL_W) continue
      area++
      if (pixelOn(h, px, r.py)) lit++
    }
  }
  const cover = lit / area
  if (cover < 0.3 || cover > 0.85) return `the ball's interior is ${(cover * 100).toFixed(0)}% lit -- ${cover < 0.3 ? 'no facets' : 'a solid disc'}`
  return null
}

/** The ball's bitmaps as one string, to see it turn. */
const ballBits = (h, mod) => {
  const out = []
  for (let y = mod.BALL_Y0; y < mod.BALL_Y0 + mod.BALL_H; y++) {
    for (let x = mod.BALL_X0; x < mod.BALL_X0 + mod.BALL_W; x++) { const g = gfxAt(h, x, y); out.push(g ? g.join('.') : '-') }
  }
  return out.join('|')
}

test('DANCEFLOOR: repaints every canvas cell and nothing outside rows 1..21', async () => {
  const { h, fx } = await bootFloor()
  try {
    h.advance(1500)
    const put = h.term.put, putGlyph = h.term.putGlyph
    const hit = new Uint8Array(h.term.cols * VIZ_BOT)
    const outside = []
    const mark = function (x, y) {
      if (y < 1 || y >= VIZ_BOT) outside.push(`${x},${y}`)
      else if (x >= 0 && x < this.cols) hit[y * this.cols + x] = 1
    }
    h.term.put = function (x, y, ...rest) { mark.call(this, x, y); return put.call(this, x, y, ...rest) }
    h.term.putGlyph = function (x, y, ...rest) { mark.call(this, x, y); return putGlyph.call(this, x, y, ...rest) }
    const frames = []
    try {
      // Frames that re-pack nothing (same floor, same ball) as well as ones
      // that re-pack everything: an unchanged cell must still be re-put.
      fx.draw(h.program, { term: h.term }, effectT(h))
      fx.draw(h.program, { term: h.term }, effectT(h) + 0.001)
      frames.push(hit.reduce((a, b) => a + b, 0))
      hit.fill(0)
      fx.draw(h.program, { term: h.term }, effectT(h) + 0.5)
      h.program._au = signal({ level: 1, bass: 1, treble: 1, pulse: 1, onset: true })
      fx.draw(h.program, { term: h.term }, effectT(h) + 1)
    } finally { h.term.put = put; h.term.putGlyph = putGlyph }
    assert.deepEqual(outside.slice(0, 5), [], `${outside.length} puts landed outside the canvas`)
    let missed = 0
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) if (!hit[y * h.term.cols + x]) missed++
    assert.equal(missed, 0, `${missed} canvas cells were not repainted this frame`)
    assert.equal(frames[0], h.term.cols * (VIZ_BOT - 1), 'an unchanged frame left cells un-put')
    const n = inked(h)
    assert.ok(n > 300, `only ${n} inked cells on the canvas`)
  } finally { h.shutdown() }
})

test('DANCEFLOOR: every character it draws exists in the BDF font', async () => {
  const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
  const { h } = await bootFloor()
  try {
    const seen = new Set()
    for (let i = 0; i < 120; i++) {
      h.advance(100)
      for (const r of canvasRows(h)) for (const ch of r) seen.add(ch)
    }
    const missing = [...seen].filter((ch) => !font.glyphs.has(ch.codePointAt(0)))
    assert.deepEqual(missing, [], 'glyphs not in ter-u16n.bdf render as blanks')
  } finally { h.shutdown() }
})

test('DANCEFLOOR: it moves -- frames a second apart differ, on the wall and on the ball', async () => {
  const { h, mod } = await bootFloor()
  try {
    h.advance(1000)
    const a = canvasRows(h), ballA = ballBits(h, mod)
    h.advance(1200)
    const b = canvasRows(h), ballB = ballBits(h, mod)
    let wall = 0
    for (let y = 0; y < mod.FLOOR_TOP - 1; y++) if (a[y] !== b[y]) wall++
    assert.ok(wall >= 3, `only ${wall} wall rows changed -- the spots are not sweeping`)
    assert.notEqual(ballA, ballB, 'the ball is not turning')
  } finally { h.shutdown() }
})

test('DANCEFLOOR: re-entry after a long visit carries no beat clock from the previous visit', async () => {
  // _dancefloorBeatAt is the effect's one absolute effect-clock value, and
  // after two minutes of synthetic beats it holds ~120s. The rate limit
  // reads it and the draw does not self-heal it, so a stale value freezes
  // the floor for as long as the last visit lasted -- reset() is what this
  // tests. Mutation-checked: with reset() emptied, both the clock assertion
  // and the "floor stepped" assertion below go red.
  // 2026-09-13 (audit L12) -- the two minutes are compressed: the entry stamp
  // is moved back 120s instead of rendering 7500 frames of it, then two real
  // seconds of synthetic beats stamp the clock at ~121s. The draw's t comes
  // from _vizEnterAt (visualizer.js), so this is the state a real long visit
  // leaves at exit.
  const { h } = await bootFloor()
  try {
    h.advance(1000)
    h.program._vizEnterAt -= 120000
    h.advance(2000)
    assert.ok(h.program._dancefloorBeatAt > 100, 'the floor should have been stepping through the long visit')
    h.key('e')
    h.advance(500)
    h.key('v')
    const stepAtEntry = h.program._dancefloorStep
    h.advance(2000)
    const t = effectT(h)
    assert.ok(t < 5, `effect clock should have restarted (t=${t.toFixed(1)})`)
    assert.ok(!(h.program._dancefloorBeatAt > t), `beat stamped at ${h.program._dancefloorBeatAt}s on a clock at ${t.toFixed(1)}s`)
    assert.ok(h.program._dancefloorStep - stepAtEntry >= 2, 'the floor did not step in two seconds after re-entry')
    assert.ok(inked(h) > 300, `only ${inked(h)} inked cells after re-entry`)
  } finally { h.shutdown() }
})

test('DANCEFLOOR: the mirror ball is round, hung on its cord, a faceted mosaic -- every frame', async () => {
  const { h, mod } = await bootFloor()
  try {
    for (let i = 0; i < 30; i++) {
      h.advance(150)
      assert.equal(ballProblem(h, mod), null, `frame ${i}`)
    }
  } finally { h.shutdown() }
})

// 2026-10-20 (polish). The critique: the ball read as a SKULL -- two block
// glints side by side in its upper half for eyes and a row of them below
// for teeth. Every bright thing on the ball must now sit on its rim.
test('DANCEFLOOR: the ball\'s glints are on its rim, BRIGHT, at most a few -- no eyes', async () => {
  const { h, fx, mod } = await bootFloor()
  try {
    const cx = mod.BALL_CX * ADV + CELL_W / 2, cy = mod.BALL_CY * CELL_H + CELL_H / 2
    const aspect = (4 / 3) / ((h.term.cols * ADV) / (h.term.rows * CELL_H))
    let spotGlint = 0
    for (let f = 0; f < 60; f++) {
      drawWith(h, fx, 40 + f * 0.1, signal({ treble: 1, level: 1, bass: 1, pulse: f % 5 === 0 ? 1 : 0.1 }))
      let brightCells = 0
      for (let y = mod.BALL_Y0 - 1; y < mod.BALL_Y0 + mod.BALL_H + 1; y++) {
        for (let x = mod.BALL_X0; x < mod.BALL_X0 + mod.BALL_W; x++) {
          if (!gfxAt(h, x, y) || !(attrAt(h, x, y) & BRIGHT)) continue
          brightCells++
          // A BRIGHT cell's centre is near the rim: never deep inside.
          const dx = ((x * ADV + CELL_W / 2) - cx) * aspect / mod.BALL_R
          const dy = ((y * CELL_H + CELL_H / 2) - cy) / mod.BALL_R
          const rr = Math.hypot(dx, dy)
          assert.ok(rr > 0.62, `frame ${f}: a BRIGHT cell at ${x},${y} is inside the ball (r=${rr.toFixed(2)}) -- an eye`)
          // And on the lit, left side: never mirrored on the right.
          assert.ok(dx < 0.35, `frame ${f}: a BRIGHT cell at ${x},${y} on the ball's right side`)
        }
      }
      assert.ok(brightCells <= (mod.MAX_GLINTS + 1) * 4, `frame ${f}: ${brightCells} BRIGHT cells on the ball`)
      const g = mod.glintAt(h.term, mod.SPOT_GLINT_ANGLE)
      if (attrAt(h, g.c, g.r) & BRIGHT) spotGlint++
    }
    assert.equal(spotGlint, 60, `the spotlight's glint was BRIGHT in only ${spotGlint} of 60 frames`)
  } finally { h.shutdown() }
})

test('DANCEFLOOR: the lit-tile pattern steps when a beat lands, and holds between beats', async () => {
  const { h, fx, mod } = await bootFloor()
  try {
    h.advance(500)
    fx.reset(h.program)
    const t0 = 30
    // Quiet frames: the pattern must hold, however the level wanders.
    drawWith(h, fx, t0, signal())
    const before = litTiles(h, mod)
    for (let f = 1; f <= 20; f++) {
      drawWith(h, fx, t0 + f / 60, signal({ level: 0.2 + f * 0.04, bass: f * 0.05 }))
      assert.equal(litTiles(h, mod), before, `pattern changed on quiet frame ${f}`)
    }
    const tiles = before.split(',').filter(Boolean).length
    assert.ok(tiles >= 1, 'no tiles lit at all')
    assert.ok(tiles <= 32 * 0.4, `${tiles} of 32 tiles lit -- a lit floor is a slab on the tube`)

    // The kick: a real onset puts pulse at 1.
    let t = t0 + 21 / 60
    drawWith(h, fx, t, signal({ level: 0.8, onset: true, pulse: 1 }))
    const after = litTiles(h, mod)
    assert.notEqual(after, before, 'the floor did not step on the beat')

    // The pulse decaying behind it is not a new beat.
    for (let f = 1; f <= 12; f++) {
      t += 1 / 60
      drawWith(h, fx, t, signal({ level: 0.8, pulse: Math.exp(-f / 7) }))
      assert.equal(litTiles(h, mod), after, `pattern changed while the pulse decayed (frame ${f})`)
    }
    // A second transient inside the step gap (a double kick) does not step.
    drawWith(h, fx, t + 0.02, signal({ level: 0.8, onset: true, pulse: 1 }))
    assert.equal(litTiles(h, mod), after, 'a transient 0.2s after the beat stepped the floor again')
    // The next beat, half a second on, does.
    drawWith(h, fx, t + 0.2, signal({ level: 0.8, pulse: 0.05 }))
    drawWith(h, fx, t + 0.5, signal({ level: 0.8, onset: true, pulse: 1 }))
    assert.notEqual(litTiles(h, mod), after, 'the next beat did not step the floor')
  } finally { h.shutdown() }
})

test('DANCEFLOOR: with no tap the floor steps in time with the synthetic ~0.9s pulse', async () => {
  const { h, mod } = await bootFloor()
  try {
    h.advance(300)
    let prev = litTiles(h, mod), prevStep = h.program._dancefloorStep
    const changes = [], steps = []
    const start = effectT(h)
    while (effectT(h) < start + 9) {
      h.advance(16)
      const t = effectT(h)
      const now = litTiles(h, mod)
      if (now !== prev) changes.push(t)
      if (h.program._dancefloorStep !== prevStep) steps.push(t)
      prev = now
      prevStep = h.program._dancefloorStep
    }
    // Ten pulses in nine seconds; every step, and every change on the
    // floor, lands within a frame or two of a pulse.
    assert.ok(steps.length >= 9 && steps.length <= 11, `${steps.length} steps in 9s`)
    assert.ok(changes.length >= 7, `the floor visibly changed only ${changes.length} times in 9s`)
    const offBeat = [...steps, ...changes].filter((t) => {
      const ph = t % 0.9
      return Math.min(ph, 0.9 - ph) > 0.05
    })
    assert.deepEqual(offBeat.map((t) => t.toFixed(3)), [], 'the floor stepped off the beat')
  } finally { h.shutdown() }
})

test('DANCEFLOOR: the spots on the wall travel together in one direction, as a turning ball throws them', async () => {
  const { h, fx, mod } = await bootFloor()
  try {
    h.advance(500)
    const heads = () => {
      const out = []
      for (let y = 1; y < mod.FLOOR_TOP - 1; y++) {
        const row = h.row(y)
        for (let x = 0; x < h.term.cols; x++) if (row[x] === mod.SPOT_HEAD) out.push({ x, y })
      }
      return out
    }
    let right = 0, left = 0, matched = 0
    for (const t0 of [12, 47, 83, 140]) {
      fx.reset(h.program)
      drawWith(h, fx, t0, signal({ level: 0.9 }))
      const a = heads()
      drawWith(h, fx, t0 + 0.25, signal({ level: 0.9 }))
      const b = heads()
      assert.ok(a.length >= 4, `only ${a.length} spots on the wall at t=${t0}`)
      for (const s of a) {
        // Where is this spot a quarter second later? With the rotation, it
        // is at the same column (slow, in a corner) or up to three to the
        // right; "against" means nothing is there but something is to the
        // left. (Nearest-neighbour matching mis-pairs two spots a column
        // apart on one row -- a tie between x-1 and x+1 -- so the test asks
        // whether the rotation's prediction is met instead.)
        const onRow = (dx) => b.some((q) => q.y === s.y && q.x === s.x + dx)
        const fwd = onRow(1) || onRow(2) || onRow(3)
        const still = onRow(0)
        const back = onRow(-1) || onRow(-2) || onRow(-3)
        if (!fwd && !still && !back) continue
        matched++
        if (fwd) right++
        else if (!still) left++
      }
    }
    assert.ok(matched >= 12, `only ${matched} spots could be followed between frames`)
    assert.ok(right >= 6, `only ${right} spots moved at all`)
    assert.equal(left, 0, `${left} spots moved against the rotation (${right} with it)`)
  } finally { h.shutdown() }
})

test('DANCEFLOOR: no block characters, BRIGHT stays rare, and the floor never glares', async () => {
  const { h, fx, mod } = await bootFloor()
  try {
    const audit = (label) => {
      let bright = 0, floorLit = 0, floorCells = 0
      const spots = h.program._dancefloorSpotCells || new Set()
      for (let y = 1; y < VIZ_BOT; y++) {
        const row = h.row(y)
        for (let x = 0; x < h.term.cols; x++) {
          const ch = row[x], a = attrAt(h, x, y), g = gfxAt(h, x, y)
          assert.ok(!/[█▓▒░▀▄]/.test(ch), `${label}: block '${ch}' at ${x},${y}`)
          const onBall = x >= mod.BALL_X0 && x < mod.BALL_X0 + mod.BALL_W && y >= mod.BALL_Y0 - 1 && y < mod.BALL_Y0 + mod.BALL_H + 1
          if ((a & BRIGHT) && (g || ch !== ' ')) {
            if (!onBall) bright++
            assert.ok(onBall || ch === mod.SPOT_HEAD || spots.has(y * h.term.cols + x),
              `${label}: BRIGHT at ${x},${y} -- only glints and spots may be`)
          }
          if (y >= mod.FLOOR_TOP) {
            floorCells++
            if (spots.has(y * h.term.cols + x)) continue
            // Never NORMAL on the floor but where a fleck is.
            if (g) assert.ok(a & (DIM | MUTED | FAINT), `${label}: floor cell ${x},${y} at NORMAL or above`)
            if (g && popcount(g) / (CELL_W * CELL_H) > 0.3) floorLit++
            if (g) assert.ok(popcount(g) / (CELL_W * CELL_H) <= 0.72, `${label}: floor cell ${x},${y} is ${popcount(g)}/128 lit -- a slab`)
          }
        }
      }
      return { bright, floorLit: floorLit / floorCells }
    }
    let worst = { bright: 0, floorLit: 0 }
    const keep = (r) => { for (const k of Object.keys(worst)) worst[k] = Math.max(worst[k], r[k]) }
    for (let i = 0; i < 40; i++) { h.advance(100); keep(audit(`synthetic frame ${i}`)) }
    // And the loudest case: every kick at full bass and treble, at every
    // routine of the floor.
    fx.reset(h.program)
    for (let f = 0; f < 64; f++) {
      const t = 50 + f * 0.5
      drawWith(h, fx, t, signal({ level: 1, bass: 1, treble: 1, pulse: 0.05 }))
      drawWith(h, fx, t + 0.02, signal({ level: 1, bass: 1, treble: 1, onset: true, pulse: 1 }))
      keep(audit(`kick ${f}`))
    }
    assert.ok(worst.bright <= 16, `${worst.bright} BRIGHT spot cells in one frame`)
    assert.ok(worst.floorLit <= 0.35, `${(worst.floorLit * 100).toFixed(0)}% of the floor lit in one frame`)
  } finally { h.shutdown() }
})

test('DANCEFLOOR: muted, the ball keeps turning, the spots dim, the floor goes dark and stops stepping', async () => {
  const { h, mod } = await bootFloor()
  try {
    h.advance(1000)
    h.program.muted = true
    h.advance(200)
    const step = h.program._dancefloorStep
    const ballA = ballBits(h, mod)
    let spots = 0
    for (let i = 0; i < 30; i++) {
      h.advance(100)
      assert.equal(litTiles(h, mod), '', 'lit tiles under mute')
      for (let y = 1; y < VIZ_BOT; y++) {
        for (let x = 0; x < h.term.cols; x++) {
          if (h.row(y)[x] !== mod.SPOT_HEAD) continue
          spots++
          assert.ok(attrAt(h, x, y) & (DIM | FAINT | MUTED), `a spot at full brightness under mute (${x},${y})`)
        }
      }
      // Nothing BRIGHT at all: the spotlight's glint drops to NORMAL.
      for (let y = 1; y < VIZ_BOT; y++) {
        for (let x = 0; x < h.term.cols; x++) {
          if (gfxAt(h, x, y)) assert.ok(!(attrAt(h, x, y) & BRIGHT), `BRIGHT bitmap at ${x},${y} under mute`)
        }
      }
    }
    assert.equal(h.program._dancefloorStep, step, 'the floor stepped under mute')
    assert.ok(spots > 0, 'every spot went out under mute -- the ball should still throw a few')
    assert.notEqual(ballBits(h, mod), ballA, 'the ball stopped turning under mute')
    assert.equal(ballProblem(h, mod), null)
  } finally { h.shutdown() }
})

test('DANCEFLOOR: the dancers change pose on the beat, MUTED over the floor', async () => {
  const { h, fx, mod } = await bootFloor()
  try {
    h.advance(500)
    fx.reset(h.program)
    const figures = () => mod.DANCER_X.map((x) =>
      [0, 1, 2].map((r) => h.row(mod.DANCER_Y + r).slice(x - 1, x + 2)).join('|'))
    drawWith(h, fx, 20, signal())
    const a = figures()
    for (const f of a) assert.match(f, /o/, `a dancer has no head: ${f}`)
    // 2026-10-20 (polish) -- MUTED (was DIM): the critique asked for the
    // dancers to read over the floor.
    for (const x of mod.DANCER_X) {
      const hx = h.row(mod.DANCER_Y).slice(x - 1, x + 2).indexOf('o') + x - 1
      assert.ok(attrAt(h, hx, mod.DANCER_Y) & MUTED, `dancer's head at ${hx} is not MUTED`)
    }
    drawWith(h, fx, 20.3, signal())
    assert.deepEqual(figures(), a, 'the dancers moved without a beat')
    drawWith(h, fx, 20.32, signal({ onset: true, pulse: 1 }))
    const b = figures()
    assert.ok(b.every((f, i) => f !== a[i]), `not every dancer changed pose on the beat: ${a} -> ${b}`)
  } finally { h.shutdown() }
})

// 2026-10-20 (polish). The critique, of the character floor: lit tiles were
// '░' staircases sloping with the rails -- tetromino blobs -- and the
// character fixes it offered could not work at this size (a tile's interior
// is 1-6 cells across, so "the same columns on every row" left the outer
// tiles a single column or nothing). The floor is panels now; this reads
// each lit tile back off the bitmaps and holds that it fills ITS panel and
// that the joints between panels stay dark, so no tile can stair-step over a
// joint or fuse with its neighbour. Mutation-checked: GROUT_PX = 0 (no
// joints) and a panel test that ignores the tile index (every panel lit)
// both fail here.
test('DANCEFLOOR: a lit tile fills its own panel -- dark joints, no fused blobs, not a slab', async () => {
  const { h, fx, mod } = await bootFloor()
  try {
    h.advance(500)
    fx.reset(h.program)
    let litSeen = 0
    for (let f = 0; f < 24; f++) {
      const t = 50 + f * 0.5
      drawWith(h, fx, t, signal({ level: 1, bass: 1, pulse: 0.05 }))
      drawWith(h, fx, t + 0.02, signal({ level: 1, bass: 1, onset: true, pulse: 1 }))
      const { on, total, jointOn } = panelCover(h, mod)
      assert.equal(jointOn, 0, `kick ${f}: ${jointOn} lit pixels in the joints between panels`)
      for (const [k, n] of total) {
        const c = (on.get(k) || 0) / n
        // Either lit (about LIT_COVER, plus the bass) or dark (about the
        // dark panels' 0.12) -- nothing in between, which is what a panel
        // half lit by its neighbour's spill would look like.
        assert.ok(c < 0.2 || (c > 0.4 && c < 0.72), `kick ${f}: tile ${k} is ${(c * 100).toFixed(0)}% lit`)
        if (c > 0.4) litSeen++
      }
    }
    assert.ok(litSeen > 40, `only ${litSeen} lit tile-frames over 24 kicks`)
  } finally { h.shutdown() }
})

test('DANCEFLOOR: the ball is the brightest structure -- NORMAL facets over DIM/MUTED floor panels', async () => {
  const { h, mod } = await bootFloor()
  try {
    for (let i = 0; i < 20; i++) {
      h.advance(150)
      let normal = 0
      for (let y = mod.BALL_Y0; y < mod.BALL_Y0 + mod.BALL_H; y++) {
        for (let x = mod.BALL_X0; x < mod.BALL_X0 + mod.BALL_W; x++) {
          if (gfxAt(h, x, y) && !(attrAt(h, x, y) & (DIM | MUTED | FAINT | BRIGHT))) normal++
        }
      }
      assert.ok(normal >= 12, `frame ${i}: only ${normal} NORMAL cells on the ball`)
    }
  } finally { h.shutdown() }
})
