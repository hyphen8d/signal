// BACKROOM (AFTER HOURS; redrawn in pixels 2026-10-20) -- what the effect
// leaves on the grid, read back off the gfx plane: it draws through
// putGlyph() bitmaps, so a character-reading test sees every lit cell as a
// space (CLAUDE.md, FLAME's note). Covered: the canvas contract at three
// widths; nothing but bitmaps and blanks (so no shade blocks and no `~`);
// the picture (a cone of light under the lamp, the bass cut out of it as a
// dark silhouette with its lit edge and varnish, a black room outside); the
// brightness order (NORMAL only on the bass, its player and the lens; never
// BRIGHT); the one musical element (loudness widens and fills the cone over
// about a second; a kick swells it and settles; only a rising edge kicks);
// no tap; MUTED (at the floor, never blank, never swells, smoke still
// climbing); and that re-entry carries no kick clock.
//
// The frame loop rewrites p._au every frame (visualizer.js), so the audio is
// driven by calling the effect's draw directly with a crafted signal, as
// tests/visual-flowfield.test.mjs does.
//
// Run: node --test tests/visual-backroom.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from './harness.mjs'
import { parseBDF } from '../src/bdf.js'
import { Term, BRIGHT, DIM, FAINT, MUTED } from '../src/term.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const VIZ_BOT = 22
const CELL_W = 8, CELL_H = 16

// Steady and loud, between beats: the viz-sheet's LOUD state.
const signal = (over = {}) => ({
  level: 0.75, bass: 0.45, mid: 0.6, treble: 0.5,
  bands9: new Array(9).fill(0.5), onset: false, pulse: 0.15, ...over,
})
const KICK = { pulse: 1, onset: true, level: 0.95, bass: 1 }

async function bootRoom() {
  const h = await boot({ station: 'after-hours' })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  assert.equal(h.program.activeVisualKey(), 'backroom', 'AFTER HOURS should land on BACKROOM')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/backroom.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.backroom, mod }
}

function drawWith(h, fx, t, A, term = h.term, muted = false) {
  h.program.muted = muted
  h.program._au = A
  fx.draw(h.program, { term }, t)
}

/** Is canvas pixel (px, py) lit? py = 0 is the top of canvas row 1. */
function litAt(term, px, py) {
  const g = term.gfx[(1 + (py >> 4)) * term.cols + (px >> 3)]
  return !!g && ((g[py & 15] >> (CELL_W - 1 - (px & 7))) & 1) === 1
}
/** Lit pixels in the canvas pixel box [x0, x1) x [y0, y1). */
function litIn(term, x0, y0, x1, y1) {
  let n = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (litAt(term, x, y)) n++
  return n
}
const popcount = (v) => { let n = 0; while (v) { n += v & 1; v >>>= 1 } return n }
function litPixels(term) {
  let n = 0
  for (let i = term.cols; i < term.cols * VIZ_BOT; i++) { const g = term.gfx[i]; if (g) for (const r of g) n += popcount(r) }
  return n
}
/** Canvas cells (x, y) whose attribute has `bit`; NORMAL is 0, pass null. */
function cellsWith(term, bit) {
  const out = []
  for (let y = 1; y < VIZ_BOT; y++) {
    for (let x = 0; x < term.cols; x++) {
      const i = y * term.cols + x
      if (!term.gfx[i]) continue
      const a = term.attrs[i]
      if (bit === null ? !(a & (BRIGHT | MUTED | DIM | FAINT)) : (a & bit)) out.push([x, y])
    }
  }
  return out
}
function snapshot(term) {
  const out = []
  for (let i = term.cols; i < term.cols * VIZ_BOT; i++) {
    const g = term.gfx[i]
    out.push(term.attrs[i] + ':' + (g ? Array.from(g).join(',') : term.chars[i]))
  }
  return out
}
const diffCount = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n }

/** Steady frames until the light has settled and any kick has gone. */
function settle(h, fx, t0, A = signal(), muted = false, secs = 5) {
  let t = t0
  for (let i = 0; i < secs * 20; i++) { t += 0.05; drawWith(h, fx, t, A, h.term, muted) }
  return t
}

/** Lit pixels in the cone's band (rows of the stage air, the cone's width at
 *  its widest), with the cast's cells left in: a whole-cone measure. */
