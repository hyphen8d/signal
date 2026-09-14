// BACKROOM (AFTER HOURS, 2026-09-13) -- what the effect actually leaves on
// the grid, read back off it the way tests/visuals.test.mjs reads BREACH's
// words: the canvas contract (every cell of rows 1..21 repainted, nothing
// outside), that it moves, that re-entry after a long visit carries no glint
// clock from the previous visit, that the two things the picture promises --
// the upright bass and the spotlight cone -- are legible, that the frame
// stays dark (the '█' cap is the tube-bloom lesson from UPRISING and KEEP,
// which the text grid otherwise cannot see), and that mute settles it.
//
// Run: node --test tests/visual-backroom.test.mjs

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
const BRIGHT = 1
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000
const canvasRows = (h) => Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1))
const nonSpace = (h) => canvasRows(h).join('').replace(/ /g, '').length

async function bootBackroom() {
  const h = await boot({ station: 'after-hours' })
  h.powerOn()
  h.key('v')
  assert.equal(h.program.activeVisualKey(), 'backroom', 'AFTER HOURS should land on BACKROOM')
  return h
}

/** The effect module from the SAME instance the program imported. */
async function backroomModule() {
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  return VISUALS.backroom
}

/** The module's own exports (layout constants), same instance. */
async function backroomExports() {
  return import(`../visuals/backroom.js?v=${globalThis.SIGNAL_BUILD}`)
}

/** Reads the upright bass back off the grid: a scroll, a neck of string
 *  glyphs under it, a bridge in the same column, bouts either side of the
 *  bridge, and the endpin. Returns a reason string on failure, or null. */
function bassProblem(h) {
  const rows = canvasRows(h)
  for (let y = 0; y < rows.length; y++) {
    const x = rows[y].indexOf('@')
    if (x < 0) continue
    let neck = 0
    let yy = y + 1
    while (yy < rows.length && '‖|¦'.includes(rows[yy][x])) { neck++; yy++ }
    if (neck < 4) return `neck under the scroll is only ${neck} rows`
    const bridgeY = rows.findIndex((r, i) => i > y && r[x] === '╪')
    if (bridgeY < 0) return 'no bridge under the scroll'
    const br = rows[bridgeY]
    const left = br.lastIndexOf('(', x), right = br.indexOf(')', x)
    if (left < 0 || right < 0 || x - left < 3 || right - x < 3) return 'no lower bouts either side of the bridge'
    if (!rows.some((r, i) => i > bridgeY && r[x] === '┴')) return 'no endpin under the bridge'
    return null
  }
  return 'no scroll on the grid'
}

test('BACKROOM: repaints every canvas cell and nothing outside rows 1..21', async () => {
  const h = await bootBackroom()
  try {
    h.advance(1500)
    const fx = await backroomModule()
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
    } finally { h.term.put = put }
    assert.deepEqual(outside.slice(0, 5), [], `${outside.length} puts landed outside the canvas`)
    let missed = 0
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) if (!hit[y * h.term.cols + x]) missed++
    assert.equal(missed, 0, `${missed} canvas cells were not repainted this frame`)
    const lit = nonSpace(h)
    assert.ok(lit > 300, `only ${lit} non-space cells on the canvas`)
    // Mostly dark: a club at 2am, not a lit room.
    assert.ok(lit < 1680 * 0.45, `${lit} non-space cells -- the room should be mostly dark`)
  } finally { h.shutdown() }
})

