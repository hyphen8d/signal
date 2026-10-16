// ATOMIC AGE (key `isotope`, ATOMIC, rebuilt 2026-10-16) -- what the effect
// actually leaves on the grid, read back off it the way the other
// visual-*.test.mjs files do: the canvas contract, the glyphs, that the atom
// is there (nucleus at the centre, orbits around it, three electrons), that
// a kick flares the nucleus and throws a shockwave -- on a beat and only on
// a beat -- that an onset pops a starburst, that BRIGHT stays rare, that
// mute settles it, and that re-entry after a long visit carries no clock
// from the previous one.
//
// The frame loop rewrites p._au every frame (visualizer.js), so everything
// about the beat is driven by calling the effect's draw directly with a
// crafted signal.
//
// Run: node --test tests/visual-isotope.test.mjs

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
const BRIGHT = 1, DIM = 4, MUTED = 32
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000
const canvasRows = (h) => Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1))
const attrAt = (h, x, y) => h.term.attrs[y * h.term.cols + x]
const isDots = (ch) => { const c = ch.codePointAt(0); return c > 0x2800 && c <= 0x28ff }

const signal = (over = {}) => ({
  level: 0.6, bass: 0.4, mid: 0.4, treble: 0.3,
  bands9: new Array(9).fill(0.4), onset: false, pulse: 0, ...over,
})

async function bootAtom() {
  const h = await boot({ station: 'atomic' })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  h.advance(300)
  assert.equal(h.program.activeVisualKey(), 'isotope', 'ATOMIC should land on the atom (key isotope)')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/isotope.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.isotope, mod }
}

/** Draws one frame directly with a crafted signal. */
function drawWith(h, fx, t, A, muted = false) {
  h.program.muted = muted
  h.program._au = A
  fx.draw(h.program, { term: h.term }, t)
}

/** The nucleus cells, read back: [{x, y, ch, attr, want, role}]. */
function nucleus(h, mod) {
  const cx = Math.floor(h.term.cols / 2)
  return mod.NUCLEUS.map(([dx, dy, want, role]) => {
    const x = cx + dx, y = mod.NUCLEUS_Y + dy
    return { x, y, ch: h.row(y)[x], attr: attrAt(h, x, y), want, role }
  })
}
const nucleusHot = (h, mod) => nucleus(h, mod).filter((c) => c.role === 'p').every((c) => c.attr & BRIGHT)

/** Braille cells further than `r` cells (in 2:1-corrected distance) from the
 *  nucleus -- what a shockwave adds to the picture. */
function dotsBeyond(h, mod, r) {
  const cx = Math.floor(h.term.cols / 2)
  let n = 0
  for (let y = 1; y < VIZ_BOT; y++) {
    const row = h.row(y)
    for (let x = 0; x < h.term.cols; x++) {
      if (!isDots(row[x])) continue
      const d = Math.hypot(x - cx, (y - mod.NUCLEUS_Y) * 2)
      if (d > r) n++
    }
  }
  return n
}

test('ATOMIC AGE: repaints every canvas cell and nothing outside rows 1..21', async () => {
  const { h, fx } = await bootAtom()
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
      h.program._au = signal({ level: 1, bass: 1, treble: 1, pulse: 1, onset: true })
      fx.draw(h.program, { term: h.term }, effectT(h) + 0.5)
    } finally { h.term.put = put }
    assert.deepEqual(outside.slice(0, 5), [], `${outside.length} puts landed outside the canvas`)
    let missed = 0
    for (let i = h.term.cols; i < h.term.cols * VIZ_BOT; i++) if (!hit[i]) missed++
    assert.equal(missed, 0, `${missed} canvas cells not repainted`)
  } finally { h.shutdown() }
})

test('ATOMIC AGE: every character it draws exists in the BDF font (Braille is synthesised)', async () => {
  const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
  const { h } = await bootAtom()
  try {
    const seen = new Set()
    for (let i = 0; i < 120; i++) {
      h.advance(100)
      for (const r of canvasRows(h)) for (const ch of r) seen.add(ch)
    }
    const missing = [...seen].filter((ch) => !font.glyphs.has(ch.codePointAt(0)))
    assert.deepEqual(missing, [], 'glyphs not in ter-u16n.bdf render as blanks')
    assert.ok([...seen].some(isDots), 'the orbits are drawn in Braille dots')
  } finally { h.shutdown() }
})

