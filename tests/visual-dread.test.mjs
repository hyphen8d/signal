// DREAD / DROP FORGE (NIN, the secret station; redrawn 2026-10-18 in beam
// pixels) -- what the effect leaves on the grid, read back off it. The picture
// is per-cell bitmaps (putGlyph), so a character read sees only spaces: these
// tests read term.gfx and term.attrs. Covered: the canvas contract at three
// widths; that the forge is drawn as pixels and nothing else; that a KICK
// frame is unmistakably different from a LOUD one (white-hot billet, the
// hammer down) and settles back; that only a rising edge strikes; that it
// strikes with no tap (syntheticAudio); that MUTED is faint, never BRIGHT,
// never struck, and moves only in the billet's ember; that re-entry carries
// no slam clock; that a tear shears one band sideways and lets go; and the
// tube caps.
//
// The frame loop rewrites p._au every frame (visualizer.js), so the beat is
// driven by calling the effect's draw directly with a crafted signal. Tears
// roll Math.random; tests that need two frames to be comparable pin it high,
// which no tear trigger can pass.
//
// Run: node --test tests/visual-dread.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from './harness.mjs'
import { parseBDF } from '../src/bdf.js'
import { Term } from '../src/term.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const VIZ_BOT = 22
// Attribute bits, src/cellgrid.js.
const BRIGHT = 1

// The viz-sheet LOUD bed, between beats.
const signal = (over = {}) => ({
  level: 0.7, bass: 0.45, mid: 0.6, treble: 0.5,
  bands9: [0.45, 0.7, 0.5, 0.6, 0.4, 0.5, 0.7, 0.45, 0.6], onset: false, pulse: 0.15, ...over,
})
const KICK = signal({ pulse: 1, onset: true, bass: 1, level: 0.95 })

async function bootDread() {
  const h = await boot({ station: 'nin' })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  assert.equal(h.program.activeVisualKey(), 'dread', 'NIN should land on DREAD')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/dread.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.dread, mod }
}

function drawWith(h, fx, t, A, term = h.term) {
  h.program.muted = false
  h.program._au = A
  fx.draw(h.program, { term }, t)
}

/** Runs fn with Math.random pinned high: no tear can trigger. */
function noTears(fn) {
  const r = Math.random
  Math.random = () => 0.999
  try { return fn() } finally { Math.random = r }
}

/** Every canvas cell as "bitmap|attr" (blank cells as '.'). */
function snap(term) {
  const out = []
  for (let y = 1; y < VIZ_BOT; y++) {
    for (let x = 0; x < term.cols; x++) {
      const i = y * term.cols + x
      const g = term.gfx[i]
      out.push(g ? Array.from(g).join(',') + '|' + term.attrs[i] : '.')
    }
  }
  return out
}
const diffCells = (a, b) => a.reduce((n, v, i) => n + (v !== b[i]), 0)
const cellsWhere = (term, pred) => {
  let n = 0
  for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < term.cols; x++) if (pred(y * term.cols + x)) n++
  return n
}

function settle(h, fx, t0, A = signal()) {
  let t = t0
  for (let i = 0; i < 80; i++) { t += 0.05; drawWith(h, fx, t, A) }
  return t
}

test('DREAD: paints the whole canvas and nothing outside it, at 60, 80 and 100 columns', async () => {
  const { h, fx } = await bootDread()
  try {
    const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
    for (const cols of [60, 80, 100]) {
      const term = new Term(font, cols, 25, 6, 5)
      fx.reset(h.program)
      const put = term.put, putGlyph = term.putGlyph
      const outside = []
      let missed = 0
      for (let f = 0; f < 30; f++) {
        const hit = new Uint8Array(cols * VIZ_BOT)
        const mark = (x, y) => {
          if (y < 1 || y >= VIZ_BOT || x < 0 || x >= cols) outside.push([x, y])
          else hit[y * cols + x] = 1
        }
        term.put = function (x, y, ...rest) { mark(x, y); return put.call(this, x, y, ...rest) }
        term.putGlyph = function (x, y, ...rest) { mark(x, y); return putGlyph.call(this, x, y, ...rest) }
        try { drawWith(h, fx, 2 + f / 50, signal({ pulse: f % 6 === 0 ? 1 : 0 }), term) } finally { term.put = put; term.putGlyph = putGlyph }
        for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      }
      assert.deepEqual(outside.slice(0, 3), [], `${cols} cols: wrote outside the canvas`)
      assert.equal(missed, 0, `${cols} cols: ${missed} cell-frames left unpainted`)
    }
  } finally { h.shutdown() }
})

