// KEEP (THE CRYPT's visualizer, 2026-09-13) -- a ruined castle keep at
// night. Asserted the way tests/visuals.test.mjs asserts its effects: by
// rendering through the real program and reading the grid back, never by
// asking the effect what it thinks it drew. The silhouette, the lit windows
// and the bats are what this effect promises to show, so each is read off
// the grid; the re-entry test is the DREAD-tear shape for the one piece of
// clock-keyed state here, the bat flight.
//
// Run: node --test tests/visual-keep.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000
const CANVAS_BOT = 22 // VIZ_BOT
// (cols + trail + margin) / speed in visuals/keep.js, rounded up.
const FLIGHT_S = 12
const SOLID = new Set(['█', '▀', '▄', '▓'])
// Attribute bits, src/cellgrid.js.
const BRIGHT = 1, DIM = 4, MUTED = 32, FAINT = 64

async function bootKeep() {
  const h = await boot({ station: 'the-crypt' })
  h.powerOn()
  h.key('v')
  assert.equal(h.program.activeVisualKey(), 'keep', 'THE CRYPT should land on KEEP')
  return h
}

const canvasText = (h) => { let s = ''; for (let y = 1; y < CANVAS_BOT; y++) s += h.row(y); return s }
const nonSpace = (s) => s.replace(/ /g, '').length
const attrAt = (h, x, y) => h.term.attrs[y * h.term.cols + x]
const charAt = (h, x, y) => h.row(y)[x]

test('KEEP: paints every canvas row and nothing outside rows 1..21', async () => {
  const h = await bootKeep()
  try {
    // Wrap the registry's own draw (same ?v= instance the program uses)
    // so only puts made BY THE EFFECT are recorded -- the shell's footer
    // legitimately repaints rows 22-24 every frame.
    const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
    const fx = VISUALS.keep
    const origDraw = fx.draw
    const origPut = h.term.put
    const rowsHit = new Set()
    let inDraw = false
    h.term.put = function (x, y, ...rest) { if (inDraw) rowsHit.add(y); return origPut.call(this, x, y, ...rest) }
    fx.draw = function (...args) { inDraw = true; try { return origDraw.apply(this, args) } finally { inDraw = false } }
    try {
      h.advance(3000)
    } finally {
      fx.draw = origDraw
      h.term.put = origPut
    }
    const outside = [...rowsHit].filter((y) => y < 1 || y >= CANVAS_BOT)
    assert.deepEqual(outside, [], `the effect wrote to rows outside the canvas: ${outside}`)
    for (let y = 1; y < CANVAS_BOT; y++) assert.ok(rowsHit.has(y), `row ${y} was never repainted`)
    const n = nonSpace(canvasText(h))
    assert.ok(n > 500, `only ${n} non-space cells -- the scene is barely there`)
    // Mood over busyness: the frame must still be mostly not-bright.
    let loud = 0
    for (let y = 1; y < CANVAS_BOT; y++) for (let x = 0; x < h.term.cols; x++) if (attrAt(h, x, y) & BRIGHT) loud++
    assert.ok(loud < 40, `${loud} BRIGHT cells -- KEEP should be dark sky and silhouette`)
  } finally { h.shutdown() }
})

test('KEEP: moves -- mist and torchlight change between frames', async () => {
  const h = await bootKeep()
  try {
    h.advance(2000)
    const a = canvasText(h)
    h.advance(2000)
    const b = canvasText(h)
    assert.notEqual(a, b, 'two frames two seconds apart are identical')
    // The movement is in the mist bank, not only a star twinkling.
    let lower = 0
    const ra = a.match(/.{80}/gu), rb = b.match(/.{80}/gu)
    for (let y = 15; y < 21; y++) if (ra[y] !== rb[y]) lower++
    assert.ok(lower >= 3, `only ${lower} of the lower rows changed -- the mist is not drifting`)
  } finally { h.shutdown() }
})

test('KEEP: the castle silhouette reads back -- crenellations, a tall tower, solid stone', async () => {
  const h = await bootKeep()
  try {
    h.advance(1500)
    const rows = []
    for (let y = 0; y < CANVAS_BOT; y++) rows.push(h.row(y))
    // The keep's battlement: merlon, gap, merlon ... over solid wall.
    const crenel = rows.findIndex((r, y) => y >= 1 && r.includes('█ █ █ █ █ █ █ █'))
    assert.ok(crenel > 0, 'no crenellated parapet on the grid')
    const at = rows[crenel].indexOf('█ █ █ █ █ █ █ █')
    assert.ok(rows[crenel + 1].slice(at, at + 15) === '█'.repeat(15), `no solid wall under the parapet: ${JSON.stringify(rows[crenel + 1].slice(at, at + 15))}`)
    // A tall tower: solid stone at least four rows above the keep's parapet,
    // itself topped with merlons.
    const towerTop = rows.findIndex((r, y) => y >= 1 && /█ █ █ █/.test(r))
    assert.ok(towerTop >= 1 && towerTop <= crenel - 4, `tower top at row ${towerTop}, parapet at ${crenel}`)
    // A solid mass of stone -- a silhouette, not an outline.
    let solid = 0
    for (let y = 1; y < CANVAS_BOT; y++) for (const c of rows[y]) if (SOLID.has(c)) solid++
    assert.ok(solid > 400, `only ${solid} solid cells in the silhouette`)
    // The moon: a crescent of block cells in the upper right, clear of the castle.
    let moon = 0
    for (let y = 1; y < 9; y++) for (let x = 60; x < 80; x++) if (SOLID.has(rows[y][x])) moon++
    assert.ok(moon >= 8 && moon <= 30, `moon region has ${moon} block cells`)
  } finally { h.shutdown() }
})