const coneLit = (mod, term) => litIn(term, mod.LAMP_X - 200, 30, mod.LAMP_X + 200, mod.FLOOR_Y - 4)

test('BACKROOM: paints the whole canvas and nothing outside it, at 60, 80 and 100 columns', async () => {
  const { h, fx } = await bootRoom()
  try {
    const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
    for (const cols of [60, 80, 100]) {
      const term = new Term(font, cols, 25, 6, 5)
      fx.reset(h.program)
      const { put, putGlyph } = term
      const outside = []
      let missed = 0
      for (let f = 0; f < 20; f++) {
        const hit = new Uint8Array(cols * VIZ_BOT)
        const mark = (x, y) => {
          if (y < 1 || y >= VIZ_BOT || x < 0 || x >= cols) outside.push([x, y])
          else hit[y * cols + x] = 1
        }
        term.put = function (x, y, ...rest) { mark(x, y); return put.call(this, x, y, ...rest) }
        term.putGlyph = function (x, y, ...rest) { mark(x, y); return putGlyph.call(this, x, y, ...rest) }
        try { drawWith(h, fx, 2 + f / 5, signal({ pulse: f % 6 === 0 ? 1 : 0 }), term) } finally {
          term.put = put; term.putGlyph = putGlyph
        }
        for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      }
      assert.deepEqual(outside.slice(0, 3), [], `${cols} cols: wrote outside the canvas`)
      assert.equal(missed, 0, `${cols} cols: ${missed} cell-frames left unpainted`)
      assert.ok(litPixels(term) > 3000, `${cols} cols: the room is nearly dark`)
    }
  } finally { h.shutdown() }
})

test('BACKROOM: nothing on the canvas but bitmaps and blanks', async () => {
  const { h, fx } = await bootRoom()
  try {
    let t = 1
    for (let i = 0; i < 80; i++) {
      t += 0.07
      drawWith(h, fx, t, signal({ pulse: i % 9 === 0 ? 1 : 0.1 }), h.term, i > 60)
      for (let k = h.term.cols; k < h.term.cols * VIZ_BOT; k++) {
        assert.ok(h.term.gfx[k] || h.term.chars[k] === 32, `a character at cell ${k}`)
      }
    }
  } finally { h.shutdown() }
})

test('BACKROOM: the picture -- a cone under the lamp, the bass cut out of it, a black room', async () => {
  const { h, fx, mod } = await bootRoom()
  try {
    settle(h, fx, 1)
    const term = h.term
    // The cone: lit air on its axis between the lamp and the bassist's head,
    // and black either side of it high up, where the cone is still narrow.
    assert.ok(litIn(term, mod.LAMP_X - 8, 24, mod.LAMP_X + 8, 60) > 60, 'no light under the lamp')
    assert.equal(litIn(term, 0, 20, mod.LAMP_X - 110, 60), 0, 'light in the dark room left of the cone')
    assert.equal(litIn(term, mod.LAMP_X + 110, 20, 560, 60), 0, 'light in the dark room right of the cone')
    // The cone widens down toward the boards.
    const rowSpan = (py) => {
      let l = -1, r = -1
      for (let x = mod.LAMP_X - 250; x < mod.LAMP_X + 250; x++) {
        if (litIn(term, x - 4, py - 4, x + 4, py + 4) > 2) { if (l < 0) l = x; r = x }
      }
      return r - l
    }
    assert.ok(rowSpan(200) > rowSpan(50) * 2, `the cone does not widen (${rowSpan(50)} -> ${rowSpan(200)} px)`)
    // The bass: dark inside its lower bout, left of the fingerboard (away
    // from the varnish streak on the right of each bout), with lit air
    // beside it -- a silhouette cut out of the light, not an outline.
    const y = 212, a = mod.bassAxis(y), w = mod.bassHalfWidth(y)
    assert.ok(w > 30, 'the lower bout is the widest part of the bass')
    assert.equal(litIn(term, Math.round(a - w * 0.8), y - 6, Math.round(a - 6), y + 6), 0, 'light inside the bass body')
    // The waist is narrower than both bouts: the cello/guitar test.
    const waist = Math.min(...Array.from({ length: 30 }, (_, i) => mod.bassHalfWidth(150 + i)))
    assert.ok(waist < mod.bassHalfWidth(140) && waist < w * 0.7, 'no waist between the bouts')
    // Its varnish catches the spot: lit pixels on the right of the bouts.
    let sheen = 0
    for (let yy = 135; yy < 215; yy += 2) {
      const ax = mod.bassAxis(yy), hw = mod.bassHalfWidth(yy)
      sheen += litIn(term, Math.round(ax + hw * 0.34), yy, Math.round(ax + hw * 0.66), yy + 1)
    }
    assert.ok(sheen > 80, `the bass's varnish is dark (${sheen} px)`)
    // The scroll stands above the bassist's head, in the light.
    const sx = Math.round(mod.bassAxis(mod.SCROLL_Y))
    assert.ok(litIn(term, sx - 8, mod.SCROLL_Y - 8, sx + 9, mod.SCROLL_Y + 9) > 10, 'no lit edge on the scroll')
  } finally { h.shutdown() }
})

