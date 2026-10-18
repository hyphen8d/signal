// VANITY (key 'flowfield', GREEN ROOM, redrawn 2026-10-16) -- what the
// effect leaves on the grid, read back off it: the canvas contract at three
// widths, that the picture is there (a framed mirror ringed with bulbs, a
// counter, an ashtray with an ember, a smoke line rising off it), that a
// KICK is plainly different from a LOUD frame and comes back to rest, that
// only a rising edge kicks, that it kicks with no tap at all, that MUTED is
// faint but never blank and never kicks, that a change of level leaves the
// smoke where it was (the old FLOW FIELD scaled `t *` frequencies by level,
// so a louder bar jumped the whole field), that re-entry carries no kick
// clock, and the tube caps.
//
// The frame loop rewrites p._au every frame (visualizer.js), so the audio is
// driven by calling the effect's draw directly with a crafted signal, as
// tests/visual-boombap.test.mjs does.
//
// Run: node --test tests/visual-flowfield.test.mjs

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

// Steady and loud, between beats: the viz-sheet's LOUD state.
const signal = (over = {}) => ({
  level: 0.7, bass: 0.45, mid: 0.6, treble: 0.5,
  bands9: new Array(9).fill(0.5), onset: false, pulse: 0.15, ...over,
})

async function bootVanity() {
  const h = await boot({ station: 'green-room' })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  assert.equal(h.program.activeVisualKey(), 'flowfield', 'GREEN ROOM should land on its own effect')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/flowfield.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.flowfield, mod }
}

function drawWith(h, fx, t, A, term = h.term, muted = false) {
  h.program.muted = muted
  h.program._au = A
  fx.draw(h.program, { term }, t)
}

/** Every canvas cell as char+attr, one string per cell. */
function snapshot(term) {
  const out = []
  for (let y = 1; y < VIZ_BOT; y++) {
    for (let x = 0; x < term.cols; x++) {
      const i = y * term.cols + x
      out.push(String.fromCodePoint(term.chars[i]) + ':' + term.attrs[i])
    }
  }
  return out
}
const diffCount = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n }
const canvasRows = (h) => Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1))
const brightCount = (term) => {
  let n = 0
  for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < term.cols; x++) if (term.attrs[y * term.cols + x] & BRIGHT) n++
  return n
}

/** Steady loud frames until the breath has settled and any kick has gone. */
function settle(h, fx, t0, A = signal(), muted = false) {
  let t = t0
  for (let i = 0; i < 60; i++) { t += 0.05; drawWith(h, fx, t, A, h.term, muted) }
  return t
}

test('VANITY: paints the whole canvas and nothing outside it, at 60, 80 and 100 columns', async () => {
  const { h, fx } = await bootVanity()
  try {
    const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
    for (const cols of [60, 80, 100]) {
      const term = new Term(font, cols, 25, 6, 5)
      fx.reset(h.program)
      const put = term.put
      const outside = []
      let missed = 0
      for (let f = 0; f < 20; f++) {
        const hit = new Uint8Array(cols * VIZ_BOT)
        term.put = function (x, y, ...rest) {
          if (y < 1 || y >= VIZ_BOT || x < 0 || x >= cols) outside.push([x, y])
          else hit[y * cols + x] = 1
          return put.call(this, x, y, ...rest)
        }
        try { drawWith(h, fx, 2 + f / 5, signal({ pulse: f % 6 === 0 ? 1 : 0 }), term) } finally { term.put = put }
        for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      }
      assert.deepEqual(outside.slice(0, 3), [], `${cols} cols: wrote outside the canvas`)
      assert.equal(missed, 0, `${cols} cols: ${missed} cell-frames left unpainted`)
    }
  } finally { h.shutdown() }
})

test('VANITY: every character it draws exists in the BDF font, and no shade blocks', async () => {
  const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
  const { h, fx } = await bootVanity()
  try {
    const seen = new Set()
    let t = 1
    for (let i = 0; i < 200; i++) {
      t += 0.07
      drawWith(h, fx, t, signal({ pulse: i % 9 === 0 ? 1 : 0.1 }), h.term, i > 150)
      for (const r of canvasRows(h)) for (const ch of r) seen.add(ch)
    }
    const missing = [...seen].filter((ch) => !font.glyphs.has(ch.codePointAt(0)))
    assert.deepEqual(missing, [], 'glyphs not in ter-u16n.bdf render as blanks')
    // Rubric 4: shade blocks raster as solid rectangles -- the smoke and the
    // haze are lines, never '░▒▓█'.
    assert.deepEqual([...seen].filter((ch) => '░▒▓█'.includes(ch)), [], 'shade blocks on the canvas')
  } finally { h.shutdown() }
})