test('KEEP: lit windows sit inside the stone and flicker independently', async () => {
  const h = await bootKeep()
  try {
    h.advance(1000)
    const wins = h.program._keepScene.windows
    assert.ok(wins.length >= 3, `only ${wins.length} lit windows`)
    for (const w of wins) {
      const l = charAt(h, w.x - 1, w.y), r = charAt(h, w.x + 1, w.y)
      assert.ok(SOLID.has(l) && SOLID.has(r), `window at ${w.x},${w.y} is not set in stone: ${JSON.stringify(l + charAt(h, w.x, w.y) + r)}`)
    }
    // Sample the torchlight: each window must be lit brighter than the
    // DIM stone around it most of the time, and the windows must not all
    // move in lockstep.
    const seqs = wins.map(() => [])
    let lit = 0, total = 0
    for (let i = 0; i < 80; i++) {
      h.advance(100)
      wins.forEach((w, k) => {
        const a = attrAt(h, w.x, w.y)
        seqs[k].push(`${charAt(h, w.x, w.y)}${a}`)
        total++
        if (!(a & (DIM | FAINT))) lit++
      })
    }
    assert.ok(lit / total > 0.6, `windows lit brighter than the stone on only ${lit}/${total} samples`)
    const distinct = new Set(seqs.map((s) => s.join(',')))
    assert.ok(distinct.size > 1, 'every window flickers identically')
    for (const s of seqs) assert.ok(new Set(s).size > 1, 'a window never flickered at all')
  } finally { h.shutdown() }
})

test('KEEP: muted, the ruin goes still -- steady torches, no bats', async () => {
  const h = await bootKeep()
  try {
    h.program.muted = true
    h.advance(1000)
    const wins = h.program._keepScene.windows
    const snap = () => wins.map((w) => `${charAt(h, w.x, w.y)}${attrAt(h, w.x, w.y)}`).join(',')
    const s0 = snap()
    const sky0 = h.row(2) + h.row(3)
    h.advance(3000)
    assert.equal(snap(), s0, 'torches flicker while muted')
    assert.equal(h.row(2) + h.row(3), sky0, 'the sky moves while muted')
    // Still lit, though: a dark castle reads as the effect having stopped.
    for (const w of wins) assert.ok(!(attrAt(h, w.x, w.y) & (DIM | FAINT)), 'torches went dark on mute')
    h.advance(90000)
    assert.equal(h.program._keepBats, null, 'bats flew while muted')
    assert.ok(nonSpace(canvasText(h)) > 500, 'the scene emptied out while muted')
  } finally { h.shutdown() }
})

test('KEEP: a bat flight crosses the sky and ends on its own', async () => {
  const h = await bootKeep()
  try {
    h.advance(1000)
    h.program._keepBats = { startT: effectT(h), dir: 1, y0: 3 }
    h.advance(4000)
    const sky = []
    for (let y = 1; y < 12; y++) sky.push(h.row(y))
    assert.ok(sky.some((r) => r.includes('^v^') || r.includes('-v-')), `no bat on the sky rows:\n${sky.join('\n')}`)
    h.advance(FLIGHT_S * 1000)
    assert.equal(h.program._keepBats, null, 'the flight never ended')
    const t = effectT(h)
    assert.ok(h.program._keepBatsNotBefore > t, 'no cooldown after a flight')
  } finally { h.shutdown() }
})

test('KEEP: a flight in progress at exit does not come back stuck (re-entry)', async () => {
  // The flock's startT and the not-before gate are effect-clock values. A
  // flight up at exit after a two-minute visit would come back with a
  // startT ~120s on a clock at ~2s: a negative age, so nothing draws and
  // nothing ends, and it blocks every new flight until the clock catches
  // up. Forced rather than waited for, like the DREAD tear.
  const h = await bootKeep()
  try {
    h.advance(120000)
    h.program._keepBats = { startT: effectT(h) - 1, dir: -1, y0: 4 }
    h.program._keepBatsNotBefore = effectT(h) + 30
    h.key('e')
    h.advance(500)
    h.key('v')
    assert.equal(h.program.activeVisualKey(), 'keep')
    h.advance(2000)
    const t = effectT(h)
    const bats = h.program._keepBats
    assert.ok(!bats || (bats.startT <= t && t - bats.startT <= FLIGHT_S), `flight carried startT ${bats && bats.startT.toFixed(1)}s onto a clock at ${t.toFixed(1)}s`)
    assert.ok(h.program._keepBatsNotBefore <= t + 15, `next flight gated until ${h.program._keepBatsNotBefore.toFixed(1)}s on a clock at ${t.toFixed(1)}s`)
    assert.ok(h.program._keepLastT <= t, 'mist clock carried from the previous visit')
    assert.ok(nonSpace(canvasText(h)) > 500, 'the frame is empty after re-entry')
    // And flights still happen on this visit, unforced (synthetic audio).
    let flew = false
    for (let i = 0; i < 240 && !flew; i++) { h.advance(1000); flew = !!h.program._keepBats }
    assert.ok(flew, 'no bat flight in four minutes after re-entry')
  } finally { h.shutdown() }
})