test('BACKROOM: brightness order -- NORMAL only on the bass, its player and the lens; never BRIGHT', async () => {
  const { h, fx, mod } = await bootRoom()
  try {
    let t = 1
    for (let f = 0; f < 160; f++) {
      t += 0.05
      drawWith(h, fx, t, signal({ pulse: f % 8 === 0 ? 1 : 0, level: 0.95, bass: 0.95 }))
      assert.equal(cellsWith(h.term, BRIGHT).length, 0, `BRIGHT at frame ${f}`)
      // The bass, the bassist and the lamp's lens all sit in columns
      // 27..44 (x 216..352 px) and above the stage lip.
      const stray = cellsWith(h.term, null).filter(([x, y]) => x < 27 || x > 44 || y > 1 + (mod.FLOOR_Y >> 4))
      assert.deepEqual(stray.slice(0, 3), [], `NORMAL away from the bass at frame ${f}`)
    }
    // And the bass leads: plenty of NORMAL there.
    assert.ok(cellsWith(h.term, null).length >= 25, 'the bass is not the brightest thing')
  } finally { h.shutdown() }
})

test('BACKROOM: loudness fills the room with light, over about a second', async () => {
  const { h, fx, mod } = await bootRoom()
  try {
    let t = settle(h, fx, 1, signal({ level: 0.1, pulse: 0 }))
    const quiet = coneLit(mod, h.term)
    // One frame of a loud chorus barely moves it: the light follows the
    // level over ~1s, never in a jump.
    t += 0.05; drawWith(h, fx, t, signal({ level: 1, pulse: 0 }))
    const step = coneLit(mod, h.term)
    t = settle(h, fx, t, signal({ level: 1, pulse: 0 }), false, 4)
    const loud = coneLit(mod, h.term)
    assert.ok(loud > quiet * 1.5, `a loud chorus lit ${loud} px against a quiet ${quiet}`)
    assert.ok(Math.abs(step - quiet) < (loud - quiet) * 0.35, `one frame jumped the light ${quiet} -> ${step} (of ${loud})`)
    // And wider: light out at the cone's loud edge on the boards' row.
    const edge = (term) => litIn(term, mod.LAMP_X + 150, 200, mod.LAMP_X + 185, 236) + litIn(term, mod.LAMP_X - 185, 200, mod.LAMP_X - 150, 236)
    const loudEdge = edge(h.term)
    settle(h, fx, t, signal({ level: 0.1, pulse: 0 }))
    assert.ok(loudEdge > edge(h.term) + 40, 'the cone does not widen with the music')
  } finally { h.shutdown() }
})

test('BACKROOM: a KICK swells the light against a LOUD frame, and settles back', async () => {
  const { h, fx, mod } = await bootRoom()
  try {
    let t = settle(h, fx, 1)
    t += 0.034; drawWith(h, fx, t, signal())
    const loud = snapshot(h.term), loudLit = coneLit(mod, h.term)
    t += 0.016; drawWith(h, fx, t, signal(KICK))
    const changed = diffCount(loud, snapshot(h.term))
    const kickLit = coneLit(mod, h.term)
    assert.ok(changed >= 250, `a kick changed only ${changed} cells against the LOUD frame`)
    assert.ok(kickLit > loudLit * 1.25, `the kick lit ${kickLit} px against LOUD's ${loudLit}`)
    // Held for a few frames (a 60Hz pop is invisible), down within a second.
    t += 0.15; drawWith(h, fx, t, signal({ pulse: 0.8 }))
    assert.ok(coneLit(mod, h.term) > loudLit * 1.15, 'the swell should hold for a few frames')
    for (let i = 0; i < 50; i++) { t += 0.02; drawWith(h, fx, t, signal()) }
    assert.ok(coneLit(mod, h.term) < loudLit * 1.08, 'the light comes back down after the kick')
  } finally { h.shutdown() }
})

