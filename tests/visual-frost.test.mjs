// FROST (COLD WAVE, rebuilt 2026-10-16 as a neon heart) -- what the effect
// leaves on the grid, read back off it: the canvas contract at three widths,
// that the subject is actually there (the heart's outline, its point, the
// word inside it, the reflection under the curb), that a kick STRIKES the
// tube -- and that nothing does when there is no rising edge -- that the
// strike stays inside the BRIGHT budget, that mute settles it cold, and that
// re-entry carries no strike clock from the last visit.
//
// The frame loop rewrites p._au every frame (visualizer.js), so the beat is
// driven by calling the effect's draw directly with a crafted signal, the way
// tests/visual-dancefloor.test.mjs does.
//
// Run: node --test tests/visual-frost.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { boot } from './harness.mjs'
import { parseBDF } from '../src/bdf.js'
import { Term } from '../src/term.js'

const VIZ_BOT = 22
// Attribute bits, src/cellgrid.js.
const BRIGHT = 1, DIM = 4, MUTED = 32, FAINT = 64
const NORMAL = 0
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000

const signal = (over = {}) => ({
  level: 0.6, bass: 0.4, mid: 0.4, treble: 0.3,
  bands9: new Array(9).fill(0.4), onset: false, pulse: 0, ...over,
})

async function bootFrost() {
  const h = await boot({ station: 'cold-wave' })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  h.advance(300)
  assert.equal(h.program.activeVisualKey(), 'frost', 'COLD WAVE should land on FROST')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/frost.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.frost, mod }
}

function drawWith(h, fx, t, A) {
  h.program.muted = false
  h.program._au = A
  fx.draw(h.program, { term: h.term }, t)
}

/** Grid coordinates of every tube cell, read from the module's own art and
 *  placed the way draw() places it (centred on the term's width). */
function tubeCells(h, mod) {
  const x0 = Math.round(h.term.cols / 2 - mod.HEART_W / 2)
  const out = []
  mod.HEART.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== ' ') out.push({ x: x0 + c, y: mod.HEART_Y0 + r, ch }) }))
  return out
}
const attrAt = (h, x, y) => h.term.attrs[y * h.term.cols + x]
const lit = (a) => a === NORMAL || (a & BRIGHT)

test('FROST: repaints every canvas cell and nothing outside rows 1..21, at 60, 80 and 100 columns', async () => {
  const { h, fx } = await bootFrost()
  const font = parseBDF(readFileSync(new URL('../fonts/ter-u16n.bdf', import.meta.url), 'utf8'))
  try {
    for (const cols of [60, 80, 100]) {
      const term = new Term(font, cols, 25, 6, 5)
      const put = term.put
      const hit = new Uint8Array(cols * VIZ_BOT)
      const outside = []
      term.put = function (x, y, ...rest) {
        if (y < 1 || y >= VIZ_BOT) outside.push(`${x},${y}`)
        else if (x >= 0 && x < cols) hit[y * cols + x] = 1
        else outside.push(`${x},${y}`)
        return put.call(this, x, y, ...rest)
      }
      h.program.muted = false
      fx.reset(h.program)
      // A strike in progress too, so the halo and the front are in scope.
      h.program._au = signal({ pulse: 0 }); fx.draw(h.program, { term }, 5)
      h.program._au = signal({ pulse: 1, level: 1 }); fx.draw(h.program, { term }, 5.02)
      term.put = put
      assert.deepEqual(outside.slice(0, 5), [], `${cols} cols: ${outside.length} puts landed outside the canvas`)
      let missed = 0
      for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      assert.equal(missed, 0, `${cols} cols: ${missed} canvas cells unpainted`)
    }
  } finally { h.shutdown() }
})

