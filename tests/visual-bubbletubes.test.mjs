// DJ BOOTH (SYNAPSE, key 'bubbletubes', redrawn in pixel bitmaps 2026-10-20)
// -- what the effect leaves on the grid, read back off it. The picture is
// drawn through putGlyph(), so a character read sees every lit cell as a
// space: these tests read term.gfx (the bitmaps) and term.attrs (the beam
// tier), the way tests/visual-frost.test.mjs does.
//
// Claims: the canvas contract at three widths; the picture is there (the
// DJ a dark silhouette with a lit rim, both platters' label rings, the
// crowd along the bottom, the beams; no characters at all); a KICK re-aims
// the rig -- the beams land somewhere else and STAY there after the flash,
// so a still catches it -- with the lenses and the DJ's rim BRIGHT and his
// fist up; only a rising edge steps it; it steps with no tap; the flash is
// seen on a slow machine; MUTED is lit, still, never BRIGHT, and the decks
// still turn; re-entry carries no kick clock.
//
// The frame loop rewrites p._au every frame (visualizer.js), so the beat is
// driven by calling the effect's draw directly with a crafted signal.
//
// Run: node --test tests/visual-bubbletubes.test.mjs

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
// Attribute bits, src/cellgrid.js. NORMAL is 0.
const BRIGHT = 1, DIM = 4, MUTED = 32, FAINT = 64
const NORMAL = 0
const STATION = 'midnight-neon'   // SYNAPSE's id (the dial slot kept its old id)
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000

// viz-sheet.mjs's LOUD and KICK, as signals.
const loud = (over = {}) => ({
  level: 0.7, bass: 0.45, mid: 0.6, treble: 0.5,
  bands9: [0.45, 0.69, 0.59, 0.36, 0.22, 0.47, 0.7, 0.58, 0.31], onset: false, pulse: 0.15, ...over,
})
const kick = () => loud({ level: 0.95, bass: 1, onset: true, pulse: 1 })

async function bootBooth() {
  const h = await boot({ station: STATION })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  assert.equal(h.program.activeVisualKey(), 'bubbletubes', 'SYNAPSE should land on its own effect')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/bubbletubes.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.bubbletubes, mod }
}

function drawWith(h, fx, t, A, muted = false, term = h.term) {
  h.program.muted = muted
  h.program._au = A
  fx.draw(h.program, { term }, t)
}
/** Quiet frames until the kick clock and the level have settled. */
function settle(h, fx, t0, A = loud()) {
  let t = t0
  for (let i = 0; i < 60; i++) { t += 0.05; drawWith(h, fx, t, A) }
  return t
}
const idx = (h, x, y) => y * h.term.cols + x
const has = (h, c) => !!h.term.gfx[idx(h, c.x, c.y)]
const attr = (h, c) => h.term.attrs[idx(h, c.x, c.y)]
const lit = (a) => a === NORMAL || a === MUTED || (a & BRIGHT)
/** Canvas cells carrying a bitmap whose attribute passes `pred`. */
function cellsWhere(h, pred, y0 = 1, y1 = VIZ_BOT - 1) {
  const out = []
  for (let y = y0; y <= y1; y++) for (let x = 0; x < h.term.cols; x++) {
    const i = idx(h, x, y)
    if (h.term.gfx[i] && pred(h.term.attrs[i])) out.push({ x, y })
  }
  return out
}
/** The canvas as comparable strings: bitmap + tier per cell. */
function snapshot(h, y0 = 1, y1 = VIZ_BOT - 1) {
  const out = []
  for (let y = y0; y <= y1; y++) for (let x = 0; x < h.term.cols; x++) {
    const i = idx(h, x, y), b = h.term.gfx[i]
    out.push(b ? b.join(',') + ':' + h.term.attrs[i] : '')
  }
  return out
}
const diffCount = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n }

test('DJ BOOTH: repaints every canvas cell and nothing outside rows 1..21, at 60, 80 and 100 columns', async () => {
  const { h, fx } = await bootBooth()
  try {
    const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
    for (const cols of [60, 80, 100]) {
      const term = new Term(font, cols, 25, 6, 5)
      fx.reset(h.program)
      const outside = []
      let missed = 0
      for (let f = 0; f < 12; f++) {
        const hit = new Uint8Array(cols * VIZ_BOT)
        const orig = {}
        for (const fn of ['put', 'putGlyph']) {
          orig[fn] = term[fn]
          term[fn] = function (x, y, ...rest) {
            if (y < 1 || y >= VIZ_BOT || x < 0 || x >= cols) outside.push(`${x},${y}`)
            else hit[y * cols + x] = 1
            return orig[fn].call(this, x, y, ...rest)
          }
        }
        try { drawWith(h, fx, 2 + f / 20, f % 6 === 0 ? kick() : loud(), false, term) } finally { Object.assign(term, orig) }
        for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      }
      assert.deepEqual(outside.slice(0, 3), [], `${cols} cols: wrote outside the canvas`)
      assert.equal(missed, 0, `${cols} cols: ${missed} cell-frames left unpainted`)
      assert.ok(term.gfx.filter(Boolean).length > cols * 8, `${cols} cols: hardly any pixels drawn`)
    }
  } finally { h.shutdown() }
})

