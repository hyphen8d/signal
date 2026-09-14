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
// Attribute bits, src/cellgrid.js.
const BRIGHT = 1, DIM = 4, MUTED = 32, FAINT = 64
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000
const canvasRows = (h) => Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1))
const nonSpace = (h) => canvasRows(h).join('').replace(/ /g, '').length
const attrAt = (h, x, y) => h.term.attrs[y * h.term.cols + x]

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

/** The set of lit tiles, read off the grid: a tile is lit when most of its
 *  interior cells hold a shade glyph (its dark margin and a passing spot
 *  cannot tip that either way). */
function litTiles(h, mod) {
  const shade = new Map(), total = new Map()
  for (let y = mod.FLOOR_TOP; y < VIZ_BOT; y++) {
    const row = h.row(y)
    for (let x = 0; x < h.term.cols; x++) {
      const k = mod.floorTileAt(x, y)
      if (k < 0) continue
      total.set(k, (total.get(k) || 0) + 1)
      if (row[x] === '░' || row[x] === '▒') shade.set(k, (shade.get(k) || 0) + 1)
    }
  }
  const lit = []
  for (const [k, n] of total) if ((shade.get(k) || 0) / n > 0.4) lit.push(k)
  return lit.sort((a, b) => a - b).join(',')
}

/** Reads the mirror ball back: the cord over its top, and for each of its
 *  rows the outer extent of its outline glyphs inside the ball's columns.
 *  Returns a reason string on failure, or null. */
function ballProblem(h, mod) {
  const { BALL_X0, BALL_Y0, BALL_W, BALL_H, BALL_CX } = mod
  if (h.row(1)[BALL_CX] !== '│') return 'no cord over the ball'
  const OUTLINE = '.-‾´`/\\│_'
  const widths = []
  for (let r = 0; r < BALL_H; r++) {
    const row = h.row(BALL_Y0 + r)
    let l = -1, rt = -1
    for (let x = BALL_X0; x < BALL_X0 + BALL_W; x++) {
      if (OUTLINE.includes(row[x])) { if (l < 0) l = x; rt = x }
    }
    if (l < 0) return `ball row ${r} has no outline`
    // Symmetric about the cord, within a column.
    if (Math.abs((l + rt) / 2 - BALL_CX) > 1) return `ball row ${r} is off-centre (${l}..${rt})`
    widths.push(rt - l + 1)
  }
  // Widest at the middle row, narrowing to the top and bottom.
  const mid = Math.floor(BALL_H / 2)
  for (let r = 0; r < mid; r++) {
    if (widths[r] > widths[r + 1]) return `ball widens toward the top at row ${r}: ${widths}`
    if (widths[BALL_H - 1 - r] > widths[BALL_H - 2 - r]) return `ball widens toward the bottom: ${widths}`
  }
  // Round on ~2:1 cells: the widest row spans about twice the row count.
  const aspect = widths[mid] / (BALL_H * 2)
  if (aspect < 0.9 || aspect > 1.25) return `ball aspect ${aspect.toFixed(2)} is not round (${widths})`
  if (widths[0] > widths[mid] * 0.75) return `ball's top row is too wide to be round (${widths})`
  return null
}

/** The ball's interior (between the outline on each of its gap rows). */
function ballInterior(h, mod) {
  const { BALL_X0, BALL_Y0, BALL_H } = mod
  const cells = []
  for (let r = 1; r < BALL_H - 1; r++) {
    const row = h.row(BALL_Y0 + r)
    const seg = row.slice(BALL_X0, BALL_X0 + 15)
    const l = seg.search(/[.´\/│\\`]/)
    const rt = 14 - [...seg].reverse().join('').search(/[.´\/│\\`]/)
    for (let x = l + 1; x < rt; x++) cells.push(seg[x])
  }
  return cells
}

