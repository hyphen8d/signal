// BREACH (CIPHER, design pass 2026-10-16) -- what the effect leaves on the
// grid, read back off it: the canvas contract at three widths, that the
// subject is there (a login box, its rows, its bar), that the rain is
// streams with a BRIGHT head and a NORMAL neck over a mostly black screen,
// that a kick is visible in the box -- and that steady loud audio is not a
// kick -- that mute is faint (no BRIGHT anywhere) but never blank, that a
// resolved word never lands on the box, and that re-entry starts a fresh
// attempt. (tests/visuals.test.mjs holds the older H4/M5 word contract.)
//
// The frame loop rewrites p._au every frame (visualizer.js), so the beat is
// driven by calling the effect's draw directly with a crafted signal, the way
// tests/visual-frost.test.mjs does.
//
// Run: node --test tests/visual-breach.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { boot } from './harness.mjs'
import { parseBDF } from '../src/bdf.js'
import { Term } from '../src/term.js'

const VIZ_BOT = 22
// Attribute bits, src/cellgrid.js.
const BRIGHT = 1, NORMAL = 0

const signal = (over = {}) => ({
  level: 0.6, bass: 0.4, mid: 0.4, treble: 0.3,
  bands9: new Array(9).fill(0.4), onset: false, pulse: 0.15, ...over,
})

async function bootBreach() {
  const h = await boot({ station: 'cipher' })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  h.advance(300)
  assert.equal(h.program.activeVisualKey(), 'breach', 'CIPHER should land on BREACH')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/breach.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.breach, mod }
}

function drawWith(h, fx, t, A, term = h.term) {
  h.program.muted = false
  h.program._au = A
  fx.draw(h.program, { term }, t)
}
const attrAt = (h, x, y) => h.term.attrs[y * h.term.cols + x]
const inBox = (box, x, y) => x >= box.x - 1 && x <= box.x + box.w && y >= box.y - 1 && y <= box.y + box.h

test('BREACH: repaints every canvas cell and nothing outside rows 1..21, at 60, 80 and 100 columns', async () => {
  const { h, fx } = await bootBreach()
  const font = parseBDF(readFileSync(new URL('../fonts/ter-u16n.bdf', import.meta.url), 'utf8'))
  try {
    for (const cols of [60, 80, 100]) {
      const term = new Term(font, cols, 25, 6, 5)
      fx.init(h.program, term)
      fx.reset(h.program)
      const put = term.put
      const hit = new Uint8Array(cols * VIZ_BOT)
      const outside = []
      term.put = function (x, y, ...rest) {
        if (y < 1 || y >= VIZ_BOT || x < 0 || x >= cols) outside.push(`${x},${y}`)
        else hit[y * cols + x] = 1
        return put.call(this, x, y, ...rest)
      }
      drawWith(h, fx, 1, signal(), term)
      drawWith(h, fx, 1.02, signal({ onset: true, pulse: 1 }), term)
      term.put = put
      assert.deepEqual(outside.slice(0, 5), [], `${cols} cols: ${outside.length} puts landed outside the canvas`)
      let missed = 0
      for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      assert.equal(missed, 0, `${cols} cols: ${missed} canvas cells unpainted`)
    }
  } finally { h.shutdown() }
})

test('BREACH: the subject is on the grid -- a login box with its rows and its bar', async () => {
  const { h, fx, mod } = await bootBreach()
  try {
    fx.reset(h.program)
    drawWith(h, fx, 1, signal())
    const b = mod.boxRect(h.term.cols)
    const top = h.row(b.y).slice(b.x, b.x + b.w)
    const bot = h.row(b.y + b.h - 1).slice(b.x, b.x + b.w)
    assert.match(top, /^┌─ REMOTE SHELL ─+CIPHER─+┐$/, `top border: ${JSON.stringify(top)}`)
    assert.match(bot, /^└─+┘$/, `bottom border: ${JSON.stringify(bot)}`)
    assert.ok(h.row(b.y + mod.ROW_USER).includes('USER   root'), 'no USER row')
    assert.ok(h.row(b.y + mod.ROW_KEY).includes('KEY'), 'no KEY row')
    assert.match(h.row(b.y + mod.ROW_BAR), /\[[█·]+\]\s+\d+%/, 'no progress bar')
    assert.ok(h.row(b.y + mod.ROW_STATUS).includes('DECRYPTING'), 'no status line')
    // Its black margin: no rain touches the frame.
    for (let x = b.x - 1; x <= b.x + b.w; x++) {
      assert.equal(h.row(b.y - 1)[x], ' ', `rain on the margin above the box at ${x}`)
      assert.equal(h.row(b.y + b.h)[x], ' ', `rain on the margin below the box at ${x}`)
    }
  } finally { h.shutdown() }
})