test('DJ BOOTH: the picture is there -- the DJ in silhouette, two platters, the crowd, the beams; no text', async () => {
  const { h, fx, mod } = await bootBooth()
  try {
    settle(h, fx, 1)
    // The DJ: dark inside his head, a lit rim round it at NORMAL -- the
    // subject's tier -- on both sides and over the headphone band.
    const H = mod.HEAD
    const centre = mod.cellAt(h.term, H.x, H.y)
    assert.ok(!has(h, centre), 'the middle of the head is lit -- he should be a silhouette')
    for (const [X, Y, what] of [[H.x - H.rx - 8, H.y + 3, 'left cup'], [H.x + H.rx + 8, H.y + 3, 'right cup'], [H.x, H.y - H.ry - 4, 'the band']]) {
      const c = mod.cellAt(h.term, X, Y)
      assert.ok(has(h, c) && attr(h, c) === NORMAL, `the rim at the ${what} is not lit NORMAL (${attr(h, c)})`)
    }
    // Both platters: the label ring lit NORMAL either side of the spindle.
    for (const d of mod.DECKS) {
      const c = mod.cellAt(h.term, d.x - d.rx * 0.3, d.y)
      assert.ok(has(h, c) && lit(attr(h, c)), `no label ring on the deck at ${Math.round(d.x)}`)
    }
    // The near deck is the bigger one: the three-quarter view, not the
    // front-on pair BOOM BAP already is.
    assert.ok(mod.DECKS[0].rx > mod.DECKS[1].rx * 1.15, 'the decks are the same size -- front-on')
    // The crowd: dark heads along the bottom row with lit edges between.
    const bottom = cellsWhere(h, () => true, VIZ_BOT - 2, VIZ_BOT - 1).length
    const dark = []
    for (let x = 0; x < h.term.cols; x++) if (!has(h, { x, y: VIZ_BOT - 1 })) dark.push(x)
    assert.ok(bottom >= h.term.cols * 0.5, `only ${bottom} lit cells in the crowd rows`)
    assert.ok(dark.length >= 8, `only ${dark.length} dark cells on the bottom row -- no heads`)
    // The beams: upper half of the frame well lit.
    const upper = cellsWhere(h, (a) => a === NORMAL || a === MUTED || a === DIM, 1, 6).length
    assert.ok(upper >= 30, `only ${upper} lit cells in the top six rows -- where are the beams?`)
    // A picture, not characters.
    const text = Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1)).join('')
    assert.equal(text.trim(), '', 'characters on the canvas')
  } finally { h.shutdown() }
})

test('DJ BOOTH: a KICK re-aims the rig and the new aim HOLDS after the flash; the fist goes up', async () => {
  // Two boots on the same frame times, one kicked and one not: the haze in
  // the beams drifts on its own, so "differs from before" proves nothing --
  // "differs from the same moment without the kick" does.
  const run = async (kicked) => {
    const { h, fx, mod } = await bootBooth()
    try {
      let t = settle(h, fx, 1)
      assert.equal(cellsWhere(h, (a) => a & BRIGHT).length, 0, 'BRIGHT at rest -- the kick would have nothing to add')
      t += 0.016; drawWith(h, fx, t, kicked ? kick() : loud())
      const onKick = { bright: cellsWhere(h, (a) => a & BRIGHT).length, fist: mod.cellAt(h.term, mod.DJ_X + 87, 46) }
      onKick.fistUp = has(h, onKick.fist) && !!(attr(h, onKick.fist) & BRIGHT)
      // Past the flash, back on the LOUD bed.
      for (let i = 0; i < 20; i++) { t += 0.05; drawWith(h, fx, t, loud()) }
      if (kicked) assert.ok(t - h.program._boothKickAt > mod.KICK_HOLD_S, 'test setup: past the flash')
      return { onKick, after: snapshot(h, 1, 11), brightAfter: cellsWhere(h, (a) => a & BRIGHT).length }
    } finally { h.shutdown() }
  }
  const quiet = await run(false), kicked = await run(true)
  assert.ok(kicked.onKick.bright >= 30, `only ${kicked.onKick.bright} BRIGHT cells on the kick -- the flash is not seen`)
  assert.ok(kicked.onKick.fistUp, 'no BRIGHT fist in the air on the kick')
  assert.ok(!quiet.onKick.fistUp, 'test setup: the fist is up without a kick')
  assert.equal(kicked.brightAfter, 0, 'the flash outlived its hold')
  // The beams stay where the kick sent them: what makes LOUD and KICK
  // tiles differ in a still taken long after the onset.
  const held = diffCount(quiet.after, kicked.after)
  assert.ok(held >= 60, `after the flash only ${held} cells of the rig differ from the unkicked run -- the aim did not hold`)
})

