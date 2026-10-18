// DREAD (NIN, the secret station; redrawn 2026-10-16) -- what the effect
// leaves on the grid, read back off it: the canvas contract at three widths;
// that the press line is there (gantry, five presses, anvils) and no '█' slab
// survives; that a KICK frame is unmistakably different from a LOUD one (the
// centre ram on the bed, its teeth BRIGHT); that only a rising edge slams;
// that it slams with no tap at all (syntheticAudio); that MUTED is faint but
// not blank, and still; that re-entry carries no slam clock; that a tear is a
// sideways slip, short-lived; and the tube caps.
//
// The frame loop rewrites p._au every frame (visualizer.js), so everything
// about the beat is driven by calling the effect's draw directly with a
// crafted signal. Tears roll Math.random; tests that need two frames to be
// comparable pin it high, which no tear trigger can pass.
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

/** The canvas (rows 1..VIZ_BOT-1), chars + attrs, one string. */
function canvas(term, y0 = 1) {
  let s = ''
  for (let y = y0; y < VIZ_BOT; y++) {
    for (let x = 0; x < term.cols; x++) {
      const i = y * term.cols + x
      s += String.fromCharCode(term.chars[i]) + String.fromCharCode(48 + term.attrs[i])
    }
  }
  return s
}
const diffCells = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 2) if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) n++; return n }

function settle(h, fx, t0, A = signal()) {
  let t = t0
  for (let i = 0; i < 40; i++) { t += 0.05; drawWith(h, fx, t, A) }
  return t
}

test('DREAD: paints the whole canvas and nothing outside it, at 60, 80 and 100 columns', async () => {
  const { h, fx } = await bootDread()
  try {
    const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
    for (const cols of [60, 80, 100]) {
      const term = new Term(font, cols, 25, 6, 5)
      fx.reset(h.program)
      const put = term.put
      const outside = []
      let missed = 0
      for (let f = 0; f < 30; f++) {
        const hit = new Uint8Array(cols * VIZ_BOT)
        term.put = function (x, y, ...rest) {
          if (y < 1 || y >= VIZ_BOT || x < 0 || x >= cols) outside.push([x, y])
          else hit[y * cols + x] = 1
          return put.call(this, x, y, ...rest)
        }
        try { drawWith(h, fx, 2 + f / 20, signal({ pulse: f % 6 === 0 ? 1 : 0 }), term) } finally { term.put = put }
        for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      }
      assert.deepEqual(outside.slice(0, 3), [], `${cols} cols: wrote outside the canvas`)
      assert.equal(missed, 0, `${cols} cols: ${missed} cell-frames left unpainted`)
    }
  } finally { h.shutdown() }
})

test('DREAD: the press line is there -- gantry, five presses, the plate, the anvils', async () => {
  const { h, fx, mod } = await bootDread()
  try {
    noTears(() => settle(h, fx, 1))
    const L = mod.dreadLayout(h.term.cols)
    const at = (x, y) => h.row(y)[x]
    assert.equal(at(L.mx0, mod.GANTRY_Y0), '╔', 'gantry top-left')
    assert.equal(at(L.mx1, mod.GANTRY_Y0), '╗', 'gantry top-right')
    assert.equal((h.row(mod.HOUSING_Y0).match(/┌/g) || []).length, 5, 'five cylinder housings')
    assert.ok(h.find('200 TON') >= 0, 'the centre press carries its rating')
    for (const P of L.presses) {
      // Every ram head is an outline with a dark interior.
      let top = -1
      for (let y = mod.RAM_UP; y <= mod.RAM_DOWN; y++) if (at(P.x0, y) === '╔') { top = y; break }
      assert.ok(top >= 0, `a ram head under the press at col ${P.x0}`)
      assert.equal(at(P.x0 + P.w - 1, top + 2), '╝', 'its outline closes')
      assert.equal(h.row(top + 1).slice(P.x0 + 2, P.x0 + P.w - 2).trim(), '', 'its interior is dark')
    }
    assert.match(h.row(mod.BED_Y), /━{40,}/, 'the die plate')
    assert.ok(h.row(mod.ANVIL_Y0).includes('▓'), 'the anvils')
  } finally { h.shutdown() }
})