test('FROST: the subject is on the grid -- a heart, its point, the word, the reflection', async () => {
  const { h, fx, mod } = await bootFrost()
  try {
    drawWith(h, fx, 10, signal())
    const cells = tubeCells(h, mod)
    const wrong = cells.filter(({ x, y, ch }) => h.row(y)[x] !== ch)
    assert.equal(wrong.length, 0, `${wrong.length} tube cells are not the heart's outline`)
    // Symmetric: each art row's outline is centred on the heart's axis.
    const cx = Math.round(h.term.cols / 2 - mod.HEART_W / 2) + (mod.HEART_W - 1) / 2
    for (let r = 0; r < mod.HEART_H; r++) {
      const xs = cells.filter((c) => c.y === mod.HEART_Y0 + r).map((c) => c.x)
      assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - cx) <= 0.5, `heart row ${r} is off-centre`)
    }
    // Widest at the lobes, narrowing to a point: the last row is the narrowest.
    const width = (r) => { const xs = cells.filter((c) => c.y === mod.HEART_Y0 + r).map((c) => c.x); return Math.max(...xs) - Math.min(...xs) }
    for (let r = 4; r < mod.HEART_H - 1; r++) assert.ok(width(r + 1) < width(r), `the heart does not narrow at row ${r}`)
    assert.ok(width(mod.HEART_H - 1) <= 5, 'the heart has no point')
    assert.ok(h.row(mod.HEART_Y0 + mod.WORD_ROW).includes('C O L D   W A V E'), 'the word is not lettered inside the heart')
    // The reflection: tube glyphs under the curb, mirrored (an upside-down
    // point's corners are '╭' / '╮').
    const under = Array.from({ length: VIZ_BOT - mod.CURB_Y - 1 }, (_, i) => h.row(mod.CURB_Y + 1 + i)).join('')
    assert.ok((under.match(/[╭╮]/g) || []).length >= 6, 'no reflection under the curb')
    // Both lobes: the lowest puddle row is the reflection of the lobe tops,
    // two separate runs of tube with a gap between them (the notch).
    const last = h.row(VIZ_BOT - 1).trim()
    assert.match(last, /^╰─+╯ +╰─+╯$/, `the reflection's last row is not two lobes: "${last}"`)
    // Joined diagonals: ONE shift for the whole puddle. Under a single shift
    // the flipped REFLECT art matches the grid everywhere but the 5% the
    // ripples drop out; a per-row phase (the old pyramid) cannot.
    const x0 = Math.round(h.term.cols / 2 - mod.HEART_W / 2)
    const FLIP = { '╭': '╰', '╰': '╭', '╮': '╯', '╯': '╮' }
    let best = 0, total = 0
    for (let shift = -2; shift <= 2; shift++) {
      let hits = 0; total = 0
      mod.REFLECT.forEach((art, rr) => {
        const y = mod.CURB_Y + mod.REFLECT_H - rr
        if (y >= VIZ_BOT) return
        const row = h.row(y)
        for (let c = 0; c < art.length; c++) {
          if (art[c] === ' ') continue
          total++
          if (row[x0 + c + shift] === (FLIP[art[c]] || art[c])) hits++
        }
      })
      best = Math.max(best, hits)
    }
    assert.ok(best >= total * 0.88, `the reflection matches its art at one shift in only ${best}/${total} cells`)
  } finally { h.shutdown() }
})

test('FROST: a kick strikes the tube; no rising edge, no strike', async () => {
  const { h, fx, mod } = await bootFrost()
  try {
    const cells = tubeCells(h, mod)
    const litCount = () => cells.filter(({ x, y }) => lit(attrAt(h, x, y))).length
    // Settle at rest: pulse flat.
    for (let f = 0; f < 120; f++) drawWith(h, fx, 10 + f / 60, signal({ pulse: 0 }))
    assert.equal(litCount(), 0, 'the tube is lit at rest -- a kick would have nothing to change')
    // A held-high pulse is not a kick either.
    drawWith(h, fx, 12.0, signal({ pulse: 0.15 }))
    drawWith(h, fx, 12.02, signal({ pulse: 0.3 }))
    drawWith(h, fx, 12.04, signal({ pulse: 0.3 }))
    assert.equal(litCount(), 0, 'a pulse that only creeps up struck the tube')
    // The kick: a rise of more than BEAT_RISE in one frame.
    drawWith(h, fx, 13.0, signal({ pulse: 0 }))
    drawWith(h, fx, 13.02, signal({ pulse: 1 }))
    // Mid-strike: the front has passed the point and not yet the lobes.
    const point = cells.filter((c) => c.y === mod.HEART_Y0 + mod.HEART_H - 1)
    const lobes = cells.filter((c) => c.y === mod.HEART_Y0)
    assert.ok(point.every(({ x, y }) => lit(attrAt(h, x, y))), 'the strike did not start at the point')
    assert.ok(lobes.every(({ x, y }) => !lit(attrAt(h, x, y))), 'the strike reached the lobes in one frame -- no run')
    drawWith(h, fx, 13.02 + mod.STRIKE_S + 0.02, signal({ pulse: 0.8 }))
    assert.equal(litCount(), cells.length, 'after the strike the whole outline should hold lit')
    drawWith(h, fx, 13.02 + mod.STRIKE_S + mod.HOLD_S + 0.05, signal({ pulse: 0.2 }))
    assert.equal(litCount(), 0, 'the tube did not drop back after the hold')
  } finally { h.shutdown() }
})