test('BACKROOM: every character it draws exists in the BDF font', async () => {
  const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
  const h = await bootBackroom()
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

test('BACKROOM: the smoke moves through the beam', async () => {
  const h = await bootBackroom()
  try {
    h.advance(1000)
    const a = canvasRows(h)
    h.advance(1500)
    const b = canvasRows(h)
    assert.notEqual(a.join('\n'), b.join('\n'), 'two frames 1.5s apart are identical')
    let changed = 0
    for (let y = 2; y < 14; y++) if (a[y] !== b[y]) changed++
    assert.ok(changed >= 6, `only ${changed} of the stage rows changed -- the smoke is not drifting`)
  } finally { h.shutdown() }
})

test('BACKROOM: re-entry after a long visit carries no glint clock from the previous visit', async () => {
  // _backroomGlintAt is the effect's one absolute effect-clock value. Forced
  // to the end of a two-minute visit (as LAGOON's flare is), then muted so
  // the check cannot depend on a synthetic onset. The draw does not self-heal
  // it -- a stale value in the future also blocks every new glint via the
  // rate limit -- so reset() is what this tests. Mutation-checked: with
  // reset() emptied this goes red on the first assertion below.
  // 2026-09-13 (audit L12) -- the two minutes are compressed: the entry stamp
  // is moved back 120s instead of rendering 7500 frames of it. What this bug
  // class needs is an effect clock ~120s ahead at exit, and the draw's t is
  // computed from _vizEnterAt (visualizer.js), so that is exactly the state a
  // real long visit leaves.
  const h = await bootBackroom()
  try {
    h.advance(1000)
    h.program._vizEnterAt -= 120000
    h.advance(500)
    h.program._backroomGlintAt = effectT(h)
    h.program.muted = true
    h.key('e')
    h.advance(500)
    h.key('v')
    h.advance(2000)
    const t = effectT(h)
    assert.ok(t < 5, `effect clock should have restarted (t=${t.toFixed(1)})`)
    assert.ok(!(h.program._backroomGlintAt > t), `glint stamped at ${h.program._backroomGlintAt}s on a clock at ${t.toFixed(1)}s`)
    assert.equal(bassProblem(h), null, 'the bass should still be on stage after re-entry')
    assert.ok(nonSpace(h) > 250, `only ${nonSpace(h)} non-space cells after re-entry`)
  } finally { h.shutdown() }
})

test('BACKROOM: the upright bass reads -- scroll, neck, bouts, bridge, endpin -- every frame', async () => {
  const h = await bootBackroom()
  try {
    for (let i = 0; i < 40; i++) {
      h.advance(150)
      assert.equal(bassProblem(h), null, `frame ${i}`)
    }
  } finally { h.shutdown() }
})

test('BACKROOM: one spotlight cone -- lamp, widening edges, lit air inside, black room outside', async () => {
  const { LAMP_X, BEAM_TOP, STAGE_Y, coneHalfWidth, artMaskFor } = await backroomExports()
  const h = await bootBackroom()
  try {
    const cols = h.term.cols
    const ART_MASK = artMaskFor(cols)
    let inLit = 0, inN = 0, outLit = 0, outN = 0
    for (let i = 0; i < 30; i++) {
      h.advance(200)
      const rows = canvasRows(h)
      // The lamp's lens, bright, directly over the apex.
      const lens = h.row(BEAM_TOP)
      assert.equal(lens.slice(LAMP_X - 1, LAMP_X + 2), '▀▀▀', 'lamp lens missing over the cone')
      assert.ok(h.term.attrs[BEAM_TOP * h.term.cols + LAMP_X] & BRIGHT, 'the lens should be the bright thing')
      // Edge glyphs where no player stands in them, stepping outward as the
      // rows go down. Read at the positions the cone puts them, so a stray
      // '/' in a figure cannot pass for an edge.
      let prev = 0, edgeRows = 0
      for (let y = BEAM_TOP + 1; y < STAGE_Y; y++) {
        const hw = coneHalfWidth(y)
        const l = Math.round(LAMP_X - hw), rt = Math.round(LAMP_X + hw)
        if (ART_MASK[y * cols + l] || ART_MASK[y * cols + rt]) continue
        assert.equal(h.row(y)[l] + h.row(y)[rt], '/\\', `cone edges missing on row ${y}`)
        assert.ok(rt - l > prev, `cone does not widen at row ${y}`)
        prev = rt - l
        edgeRows++
      }
      assert.ok(edgeRows >= 3, `the cone's edges show on only ${edgeRows} rows`)
      // Lit air inside vs. a black room outside, over unoccupied cells only.
      for (let y = BEAM_TOP + 1; y < STAGE_Y; y++) {
        const hw = coneHalfWidth(y)
        for (let x = 8; x < 72; x++) {
          if (ART_MASK[y * cols + x]) continue
          const u = Math.abs(x - LAMP_X) / hw
          const lit = rows[y - 1][x] !== ' '
          if (u < 0.85) { inN++; if (lit) inLit++ } else if (u > 1.35) { outN++; if (lit) outLit++ }
        }
      }
      // The pool of light on the boards, centred under the lamp.
      const pool = h.row(STAGE_Y)
      const a = pool.indexOf('═'), b = pool.lastIndexOf('═')
      assert.ok(a >= 0 && b - a >= 14, 'no pool of light on the stage floor')
      assert.ok(Math.abs((a + b) / 2 - LAMP_X) <= 2, `pool centred at ${(a + b) / 2}, lamp at ${LAMP_X}`)
    }
    const inside = inLit / inN, outside = outLit / outN
    assert.ok(inside > 0.3, `only ${(inside * 100).toFixed(0)}% of the cone's open cells are lit`)
    assert.ok(outside < 0.03, `${(outside * 100).toFixed(1)}% of the room outside the cone is lit`)
  } finally { h.shutdown() }
})

test('BACKROOM: full blocks stay accents and BRIGHT stays rare (tube bloom)', async () => {
  // Wide '█' runs bloom into glowing slabs on the real CRT even at FAINT --
  // invisible to the text grid, so the cap is asserted here directly.
  const h = await bootBackroom()
  try {
    let worstBlocks = 0, worstBright = 0
    for (let i = 0; i < 60; i++) {
      h.advance(100)
      const blocks = canvasRows(h).join('').split('█').length - 1
      let bright = 0
      for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) if (h.term.attrs[y * h.term.cols + x] & BRIGHT) bright++
      worstBlocks = Math.max(worstBlocks, blocks)
      worstBright = Math.max(worstBright, bright)
    }
    assert.ok(worstBlocks <= 1680 * 0.01, `${worstBlocks} '█' cells in one frame`)
    assert.ok(worstBright <= 6, `${worstBright} BRIGHT cells in one frame -- only the lens, candle and a glint may be`)
  } finally { h.shutdown() }
})

test('BACKROOM: the bassist nods with the music and stands still under mute', async () => {
  const h = await bootBackroom()
  try {
    // The bassist's head is the one left of the lamp's axis.
    const headX = () => {
      for (let y = 1; y < 8; y++) {
        const x = h.row(y).indexOf('╭─╮')
        if (x >= 0 && x < 40) return x
      }
      return -1
    }
    const seen = new Set()
    for (let i = 0; i < 100; i++) { h.advance(100); seen.add(headX()) }
    assert.ok(!seen.has(-1), 'lost the bassist\'s head')
    assert.ok(seen.size >= 2, 'the bassist never moved in ten seconds of music')

    h.program.muted = true
    h.advance(300)
    const still = new Set()
    const foreground = canvasRows(h).slice(15).join('\n')
    for (let i = 0; i < 30; i++) {
      h.advance(100)
      still.add(headX())
      // Strings at rest, and nothing below the stage changes (the candle
      // and neon hold steady; only the smoke keeps moving).
      assert.ok(!/[¦]/.test(canvasRows(h).slice(2, 15).join('')), 'strings still shimmering under mute')
    }
    assert.equal(still.size, 1, 'the bassist should stand still under mute')
    assert.equal(canvasRows(h).slice(15).join('\n'), foreground, 'the room below the stage should be still under mute')
  } finally { h.shutdown() }
})

test('BACKROOM: an onset is a soft half-second glint on the cymbal, then gone', async () => {
  const { RIM, GLINT_S } = await backroomExports()
  const h = await bootBackroom()
  try {
    h.program.muted = true // no synthetic onsets: the glint below is the only one
    h.advance(1000)
    const spot = () => h.row(RIM[3].y - 1)[RIM[3].x]
    assert.equal(spot(), ' ', 'no glint before the onset')
    h.program._backroomGlintAt = effectT(h)
    h.advance(GLINT_S * 500)
    assert.equal(spot(), '+', 'the glint should peak halfway through')
    h.advance(GLINT_S * 1000 + 200)
    assert.equal(spot(), ' ', 'the glint should be gone within a moment')
  } finally { h.shutdown() }
})