test('DREAD: the forge is drawn in beam pixels -- standards, hammer, anvil -- and no characters', async () => {
  const { h, fx, mod } = await bootDread()
  try {
    noTears(() => settle(h, fx, 1))
    const { term } = h
    const lit = cellsWhere(term, (i) => term.gfx[i])
    assert.ok(lit >= 500, `only ${lit} pixel cells lit -- the machine should fill the picture`)
    assert.equal(cellsWhere(term, (i) => !term.gfx[i] && term.chars[i] !== 32), 0, 'no characters on the canvas')
    // The two standards stand the full height: their cells are lit on every
    // row from under the crosshead to the floor.
    const cx = term.cols / 2
    for (const col of [cx - 17, cx + 16]) {
      for (let y = 5; y <= 19; y++) assert.ok(term.gfx[y * term.cols + col], `standard at col ${col} missing on row ${y}`)
    }
    // The hammer hangs over the billet: lit cells straight down the centre
    // from the cylinder to the anvil, with a gap of air above the billet.
    const centre = []
    for (let y = 1; y < VIZ_BOT; y++) centre.push(term.gfx[y * term.cols + cx] ? '#' : '.')
    assert.match(centre.join(''), /^#{8,}\.+#+/, `centre column top to bottom: ${centre.join('')}`)
    assert.ok(mod.CONTACT_TOP > mod.RAISED_TOP, 'the hammer has travel')
  } finally { h.shutdown() }
})

test('DREAD: KICK differs from LOUD at a glance -- the billet white-hot, the hammer down -- then settles', async () => {
  const { h, fx, mod } = await bootDread()
  try {
    noTears(() => {
      // bass 0 between blows: the hammer's bass tremor would otherwise move
      // the whole head a pixel between any two frames.
      const bed = signal({ bass: 0 })
      let t = settle(h, fx, 1, bed)
      const loud = snap(h.term)
      assert.equal(cellsWhere(h.term, (i) => h.term.attrs[i] & BRIGHT && h.term.gfx[i]), 0, 'nothing BRIGHT between blows')
      // The die's cell row at the moment of contact. The billet's glow fills
      // the air there between blows too, but only up to MUTED: lit NORMAL
      // across the die's width, it is the die itself.
      const dieRow = 1 + Math.floor((mod.CONTACT_TOP + mod.TUP_H - 8) / 16)
      const normalRun = () => {
        let run = 0, best = 0
        for (let x = 0; x < h.term.cols; x++) {
          const i = dieRow * h.term.cols + x
          run = h.term.gfx[i] && (h.term.attrs[i] === 0 || h.term.attrs[i] & BRIGHT) ? run + 1 : 0
          best = Math.max(best, run)
        }
        return best
      }
      assert.ok(normalRun() < 12, 'between blows the die is not down')
      t += 0.016; drawWith(h, fx, t, KICK)
      const kick = snap(h.term)
      const moved = diffCells(loud, kick)
      assert.ok(moved >= 80, `the blow changed only ${moved} cells -- it has to be the thing you see`)
      assert.ok(cellsWhere(h.term, (i) => h.term.attrs[i] & BRIGHT && h.term.gfx[i]) >= 3, 'the billet flashes white-hot')
      assert.equal(h.program._dreadKickAt, t, 'the blow is recorded')
      assert.ok(normalRun() >= 14, `the hammer is down on the billet (a lit run of ${normalRun()} cells on the die's row)`)
      // Its aftermath outlasts the blow: half a second on, the hammer is
      // still low and the picture is still nothing like LOUD.
      for (let n = 0; n < 30; n++) { t += 0.016; drawWith(h, fx, t, bed) }
      assert.ok(diffCells(loud, snap(h.term)) >= 60, 'half a second after the blow, it still shows')
      // And it settles: past the retract, the sparks and the cooling, the
      // frame is LOUD's again.
      for (let n = 0; n < 250; n++) { t += 0.016; drawWith(h, fx, t, bed) }
      assert.ok(t - h.program._dreadKickAt > mod.SLAM_HOLD_S + mod.RETRACT_S + mod.STEAM_S + 2, 'test setup: long past the blow')
      const back = diffCells(loud, snap(h.term))
      assert.ok(back <= 4, `${back} cells still differ from LOUD after the blow settled`)
    })
  } finally { h.shutdown() }
})

test('DREAD: only a rising edge is a blow -- a pulse held high strikes once', async () => {
  const { h, fx } = await bootDread()
  try {
    noTears(() => {
      let t = settle(h, fx, 1)
      let kicks = 0, last = h.program._dreadKickAt
      for (let i = 0; i < 60; i++) {
        t += 0.016
        drawWith(h, fx, t, signal({ pulse: 1 }))
        if (h.program._dreadKickAt !== last) { kicks++; last = h.program._dreadKickAt }
      }
      assert.equal(kicks, 1, `a held pulse fired ${kicks} blows`)
    })
  } finally { h.shutdown() }
})

test('DREAD: with no tap it still strikes, on syntheticAudio', async () => {
  // Driven through the real frame loop, where p._au is null with no tap.
  const h = await boot({ station: 'nin' })
  try {
    h.powerOn(); h.key('v'); if (h.program.tapConsentOpen) h.key('n')
    assert.equal(h.program.activeVisualKey(), 'dread')
    assert.equal(h.program._au, null, 'test setup: no tap')
    const seen = new Set()
    for (let i = 0; i < 200; i++) { h.advance(16); seen.add(h.program._dreadKickAt) }
    assert.ok(seen.size >= 3, `only ${seen.size - 1} blows in 3.2s without a tap`)
  } finally { h.shutdown() }
})

test('DREAD: MUTED is faint, not blank -- the forge stays drawn, nothing BRIGHT, no blows, only the ember moves', async () => {
  const { h, fx, mod } = await bootDread()
  try {
    let t = noTears(() => settle(h, fx, 1))
    h.program.muted = true
    h.program._au = signal({ pulse: 1 })
    for (let i = 0; i < 60; i++) { t += 0.05; fx.draw(h.program, { term: h.term }, t) }
    const before = snap(h.term)
    const { term } = h
    const lit = cellsWhere(term, (i) => term.gfx[i])
    assert.ok(lit >= 400, `muted, only ${lit} cells drawn -- the machine must stay on screen`)
    assert.equal(cellsWhere(term, (i) => term.gfx[i] && term.attrs[i] & BRIGHT), 0, 'nothing BRIGHT while muted')
    const kickAt = h.program._dreadKickAt
    // Pulse edges and onsets for ten seconds: no blow, no tear, and nothing
    // moves outside the billet's two cell rows (its ember breathes).
    const billetRows = new Set([1 + Math.floor(mod.BILLET_TOP / 16), 1 + Math.floor((mod.ANVIL_TOP - 1) / 16)])
    const changed = new Set()
    for (let i = 0; i < 200; i++) {
      h.program._au = signal({ pulse: i & 1 ? 1 : 0, onset: !!(i & 1) })
      t += 0.05
      fx.draw(h.program, { term }, t)
      assert.equal(h.program._dreadTear.active, false, 'no tear while muted')
      const now = snap(term)
      now.forEach((v, k) => { if (v !== before[k]) changed.add(1 + Math.floor(k / term.cols)) })
    }
    assert.equal(h.program._dreadKickAt, kickAt, 'no blow while muted')
    for (const row of changed) assert.ok(billetRows.has(row), `muted picture moved on row ${row}`)
    assert.ok(changed.size > 0, 'the ember breathes -- muted is faint but alive')
  } finally { h.shutdown() }
})

test('DREAD: re-entry after a long visit carries no slam clock', async () => {
  // _dreadKickAt is an absolute effect-clock value: left minutes ahead of the
  // restarted clock, the hammer would sit on the billet and refuse every blow.
  const { h, fx } = await bootDread()
  try {
    h.program._dreadKickAt = 600
    h.program._dreadPrevKickAt = 599
    h.program._dreadLastT = 600
    h.program._dreadPrevPulse = 1
    fx.reset(h.program)
    noTears(() => {
      drawWith(h, fx, 0.5, signal({ pulse: 0 }))
      drawWith(h, fx, 0.52, signal({ pulse: 1 }))
    })
    assert.equal(h.program._dreadKickAt, 0.52, 'the first blow after entry lands')
    assert.ok(h.program._dreadPrevKickAt < 0.52, 'and no spray is scheduled from the old visit')
  } finally { h.shutdown() }
})

test('DREAD: a tear shears one band of pixels sideways and lets go within TEAR_MAX_S', async () => {
  const { h, fx, mod } = await bootDread()
  try {
    let t = noTears(() => settle(h, fx, 1))
    const { term } = h
    // The floor row: static scenery, nothing else reaches it.
    const row = 1 + Math.floor(mod.FLOOR_Y / 16)
    const cell = (x) => { const g = term.gfx[row * term.cols + x]; return g ? Array.from(g).join(',') : '.' }
    const clean = Array.from({ length: term.cols }, (_, x) => cell(x))
    const tear = h.program._dreadTear
    // Force one the shape the draw writes it in: 24 pixels = 3 cells right.
    Object.assign(tear, { active: true, row, shift: 24, until: t + 0.1 })
    noTears(() => { t += 0.016; drawWith(h, fx, t, signal()) })
    const torn = Array.from({ length: term.cols }, (_, x) => cell(x))
    assert.deepEqual(torn.slice(3), clean.slice(0, term.cols - 3), 'the band is the same picture, slipped 3 cells')
    assert.notDeepEqual(torn, clean, 'and it did move')
    assert.ok(torn.slice(0, 3).some((c) => c !== '.'), 'with junk in the gap it left')
    // Natural tears: never longer than TEAR_MAX_S.
    let started = null, longest = 0
    for (let i = 0; i < 2000; i++) {
      t += 0.016
      drawWith(h, fx, t, signal({ pulse: i % 30 === 0 ? 1 : 0.1 }))
      if (tear.active && started == null) started = t
      if (!tear.active && started != null) { longest = Math.max(longest, t - started); started = null }
    }
    assert.ok(longest > 0, 'tears happen while playing')
    assert.ok(longest <= mod.TEAR_MAX_S + 0.02, `a tear held ${longest.toFixed(2)}s`)
  } finally { h.shutdown() }
})

test('DREAD: no glyphs at all, and BRIGHT stays rare (tube bloom under the red tint)', async () => {
  const { h, fx } = await bootDread()
  try {
    let worstChars = 0, worstBright = 0, t = 1
    for (let f = 0; f < 200; f++) {
      t += 0.03
      drawWith(h, fx, t, signal({ pulse: f % 8 === 0 ? 1 : 0, level: 0.95, bass: 0.95, bands9: new Array(9).fill(0.95) }))
      const { term } = h
      worstChars = Math.max(worstChars, cellsWhere(term, (i) => !term.gfx[i] && term.chars[i] !== 32))
      worstBright = Math.max(worstBright, cellsWhere(term, (i) => term.gfx[i] && term.attrs[i] & BRIGHT))
    }
    assert.equal(worstChars, 0, `${worstChars} character cells in one frame (shade blocks raster as slabs)`)
    assert.ok(worstBright >= 1, 'test setup: the blows did flash')
    assert.ok(worstBright <= 20, `${worstBright} BRIGHT cells in one frame at full level on a blow`)
  } finally { h.shutdown() }
})