test('DREAD: KICK differs from LOUD at a glance -- the centre ram is on the bed, its teeth BRIGHT', async () => {
  const { h, fx, mod } = await bootDread()
  try {
    noTears(() => {
      let t = settle(h, fx, 1)
      const loud = canvas(h.term)
      const loudMachine = canvas(h.term, 2)  // the lamp on row 1 blinks on its own
      const L = mod.dreadLayout(h.term.cols)
      const C = L.center
      // LOUD: nothing reaches the bed; the row above the plate is empty
      // under every press.
      assert.equal(h.row(mod.BED_Y - 1).slice(L.mx0, L.mx1 + 1).trim(), '', 'between beats nothing touches the bed')
      t += 0.016; drawWith(h, fx, t, signal({ pulse: 1, onset: true, bass: 1, level: 0.95 }))
      const kick = canvas(h.term)
      const moved = diffCells(loud, kick)
      assert.ok(moved >= 60, `the kick changed only ${moved} cells -- it has to be the thing you see`)
      const teeth = h.row(mod.BED_Y - 1).slice(C.x0, C.x0 + C.w)
      assert.ok(teeth.includes('▼'), `the centre ram's teeth are on the bed (${JSON.stringify(teeth)})`)
      const i = (mod.BED_Y - 1) * h.term.cols + C.x0 + 1
      assert.ok(h.term.attrs[i] & BRIGHT, 'and lit BRIGHT')
      // Held, then hauled back: past the hold and the retract, the frame is LOUD's again.
      for (let n = 0; n < 40; n++) { t += 0.016; drawWith(h, fx, t, signal()) }
      assert.ok(t - h.program._dreadKickAt > mod.SLAM_HOLD_S + mod.RETRACT_S, 'test setup: past the retract')
      assert.equal(diffCells(loudMachine, canvas(h.term, 2)), 0, 'the ram went back up')
    })
  } finally { h.shutdown() }
})

test('DREAD: only a rising edge is a kick -- a pulse held high slams once', async () => {
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
      assert.equal(kicks, 1, `a held pulse fired ${kicks} slams`)
    })
  } finally { h.shutdown() }
})

test('DREAD: with no tap it still slams, on syntheticAudio', async () => {
  // The old DREAD read p._au raw: with no LINE IN the panel grid churned at
  // a fixed rate and nothing ever answered a beat. Driven through the real
  // frame loop here, where p._au is null with no tap.
  const h = await boot({ station: 'nin' })
  try {
    h.powerOn(); h.key('v'); if (h.program.tapConsentOpen) h.key('n')
    assert.equal(h.program.activeVisualKey(), 'dread')
    assert.equal(h.program._au, null, 'test setup: no tap')
    const seen = new Set()
    for (let i = 0; i < 200; i++) { h.advance(16); seen.add(h.program._dreadKickAt) }
    assert.ok(seen.size >= 3, `only ${seen.size - 1} slams in 3.2s without a tap`)
  } finally { h.shutdown() }
})

test('DREAD: MUTED is faint, not blank -- the machine stays drawn, still, and nothing slams', async () => {
  const { h, fx, mod } = await bootDread()
  try {
    let t = noTears(() => settle(h, fx, 1))
    h.program.muted = true
    h.program._au = signal({ pulse: 1 })
    for (let i = 0; i < 40; i++) { t += 0.05; fx.draw(h.program, { term: h.term }, t) }
    const before = canvas(h.term)
    let lit = 0, bright = 0
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < h.term.cols; x++) {
        const i = y * h.term.cols + x
        if (h.term.chars[i] !== 32) lit++
        if (h.term.attrs[i] & BRIGHT) bright++
      }
    }
    assert.ok(lit >= 300, `muted, only ${lit} cells drawn -- the machine must stay on screen`)
    assert.equal(bright, 0, 'nothing BRIGHT while muted')
    assert.ok(h.find('200 TON') >= 0, 'the presses are still there')
    // Pulse edges and a long stretch of time: no slam, no tear, no motion
    // beyond the (unlit) lamp.
    for (let i = 0; i < 200; i++) {
      h.program._au = signal({ pulse: i & 1 ? 1 : 0, onset: !!(i & 1) })
      t += 0.05
      fx.draw(h.program, { term: h.term }, t)
    }
    assert.equal(diffCells(before, canvas(h.term)), 0, 'the muted picture moved')
    assert.equal(h.program._dreadTear.active, false, 'no tear while muted')
    const L = mod.dreadLayout(h.term.cols)
    assert.equal(h.row(mod.BED_Y - 1).slice(L.mx0, L.mx1 + 1).trim(), '', 'no ram on the bed')
  } finally { h.shutdown() }
})

