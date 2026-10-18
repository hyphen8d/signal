// BOOM BAP (HACKBACK, rebuilt 2026-10-16) -- what the effect leaves on the
// grid, read back off it: the canvas contract at three widths, that the
// boombox is there (case, two speakers, the deck, the EQ), that a kick pumps
// the cones OUT and they come back to rest, that only a rising edge is a kick,
// that it kicks with no tap at all (syntheticAudio), that mute stills it,
// that re-entry after a long visit carries no kick clock, and the tube caps
// ('█' and BRIGHT) every effect since UPRISING has had to keep.
//
// The frame loop rewrites p._au every frame (visualizer.js), so everything
// about the beat is driven by calling the effect's draw directly with a
// crafted signal.
//
// Run: node --test tests/visual-boombap.test.mjs

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

const signal = (over = {}) => ({
  level: 0.6, bass: 0.6, mid: 0.4, treble: 0.3,
  bands9: [0.7, 0.6, 0.5, 0.5, 0.4, 0.4, 0.3, 0.3, 0.2], onset: false, pulse: 0, ...over,
})

async function bootBox() {
  const h = await boot({ station: 'hackback' })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  assert.equal(h.program.activeVisualKey(), 'boombap', 'HACKBACK should land on BOOM BAP')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/boombap.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.boombap, mod }
}

function drawWith(h, fx, t, A, term = h.term) {
  h.program.muted = false
  h.program._au = A
  fx.draw(h.program, { term }, t)
}

/** Both speakers' cells (chars + attrs) as one string -- what the kick moves. */
function cones(h, mod, term = h.term) {
  const L = mod.boomLayout(term.cols)
  let s = ''
  for (const cx of [L.lcx, L.rcx]) {
    for (let y = mod.SPK_CY - mod.SPK_RY; y <= mod.SPK_CY + mod.SPK_RY; y++) {
      for (let x = Math.ceil(cx - L.rx + 1); x <= Math.floor(cx + L.rx - 1); x++) {
        const i = y * term.cols + x
        s += String.fromCodePoint(term.chars[i]) + term.attrs[i]
      }
    }
  }
  return s
}
const diffCount = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n }

/** Draws quiet frames until the kick clock and the springs have settled. */
function settle(h, fx, t0, A = signal()) {
  let t = t0
  for (let i = 0; i < 40; i++) { t += 0.05; drawWith(h, fx, t, A) }
  return t
}

test('BOOM BAP: paints the whole canvas and nothing outside it, at 60, 80 and 100 columns', async () => {
  const { h, fx } = await bootBox()
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
        try { drawWith(h, fx, 2 + f / 20, signal({ pulse: f % 6 === 0 ? 1 : 0 }), term) } finally { term.put = put }
        for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      }
      assert.deepEqual(outside.slice(0, 3), [], `${cols} cols: wrote outside the canvas`)
      assert.equal(missed, 0, `${cols} cols: ${missed} cell-frames left unpainted`)
    }
  } finally { h.shutdown() }
})

test('BOOM BAP: the boombox is there -- case, handle, two speakers, the deck, the EQ', async () => {
  const { h, fx, mod } = await bootBox()
  try {
    settle(h, fx, 1)
    const L = mod.boomLayout(h.term.cols)
    const at = (x, y) => h.row(y)[x]
    assert.equal(at(L.x0, mod.BODY_TOP), '╭', 'case top-left corner')
    assert.equal(at(L.x1, mod.BODY_TOP), '╮', 'case top-right corner')
    assert.equal(at(L.x0, mod.BODY_BOT), '╰', 'case bottom-left corner')
    assert.equal(at(L.x1, mod.BODY_BOT), '╯', 'case bottom-right corner')
    assert.ok(L.x1 - L.x0 >= 60, `the box fills the frame (${L.x1 - L.x0 + 1} cols)`)
    assert.match(h.row(mod.HANDLE_Y), /╭─+╮/, 'the handle arches over the case')
    for (const cx of [L.lcx, L.rcx]) {
      // Each speaker: its frame at both ends of its middle row, the dust cap
      // dead centre, the frame's top and bottom arcs.
      assert.equal(at(Math.round(cx - L.rx), mod.SPK_CY), '│', `speaker frame, left side (cx ${cx})`)
      assert.equal(at(Math.round(cx + L.rx), mod.SPK_CY), '│', `speaker frame, right side (cx ${cx})`)
      assert.ok(h.row(mod.SPK_CY).slice(Math.floor(cx) - 1, Math.ceil(cx) + 2).includes('●'), 'a dust cap at the centre')
      assert.equal(at(Math.round(cx), mod.SPK_CY - mod.SPK_RY), '─', 'the frame closes over the top')
      assert.equal(at(Math.round(cx), mod.SPK_CY + mod.SPK_RY), '─', 'and under the bottom')
    }
    assert.ok(h.find('C-90') >= 0, 'a cassette in the deck')
    let bars = 0
    for (let x = 0; x < h.term.cols; x++) if (h.row(mod.EQ_Y0 + mod.EQ_ROWS - 1)[x] === '■') bars++
    assert.equal(bars, 9, 'nine EQ bars lit from the bottom')
  } finally { h.shutdown() }
})