test('DANCEFLOOR: repaints every canvas cell and nothing outside rows 1..21', async () => {
  const { h, fx } = await bootFloor()
  try {
    h.advance(1500)
    const put = h.term.put
    const hit = new Uint8Array(h.term.cols * VIZ_BOT)
    const outside = []
    h.term.put = function (x, y, ...rest) {
      if (y < 1 || y >= VIZ_BOT) outside.push(`${x},${y}`)
      else if (x >= 0 && x < this.cols) hit[y * this.cols + x] = 1
      return put.call(this, x, y, ...rest)
    }
    try {
      fx.draw(h.program, { term: h.term }, effectT(h))
      // A kick with everything up, too, so the flare's extra cells are in scope.
      fx.draw(h.program, { term: h.term }, effectT(h) + 0.5)
      h.program._au = signal({ level: 1, bass: 1, treble: 1, pulse: 1, onset: true })
      fx.draw(h.program, { term: h.term }, effectT(h) + 1)
    } finally { h.term.put = put }
    assert.deepEqual(outside.slice(0, 5), [], `${outside.length} puts landed outside the canvas`)
    let missed = 0
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) if (!hit[y * h.term.cols + x]) missed++
    assert.equal(missed, 0, `${missed} canvas cells were not repainted this frame`)
    const lit = nonSpace(h)
    assert.ok(lit > 300, `only ${lit} non-space cells on the canvas`)
    assert.ok(lit < 1680 * 0.4, `${lit} non-space cells -- the room should be mostly dark`)
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
    const a = canvasRows(h), ballA = ballInterior(h, mod).join('')
    h.advance(1200)
    const b = canvasRows(h), ballB = ballInterior(h, mod).join('')
    assert.notEqual(a.join('\n'), b.join('\n'), 'two frames 1.2s apart are identical')
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
    assert.ok(nonSpace(h) > 300, `only ${nonSpace(h)} non-space cells after re-entry`)
  } finally { h.shutdown() }
})