test('DJ BOOTH: only a rising edge steps the chase -- a held pulse steps once', async () => {
  const { h, fx } = await bootBooth()
  try {
    let t = settle(h, fx, 1)
    const s0 = h.program._boothStep
    for (let i = 0; i < 60; i++) { t += 0.016; drawWith(h, fx, t, loud({ pulse: 1 })) }
    assert.equal(h.program._boothStep - s0, 1, 'a held pulse stepped more than once')
    // ...and one that only creeps up does not step at all.
    t = settle(h, fx, t, loud({ pulse: 0 }))
    const s1 = h.program._boothStep
    for (let i = 1; i <= 8; i++) { t += 0.02; drawWith(h, fx, t, loud({ pulse: i * 0.12 })) }
    assert.equal(h.program._boothStep, s1, 'a pulse that only creeps up stepped the rig')
  } finally { h.shutdown() }
})

test('DJ BOOTH: with no tap it still steps, on syntheticAudio', async () => {
  const h = await boot({ station: STATION })
  try {
    h.powerOn(); h.key('v'); if (h.program.tapConsentOpen) h.key('n')
    assert.equal(h.program._au, null, 'test setup: no tap')
    const s0 = h.program._boothStep
    for (let i = 0; i < 200; i++) h.advance(16)
    assert.ok(h.program._boothStep - s0 >= 3, `only ${h.program._boothStep - s0} steps in 3.2s without a tap`)
  } finally { h.shutdown() }
})

test('DJ BOOTH: the flash is seen on a slow machine -- the frame after a kick, even a second late', async () => {
  const { h, fx, mod } = await bootBooth()
  try {
    settle(h, fx, 1)
    drawWith(h, fx, 10, loud({ pulse: 0 }))
    drawWith(h, fx, 11, kick())
    drawWith(h, fx, 12, loud())
    assert.ok(cellsWhere(h, (a) => a & BRIGHT).length >= 30, 'the frame after a kick, a second late, shows no flash')
    for (let f = 0; f < mod.KICK_MIN_FRAMES; f++) drawWith(h, fx, 13 + f, loud())
    assert.equal(cellsWhere(h, (a) => a & BRIGHT).length, 0, 'the flash never ends on a slow machine')
  } finally { h.shutdown() }
})

test('DJ BOOTH: MUTED is lit and still -- no step, nothing BRIGHT, the DJ and decks there, the decks turning', async () => {
  const { h, fx, mod } = await bootBooth()
  try {
    let t = settle(h, fx, 1)
    const s0 = h.program._boothStep
    for (let i = 0; i < 40; i++) { t += 0.05; drawWith(h, fx, t, i % 4 ? loud() : kick(), true) }
    assert.equal(h.program._boothStep, s0, 'a pulse edge stepped the rig while muted')
    assert.equal(cellsWhere(h, (a) => a & BRIGHT).length, 0, 'something flashed while muted')
    const shown = cellsWhere(h, (a) => a === NORMAL || a === MUTED).length
    assert.ok(shown >= 80, `muted, only ${shown} cells at MUTED or above -- MUTED has to read`)
    const H = mod.HEAD
    const cup = mod.cellAt(h.term, H.x - H.rx - 8, H.y + 3)
    assert.ok(has(h, cup) && lit(attr(h, cup)), 'muted, the DJ lost his rim')
    // Alive: the record turns under the highlight with the sound off.
    const before = snapshot(h)
    t += 0.4; drawWith(h, fx, t, loud(), true)
    const moved = diffCount(before, snapshot(h))
    assert.ok(moved >= 3, `only ${moved} cells changed between muted frames -- the decks stopped`)
  } finally { h.shutdown() }
})

test('DJ BOOTH: re-entry after a long visit carries no kick clock from the last one', async () => {
  const { h, fx } = await bootBooth()
  try {
    drawWith(h, fx, 600, loud({ pulse: 0 }))
    drawWith(h, fx, 600.02, kick())
    assert.ok(h.program._boothKickAt > 500, 'test setup: a kick late in a long visit')
    h.key('e'); h.advance(200)
    h.key('v'); h.advance(300)
    const t = effectT(h)
    assert.ok(h.program._boothKickAt <= t + 0.05, `_boothKickAt ${h.program._boothKickAt} on a clock at ${t}`)
    assert.ok((h.program._boothLastT ?? 0) <= t + 0.05, `_boothLastT ${h.program._boothLastT} on a clock at ${t}`)
    // ...and the first kick after entry lands and steps the rig.
    const s0 = h.program._boothStep
    drawWith(h, fx, t + 0.5, loud({ pulse: 0 }))
    drawWith(h, fx, t + 0.52, kick())
    assert.equal(h.program._boothStep, s0 + 1, 'the first kick after re-entry did not step the rig')
  } finally { h.shutdown() }
})

test('DJ BOOTH: every step of the chase re-aims at least four of the six cans', async () => {
  const { mod } = await bootBooth().then(async (r) => { r.h.shutdown(); return r })
  // Consecutive chase steps differ for every can: each kick re-aims all six.
  for (let i = 0; i < mod.CHASE.length; i++) {
    const a = mod.CHASE[i], b = mod.CHASE[(i + 1) % mod.CHASE.length]
    const same = a.filter((v, k) => v === b[k]).length
    assert.ok(same <= 2, `chase step ${i} -> ${i + 1} leaves ${same} of six cans where they were`)
  }
})
