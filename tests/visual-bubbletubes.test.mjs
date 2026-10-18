// DJ BOOTH (SYNAPSE, key 'bubbletubes', redrawn 2026-10-16) -- what the
// effect leaves on the grid, read back off it: the canvas contract at three
// widths; that the booth is there (truss and cans, the DJ in headphones, two
// platters, the mixer, the callsign on the panel, the crowd); that a KICK
// frame differs visibly from a LOUD frame and the new rig position HOLDS
// after the flash (a still can catch it); that only a rising edge steps the
// chase; that it steps with no tap (syntheticAudio); that MUTED is faint and
// not blank, and does not step; re-entry after a long visit; and the tube
// rules -- no shade blocks at all, BRIGHT only on the kick and rare.
//
// The frame loop rewrites p._au every frame (visualizer.js), so everything
// about the beat is driven by calling the effect's draw directly with a
// crafted signal, as tests/visual-boombap.test.mjs does.
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
const BRIGHT = 1
const STATION = 'midnight-neon'   // SYNAPSE's id (the dial slot kept its old id)

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

function drawWith(h, fx, t, A, term = h.term) {
  h.program.muted = false
  h.program._au = A
  fx.draw(h.program, { term }, t)
}

/** The canvas (rows 1..VIZ_BOT-1) as chars + attrs. */
function canvas(term) {
  const n = term.cols * (VIZ_BOT - 1)
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const j = term.cols + i
    out[i] = term.chars[j] + ':' + term.attrs[j]
  }
  return out
}
const diffCount = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n }

/** Quiet frames until the kick clock and meters have settled. */
function settle(h, fx, t0, A = loud()) {
  let t = t0
  for (let i = 0; i < 40; i++) { t += 0.05; drawWith(h, fx, t, A) }
  return t
}

test('DJ BOOTH: paints the whole canvas and nothing outside it, at 60, 80 and 100 columns', async () => {
  const { h, fx } = await bootBooth()
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
        try { drawWith(h, fx, 2 + f / 20, f % 6 === 0 ? kick() : loud(), term) } finally { term.put = put }
        for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      }
      assert.deepEqual(outside.slice(0, 3), [], `${cols} cols: wrote outside the canvas`)
      assert.equal(missed, 0, `${cols} cols: ${missed} cell-frames left unpainted`)
    }
  } finally { h.shutdown() }
})

test('DJ BOOTH: the picture is there -- rig, DJ, two decks, mixer, callsign, crowd', async () => {
  const { h, fx, mod } = await bootBooth()
  try {
    settle(h, fx, 1)
    const L = mod.boothLayout(h.term.cols)
    const row = (y) => h.row(y)
    assert.equal([...row(mod.CAN_Y)].filter((c) => c === '▼').length, mod.CANS, 'six cans hang off the truss')
    assert.match(row(mod.HEAD_Y + 1), /\[│ - - │\]/, 'the DJ, in headphones')
    for (const cx of [L.lcx, L.rcx]) {
      assert.equal(row((mod.DECK_Y0 + mod.DECK_Y1) / 2).slice(cx - 1, cx + 2), '(●)', `a platter label at col ${cx}`)
      assert.equal(row((mod.DECK_Y0 + mod.DECK_Y1) / 2)[cx - L.rx], '│', 'the platter rim')
    }
    assert.ok(row(mod.DECK_Y1 - 1).includes('───╪───'), 'the mixer crossfader')
    assert.ok(row(mod.PANEL_Y0 + 2).includes('S Y N A P S E'), 'the callsign across the booth panel')
    assert.ok([...row(mod.CROWD_Y)].filter((c) => c === '●').length >= 10, 'a crowd along the bottom')
  } finally { h.shutdown() }
})

test('DJ BOOTH: KICK differs from LOUD by a lot, and the new rig position holds after the flash', async () => {
  const { h, fx, mod } = await bootBooth()
  try {
    let t = settle(h, fx, 1)
    const before = canvas(h.term)
    t += 0.016; drawWith(h, fx, t, kick())
    const onKick = canvas(h.term)
    const moved = diffCount(before, onKick)
    assert.ok(moved >= 60, `the kick changed only ${moved} cells -- it has to be the thing you see`)
    let fist = false
    for (let y = 1; y < mod.HEAD_Y + 1; y++) {
      const x = h.row(y).indexOf('●')
      if (x >= 0 && h.term.attrs[y * h.term.cols + x] & BRIGHT) fist = true
    }
    assert.ok(fist, 'the DJ throws a BRIGHT fist up on the kick')
    // Past the flash, back on the LOUD bed: the beams stay where the kick sent
    // them -- this is what makes LOUD and KICK tiles differ in a still taken
    // long after the onset.
    for (let i = 0; i < 20; i++) { t += 0.05; drawWith(h, fx, t, loud()) }
    assert.ok(t - h.program._boothKickAt > mod.KICK_HOLD_S, 'test setup: past the flash')
    const after = canvas(h.term)
    const held = diffCount(before, after)
    assert.ok(held >= 30, `after the flash only ${held} cells differ from before the kick -- the step did not hold`)
  } finally { h.shutdown() }
})