test('DANCEFLOOR: the mirror ball is round, hung on its cord, faceted and lit -- every frame', async () => {
  const { h, mod } = await bootFloor()
  try {
    for (let i = 0; i < 40; i++) {
      h.advance(150)
      assert.equal(ballProblem(h, mod), null, `frame ${i}`)
      const inside = ballInterior(h, mod)
      const blank = inside.filter((c) => c === ' ').length
      // Facets, not a disc and not an empty ring: some reflection glyphs,
      // some dark grout, never a solid fill.
      assert.ok(inside.length >= 50, `ball interior is only ${inside.length} cells`)
      assert.ok(blank / inside.length > 0.15, `ball interior is ${blank}/${inside.length} blank -- a solid disc`)
      assert.ok(blank / inside.length < 0.7, `ball interior is ${blank}/${inside.length} blank -- no facets`)
      assert.ok(new Set(inside.filter((c) => c !== ' ')).size >= 2, 'the facets are all one glyph')
      assert.ok(inside.filter((c) => c === '█').length <= 3, 'more than a handful of block glints on the ball')
      // The spotlight's point is on the ball, and is the bright thing.
      const { x, y } = mod.SPOT_ON_BALL
      assert.equal(h.row(y)[x], '█', 'the spotlight point is missing')
      assert.ok(attrAt(h, x, y) & BRIGHT, 'the spotlight point should be BRIGHT')
    }
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

test('DANCEFLOOR: full blocks stay accents, BRIGHT stays rare, and the floor never glares', async () => {
  const { h, fx, mod } = await bootFloor()
  try {
    const audit = (label) => {
      let blocks = 0, bright = 0, floorShade = 0, floorCells = 0, glints = 0
      for (let y = 1; y < VIZ_BOT; y++) {
        const row = h.row(y)
        for (let x = 0; x < h.term.cols; x++) {
          const ch = row[x], a = attrAt(h, x, y)
          // Facet glints: BRIGHT on the ball other than the spotlight's
          // point. Counted on their own because a row of them is a bar on
          // the tube even while the frame's BRIGHT total is within its cap.
          const onBall = x >= mod.BALL_X0 && x < mod.BALL_X0 + mod.BALL_W && y >= mod.BALL_Y0 && y < mod.BALL_Y0 + mod.BALL_H
          if (onBall && (a & BRIGHT) && !(x === mod.SPOT_ON_BALL.x && y === mod.SPOT_ON_BALL.y) && ch !== mod.SPOT_HEAD) {
            glints++
            assert.ok(glints <= mod.MAX_GLINTS, `${label}: ${glints} glints on the ball in one frame`)
          }
          if (ch === '█') {
            blocks++
            assert.ok(y < mod.FLOOR_TOP, `${label}: a block on the floor at ${x},${y}`)
          }
          if (a & BRIGHT) {
            bright++
            assert.ok('█*•'.includes(ch), `${label}: BRIGHT '${ch}' at ${x},${y} -- only glints and spots may be`)
          }
          if (y >= mod.FLOOR_TOP) {
            floorCells++
            if (ch === '░' || ch === '▒' || ch === '▓') {
              floorShade++
              assert.notEqual(ch, '▓', `${label}: dense shade on the floor`)
            }
          }
        }
      }
      return { blocks, bright, floorShade: floorShade / floorCells }
    }
    let worst = { blocks: 0, bright: 0, floorShade: 0 }
    const keep = (r) => { for (const k of Object.keys(worst)) worst[k] = Math.max(worst[k], r[k]) }
    for (let i = 0; i < 60; i++) { h.advance(100); keep(audit(`synthetic frame ${i}`)) }
    // And the loudest case: every kick at full bass and treble, at every
    // routine of the floor.
    fx.reset(h.program)
    for (let f = 0; f < 64; f++) {
      const t = 50 + f * 0.5
      drawWith(h, fx, t, signal({ level: 1, bass: 1, treble: 1, pulse: 0.05 }))
      drawWith(h, fx, t + 0.02, signal({ level: 1, bass: 1, treble: 1, onset: true, pulse: 1 }))
      keep(audit(`kick ${f}`))
    }
    assert.ok(worst.blocks <= 1680 * 0.01, `${worst.blocks} '█' cells in one frame`)
    assert.ok(worst.bright <= 16, `${worst.bright} BRIGHT cells in one frame`)
    assert.ok(worst.floorShade <= 0.2, `${(worst.floorShade * 100).toFixed(0)}% of the floor filled with shade in one frame`)
  } finally { h.shutdown() }
})

test('DANCEFLOOR: muted, the ball keeps turning, the spots dim, the floor goes dark and stops stepping', async () => {
  const { h, mod } = await bootFloor()
  try {
    h.advance(1000)
    h.program.muted = true
    h.advance(200)
    const step = h.program._dancefloorStep
    const ballA = ballInterior(h, mod).join('')
    let spots = 0
    for (let i = 0; i < 30; i++) {
      h.advance(100)
      const rows = canvasRows(h)
      assert.ok(!/[░▒]/.test(rows.slice(mod.FLOOR_TOP - 1).join('')), 'lit tiles under mute')
      for (let y = 1; y < VIZ_BOT; y++) {
        for (let x = 0; x < h.term.cols; x++) {
          if (h.row(y)[x] !== mod.SPOT_HEAD) continue
          spots++
          assert.ok(attrAt(h, x, y) & (DIM | FAINT | MUTED), `a spot at full brightness under mute (${x},${y})`)
        }
      }
    }
    assert.equal(h.program._dancefloorStep, step, 'the floor stepped under mute')
    assert.ok(spots > 0, 'every spot went out under mute -- the ball should still throw a few')
    assert.notEqual(ballInterior(h, mod).join(''), ballA, 'the ball stopped turning under mute')
    assert.equal(ballProblem(h, mod), null)
  } finally { h.shutdown() }
})

test('DANCEFLOOR: the dancers change pose on the beat', async () => {
  const { h, fx, mod } = await bootFloor()
  try {
    h.advance(500)
    fx.reset(h.program)
    const figures = () => mod.DANCER_X.map((x) =>
      [0, 1, 2].map((r) => h.row(mod.DANCER_Y + r).slice(x - 1, x + 2)).join('|'))
    drawWith(h, fx, 20, signal())
    const a = figures()
    for (const f of a) assert.match(f, /o/, `a dancer has no head: ${f}`)
    drawWith(h, fx, 20.3, signal())
    assert.deepEqual(figures(), a, 'the dancers moved without a beat')
    drawWith(h, fx, 20.32, signal({ onset: true, pulse: 1 }))
    const b = figures()
    assert.ok(b.every((f, i) => f !== a[i]), `not every dancer changed pose on the beat: ${a} -> ${b}`)
  } finally { h.shutdown() }
})
