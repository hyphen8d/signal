// Visualizer effect scenarios that need the real program and a real Term:
// what an effect actually leaves on the grid, and what state it carries
// across a visualizer exit and re-entry. Born in the 2026-09-12 audit, when
// BREACH's "resolve" words turned out never to have rendered (H4) and three
// effects turned out to hold absolute effect-clock state across re-entry
// (M5) -- the FLAME-class bug visualizer.js's entry comment describes, three
// more times. Each is asserted here the way it was found: by rendering and
// reading the grid, not by asking the effect whether it thinks it drew.
//
// Run: node --test tests/

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000

/** Enter the visualizer on a station whose own visual is `key`. */
async function bootInto(key, station) {
  const h = await boot({ station })
  h.powerOn()
  h.key('v')
  assert.equal(h.program.activeVisualKey(), key, `${station} should land on ${key}`)
  return h
}

test('BREACH: every resolved word is legible on the grid for its whole beat (H4)', async () => {
  // 2026-09-12 (audit, H4) -- the words were written inside the per-column
  // loop, and the columns after each one repainted their full height over
  // it. Measured before the fix: 0 intact / 9482 broken over 400 frames.
  // This reads the word back out of the row it claims to hold, every
  // frame, so a regression to "draw it in the column loop" fails loudly.
  const h = await bootInto('breach', 'cipher')
  try {
    let intact = 0
    const broken = []
    for (let i = 0; i < 400; i++) {
      h.advance(50)
      const cols = h.program._breachCols
      for (let x = 0; x < cols.length; x++) {
        const c = cols[x]
        if (!c.word) continue
        const got = h.row(c.wordRow).slice(x, x + c.word.length)
        if (got === c.word.slice(0, got.length)) intact++
        else broken.push(`${c.word} at ${x},${c.wordRow} -> ${JSON.stringify(got)}`)
      }
    }
    assert.ok(intact > 50, `words should resolve often enough to test (saw ${intact})`)
    assert.deepEqual(broken.slice(0, 5), [], `${broken.length} words were painted over`)
  } finally { h.shutdown() }
})

test('BREACH: re-entry clears stale words and stale resolve schedules (M5)', async () => {
  // A two-minute visit leaves wordUntil/resolveAt values around t=120; the
  // clock restarts at 0 on re-entry, so without reset() those columns sat
  // lit (or silent) until the clock climbed back past them.
  const h = await bootInto('breach', 'cipher')
  try {
    h.advance(120000)
    h.key('e')
    h.advance(500)
    h.key('v')
    h.advance(2000)
    const t = effectT(h)
    const cols = h.program._breachCols
    const stuck = cols.filter((c) => c.word && c.wordUntil > t + 1)
    const silent = cols.filter((c) => c.resolveAt > t + 8)
    assert.equal(stuck.length, 0, `${stuck.length} columns hold a word from the previous visit`)
    assert.equal(silent.length, 0, `${silent.length} columns have no resolve scheduled inside the ambient window`)
  } finally { h.shutdown() }
})

test('RIPPLE: re-entry re-seeds every slot instead of leaving them in the future (M5)', async () => {
  // Without reset(), 9 of 11 slots came back with startT ~118s while t was
  // 2s: age < 0, skipped by the draw, and never respawned because the
  // respawn test is age > MAXAGE. A fresh respawn is at most 0.6s ahead.
  const h = await bootInto('ripple', 'city-lights')
  try {
    h.advance(120000)
    h.key('e')
    h.advance(500)
    h.key('v')
    h.advance(2000)
    const t = effectT(h)
    const future = h.program._ripples.filter((r) => r.startT > t + 0.6)
    assert.equal(future.length, 0, `${future.length} slots still carry a start time from the previous visit`)
    const live = h.program._ripples.filter((r) => t - r.startT >= 0 && t - r.startT <= 3.2)
    assert.ok(live.length >= 3, `only ${live.length} rings alive two seconds into a re-entry`)
  } finally { h.shutdown() }
})

test('DREAD: a tear active at exit does not come back as a held strobe (M5)', async () => {
  // The tear's `until` is on the effect clock. Forced here rather than
  // waited for -- it is active on ~9% of frames -- with the same shape the
  // draw itself writes, then the visit ends with it still up.
  const h = await bootInto('dread', 'nin')
  try {
    h.advance(120000)
    const tear = h.program._dreadTear
    tear.active = true
    tear.row = 5
    tear.until = effectT(h) + 0.1
    h.key('e')
    h.advance(500)
    h.key('v')
    h.advance(2000)
    const t = effectT(h)
    // A tear that started THIS visit expires within 0.18s of when it began.
    assert.ok(!tear.active || tear.until <= t + 0.2, `tear held until ${tear.until.toFixed(1)}s on a clock at ${t.toFixed(1)}s`)
  } finally { h.shutdown() }
})