test('VANITY: the picture is there -- framed mirror, bulbs round it, counter, ashtray, ember, smoke', async () => {
  const { h, fx, mod } = await bootVanity()
  try {
    settle(h, fx, 1)
    const { cx, ex, bulbs } = mod.vanityLayout(h.term.cols)
    const at = (x, y) => h.row(y)[x]
    assert.equal(at(cx - mod.MIRROR_HW, mod.FRAME_TOP), '╔', 'mirror frame, top-left')
    assert.equal(at(cx + mod.MIRROR_HW, mod.FRAME_TOP), '╗', 'mirror frame, top-right')
    assert.equal(at(cx - mod.MIRROR_HW, mod.FRAME_BOT), '╚', 'mirror frame, bottom-left')
    assert.equal(at(cx + mod.MIRROR_HW, mod.FRAME_BOT), '╝', 'mirror frame, bottom-right')
    const topLit = [...h.row(mod.BULB_Y)].filter((c) => c === 'O').length
    assert.ok(topLit >= 9, `only ${topLit} lit bulbs across the top`)
    const left = bulbs.filter((b) => !b.top && b.x < cx && at(b.x, b.y) === 'O').length
    const right = bulbs.filter((b) => !b.top && b.x > cx && at(b.x, b.y) === 'O').length
    assert.ok(left >= 4 && right >= 4, `side bulbs lit: ${left} left, ${right} right`)
    assert.ok(h.row(mod.COUNTER_Y).includes('▁'.repeat(40)), 'the counter runs under the mirror')
    assert.ok(h.row(mod.EMBER_DY + 1).includes('\\▁▁▁▁/'), 'the ashtray sits on the counter')
    assert.ok('*·'.includes(at(ex, mod.EMBER_DY)), 'an ember at the end of the joint')
    // The smoke: a continuous line of thin glyphs from just above the ember
    // to at least the middle of the glass, never more than a few cells from
    // the ember's column low down.
    const smoke = '()/\\~'
    let rows = 0
    for (let y = mod.EMBER_DY - 1; y > mod.FRAME_TOP + 2; y--) {
      const r = h.row(y)
      const near = [...r.slice(ex - 6, ex + 7)].some((c) => smoke.includes(c))
      if (!near) break
      rows++
    }
    assert.ok(rows >= 6, `the smoke line runs only ${rows} rows up from the ember`)
  } finally { h.shutdown() }
})

test('VANITY: a KICK is plainly visible against a LOUD frame, and settles back', async () => {
  const { h, fx } = await bootVanity()
  try {
    let t = settle(h, fx, 1)
    t += 0.016; drawWith(h, fx, t, signal())
    const loud = snapshot(h.term)
    assert.equal(brightCount(h.term), 0, 'nothing is BRIGHT between beats')
    t += 0.016; drawWith(h, fx, t, signal({ pulse: 1, onset: true, level: 0.95, bass: 1 }))
    const kick = snapshot(h.term)
    // The smoke moves a little between two frames 16ms apart on its own; the
    // kick has to dwarf that. Measured: ~70 cells (bulbs to BRIGHT, a halo
    // either side of each, the reflected row and the sheen lit).
    const changed = diffCount(loud, kick)
    assert.ok(changed >= 50, `a kick changed only ${changed} cells against the LOUD frame`)
    const bright = brightCount(h.term)
    assert.ok(bright >= 15, `only ${bright} BRIGHT cells on the kick -- the bulbs should pop`)
    // Still popped a frame or two later (a 60Hz pop that is gone in one frame
    // is invisible), gone well before the next beat at 120bpm.
    t += 0.05; drawWith(h, fx, t, signal({ pulse: 0.8 }))
    assert.ok(brightCount(h.term) >= 15, 'the pop should hold for a few frames')
    for (let i = 0; i < 25; i++) { t += 0.02; drawWith(h, fx, t, signal()) }
    assert.equal(brightCount(h.term), 0, 'the bulbs come back down after the kick')
  } finally { h.shutdown() }
})

test('VANITY: only a rising edge is a kick -- a pulse held high pops once', async () => {
  const { h, fx } = await bootVanity()
  try {
    let t = settle(h, fx, 1)
    let kicks = 0, last = h.program._flowKickAt
    for (let i = 0; i < 60; i++) {
      t += 0.016
      drawWith(h, fx, t, signal({ pulse: 1 }))
      if (h.program._flowKickAt !== last) { kicks++; last = h.program._flowKickAt }
    }
    assert.equal(kicks, 1, `a held pulse fired ${kicks} kicks`)
  } finally { h.shutdown() }
})