test('ATOMIC AGE: the atom reads back -- nucleus at the centre, orbits round it, three electrons', async () => {
  const { h, fx, mod } = await bootAtom()
  try {
    drawWith(h, fx, 3, signal())
    const cells = nucleus(h, mod)
    assert.ok(cells.every((c) => c.ch === c.want), `nucleus is not drawn whole: ${cells.map((c) => c.ch).join('')}`)
    // A checkerboard of protons and neutrons: no two protons side by side.
    const at = new Map(cells.map((c) => [`${c.x},${c.y}`, c.role]))
    for (const c of cells.filter((c) => c.role === 'p')) {
      assert.notEqual(at.get(`${c.x + 1},${c.y}`), 'p', 'protons side by side -- not a packed nucleus')
      assert.notEqual(at.get(`${c.x},${c.y + 1}`), 'p', 'protons stacked -- not a packed nucleus')
    }
    // Orbits: Braille on every side of the nucleus -- left, right, above and
    // below -- or it is not something going round it.
    const cx = Math.floor(h.term.cols / 2)
    const rows = canvasRows(h)
    const side = (fn) => rows.some((r, i) => [...r].some((ch, x) => isDots(ch) && fn(x, i + 1)))
    assert.ok(side((x, y) => x < cx - 12 && Math.abs(y - mod.NUCLEUS_Y) <= 2), 'no orbit to the left')
    assert.ok(side((x, y) => x > cx + 12 && Math.abs(y - mod.NUCLEUS_Y) <= 2), 'no orbit to the right')
    assert.ok(side((x, y) => y <= 4), 'no orbit above')
    assert.ok(side((x, y) => y >= 18), 'no orbit below')
    // Three electrons, each a NORMAL disc of dots where the effect says it is,
    // all in different places and clear of the nucleus.
    const at3 = h.program._isoElectronAt
    assert.equal(at3.length, 3, 'one electron per orbit')
    assert.equal(new Set(at3.map(([x, y]) => `${x},${y}`)).size, 3, 'two electrons in one cell')
    for (const [x, y] of at3) {
      assert.ok(isDots(h.row(y)[x]), `no electron drawn at ${x},${y}: '${h.row(y)[x]}'`)
      assert.ok(attrAt(h, x, y) === 0, `electron at ${x},${y} is not NORMAL`)
      assert.ok(Math.abs(x - cx) > 3 || Math.abs(y - mod.NUCLEUS_Y) > 1, 'an electron inside the nucleus')
    }
    // And the starbursts are on screen around it.
    assert.ok(rows.join('').split('*').length - 1 >= 4, 'the starbursts are missing')
  } finally { h.shutdown() }
})

test('ATOMIC AGE: a kick flares the nucleus and throws a shockwave; a held pulse does not', async () => {
  const { h, fx, mod } = await bootAtom()
  try {
    fx.reset(h.program)
    drawWith(h, fx, 2.0, signal({ pulse: 0.05 }))
    assert.ok(!nucleusHot(h, mod), 'nucleus flared with no kick')
    const quietDots = dotsBeyond(h, mod, 6)
    drawWith(h, fx, 2.02, signal({ pulse: 1 }))
    assert.ok(nucleusHot(h, mod), 'a kick did not flare the nucleus')
    drawWith(h, fx, 2.2, signal({ pulse: 0.5 }))
    assert.ok(dotsBeyond(h, mod, 6) > quietDots + 10, 'no shockwave ring out across the orbits after the kick')
    // Over: the flare is short, and a pulse that stays up is not a new kick.
    drawWith(h, fx, 2.4, signal({ pulse: 0.5 }))
    assert.ok(!nucleusHot(h, mod), 'the flare held past FLARE_S')
    drawWith(h, fx, 2.6, signal({ pulse: 0.55 }))
    assert.ok(!nucleusHot(h, mod), 'a slowly rising pulse fired a kick')
    // A second edge inside KICK_GAP_S is one kick, not two.
    drawWith(h, fx, 3.0, signal({ pulse: 0.05 }))
    drawWith(h, fx, 3.02, signal({ pulse: 1 }))
    const at = h.program._isoKickAt
    drawWith(h, fx, 3.06, signal({ pulse: 0.05 }))
    drawWith(h, fx, 3.1, signal({ pulse: 1 }))
    assert.equal(h.program._isoKickAt, at, 'a double edge inside the gap counted twice')
  } finally { h.shutdown() }
})