test('the 2026-09-13 effects draw correctly at a width other than the one they booted at (audit L5)', async () => {
  // The grid is fixed for a page's life, so this is latent -- but three of
  // these effects kept width-shaped state that only held at 80 columns:
  // AURORA sized its buffers at init, DANCEFLOOR and BACKROOM compiled
  // tables indexed `y * 80`. Two claims, each able to catch one shape:
  //  1. drawing on a W-column term after init for 80 gives exactly the frame
  //     a fresh init at W gives (state sized at init), every cell repainted,
  //     nothing outside rows 1..21;
  //  2. DANCEFLOOR and BACKROOM are fixed art centred on column 40, so on a
  //     100-column term the far right is dark room -- a table indexed for 80
  //     wraps into the next row and draws floor fragments there.
  const { readFileSync } = await import('node:fs')
  const { Term } = await import('../src/term.js')
  const { parseBDF } = await import('../src/bdf.js')
  const font = parseBDF(readFileSync(new URL('../fonts/ter-u16n.bdf', import.meta.url), 'utf8'))
  const NEW = ['lagoon', 'uprising', 'keep', 'orbit', 'aurora', 'backroom', 'dancefloor']
  const VIZ_BOT = 22
  const h = await boot({ station: 'tradewinds' })
  const rnd = Math.random
  try {
    h.powerOn()
    const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
    const p = h.program
    const seeded = () => { let a = 0x9e3779b9; Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
    const signal = { level: 0.6, bass: 0.5, mid: 0.4, treble: 0.3, bands9: new Array(9).fill(0.45), onset: false, pulse: 0.2 }
    const run = (fx, cols, initTerm) => {
      const term = new Term(font, cols, 25, 6, 5)
      seeded()
      p.muted = false
      p._au = signal
      fx.init(p, initTerm === 'self' ? term : h.term)
      fx.reset(p)
      const put = term.put
      const outside = []
      let missed = 0
      for (let f = 0; f < 30; f++) {
        const hit = new Uint8Array(cols * VIZ_BOT)
        term.put = function (x, y, ...rest) {
          if (y < 1 || y >= VIZ_BOT) outside.push(y)
          else if (x >= 0 && x < cols) hit[y * cols + x] = 1
          return put.call(this, x, y, ...rest)
        }
        try { fx.draw(p, { term }, 5 + f / 30) } finally { term.put = put }
        for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      }
      const rows = Array.from({ length: VIZ_BOT - 1 }, (_, i) => {
        let s = ''
        for (let x = 0; x < cols; x++) s += String.fromCodePoint(term.chars[(i + 1) * cols + x]) + term.attrs[(i + 1) * cols + x]
        return s
      })
      return { rows, outside, missed, term }
    }
    for (const cols of [60, 100]) {
      for (const key of NEW) {
        const fx = VISUALS[key]
        const carried = run(fx, cols, 'boot')
        const fresh = run(fx, cols, 'self')
        assert.deepEqual(carried.outside.slice(0, 3), [], `${key} at ${cols} cols wrote outside the canvas`)
        assert.equal(carried.missed, 0, `${key} at ${cols} cols left ${carried.missed} cell-frames unpainted`)
        const diff = carried.rows.findIndex((r, i) => r !== fresh.rows[i])
        assert.equal(diff, -1, `${key} at ${cols} cols: row ${diff + 1} differs from a fresh init at that width`)
        if (cols === 100 && (key === 'dancefloor' || key === 'backroom')) {
          // Fixed art at fixed columns: the first 80 columns of a 100-column
          // frame are the 80-column frame. This is the half that catches a
          // table indexed `y * 80` which init does not rebuild (BACKROOM's
          // mask) -- the carried-vs-fresh comparison above cannot, since
          // both runs read the same wrong table.
          const narrow = run(fx, 80, 'self')
          const cellsDiffer = []
          for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < 80; x++) {
            const a = y * 80 + x, b = y * 100 + x
            if (narrow.term.chars[a] !== fresh.term.chars[b] || narrow.term.attrs[a] !== fresh.term.attrs[b]) cellsDiffer.push(`${x},${y}`)
          }
          assert.deepEqual(cellsDiffer.slice(0, 5), [], `${key} at 100 cols: ${cellsDiffer.length} cells in the first 80 columns differ from the 80-column frame`)
          const stray = []
          for (let y = 1; y < VIZ_BOT; y++) for (let x = 86; x < cols; x++) {
            const ch = String.fromCodePoint(fresh.term.chars[y * cols + x])
            if (ch !== ' ') stray.push(`${x},${y}:${ch}`)
          }
          assert.deepEqual(stray.slice(0, 5), [], `${key} drew ${stray.length} cells in the dark room right of its art`)
        }
      }
    }
  } finally {
    Math.random = rnd
    h.shutdown()
  }
})