test('BREACH: the rain is streams -- BRIGHT head, NORMAL neck -- over a mostly black screen', async () => {
  const { h, fx, mod } = await bootBreach()
  try {
    fx.reset(h.program)
    const b = mod.boxRect(h.term.cols)
    let checked = 0, black = 0, cells = 0
    for (let f = 0; f < 120; f++) {
      // No words this run: they are drawn last and would hide the stream.
      for (const c of h.program._breachCols) { c.word = null; c.resolveAt = 1e9 }
      drawWith(h, fx, 1 + f * 0.05, signal())
      h.program._breachCols.forEach((c, x) => {
        const hr = Math.floor(c.head)
        if (hr < 3 || hr >= VIZ_BOT || x >= h.term.cols) return
        if (inBox(b, x, hr) || inBox(b, x, hr - 1) || inBox(b, x, hr - 2)) return
        assert.equal(attrAt(h, x, hr), BRIGHT, `column ${x}: head not BRIGHT`)
        assert.equal(attrAt(h, x, hr - 1), NORMAL, `column ${x}: neck not NORMAL`)
        assert.ok(/[0-9A-F]/.test(h.row(hr)[x]), `column ${x}: head is not a hex digit`)
        checked++
      })
      for (let y = 1; y < VIZ_BOT; y++) {
        for (let x = 0; x < h.term.cols; x++) {
          if (inBox(b, x, y)) continue
          cells++
          if (h.row(y)[x] === ' ') black++
        }
      }
    }
    assert.ok(checked > 200, `too few streams on screen to judge (${checked})`)
    assert.ok(black / cells >= 0.4, `only ${(100 * black / cells).toFixed(0)}% of the rain field is black (want >= 40%)`)
  } finally { h.shutdown() }
})

test('BREACH: a kick flips the frame and jumps the bar; steady loud audio does neither', async () => {
  const { h, fx, mod } = await bootBreach()
  try {
    fx.reset(h.program)
    const b = mod.boxRect(h.term.cols)
    const corner = () => h.row(b.y)[b.x]
    let t = 1
    // Steady loud: two seconds of it, no onset, a flat pulse.
    for (let i = 0; i < 120; i++) drawWith(h, fx, (t += 1 / 60), signal({ level: 0.7, pulse: 0.15 }))
    assert.equal(corner(), '┌', 'steady loud audio flipped the frame')
    const before = h.program._breachProg
    assert.ok(before < mod.KICK_STEP, `steady audio moved the bar by ${before.toFixed(3)} in 2s -- that is a beat, not a creep`)
    // The kick.
    drawWith(h, fx, (t += 1 / 60), signal({ level: 0.95, onset: true, pulse: 1 }))
    assert.equal(corner(), '╔', 'a kick did not flip the frame to double-line')
    assert.equal(attrAt(h, b.x, b.y), BRIGHT, 'a kick did not light the frame')
    assert.ok(h.row(b.y + mod.ROW_STATUS).includes('KEY ACCEPTED'), 'a kick did not say KEY ACCEPTED')
    assert.ok(h.program._breachProg - before >= mod.KICK_STEP - 1e-9, 'a kick did not jump the bar')
    // A held onset is ONE kick, not one per frame.
    const after = h.program._breachProg
    for (let i = 0; i < 5; i++) drawWith(h, fx, (t += 1 / 60), signal({ level: 0.95, onset: true, pulse: 1 }))
    assert.ok(h.program._breachProg - after < mod.KICK_STEP / 2, 'a held onset kicked more than once')
    // And it lets go.
    for (let i = 0; i < 40; i++) drawWith(h, fx, (t += 1 / 60), signal({ level: 0.7, pulse: 0.15 }))
    assert.equal(corner(), '┌', 'the frame never settled after the kick')
  } finally { h.shutdown() }
})