test('VANITY: with no tap it still breathes and kicks, on syntheticAudio', async () => {
  const { h } = await bootVanity()
  try {
    assert.equal(h.program._au, null, 'test setup: no tap')
    const seen = new Set()
    for (let i = 0; i < 200; i++) { h.advance(16); seen.add(h.program._flowKickAt) }
    assert.ok(seen.size >= 3, `only ${seen.size - 1} kicks in 3.2s without a tap`)
  } finally { h.shutdown() }
})

test('VANITY: MUTED is faint but never blank, and never kicks', async () => {
  const { h, fx, mod } = await bootVanity()
  try {
    let t = settle(h, fx, 1, signal(), true)
    // A pulse edge under mute must not pop anything.
    t += 0.016; drawWith(h, fx, t, signal({ pulse: 0 }), h.term, true)
    t += 0.016; drawWith(h, fx, t, signal({ pulse: 1, onset: true }), h.term, true)
    assert.equal(brightCount(h.term), 0, 'a pulse edge lit something while muted')
    const { bulbs } = mod.vanityLayout(h.term.cols)
    // Not blank: the ring is still there as small bulbs, at a tier that
    // shows on every tint -- MUTED, not DIM or FAINT, which vanish on most.
    let ring = 0
    for (const b of bulbs) {
      const i = b.y * h.term.cols + b.x
      const ch = String.fromCodePoint(h.term.chars[i])
      const a = h.term.attrs[i]
      if ('o○'.includes(ch) && (a & MUTED) && !(a & (DIM | FAINT))) ring++
    }
    assert.equal(ring, bulbs.length, `only ${ring} of ${bulbs.length} bulbs show under mute`)
    // ...and the rest of the room: enough visible (MUTED or brighter) cells to
    // still be a picture.
    let visible = 0
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < h.term.cols; x++) {
        const i = y * h.term.cols + x
        if (h.term.chars[i] !== 32 && !(h.term.attrs[i] & (DIM | FAINT))) visible++
      }
    }
    assert.ok(visible >= 150, `only ${visible} visible cells under mute -- it reads as blank`)
    // And faint: no lit 'O' or flaring '☼' anywhere.
    assert.ok(!/[O☼]/.test(canvasRows(h).join('')), 'lit bulbs under mute')
    // Smoke still rises: ambient life, so it is not a hung tab.
    const a = canvasRows(h).join('\n')
    t += 1.5; drawWith(h, fx, t, signal(), h.term, true)
    assert.notEqual(canvasRows(h).join('\n'), a, 'nothing moved in 1.5s under mute')
  } finally { h.shutdown() }
})

test('VANITY: a change of level leaves the smoke where it was', async () => {
  // The old FLOW FIELD scaled `t *` frequency terms by level, so a louder bar
  // jumped the whole field. The smoke is a pure function of time; only the
  // bulbs answer the music.
  const { h, fx, mod } = await bootVanity()
  try {
    const { ex } = mod.vanityLayout(h.term.cols)
    const smokeRows = () => {
      const out = []
      for (let y = mod.FRAME_TOP + 2; y < mod.EMBER_DY; y++) out.push(h.row(y).slice(ex - 8, ex + 9))
      return out.join('\n')
    }
    settle(h, fx, 1, signal({ level: 0.2 }))
    drawWith(h, fx, 7, signal({ level: 0.2 }))
    const quiet = smokeRows()
    settle(h, fx, 1, signal({ level: 0.95 }))
    drawWith(h, fx, 7, signal({ level: 0.95 }))
    assert.equal(smokeRows(), quiet, 'the smoke moved with the level')
  } finally { h.shutdown() }
})

test('VANITY: re-entry after a long visit carries no kick clock', async () => {
  const { h, fx } = await bootVanity()
  try {
    h.program._flowKickAt = 600
    h.program._flowLastT = 600
    h.program._flowPrevPulse = 1
    fx.reset(h.program)
    drawWith(h, fx, 0.5, signal({ pulse: 0 }))
    drawWith(h, fx, 0.52, signal({ pulse: 1 }))
    assert.equal(h.program._flowKickAt, 0.52, 'the first kick after entry lands')
    assert.ok(brightCount(h.term) > 0, 'and pops the bulbs')
  } finally { h.shutdown() }
})

test('VANITY: BRIGHT stays on the bulbs (tube bloom)', async () => {
  const { h, fx, mod } = await bootVanity()
  try {
    const { bulbs } = mod.vanityLayout(h.term.cols)
    let worst = 0, t = 1
    for (let f = 0; f < 120; f++) {
      t += 0.05
      drawWith(h, fx, t, signal({ pulse: f % 8 === 0 ? 1 : 0, level: 0.95, bass: 0.95 }))
      worst = Math.max(worst, brightCount(h.term))
    }
    assert.ok(worst <= bulbs.length + 1, `${worst} BRIGHT cells in one frame -- only the bulbs may be`)
  } finally { h.shutdown() }
})