test('FROST: the strike stays inside the BRIGHT budget and its glow ends with it', async () => {
  // A whole outline at BRIGHT is a slab of bloom on the tube (the UPRISING /
  // KEEP lesson); only the running front may be BRIGHT, 16 cells at most,
  // the cap DANCEFLOOR set. The '░' halo must be gone once the strike is.
  const { h, fx, mod } = await bootFrost()
  try {
    let worst = 0
    for (let f = 0; f < 90; f++) {
      const phase = (f % 30) / 30
      drawWith(h, fx, 20 + f / 60, signal({ level: 1, pulse: Math.exp(-phase * 6) }))
      let b = 0
      for (let i = h.term.cols; i < h.term.cols * VIZ_BOT; i++) if (h.term.attrs[i] & BRIGHT) b++
      worst = Math.max(worst, b)
    }
    assert.ok(worst > 0, 'the strike never showed a BRIGHT front')
    assert.ok(worst <= 16, `${worst} BRIGHT cells in one frame`)
    drawWith(h, fx, 30, signal({ pulse: 0 }))
    drawWith(h, fx, 30.02, signal({ pulse: 1 }))
    const canvas = () => Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1)).join('')
    const glow = () => canvas().split('·').length - 1
    assert.ok(glow() > 20, 'no glow round the tube as it strikes')
    // Shade blocks raster as a checkered slab, not light (design pass).
    assert.ok(!/[░▒▓█]/.test(canvas()), 'shade blocks on the canvas')
    // Outside only: nothing inside the glass but the word.
    const x0 = Math.round(h.term.cols / 2 - mod.HEART_W / 2)
    for (let r = 2; r < mod.HEART_H; r++) {
      const art = mod.HEART[r], row = h.row(mod.HEART_Y0 + r)
      const inside = row.slice(x0 + art.search(/\S/) + 1, x0 + art.trimEnd().length - 1)
      assert.ok(!inside.includes('·'), `art row ${r}: the glow landed inside the heart`)
    }
    drawWith(h, fx, 30.02 + mod.STRIKE_S + 0.01, signal({ pulse: 0.9 }))
    assert.equal(glow(), 0, 'the strike glow outlived the strike')
  } finally { h.shutdown() }
})

test('FROST: muted, the sign is a cold DIM outline that never strikes', async () => {
  const { h, fx, mod } = await bootFrost()
  try {
    const cells = tubeCells(h, mod)
    h.program.muted = true
    for (let f = 0; f < 240; f++) {
      h.program._au = signal({ pulse: f % 30 === 0 ? 1 : 0, level: 1 })
      fx.draw(h.program, { term: h.term }, 40 + f / 60)
    }
    const attrs = cells.map(({ x, y }) => attrAt(h, x, y))
    assert.ok(attrs.every((a) => a & (DIM | FAINT)), 'a muted sign is still glowing above DIM')
  } finally { h.shutdown() }
})

test('FROST: re-entry after a long visit carries no strike clock from the last one', async () => {
  // The effect clock restarts at 0 on entry; a kick time left at t=500 would
  // read as a strike scheduled in the future (the 2026-09-12 audit's shape).
  const { h, fx } = await bootFrost()
  try {
    drawWith(h, fx, 500, signal({ pulse: 0 }))
    drawWith(h, fx, 500.02, signal({ pulse: 1 }))
    assert.ok(h.program._frostKickAt > 400, 'test setup: a strike late in a long visit')
    h.key('e'); h.advance(200)
    h.key('v'); h.advance(300)
    const t = effectT(h)
    assert.ok(h.program._frostKickAt <= t + 0.05, `_frostKickAt ${h.program._frostKickAt} on a clock at ${t}`)
    assert.equal(h.program._frostPrevPulse <= 1, true)
  } finally { h.shutdown() }
})