test('BOOM BAP: a kick pumps the cones OUT, and they come back to rest', async () => {
  const { h, fx, mod } = await bootBox()
  try {
    let t = settle(h, fx, 1)
    const rest = cones(h, mod)
    t += 0.016; drawWith(h, fx, t, signal({ pulse: 1 }))
    const out = cones(h, mod)
    const moved = diffCount(rest, out)
    assert.ok(moved >= 30, `the kick moved only ${moved / 2 | 0} cone cells -- it has to be the thing you see`)
    const L = mod.boomLayout(h.term.cols)
    const cap = Math.round(L.lcx)
    const capRow = h.row(mod.SPK_CY)
    const capX = capRow.indexOf('●', cap - 2)
    assert.ok(capX >= 0 && h.term.attrs[mod.SPK_CY * h.term.cols + capX] & BRIGHT, 'the dust cap lights on the kick')
    // Held, then released: past KICK_HOLD_S with the pulse fallen, the cones
    // are exactly where they started.
    for (let i = 0; i < 12; i++) { t += 0.016; drawWith(h, fx, t, signal({ pulse: Math.max(0, 1 - i * 0.1) })) }
    assert.ok(t - h.program._boomKickAt > mod.KICK_HOLD_S, 'test setup: past the hold')
    assert.equal(diffCount(rest, cones(h, mod)), 0, 'the cones came back to rest')
  } finally { h.shutdown() }
})

test('BOOM BAP: only a rising edge is a kick -- a pulse held high pumps once', async () => {
  const { h, fx, mod } = await bootBox()
  try {
    let t = settle(h, fx, 1)
    const rest = cones(h, mod)
    let kicks = 0, last = h.program._boomKickAt
    for (let i = 0; i < 60; i++) {
      t += 0.016
      drawWith(h, fx, t, signal({ pulse: 1 }))
      if (h.program._boomKickAt !== last) { kicks++; last = h.program._boomKickAt }
    }
    assert.equal(kicks, 1, `a held pulse fired ${kicks} kicks`)
    assert.equal(diffCount(rest, cones(h, mod)), 0, 'and the cones are back at rest while it is held')
  } finally { h.shutdown() }
})

test('BOOM BAP: with no tap it still kicks, on syntheticAudio', async () => {
  // The old BOOM BAP read p._au raw: without LINE IN a visitor got a fixed
  // heartbeat ring, unrelated to anything. Driven through the real frame
  // loop here, where p._au is null with no tap.
  const { h } = await boot({ station: 'hackback' }).then(async (h) => { h.powerOn(); h.key('v'); if (h.program.tapConsentOpen) h.key('n'); return { h } })
  try {
    assert.equal(h.program._au, null, 'test setup: no tap')
    const seen = new Set()
    for (let i = 0; i < 200; i++) { h.advance(16); seen.add(h.program._boomKickAt) }
    assert.ok(seen.size >= 3, `only ${seen.size - 1} kicks in 3.2s without a tap`)
  } finally { h.shutdown() }
})

test('BOOM BAP: muted, the cones are still and the EQ is dark', async () => {
  const { h, fx, mod } = await bootBox()
  try {
    let t = settle(h, fx, 1)
    h.program.muted = true
    h.program._au = signal({ pulse: 1 })
    for (let i = 0; i < 40; i++) { t += 0.05; fx.draw(h.program, { term: h.term }, t) }
    const before = cones(h, mod)
    h.program._au = signal({ pulse: 0 }); t += 0.016; fx.draw(h.program, { term: h.term }, t)
    h.program._au = signal({ pulse: 1 }); t += 0.016; fx.draw(h.program, { term: h.term }, t)
    assert.equal(diffCount(before, cones(h, mod)), 0, 'a pulse edge moved the cones while muted')
    for (let r = 0; r < mod.EQ_ROWS; r++) assert.ok(!h.row(mod.EQ_Y0 + r).includes('■'), `EQ row ${r} still lit while muted`)
  } finally { h.shutdown() }
})