test('BACKROOM: only a rising edge is a kick -- a pulse held high swells once', async () => {
  const { h, fx } = await bootRoom()
  try {
    let t = settle(h, fx, 1)
    let kicks = 0, last = h.program._backroomKickAt
    for (let i = 0; i < 60; i++) {
      t += 0.016
      drawWith(h, fx, t, signal({ pulse: 1 }))
      if (h.program._backroomKickAt !== last) { kicks++; last = h.program._backroomKickAt }
    }
    assert.equal(kicks, 1, `a held pulse fired ${kicks} kicks`)
  } finally { h.shutdown() }
})

test('BACKROOM: with no tap it still breathes and swells, on syntheticAudio', async () => {
  const { h, mod } = await bootRoom()
  try {
    assert.equal(h.program._au, null, 'test setup: no tap')
    const seen = new Set()
    for (let i = 0; i < 200; i++) { h.advance(16); seen.add(h.program._backroomKickAt) }
    assert.ok(seen.size >= 3, `only ${seen.size - 1} kicks in 3.2s without a tap`)
    assert.ok(coneLit(mod, h.term) > 2000, 'the cone is dark without a tap')
  } finally { h.shutdown() }
})

test('BACKROOM: MUTED sits at the floor -- still lit, never swells, the smoke still climbs', async () => {
  const { h, fx, mod } = await bootRoom()
  try {
    let t = settle(h, fx, 1, signal(), true)
    const floor = coneLit(mod, h.term)
    t += 0.034; drawWith(h, fx, t, signal({ pulse: 0 }), h.term, true)
    t += 0.034; drawWith(h, fx, t, signal(KICK), h.term, true)
    assert.equal(h.program._backroomKickAt, -Infinity, 'a pulse edge kicked while muted')
    assert.ok(Math.abs(coneLit(mod, h.term) - floor) < floor * 0.08, 'the light moved with a muted kick')
    assert.ok(floor > 1500, `only ${floor} px of light under mute -- it reads as blank`)
    // The bass still reads: its lit edge does not need the music.
    assert.ok(cellsWith(h.term, null).length >= 20, 'the bass went dark under mute')
    const a = snapshot(h.term)
    t += 1.5; drawWith(h, fx, t, signal(), h.term, true)
    const moved = diffCount(a, snapshot(h.term))
    assert.ok(moved >= 50, `only ${moved} cells moved in 1.5s under mute -- a frozen frame reads as a hung tab`)
  } finally { h.shutdown() }
})

test('BACKROOM: the smoke drifts through the cone and the cast stands still', async () => {
  const { h, fx, mod } = await bootRoom()
  try {
    let t = settle(h, fx, 1, signal({ pulse: 0 }))
    const a = snapshot(h.term)
    // The scroll's lit top edge is fixed art: the same pixels in both frames.
    const scroll = Math.round(mod.bassAxis(mod.SCROLL_Y))
    const rim = () => Array.from({ length: 4 }, (_, i) => litAt(h.term, scroll - 1 + i, mod.SCROLL_Y - 5) ? 1 : 0).join('')
    assert.equal(rim(), '1111', 'no lit rim across the top of the scroll')
    t = settle(h, fx, t, signal({ pulse: 0 }), false, 1.5)
    assert.ok(diffCount(a, snapshot(h.term)) >= 60, 'the smoke is not drifting')
    assert.equal(rim(), '1111', 'the scroll moved')
  } finally { h.shutdown() }
})

test('BACKROOM: re-entry after a long visit carries no kick clock', async () => {
  const { h, fx } = await bootRoom()
  try {
    h.program._backroomKickAt = 600
    h.program._backroomLastT = 600
    h.program._backroomRenderT = 600
    h.program._backroomPrevPulse = 1
    fx.reset(h.program)
    drawWith(h, fx, 0.5, signal({ pulse: 0 }))
    drawWith(h, fx, 0.52, signal({ pulse: 1 }))
    assert.equal(h.program._backroomKickAt, 0.52, 'the first kick after entry lands')
  } finally { h.shutdown() }
})