test('FROST: the sign spells the locked station, not COLD WAVE everywhere', async () => {
  // [V] cycles any effect onto any station; a sign reading COLD WAVE on
  // CIPHER was the critic's finding. Boot a different station and draw.
  const h = await boot({ station: 'cipher' })
  try {
    h.powerOn()
    h.advance(6000)
    const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
    const mod = await import(`../visuals/frost.js?v=${globalThis.SIGNAL_BUILD}`)
    const fx = VISUALS.frost
    assert.equal(h.program.lockedStation && h.program.lockedStation.id, 'cipher', 'test setup: locked on CIPHER')
    fx.reset(h.program)
    drawWith(h, fx, 10, signal())
    const signRow = h.row(mod.HEART_Y0 + mod.WORD_ROW)
    assert.ok(signRow.includes('C I P H E R'), `the sign does not read CIPHER: "${signRow}"`)
    assert.ok(!/C ?O ?L ?D/.test(signRow), 'COLD WAVE is still on the sign')
    // Too long to letter-space: unspaced. Nothing that fits, or no station:
    // the fallback.
    h.program.lockedStation = { callsign: 'DISTORTION FIELD' }
    drawWith(h, fx, 10.1, signal())
    assert.ok(h.row(mod.HEART_Y0 + mod.WORD_ROW).includes('DISTORTION FIELD'), 'a long callsign did not fall back to unspaced')
    h.program.lockedStation = null
    drawWith(h, fx, 10.2, signal())
    assert.ok(h.row(mod.HEART_Y0 + mod.WORD_ROW).includes(mod.FALLBACK_WORD), 'no station, no fallback word')
    assert.equal(mod.signWord({ callsign: 'X'.repeat(40) }), mod.FALLBACK_WORD)
    // Whatever the word, it stays inside the glass.
    const x0 = Math.round(h.term.cols / 2 - mod.HEART_W / 2)
    for (const name of ['COLD WAVE', 'CIRCUIT CRUSH', 'NINE INCH NAILS', 'DISTORTION FIELD']) {
      const w = mod.signWord({ callsign: name })
      const at = x0 + Math.round((mod.HEART_W - w.length) / 2)
      assert.ok(at >= x0 + 2 && at + w.length <= x0 + mod.HEART_W - 2, `${name} runs into the tube`)
    }
  } finally { h.shutdown() }
})

test('FROST: the brick wall is on the grid at a tier the tube can show, and under the sign', async () => {
  // The wall used to be FAINT dotted dashes: on the real tube, no wall. It
  // must be solid brickwork (mortar runs, joints) lit DIM round the sign --
  // and never brighter than DIM, or the scenery outshines the resting tube.
  const { h, fx, mod } = await bootFrost()
  try {
    for (let f = 0; f < 240; f++) drawWith(h, fx, 10 + f / 60, signal({ level: 0.6, pulse: 0 }))
    const cols = h.term.cols
    const x0 = Math.round(cols / 2 - mod.HEART_W / 2)
    let dimBrick = 0, tooBright = 0, mortarRun = 0
    for (let y = 1; y < mod.CURB_Y; y++) {
      const row = h.row(y)
      let run = 0
      for (let x = 0; x < cols; x++) {
        // Wall only: not the heart (MARGIN blanks round it) and not the
        // transformer's cable row.
        if ((x >= x0 && x < x0 + mod.HEART_W && y >= mod.HEART_Y0) || (y === mod.HEART_Y0 + 8 && x >= x0 + mod.HEART_W)) { run = 0; continue }
        const ch = row[x], a = attrAt(h, x, y)
        if (!'─│┬┴┼'.includes(ch)) { run = 0; continue }
        if (a & DIM) dimBrick++
        else if (!(a & FAINT)) tooBright++
        run = '─┬┴┼'.includes(ch) ? run + 1 : 0
        mortarRun = Math.max(mortarRun, run)
      }
    }
    assert.ok(dimBrick >= 40, `only ${dimBrick} wall cells lit DIM -- no visible wall`)
    assert.equal(tooBright, 0, `${tooBright} wall cells brighter than DIM`)
    assert.ok(mortarRun >= 8, `the longest mortar run is ${mortarRun} -- the wall is not solid brickwork`)
    // The light falls off: the far corners of the wall are FAINT, not DIM.
    assert.ok(attrAt(h, 0, 2) & FAINT, 'the wall is lit DIM all the way to the edge -- no falloff')
    assert.ok(dimBrick > 0 && dimBrick < 0.8 * (dimBrick + countFaint()), 'the wall is uniformly lit')
    function countFaint() {
      let n = 0
      for (let y = 1; y < mod.CURB_Y; y++) for (let x = 0; x < cols; x++) if ('─│┬┴┼'.includes(h.row(y)[x]) && attrAt(h, x, y) & FAINT) n++
      return n
    }
    // The resting tube is a tier over the wall.
    const tube = tubeCells(h, mod).map(({ x, y }) => attrAt(h, x, y))
    // (Six cells of the right lobe buzz on a timer and may be a tier down.)
    assert.ok(tube.filter((a) => a === MUTED).length >= tube.length - 6, 'the resting tube is not MUTED, a tier over the DIM wall')
  } finally { h.shutdown() }
})