test('DREAD: re-entry after a long visit carries no slam clock', async () => {
  // _dreadKickAt is an absolute effect-clock value: left minutes ahead of the
  // restarted clock, the ram would sit on the bed and refuse every kick.
  const { h, fx } = await bootDread()
  try {
    h.program._dreadKickAt = 600
    h.program._dreadLastT = 600
    h.program._dreadPrevPulse = 1
    fx.reset(h.program)
    noTears(() => {
      drawWith(h, fx, 0.5, signal({ pulse: 0 }))
      drawWith(h, fx, 0.52, signal({ pulse: 1 }))
    })
    assert.equal(h.program._dreadKickAt, 0.52, 'the first kick after entry lands')
  } finally { h.shutdown() }
})

test('DREAD: a tear slips one row sideways and lets go within TEAR_MAX_S', async () => {
  const { h, fx, mod } = await bootDread()
  try {
    let t = noTears(() => settle(h, fx, 1))
    const row = mod.HOUSING_Y0 + 1
    const clean = h.row(row)
    const tear = h.program._dreadTear
    // Force one the shape the draw writes it in, then draw.
    Object.assign(tear, { active: true, row, shift: 5, until: t + 0.1 })
    noTears(() => { t += 0.016; drawWith(h, fx, t, signal()) })
    const torn = h.row(row)
    assert.equal(torn.slice(5, 80), clean.slice(0, 75), 'the row is the same picture, slipped 5 cells')
    assert.notEqual(torn.slice(0, 5).trim(), '', 'with junk in the gap it left')
    // Natural tears: never longer than TEAR_MAX_S.
    let started = null, longest = 0
    for (let i = 0; i < 3000; i++) {
      t += 0.016
      drawWith(h, fx, t, signal({ pulse: i % 30 === 0 ? 1 : 0.1 }))
      if (tear.active && started == null) started = t
      if (!tear.active && started != null) { longest = Math.max(longest, t - started); started = null }
    }
    assert.ok(longest > 0, 'tears happen while playing')
    assert.ok(longest <= mod.TEAR_MAX_S + 0.02, `a tear held ${longest.toFixed(2)}s`)
  } finally { h.shutdown() }
})

test('DREAD: no full blocks, and BRIGHT stays rare (tube bloom under the red tint)', async () => {
  const { h, fx } = await bootDread()
  try {
    let worstBlock = 0, worstBright = 0, t = 1
    for (let f = 0; f < 200; f++) {
      t += 0.03
      drawWith(h, fx, t, signal({ pulse: f % 8 === 0 ? 1 : 0, level: 0.95, bass: 0.95, bands9: new Array(9).fill(0.95) }))
      let block = 0, bright = 0
      for (let y = 1; y < VIZ_BOT; y++) {
        for (let x = 0; x < h.term.cols; x++) {
          const i = y * h.term.cols + x
          if (h.term.chars[i] === 0x2588) block++
          if (h.term.attrs[i] & BRIGHT) bright++
        }
      }
      worstBlock = Math.max(worstBlock, block)
      worstBright = Math.max(worstBright, bright)
    }
    assert.equal(worstBlock, 0, `${worstBlock} '█' in one frame`)
    assert.ok(worstBright <= 20, `${worstBright} BRIGHT cells in one frame at full level on a kick`)
  } finally { h.shutdown() }
})