test('BOOM BAP: re-entry after a long visit carries no kick clock', async () => {
  // _boomKickAt is an absolute effect-clock value: left minutes in the future
  // of the restarted clock, the rate limit would refuse every kick until the
  // clock caught up -- cones frozen for as long as the last visit was.
  const { h, fx, mod } = await bootBox()
  try {
    h.program._boomKickAt = 600
    h.program._boomLastT = 600
    h.program._boomPrevPulse = 1
    fx.reset(h.program)
    drawWith(h, fx, 0.5, signal({ pulse: 0 }))
    const rest = cones(h, mod)
    drawWith(h, fx, 0.52, signal({ pulse: 1 }))
    assert.equal(h.program._boomKickAt, 0.52, 'the first kick after entry lands')
    assert.ok(diffCount(rest, cones(h, mod)) > 0, 'and pumps the cones')
  } finally { h.shutdown() }
})

test('BOOM BAP: full blocks stay accents and BRIGHT stays rare (tube bloom)', async () => {
  const { h, fx } = await bootBox()
  try {
    const cells = h.term.cols * (VIZ_BOT - 1)
    let worstBlock = 0, worstBright = 0, t = 1
    for (let f = 0; f < 120; f++) {
      t += 0.05
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
    assert.ok(worstBlock <= cells * 0.01, `${worstBlock} '█' in one frame`)
    assert.ok(worstBright <= 20, `${worstBright} BRIGHT cells in one frame at full level on a kick`)
  } finally { h.shutdown() }
})

test('BOOM BAP: the speakers outrank the box -- MUTED cones at rest, BRIGHT only on the dust cap', async () => {
  // 2026-10-16 (design pass): everything sat at one DIM tier and the
  // brightest things on screen were the dial's digits and the EQ's LEDs.
  // Mutation-checked: restoring the level-keyed rest tier (FAINT on a quiet
  // passage) goes red on the ridge assertion; restoring the BRIGHT EQ peak
  // goes red on the BRIGHT one.
  const { h, fx, mod } = await bootBox()
  try {
    const MUTED = 32, FAINT = 64
    const L = mod.boomLayout(h.term.cols)
    // A quiet passage, settled: the cone's ridges are MUTED anyway.
    const quiet = signal({ level: 0.1, bass: 0.1, bands9: new Array(9).fill(0.9) })
    let t = settle(h, fx, 1, quiet)
    let ridges = 0
    for (let x = Math.ceil(L.lcx - L.rx + 1); x < Math.floor(L.lcx - 1); x++) {
      if (h.row(mod.SPK_CY)[x] === '│') {
        ridges++
        assert.equal(h.term.attrs[mod.SPK_CY * h.term.cols + x], MUTED, `the cone ridge at ${x} is not MUTED at rest`)
      }
    }
    assert.ok(ridges >= 2, `test setup: found ${ridges} ridge cells on the speaker's middle row`)
    // Full EQ, kick: BRIGHT lands on the dust caps and nowhere else.
    const hot = signal({ pulse: 1, bands9: new Array(9).fill(1), level: 1 })
    t += 0.016; drawWith(h, fx, t, signal({ pulse: 0, bands9: new Array(9).fill(1), level: 1 }))
    t += 0.016; drawWith(h, fx, t, hot)
    let caps = 0
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) {
      if (h.term.attrs[y * h.term.cols + x] & BRIGHT) { caps++; assert.equal(h.row(y)[x], '●', `BRIGHT '${h.row(y)[x]}' at ${x},${y}`) }
    }
    assert.ok(caps >= 2, `test setup: the kick lit ${caps} dust-cap cells`)
    // The wall and the paving: FAINT dotted rules, never a solid line.
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < h.term.cols; x++) {
        if (y >= mod.HANDLE_Y && y <= mod.FEET_Y && x >= L.x0 - 1 && x <= L.x1 + 1) continue
        const c = h.row(y)[x]
        if (c === ' ') continue
        assert.ok('┈┊.'.includes(c), `a solid '${c}' in the background at ${x},${y}`)
        assert.equal(h.term.attrs[y * h.term.cols + x], FAINT, `background '${c}' at ${x},${y} is not FAINT`)
      }
    }
    // And the handle's arch is clear of the wall.
    const hx0 = Math.round(L.mid - 15), hx1 = Math.round(L.mid + 15)
    assert.equal(h.row(mod.HANDLE_Y + 1).slice(hx0 + 1, hx1).trim(), '', 'a wall joint under the handle')
  } finally { h.shutdown() }
})