test('ATOMIC AGE: with no tap the nucleus flares in time with the synthetic ~0.9s pulse', async () => {
  const { h, mod } = await bootAtom()
  try {
    h.advance(1000)
    const kicks = []
    let last = h.program._isoKickAt
    for (let i = 0; i < 300; i++) {
      h.advance(16)
      if (h.program._isoKickAt !== last) { kicks.push(h.program._isoKickAt); last = h.program._isoKickAt }
    }
    assert.ok(kicks.length >= 4, `only ${kicks.length} kicks in ~4.8s of synthetic pulse`)
    for (let i = 1; i < kicks.length; i++) {
      const gap = kicks[i] - kicks[i - 1]
      assert.ok(Math.abs(gap - 0.9) < 0.1, `kicks ${gap.toFixed(2)}s apart, not on the 0.9s pulse`)
    }
    assert.ok(mod.FLARE_S < 0.9, 'a flare must be over before the next pulse')
  } finally { h.shutdown() }
})

test('ATOMIC AGE: level drives the electrons -- loud travels further than quiet', async () => {
  const { h, fx } = await bootAtom()
  try {
    const travel = (level) => {
      fx.reset(h.program)
      const start = h.program._isoPhase.slice()
      for (let f = 0; f <= 60; f++) drawWith(h, fx, 10 + f / 60, signal({ level, pulse: 0.05 }))
      return h.program._isoPhase.reduce((s, ph, i) => s + ((ph - start[i] + Math.PI * 4) % (Math.PI * 2)), 0)
    }
    const quiet = travel(0), loud = travel(1)
    assert.ok(loud > quiet * 2, `loud travel ${loud.toFixed(2)} vs quiet ${quiet.toFixed(2)}`)
    assert.ok(quiet > 0.5, 'the electrons stopped at silence -- the atom should never stand still')
  } finally { h.shutdown() }
})

test('ATOMIC AGE: an onset pops a starburst -- longer arms, a BRIGHT heart -- and it settles', async () => {
  const { h, fx, mod } = await bootAtom()
  const rnd = Math.random
  try {
    fx.reset(h.program)
    Math.random = () => 0 // pick STARBURSTS[0], a big one
    const b = mod.STARBURSTS[0]
    const x = Math.round(b.fx * (h.term.cols - 1))
    drawWith(h, fx, 5, signal({ pulse: 0.05 }))
    assert.ok(!(attrAt(h, x, b.y) & BRIGHT), 'burst lit before any onset')
    assert.notEqual(h.row(b.y)[x + 3], '─', 'test setup: resting arms reach two cells')
    drawWith(h, fx, 5.02, signal({ pulse: 0.05, onset: true }))
    assert.equal(h.row(b.y)[x], '*')
    assert.ok(attrAt(h, x, b.y) & BRIGHT, 'popped burst heart is not BRIGHT')
    assert.equal(h.row(b.y)[x + 3], '─', 'popped burst did not throw its arms out')
    drawWith(h, fx, 5.02 + mod.POP_S + 0.05, signal({ pulse: 0.05 }))
    assert.ok(!(attrAt(h, x, b.y) & BRIGHT), 'the pop never settled')
  } finally { Math.random = rnd; h.shutdown() }
})

