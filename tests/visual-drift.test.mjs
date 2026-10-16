// ATRIUM (the 'drift' effect, NEON STASIS, rebuilt 2026-10-16) -- what the
// effect actually leaves on the grid, read back off it the way the other
// visual-*.test.mjs files do: the canvas contract, that the mall is there
// (far wall, signs, escalators, fountain, palms), that a kick and ONLY a kick
// spurts the fountain, that mute settles it, that re-entry carries no clock
// from the previous visit, and the tube-bloom caps.
//
// The frame loop rewrites p._au every frame (visualizer.js), so everything
// about the kick is driven by calling the effect's draw directly with a
// crafted signal.
//
// Run: node --test tests/visual-drift.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from './harness.mjs'
import { parseBDF } from '../src/bdf.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const VIZ_BOT = 22
const BRIGHT = 1
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000
const canvasRows = (h) => Array.from({ length: VIZ_BOT - 1 }, (_, i) => h.row(i + 1))
const nonSpace = (h) => canvasRows(h).join('').replace(/ /g, '').length

const signal = (over = {}) => ({
  level: 0.6, bass: 0.4, mid: 0.4, treble: 0.3,
  bands9: new Array(9).fill(0.4), onset: false, pulse: 0, ...over,
})

async function bootAtrium() {
  const h = await boot({ station: 'neon-stasis' })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  assert.equal(h.program.activeVisualKey(), 'drift', 'NEON STASIS should land on the drift effect')
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  const mod = await import(`../visuals/drift.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.drift, mod }
}

function drawWith(h, fx, t, A, muted = false) {
  h.program.muted = muted
  h.program._au = A
  fx.draw(h.program, { term: h.term }, t)
}

/** The fountain's centre jet, read off the grid: how many rows of water
 *  stand above the upper bowl in the middle column. */
function jetRows(h, mod) {
  const mid = Math.floor(h.term.cols / 2)
  // The jet always ends in '¦'. Stop there: at 80 columns a storefront
  // pillar stands in the same column further up and would be counted too.
  let n = 0
  for (let y = mod.BOWL_Y - 1; y >= 1; y--) {
    const ch = h.row(y)[mid]
    if (ch === '¦') return n + 1
    if (ch !== '│') break
    n++
  }
  return 0
}

test('ATRIUM: repaints every canvas cell and nothing outside rows 1..21', async () => {
  const { h, fx } = await bootAtrium()
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
      h.program._au = signal({ level: 1, bass: 1, treble: 1, pulse: 1, onset: true, bands9: new Array(9).fill(1) })
      fx.draw(h.program, { term: h.term }, effectT(h) + 1)
    } finally { h.term.put = put }
    assert.deepEqual(outside.slice(0, 5), [], `${outside.length} puts landed outside the canvas`)
    let missed = 0
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) if (!hit[y * h.term.cols + x]) missed++
    assert.equal(missed, 0, `${missed} canvas cells were not repainted this frame`)
    const lit = nonSpace(h)
    assert.ok(lit > 400, `only ${lit} non-space cells on the canvas`)
    assert.ok(lit < 1680 * 0.6, `${lit} non-space cells -- the old wall of characters is back`)
  } finally { h.shutdown() }
})

test('ATRIUM: every character it draws exists in the BDF font', async () => {
  const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
  const { h, fx } = await bootAtrium()
  try {
    const seen = new Set()
    for (let i = 0; i < 60; i++) {
      h.advance(100)
      for (const r of canvasRows(h)) for (const ch of r) seen.add(ch)
    }
    // And the kick's crown and spray, which the synthetic pulse may not have
    // landed a sampled frame on.
    drawWith(h, fx, 30, signal({ pulse: 0 }))
    drawWith(h, fx, 30.02, signal({ pulse: 1, level: 1 }))
    for (const r of canvasRows(h)) for (const ch of r) seen.add(ch)
    const missing = [...seen].filter((ch) => !font.glyphs.has(ch.codePointAt(0)))
    assert.deepEqual(missing, [], 'glyphs not in ter-u16n.bdf render as blanks')
  } finally { h.shutdown() }
})

test('ATRIUM: the mall reads back -- far wall, two floors of signs, escalators, fountain, palms', async () => {
  const { h, mod } = await bootAtrium()
  try {
    h.advance(1000)
    const rows = canvasRows(h).map((r, i) => ({ y: i + 1, r }))
    const row = (y) => h.row(y)
    assert.ok(row(mod.CEIL_Y).includes('┌') && row(mod.CEIL_Y).includes('┐'), 'the far wall meets the ceiling')
    assert.ok((row(mod.SLAB_Y).match(/═/g) || []).length > 20, 'the upper floor\'s slab runs across')
    const signWords = (y) => (row(y).match(/[A-Z]{4,}/g) || []).length
    assert.ok(signWords(mod.UP_SIGN_Y) >= 3, `upper-floor signs: ${row(mod.UP_SIGN_Y)}`)
    assert.ok(signWords(mod.LO_SIGN_Y) >= 2, `lower-floor signs: ${row(mod.LO_SIGN_Y)}`)
    let up = 0, down = 0
    for (let y = mod.SLAB_Y; y <= mod.FLOOR_Y; y++) { if (row(y).includes('/')) up++; if (row(y).includes('\\')) down++ }
    assert.ok(up >= 5 && down >= 5, `both escalators climb between the floors (${up}, ${down})`)
    assert.ok(row(mod.RIM_Y).includes('‾‾‾‾‾'), 'the basin\'s back rim')
    assert.match(row(mod.WATER_Y), /\(.*\)/, 'water held in the basin')
    assert.equal(rows.filter(({ r }) => r.includes('[=====]')).length, 1, 'two potted palms on one row')
    assert.equal((h.row(rows.find(({ r }) => r.includes('[=====]')).y).match(/\[=====\]/g) || []).length, 2, 'one each side')
  } finally { h.shutdown() }
})

test('ATRIUM: a kick bursts the fountain -- crown, spray, foam -- and it settles before the next', async () => {
  // Mutation-checked: with the rising-edge test in draw() made never true,
  // there is no crown, no spray and no foam, and this goes red.
  const { h, fx, mod } = await bootAtrium()
  try {
    const mid = Math.floor(h.term.cols / 2)
    // The spray's cells: droplets in the fountain's air, off the jet column.
    const spray = () => {
      let n = 0
      for (let y = mod.JET_CEIL_Y; y < mod.RIM_Y; y++) {
        const row = h.row(y)
        for (let x = mid - 14; x <= mid + 14; x++) if (x !== mid && row[x] === "'") n++
      }
      return n
    }
    fx.reset(h.program)
    drawWith(h, fx, 40, signal({ pulse: 0.02 }))
    assert.ok(!canvasRows(h).join('').includes('≈'), 'no foam at rest')
    assert.ok(!canvasRows(h).join('').includes('*'), 'no crown at rest')
    drawWith(h, fx, 40.1, signal({ pulse: 1 }))
    assert.ok(h.row(mod.WATER_Y).includes('≈≈≈'), 'the basin foams on the kick')
    const top = mod.BOWL_Y - jetRows(h, mod)
    assert.equal(h.row(top - 1)[mid], '*', `a crown over the jet: ${h.row(top - 1)}`)
    assert.ok(spray() >= 2, `the spray is out (${spray()} droplets)`)
    // Half a second on, no new kick: crown, spray and foam are gone.
    drawWith(h, fx, 40.6, signal({ pulse: 0.05 }))
    assert.ok(!canvasRows(h).join('').includes('*'), 'the crown is gone')
    assert.equal(spray(), 0, 'the spray has fallen')
    assert.ok(!h.row(mod.WATER_Y).includes('≈'), 'the foam settles')
  } finally { h.shutdown() }
})

test('ATRIUM: the fountain never draws above the floor line, even on a kick at full level', async () => {
  // 2026-10-16 -- a kick used to throw the jet to row 6, a thin line through
  // the escalators to the BOOKS sign. The check is a diff: the same frames
  // with and without a kick, everything else identical (pulse is read only
  // for the kick edge), must agree on every row above JET_CEIL_Y. A diff
  // rather than a glyph search, because the escalators and storefronts above
  // the line use the same glyphs as the jet. Mutation-checked against the
  // old behaviour (jet = rest + spurt * 6, no ceiling clip): red. The clip
  // alone cannot be mutated red, since the jet's height is also capped.
  const { h, fx, mod } = await bootAtrium()
  try {
    const full = (pulse) => signal({ level: 1, bass: 1, mid: 1, treble: 1, bands9: new Array(9).fill(1), pulse })
    const frames = (kick) => {
      fx.reset(h.program)
      h.program._driftPrevPulse = kick ? 0 : 1
      const out = []
      for (const dt of [0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.45]) {
        drawWith(h, fx, 80 + dt, full(1))
        out.push(canvasRows(h))
      }
      return out
    }
    const calm = frames(false), kicked = frames(true)
    assert.ok(kicked.some((f) => f.join('').includes('*')), 'test setup: the kick frames have a crown')
    assert.ok(!calm.some((f) => f.join('').includes('*')), 'test setup: the calm frames have none')
    kicked.forEach((f, i) => {
      for (let y = 1; y < mod.JET_CEIL_Y; y++) {
        assert.equal(f[y - 1], calm[i][y - 1], `frame ${i}: row ${y} changed on the kick -- the fountain reached above row ${mod.JET_CEIL_Y}`)
      }
    })
    // And at rest, at full level, the jet's own top stays below the line too.
    assert.ok(mod.BOWL_Y - jetRows(h, mod) >= mod.JET_CEIL_Y, 'the jet stands above the floor line')
  } finally { h.shutdown() }
})

test('ATRIUM: nothing spurts between beats -- a flat signal never throws the jet', async () => {
  const { h, fx, mod } = await bootAtrium()
  try {
    fx.reset(h.program)
    // Primed at the steady value: straight after reset() the previous pulse
    // is 0, and a first frame at 0.3 is a genuine rising edge.
    h.program._driftPrevPulse = 0.3
    let worst = 0
    for (let f = 0; f < 120; f++) {
      drawWith(h, fx, 50 + f / 60, signal({ pulse: 0.3, onset: f % 7 === 0 }))
      worst = Math.max(worst, jetRows(h, mod))
      assert.ok(!canvasRows(h).join('').includes('*'), `a crown with no kick at frame ${f}`)
    }
    // Resting height is 1 + level*4 rows at level 0.6.
    assert.ok(worst <= 4, `the jet reached ${worst} rows without a kick`)
  } finally { h.shutdown() }
})

test('ATRIUM: louder music raises the jet, reaches the arcs further and roughens the water', async () => {
  const { h, fx, mod } = await bootAtrium()
  try {
    fx.reset(h.program)
    drawWith(h, fx, 60, signal({ level: 0.05, pulse: 0 }))
    const quiet = { jet: jetRows(h, mod), water: (h.row(mod.WATER_Y).match(/~/g) || []).length }
    fx.reset(h.program)
    drawWith(h, fx, 60, signal({ level: 1, pulse: 0 }))
    const loud = { jet: jetRows(h, mod), water: (h.row(mod.WATER_Y).match(/~/g) || []).length }
    assert.ok(loud.jet - quiet.jet >= 1, `jet ${quiet.jet} -> ${loud.jet}`)
    assert.ok(loud.water > quiet.water + 4, `choppy water ${quiet.water} -> ${loud.water}`)
  } finally { h.shutdown() }
})

test('ATRIUM: muted, the fountain sinks to a trickle and nothing spurts', async () => {
  const { h, fx, mod } = await bootAtrium()
  try {
    h.advance(1000)
    h.key('m')
    h.advance(2500)
    assert.equal(h.program.muted, true, 'test setup: muted')
    assert.equal(jetRows(h, mod), 0, 'no jet above the bowl while muted')
    for (let f = 0; f < 60; f++) {
      h.advance(50)
      const all = canvasRows(h).join('')
      assert.ok(!all.includes('*') && !all.includes('≈'), `a spurt while muted at frame ${f}`)
    }
    // And a kick arriving in the signal while muted is ignored.
    drawWith(h, fx, effectT(h), signal({ pulse: 0 }), true)
    drawWith(h, fx, effectT(h) + 0.02, signal({ pulse: 1 }), true)
    assert.equal(jetRows(h, mod), 0, 'a kick under mute threw the jet')
  } finally { h.shutdown() }
})

test('ATRIUM: re-entry after a long visit carries no clock from the previous one', async () => {
  // _driftSpurtAt is an absolute effect-clock value the rate limit reads,
  // and _driftLastT the glow smoother's. After two minutes of synthetic
  // beats the first holds ~120s; left there across a re-entry it refuses
  // every spurt until the restarted clock catches up. Mutation-checked:
  // with reset() emptied, the clock assertion and the "spurted again"
  // assertion both go red.
  const { h, mod } = await bootAtrium()
  try {
    h.advance(1000)
    h.program._vizEnterAt -= 120000
    h.advance(2000)
    assert.ok(h.program._driftSpurtAt > 100, 'the fountain should have been spurting through the long visit')
    h.key('e')
    h.advance(500)
    h.key('v')
    if (h.program.tapConsentOpen) h.key('n')
    let spurted = false
    for (let i = 0; i < 40; i++) {
      h.advance(50)
      if (h.row(mod.WATER_Y).includes('≈≈≈')) spurted = true
    }
    const t = effectT(h)
    assert.ok(t < 5, `effect clock should have restarted (t=${t.toFixed(1)})`)
    assert.ok(!(h.program._driftSpurtAt > t), `spurt stamped at ${h.program._driftSpurtAt}s on a clock at ${t.toFixed(1)}s`)
    assert.ok(!(h.program._driftLastT > t + 0.05), `glow stamp ${h.program._driftLastT} on a clock at ${t}`)
    assert.ok(spurted, 'the fountain did not spurt in two seconds after re-entry')
  } finally { h.shutdown() }
})

test('ATRIUM: no full blocks, and BRIGHT is the crown alone (tube bloom)', async () => {
  const { h, fx } = await bootAtrium()
  try {
    const audit = (label) => {
      let bright = 0
      for (let y = 1; y < VIZ_BOT; y++) {
        const row = h.row(y)
        for (let x = 0; x < h.term.cols; x++) {
          assert.notEqual(row[x], '█', `${label}: a full block at ${x},${y}`)
          if (h.term.attrs[y * h.term.cols + x] & BRIGHT) {
            bright++
            assert.equal(row[x], '*', `${label}: BRIGHT '${row[x]}' at ${x},${y}`)
          }
        }
      }
      assert.ok(bright <= 1, `${label}: ${bright} BRIGHT cells`)
    }
    for (let i = 0; i < 40; i++) { h.advance(100); audit(`synthetic frame ${i}`) }
    fx.reset(h.program)
    const loud = { level: 1, bass: 1, treble: 1, bands9: new Array(9).fill(1) }
    for (let f = 0; f < 20; f++) {
      drawWith(h, fx, 70 + f * 0.5, signal({ ...loud, pulse: 0.05 }))
      drawWith(h, fx, 70 + f * 0.5 + 0.02, signal({ ...loud, pulse: 1, onset: true }))
      audit(`kick ${f}`)
    }
  } finally { h.shutdown() }
})

test('ATRIUM: closing time -- stores go dark and come back, a pure function of the clock', async () => {
  const { mod } = await bootAtrium().then(({ h, mod }) => { h.shutdown(); return { mod } })
  for (const id of [0, 1, 2, 3, 10, 11, 12, 13, 101, 205]) {
    let dark = 0, flips = 0, prev = mod.storeDark(id, 0)
    for (let t = 0; t < 600; t += 0.5) {
      const d = mod.storeDark(id, t)
      if (d) dark++
      if (d !== prev) flips++
      prev = d
      assert.equal(d, mod.storeDark(id, t), 'same answer for the same moment')
    }
    assert.ok(dark < 1200 * 0.5, `store ${id} dark ${((dark / 1200) * 100).toFixed(0)}% of ten minutes`)
    assert.ok(flips <= 30, `store ${id} flickered ${flips} times in ten minutes`)
  }
  let anyDark = false
  for (let t = 0; t < 600 && !anyDark; t += 1) for (let id = 0; id < 14; id++) if (mod.storeDark(id, t)) anyDark = true
  assert.ok(anyDark, 'no store ever closes')
})
