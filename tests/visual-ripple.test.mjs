// RIPPLE (CITY LIGHTS, rebuilt 2026-10-16 as a night skyline over the bay) --
// what the effect leaves on the grid, read back off it: the canvas contract,
// that the skyline, tower, moon and quay are there and the bay reflects the
// lit windows, that a kick changes the city's lights and the change HOLDS
// until the next kick (the first cut flashed and dropped back, and the probe
// measured the kick at 1.5x), that with no tap the synthetic pulse still
// steps it, that mute stops it, that re-entry carries no kick clock over, and
// the tube-bloom caps.
//
// The frame loop rewrites p._au every frame (visualizer.js), so everything
// about the beat is driven by calling the effect's draw directly with a
// crafted signal.
//
// Run: node --test tests/visual-ripple.test.mjs

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
const attrAt = (h, x, y) => h.term.attrs[y * h.term.cols + x]

const signal = (over = {}) => ({
  level: 0.6, bass: 0.4, mid: 0.4, treble: 0.3,
  bands9: new Array(9).fill(0.45), onset: false, pulse: 0, ...over,
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

/** Chars + attrs of every window cell, as one string. */
function windows(h, mod) {
  const T = mod.cityTables(h.term.cols)
  let s = ''
  for (let i = 0; i < T.kind.length; i++) {
    if (T.kind[i] !== mod.KIND.WIN) continue
    s += String.fromCodePoint(h.term.chars[i]) + h.term.attrs[i] + ','
  }
  return s
}
const changed = (a, b) => { const x = a.split(','), y = b.split(','); let n = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++; return n }

test('RIPPLE: repaints every canvas cell and nothing outside rows 1..21', async () => {
  const { h, fx } = await bootCity()
  try {
    const origDraw = fx.draw, origPut = h.term.put, cols = h.term.cols
    const outside = []
    let hit = null, frames = 0, short = 0
    h.term.put = function (x, y, ...rest) {
      if (hit) { if (y < 1 || y >= VIZ_BOT) outside.push(y); else if (x >= 0 && x < cols) hit[y * cols + x] = 1 }
      return origPut.call(this, x, y, ...rest)
    }
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
    try { h.advance(3000) } finally { fx.draw = origDraw; h.term.put = origPut }
    assert.ok(frames > 100, `draw should have run (ran ${frames})`)
    assert.deepEqual([...new Set(outside)], [], 'the effect wrote to rows outside the canvas')
    assert.equal(short, 0, `${short} of ${frames} frames left canvas cells unpainted`)
  } finally { h.shutdown() }
})

test('RIPPLE: every character it draws exists in the BDF font', async () => {
  const { h } = await bootCity()
  try {
    const font = parseBDF(readFileSync(path.join(here, '../fonts/ter-u16n.bdf'), 'utf8'))
    const seen = new Set()
    for (let f = 0; f < 120; f++) { h.advance(50); for (let y = 1; y < VIZ_BOT; y++) for (const c of h.row(y)) seen.add(c) }
    const missing = [...seen].filter((c) => c !== ' ' && !font.glyphs.has(c.codePointAt(0)))
    assert.deepEqual(missing, [], `glyphs not in the font: ${missing.join(' ')}`)
  } finally { h.shutdown() }
})

test('RIPPLE: the skyline reads back -- tower, moon, lit windows, quay, and their reflection', async () => {
  const { h, fx, mod } = await bootCity()
  try {
    fx.reset(h.program)
    drawWith(h, fx, 50, signal({ pulse: 1 }))
    drawWith(h, fx, 50.2, signal({ pulse: 0.2 }))
    const T = mod.cityTables(h.term.cols)
    // The tower: beacon at its tip, mast under it, both legs lower down.
    assert.equal(h.row(mod.TOWER_TOP)[T.tx], '•', 'no beacon at the tower tip')
    assert.equal(h.row(mod.TOWER_TOP + 1)[T.tx], '│', 'no mast under the beacon')
    const legRow = h.row(mod.SKY_BOT - 2)
    assert.ok(legRow.slice(T.tx - 6, T.tx).includes('/') && legRow.slice(T.tx + 1, T.tx + 7).includes('\\'), `tower legs missing: ${legRow}`)
    // The moon: the crescent's strokes around its column in the top rows
    // (since the 2026-10-16 design pass; it was half blocks before).
    let moon = 0
    for (let y = 1; y <= 7; y++) for (let x = T.mx - 4; x <= T.mx + 4; x++) if ('/\\|.-\'`'.includes(h.row(y)[x])) moon++
    assert.ok(moon >= 8, `only ${moon} moon cells`)
    // The quay is one unbroken line.
    assert.equal(h.row(mod.QUAY_Y).replace(/▀/g, ''), '', 'the quay is broken')
    // Lit windows: plenty of them, and every one inside the skyline.
    let lit = 0
    for (let y = 1; y <= mod.SKY_BOT; y++) lit += [...h.row(y)].filter((c) => c === '■').length
    assert.ok(lit >= 40, `only ${lit} lit windows -- the city is dark`)
    // The bay holds their light as vertical streaks.
    let streaks = 0
    for (let y = mod.WATER_TOP; y < VIZ_BOT; y++) streaks += [...h.row(y)].filter((c) => c === '│').length
    assert.ok(streaks >= 20, `only ${streaks} reflection streaks on the bay`)
  } finally { h.shutdown() }
})

test('RIPPLE: a kick changes the city lights, and the change holds until the next kick', async () => {
  const { h, fx, mod } = await bootCity()
  try {
    fx.reset(h.program)
    let t = 100
    // Settle on one latch, then hold with no rising edge.
    drawWith(h, fx, t, signal({ pulse: 1 })); t += 0.1
    for (let i = 0; i < 6; i++) { drawWith(h, fx, t, signal({ pulse: 0.1 })); t += 0.05 }
    const before = windows(h, mod)
    for (let i = 0; i < 10; i++) { drawWith(h, fx, t, signal({ pulse: 0.1 })); t += 0.05 }
    assert.equal(changed(before, windows(h, mod)), 0, 'the windows changed with no kick')
    // A kick: same level and bands, so only the beat itself can change them.
    drawWith(h, fx, t, signal({ pulse: 1 })); t += 0.1
    drawWith(h, fx, t, signal({ pulse: 0.5 })); t += 0.05
    const after = windows(h, mod)
    const n = changed(before, after)
    assert.ok(n >= 15, `a kick changed only ${n} windows`)
    // ...and holds.
    for (let i = 0; i < 8; i++) { drawWith(h, fx, t, signal({ pulse: 0.3 })); t += 0.05 }
    assert.equal(changed(after, windows(h, mod)), 0, 'the kick\'s lights did not hold until the next kick')
  } finally { h.shutdown() }
})

test('RIPPLE: with no tap the synthetic ~0.9s pulse still steps the city', async () => {
  const { h } = await bootCity()
  try {
    const s0 = h.program._rippleStep
    h.advance(4000)
    const steps = h.program._rippleStep - s0
    assert.ok(steps >= 3 && steps <= 6, `${steps} kicks in 4s on syntheticAudio's ~0.9s pulse`)
  } finally { h.shutdown() }
})

test('RIPPLE: muted, the city holds its lights and the rain keeps falling', async () => {
  const { h, fx, mod } = await bootCity()
  try {
    fx.reset(h.program)
    let t = 200
    drawWith(h, fx, t, signal({ pulse: 1 })); t += 0.3
    drawWith(h, fx, t, signal({ pulse: 0.2 })); t += 0.05   // the wave has crossed
    const before = windows(h, mod)
    // Rain is counted across the whole muted run: a single frame can land
    // between one ring fading and the next opening.
    let rain = 0
    for (let i = 0; i < 10; i++) {
      drawWith(h, fx, t, signal({ pulse: i % 2 ? 0 : 1, onset: true }), true); t += 0.25
      for (let y = mod.WATER_TOP; y < VIZ_BOT; y++) rain += [...h.row(y)].filter((c) => c === '·' || c === '∙').length
    }
    assert.equal(changed(before, windows(h, mod)), 0, 'kicks changed the lights while muted')
    assert.ok(rain > 0, 'the rain stopped while muted')
  } finally { h.shutdown() }
})

test('RIPPLE: re-entry after a long visit carries no kick clock from the previous visit', async () => {
  const { h } = await bootCity()
  try {
    h.advance(120000)
    h.key('e'); h.advance(500)
    h.key('v'); h.advance(100)
    assert.ok(h.program._rippleKickAt <= effectT(h) + 0.05, `kick clock ${h.program._rippleKickAt} on a clock at ${effectT(h)}`)
    const s0 = h.program._rippleStep
    h.advance(2500)
    assert.ok(h.program._rippleStep > s0, 'no kick landed after re-entry')
  } finally { h.shutdown() }
})

test('RIPPLE: full blocks stay accents and BRIGHT is the beacon alone (tube bloom)', async () => {
  const { h } = await bootCity()
  try {
    let worstFull = 0, worstBright = 0
    for (let f = 0; f < 60; f++) {
      h.advance(50)
      let full = 0, bright = 0
      for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) {
        if (h.row(y)[x] === '█') full++
        if (attrAt(h, x, y) & BRIGHT) bright++
      }
      worstFull = Math.max(worstFull, full); worstBright = Math.max(worstBright, bright)
    }
    const cells = h.term.cols * (VIZ_BOT - 1)
    assert.ok(worstFull <= cells * 0.01, `${worstFull} full blocks in one frame`)
    assert.ok(worstBright <= 1, `${worstBright} BRIGHT cells in one frame -- only the beacon may flare`)
  } finally { h.shutdown() }
})

test('RIPPLE: the reflection is the skyline\'s lit columns, one tier down -- no random dashes', async () => {
  // 2026-10-16 (design pass): the bay used to be scattered '- = ~ . ¦' that
  // did not read as the city upside down. Every streak cell must now sit
  // under a column holding a lit window (within the swell's one-column sway)
  // and be dimmer than that column's brightest window. Mutation-checked:
  // drawing the streaks at the window's own tier goes red on the tier half;
  // the old per-cell '─' glitter goes red on the glyph half.
  const { h, fx, mod } = await bootCity()
  try {
    const T = mod.cityTables(h.term.cols)
    const cols = h.term.cols
    // Tier of an attribute byte (src/cellgrid.js): FAINT 64, DIM 4, MUTED 32.
    const level = (a) => (a & 64) ? 0 : (a & 4) ? 1 : (a & 32) ? 2 : 3
    fx.reset(h.program)
    let t = 300
    for (let k = 0; k < 6; k++) {
      drawWith(h, fx, t, signal({ pulse: 1, level: 0.3 + k * 0.12 })); t += 0.3
      drawWith(h, fx, t, signal({ pulse: 0.1 })); t += 0.3
      // The brightest lit window per column, read off the grid.
      const best = new Array(cols).fill(-1)
      for (let y = 1; y <= mod.SKY_BOT; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        if (T.kind[i] === mod.KIND.WIN && h.row(y)[x] === '■') best[x] = Math.max(best[x], level(h.term.attrs[i]))
      }
      for (let y = mod.WATER_TOP; y < VIZ_BOT; y++) {
        const row = h.row(y)
        assert.ok(!/[~─=]/.test(row), `kick ${k}: glitter on the bay, row ${y}: ${row}`)
        for (let x = 0; x < cols; x++) {
          if (row[x] !== '│') continue
          const src = Math.max(best[x - 1] ?? -1, best[x] ?? -1, best[x + 1] ?? -1)
          assert.ok(src >= 0, `kick ${k}: a streak at ${x},${y} under no lit window`)
          assert.ok(level(h.term.attrs[y * cols + x]) < src, `kick ${k}: the streak at ${x},${y} is as bright as its window`)
        }
      }
    }
  } finally { h.shutdown() }
})

test('RIPPLE: the moon is strokes, never glyph mass, and dimmer than the beacon at rest', async () => {
  const { h, fx, mod } = await bootCity()
  try {
    const T = mod.cityTables(h.term.cols)
    fx.reset(h.program)
    drawWith(h, fx, 400, signal({ pulse: 0.1 }), true)
    for (let y = 1; y < VIZ_BOT; y++) assert.ok(!/[█▀▄▌▐]/.test(h.row(y).slice(T.mx - 4, T.mx + 5)) || y > 6, `block glyphs in the moon, row ${y}`)
    for (let y = 1; y < VIZ_BOT; y++) assert.ok(!h.row(y).includes('█'), `a full block on row ${y}`)
    // And the kick flares the beacon wider than any star: arms either side.
    drawWith(h, fx, 401, signal({ pulse: 0 }))
    drawWith(h, fx, 401.05, signal({ pulse: 1 }))
    const tip = h.row(mod.TOWER_TOP).slice(T.tx - 2, T.tx + 3)
    assert.equal(tip, '·─•─·', `the beacon flare: '${tip}'`)
    assert.ok(attrAt(h, T.tx, mod.TOWER_TOP) & BRIGHT, 'the beacon is BRIGHT on the kick')
    drawWith(h, fx, 401.6, signal({ pulse: 0.1 }))
    assert.equal(h.row(mod.TOWER_TOP).slice(T.tx - 1, T.tx + 2).trim(), '•', 'the flare is gone between beats')
  } finally { h.shutdown() }
})