test('ATOMIC AGE: BRIGHT stays rare even on the loudest kick, and no full blocks', async () => {
  const { h, fx } = await bootAtom()
  try {
    let worst = 0
    const audit = (label) => {
      let bright = 0
      for (let y = 1; y < VIZ_BOT; y++) {
        const row = h.row(y)
        for (let x = 0; x < h.term.cols; x++) {
          assert.notEqual(row[x], '█', `${label}: a full block at ${x},${y}`)
          if (attrAt(h, x, y) & BRIGHT) bright++
        }
      }
      worst = Math.max(worst, bright)
    }
    for (let i = 0; i < 40; i++) { h.advance(100); audit(`synthetic ${i}`) }
    fx.reset(h.program)
    for (let f = 0; f < 30; f++) {
      const t = 20 + f * 0.5
      drawWith(h, fx, t, signal({ level: 1, bass: 1, treble: 1, pulse: 0.05 }))
      drawWith(h, fx, t + 0.02, signal({ level: 1, bass: 1, treble: 1, onset: true, pulse: 1 }))
      audit(`kick ${f}`)
    }
    assert.ok(worst <= 16, `${worst} BRIGHT cells in one frame`)
  } finally { h.shutdown() }
})

test('ATOMIC AGE: muted, no flares and no pops, the electrons at their floor speed', async () => {
  const { h, fx, mod } = await bootAtom()
  try {
    fx.reset(h.program)
    const start = h.program._isoPhase.slice()
    for (let f = 0; f <= 120; f++) {
      // A loud tap frame is handed in, but muted means SILENT_AUDIO is used.
      drawWith(h, fx, 30 + f / 60, signal({ level: 1, pulse: f % 30 === 0 ? 1 : 0, onset: true }), true)
      assert.ok(!nucleusHot(h, mod), `muted nucleus flared at frame ${f}`)
      for (let y = 1; y < VIZ_BOT; y++) {
        for (let x = 0; x < h.term.cols; x++) {
          const ch = h.row(y)[x]
          if (ch === '*' && (attrAt(h, x, y) & BRIGHT)) assert.fail(`muted burst popped at ${x},${y}`)
        }
      }
    }
    const travelled = h.program._isoPhase.reduce((s, ph, i) => s + ((ph - start[i] + Math.PI * 4) % (Math.PI * 2)), 0)
    assert.ok(travelled > 0, 'muted, the electrons stopped entirely')
    assert.ok(travelled < 3 * 2 * 1.2 * 1.2, `muted electrons travelled ${travelled.toFixed(2)} rad in 2s -- not the floor speed`)
  } finally { h.shutdown() }
})

test('ATOMIC AGE: re-entry after a long visit carries no beat clock from the previous visit', async () => {
  const { h, fx, mod } = await bootAtom()
  try {
    // A long visit: a kick stamped five minutes in, a pop stamped too.
    drawWith(h, fx, 300, signal({ pulse: 0.05 }))
    drawWith(h, fx, 300.02, signal({ pulse: 1, onset: true }))
    assert.ok(h.program._isoKickAt > 299, 'test setup: a kick at five minutes')
    // Exit and come back: the effect clock restarts at 0.
    h.key('e')
    h.advance(200)
    h.key('v')
    h.advance(100)
    assert.ok(h.program._isoKickAt < 0 || h.program._isoKickAt <= effectT(h), `kick clock ${h.program._isoKickAt} left in the future`)
    assert.ok(h.program._isoPops.every((t) => t < 1), 'a pop clock was left in the future')
    // And a kick lands straight away on the new clock.
    drawWith(h, fx, 1.0, signal({ pulse: 0.05 }))
    drawWith(h, fx, 1.02, signal({ pulse: 1 }))
    assert.ok(nucleusHot(h, mod), 'the first kick after re-entry was refused')
    // The electrons pick up where they were: no jump from integrating the gap.
    fx.reset(h.program)
    const before = h.program._isoPhase.slice()
    drawWith(h, fx, 500, signal({ level: 1, pulse: 0.05 }))
    assert.deepEqual(h.program._isoPhase, before, 'the first frame after re-entry moved the electrons')
  } finally { h.shutdown() }
})