test('BREACH: a full bar is ACCESS GRANTED for a beat, then a fresh attempt', async () => {
  const { h, fx, mod } = await bootBreach()
  try {
    fx.reset(h.program)
    const b = mod.boxRect(h.term.cols)
    h.program._breachProg = 0.99
    let t = 1
    drawWith(h, fx, t, signal({ onset: true, pulse: 1 }))
    assert.ok(h.row(b.y + mod.ROW_STATUS).includes('ACCESS GRANTED'), 'a full bar did not grant access')
    assert.ok(h.row(b.y + mod.ROW_BAR).includes('100%'), 'a full bar does not read 100%')
    for (let i = 0; i < Math.ceil(mod.GRANTED_HOLD * 60) + 10; i++) drawWith(h, fx, (t += 1 / 60), signal({ pulse: 0.15 }))
    assert.ok(h.row(b.y + mod.ROW_STATUS).includes('DECRYPTING'), 'never went back to decrypting')
    assert.ok(h.program._breachProg < 0.05, 'the bar did not reset')
  } finally { h.shutdown() }
})

test('BREACH: muted is faint -- nothing BRIGHT, the bar frozen -- but never blank', async () => {
  const { h, fx, mod } = await bootBreach()
  try {
    fx.reset(h.program)
    h.program._breachProg = 0.4
    const b = mod.boxRect(h.term.cols)
    h.program.muted = true
    let lit = 0, bright = 0
    for (let f = 0; f < 60; f++) {
      fx.draw(h.program, { term: h.term }, 1 + f / 60)
      for (let y = 1; y < VIZ_BOT; y++) {
        for (let x = 0; x < h.term.cols; x++) {
          if (h.row(y)[x] !== ' ') lit++
          if (h.row(y)[x] !== ' ' && (attrAt(h, x, y) & BRIGHT) && !(attrAt(h, x, y) & 4)) bright++
        }
      }
    }
    assert.equal(bright, 0, `${bright} BRIGHT cells while muted`)
    assert.ok(lit / 60 > 200, `muted is near-blank (${(lit / 60).toFixed(0)} lit cells a frame)`)
    assert.equal(h.program._breachProg, 0.4, 'the bar moved while muted')
    assert.ok(h.row(b.y + mod.ROW_STATUS).includes('NO CARRIER'), 'muted status is not NO CARRIER')
  } finally { h.shutdown() }
})

test('BREACH: a resolved word never lands on the box or its margin', async () => {
  const { h, mod } = await bootBreach()
  try {
    const b = mod.boxRect(h.term.cols)
    let words = 0
    for (let i = 0; i < 300; i++) {
      h.advance(50)
      h.program._breachCols.forEach((c, x) => {
        if (!c.word) return
        words++
        for (let k = 0; k < c.word.length; k++) {
          assert.ok(!inBox(b, x + k, c.wordRow), `${c.word} at ${x},${c.wordRow} lands on the box`)
        }
      })
    }
    assert.ok(words > 30, `too few words to judge (${words})`)
  } finally { h.shutdown() }
})

test('BREACH: re-entry starts a fresh attempt (no carried progress, kick or grant)', async () => {
  const { h, fx } = await bootBreach()
  try {
    h.program._breachProg = 0.8
    h.program._breachKick = 0.3
    h.program._breachGranted = 1
    fx.reset(h.program)
    assert.equal(h.program._breachProg, 0)
    assert.equal(h.program._breachKick, 0)
    assert.equal(h.program._breachGranted, 0)
    assert.deepEqual(h.program._breachKeys, [null, null, null])
  } finally { h.shutdown() }
})