test('DJ BOOTH: only a rising edge steps the chase -- a held pulse steps once', async () => {
  const { h, fx } = await bootBooth()
  try {
    let t = settle(h, fx, 1)
    const s0 = h.program._boothStep
    for (let i = 0; i < 60; i++) { t += 0.016; drawWith(h, fx, t, loud({ pulse: 1 })) }
    assert.equal(h.program._boothStep - s0, 1, 'a held pulse stepped more than once')
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

test('DJ BOOTH: MUTED is faint, not blank, and does not step', async () => {
  const { h, fx, mod } = await bootBooth()
  try {
    let t = settle(h, fx, 1)
    h.program.muted = true
    const s0 = h.program._boothStep
    for (let i = 0; i < 40; i++) { t += 0.05; h.program._au = i % 4 ? loud() : kick(); fx.draw(h.program, { term: h.term }, t) }
    assert.equal(h.program._boothStep, s0, 'a pulse edge stepped the rig while muted')
    // Not blank: the DJ, the decks and the panel are all still drawn, at a
    // tier the tube actually shows (NORMAL is attribute 0, so count non-space
    // cells drawn NORMAL), and the rig's beams are still there.
    let lit = 0, beams = 0, bright = 0
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < h.term.cols; x++) {
        const i = y * h.term.cols + x
        const ch = String.fromCodePoint(h.term.chars[i])
        if (ch !== ' ' && h.term.attrs[i] === 0) lit++
        if (y > mod.CAN_Y && y < mod.HEAD_Y && (ch === '/' || ch === '\\' || ch === '|')) beams++
        if (h.term.attrs[i] & BRIGHT) bright++
      }
    }
    assert.ok(lit >= 120, `muted, only ${lit} cells drawn at NORMAL -- MUTED has to read`)
    assert.ok(beams >= 6, 'muted, the lights are still on')
    assert.equal(bright, 0, 'nothing flashes while muted')
    for (let r = 0; r < 3; r++) assert.ok(!h.row(mod.DECK_Y1 - 1 - r).includes('■'), 'meters dark while muted')
  } finally { h.shutdown() }
})

test('DJ BOOTH: re-entry after a long visit carries no kick clock', async () => {
  const { h, fx } = await bootBooth()
  try {
    h.program._boothKickAt = 600
    h.program._boothLastT = 600
    h.program._boothPrevPulse = 1
    fx.reset(h.program)
    drawWith(h, fx, 0.5, loud())
    const s0 = h.program._boothStep
    drawWith(h, fx, 0.52, kick())
    assert.equal(h.program._boothKickAt, 0.52, 'the first kick after entry lands')
    assert.equal(h.program._boothStep, s0 + 1, 'and steps the rig')
  } finally { h.shutdown() }
})

test('DJ BOOTH: no shade blocks, and BRIGHT only on the kick and rare', async () => {
  const { h, fx } = await bootBooth()
  try {
    let t = 1, worstBright = 0, brightOffKick = 0
    for (let f = 0; f < 160; f++) {
      t += 0.05
      const k = f % 8 === 0
      drawWith(h, fx, t, k ? kick() : loud({ level: 0.95, bass: 0.95, bands9: new Array(9).fill(0.95) }))
      let bright = 0
      for (let y = 1; y < VIZ_BOT; y++) {
        for (let x = 0; x < h.term.cols; x++) {
          const i = y * h.term.cols + x
          assert.ok(!'░▒▓█'.includes(String.fromCodePoint(h.term.chars[i])), `shade block at ${x},${y}`)
          if (h.term.attrs[i] & BRIGHT) bright++
        }
      }
      worstBright = Math.max(worstBright, bright)
      if (t - h.program._boothKickAt > 0.3) brightOffKick += bright
    }
    assert.ok(worstBright <= 12, `${worstBright} BRIGHT cells in one frame`)
    assert.equal(brightOffKick, 0, 'BRIGHT between kicks')
  } finally { h.shutdown() }
})
