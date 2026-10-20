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
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from './harness.mjs'
import { parseBDF } from '../src/bdf.js'
import { Term } from '../src/term.js'

const here = path.dirname(fileURLToPath(import.meta.url))

const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000
const CANVAS_BOT = 22 // VIZ_BOT
// (cols + trail + margin) / speed in visuals/keep.js, rounded up.
const FLIGHT_S = 12
const SOLID = new Set(['█', '▀', '▄', '▓'])
// Masonry glyph (2026-09-13, audit M1): '▓', not '█' -- see keep.js.
const STONE = '▓'
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
// Cells with ink on them: a character, or a putGlyph() bitmap (the mist,
// since 2026-10-20) -- a bitmap cell reads back as a space, so a
// character count alone would call the haze empty sky.
const inked = (h) => {
  let n = 0
  const { cols } = h.term
  for (let y = 1; y < CANVAS_BOT; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (h.term.chars[i] !== 0x20 || h.term.gfx[i]) n++
    }
  }
  return n
}
const attrAt = (h, x, y) => h.term.attrs[y * h.term.cols + x]
const charAt = (h, x, y) => h.row(y)[x]

test('KEEP: repaints every canvas cell and nothing outside rows 1..21', async () => {
  // 2026-09-13 (audit M7) -- this used to record only which ROWS were
  // written, and deleting the effect's blank-cell put left it green: a row
  // with one star on it counted as repainted. Wrap the registry's own draw
  // (same ?v= instance the program uses) so only puts made BY THE EFFECT
  // are recorded -- the shell's footer legitimately repaints rows 22-24 --
  // and require every canvas cell on every frame.
  const h = await bootKeep()
  try {
    const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
    const fx = VISUALS.keep
    const origDraw = fx.draw
    const origPut = h.term.put
    const origGlyph = h.term.putGlyph
    const cols = h.term.cols
    const outside = []
    let hit = null, frames = 0, short = 0
    const mark = (x, y) => { if (hit) { if (y < 1 || y >= CANVAS_BOT) outside.push(y); else if (x >= 0 && x < cols) hit[y * cols + x] = 1 } }
    h.term.put = function (x, y, ...rest) {
      mark(x, y)
      return origPut.call(this, x, y, ...rest)
    }
    // The mist is putGlyph() pixels since 2026-10-20; a haze cell counts.
    h.term.putGlyph = function (x, y, ...rest) {
      mark(x, y)
      return origGlyph.call(this, x, y, ...rest)
    }
    fx.draw = function (...args) {
      hit = new Uint8Array(cols * CANVAS_BOT)
      try { return origDraw.apply(this, args) } finally {
        let missed = 0
        for (let y = 1; y < CANVAS_BOT; y++) for (let x = 0; x < cols; x++) if (!hit[y * cols + x]) missed++
        if (missed) short++
        frames++
        hit = null
      }
    }
    try {
      h.advance(3000)
    } finally {
      fx.draw = origDraw
      h.term.put = origPut
      h.term.putGlyph = origGlyph
    }
    assert.ok(frames > 100, `draw should have run (ran ${frames})`)
    assert.deepEqual([...new Set(outside)], [], `the effect wrote to rows outside the canvas`)
    assert.equal(short, 0, `${short} of ${frames} frames left canvas cells unpainted`)
    const n = inked(h)
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
    // 2026-10-20 -- the mist is putGlyph() pixels, so a row is compared by
    // its bitmaps as well as its characters.
    const rowSig = (y) => {
      let s = h.row(y)
      for (let x = 0; x < h.term.cols; x++) { const g = h.term.gfx[y * h.term.cols + x]; s += g ? g.join('.') : '-' }
      return s
    }
    const snap = () => Array.from({ length: CANVAS_BOT }, (_, y) => rowSig(y))
    h.advance(2000)
    const ra = snap()
    h.advance(2000)
    const rb = snap()
    assert.notDeepEqual(ra, rb, 'two frames two seconds apart are identical')
    // The movement is in the mist bank, not only a star twinkling.
    let lower = 0
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
    const merlons = Array(8).fill(STONE).join(' ')
    const crenel = rows.findIndex((r, y) => y >= 1 && r.includes(merlons))
    assert.ok(crenel > 0, 'no crenellated parapet on the grid')
    const at = rows[crenel].indexOf(merlons)
    assert.ok(rows[crenel + 1].slice(at, at + 15) === STONE.repeat(15), `no solid wall under the parapet: ${JSON.stringify(rows[crenel + 1].slice(at, at + 15))}`)
    // A tall tower: solid stone at least four rows above the keep's parapet,
    // itself topped with merlons.
    const towerTop = rows.findIndex((r, y) => y >= 1 && r.includes(Array(4).fill(STONE).join(' ')))
    assert.ok(towerTop >= 1 && towerTop <= crenel - 4, `tower top at row ${towerTop}, parapet at ${crenel}`)
    // A solid mass of stone -- a silhouette, not an outline.
    let solid = 0
    for (let y = 1; y < CANVAS_BOT; y++) for (const c of rows[y]) if (SOLID.has(c)) solid++
    // 2026-10-16 (design pass) -- 400 -> 340: the ridges' '▄' rims used to
    // count here, and they are line-drawn now. The castle and crag alone
    // are ~380.
    // 2026-10-20 (polish) -- 340 -> 300: the crag's '▄' edge cells went
    // (one flat shade of '░' now, which this set does not count). The
    // castle alone is ~337.
    assert.ok(solid > 300, `only ${solid} solid cells in the silhouette`)
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
    // No bats: past the first-flight gate with every roll forced to succeed.
    // 2026-09-13 (audit L12) -- this waited out 90s of frames for a flight
    // that is 1-in-3000 a frame; forcing the dice proves the mute gate in
    // six seconds, and harder (red with `!muted` removed from the start test).
    const rnd = Math.random
    Math.random = () => 0
    try { h.advance(6000) } finally { Math.random = rnd }
    assert.equal(h.program._keepBats, null, 'bats flew while muted')
    assert.ok(inked(h) > 500, 'the scene emptied out while muted')
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
  // 2026-09-13 (audit L12) -- the two minutes are compressed: the entry stamp
  // is moved back 120s instead of rendering 7500 frames of it. What this bug
  // class needs is an effect clock ~120s ahead at exit, and the draw's t is
  // computed from _vizEnterAt (visualizer.js), so that is exactly the state a
  // real long visit leaves.
  const h = await bootKeep()
  try {
    h.advance(1000)
    h.program._vizEnterAt -= 120000
    h.advance(500)
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
    assert.ok(inked(h) > 500, 'the frame is empty after re-entry')
    // And flights still happen on this visit. 2026-09-13 (audit L12) -- this
    // waited up to four minutes of frames for a random flight; with every
    // roll forced, the only thing that can hold a flight back is the gate,
    // so ten seconds is a verdict rather than a sample.
    const rnd = Math.random
    Math.random = () => 0
    let flew = false
    try {
      for (let i = 0; i < 10 && !flew; i++) { h.advance(1000); flew = !!h.program._keepBats }
    } finally { Math.random = rnd }
    assert.ok(flew, 'no bat flight within ten seconds of re-entry with every roll forced')
  } finally { h.shutdown() }
})

test('KEEP: full blocks stay accents on both layouts (tube bloom, audit M1)', async () => {
  // 2026-09-13 -- the audit measured 356 '█' a frame in runs of 24 after the
  // tube check had dropped the keep to FAINT: a full block lights its whole
  // cell, so on the real shader it slabs at any tier, and the text grid
  // cannot see that. BACKROOM's cap, asserted on the 80x22 desktop canvas and
  // on the 42-column lite one. The lite canvas is drawn directly on a 42-wide
  // Term rather than through [V], which is the listener's key and not this
  // effect's contract.
  const blocks = (term, cols) => {
    let n = 0
    for (let y = 1; y < CANVAS_BOT; y++) for (let x = 0; x < cols; x++) if (term.chars[y * cols + x] === 0x2588) n++
    return n
  }
  const h = await bootKeep()
  try {
    let worst = 0
    for (let i = 0; i < 60; i++) { h.advance(100); worst = Math.max(worst, blocks(h.term, h.term.cols)) }
    const cap = h.term.cols * (CANVAS_BOT - 1) * 0.01
    assert.ok(worst <= cap, `${worst} '█' cells in one desktop frame (cap ${cap})`)

    const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
    const fx = VISUALS.keep
    const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
    const lite = new Term(font, 42, 22, 6, 5)
    fx.init(h.program, lite)
    fx.reset(h.program)
    let liteWorst = 0, liteInk = 0
    for (let f = 0; f < 120; f++) {
      fx.draw(h.program, { term: lite }, 3 + f / 10)
      liteWorst = Math.max(liteWorst, blocks(lite, 42))
    }
    for (let i = 42; i < 42 * CANVAS_BOT; i++) if (lite.chars[i] !== 0x20) liteInk++
    assert.ok(liteInk > 200, `the lite canvas is nearly empty (${liteInk}) -- the cap proves nothing`)
    const liteCap = 42 * (CANVAS_BOT - 1) * 0.01
    assert.ok(liteWorst <= liteCap, `${liteWorst} '█' cells in one lite frame (cap ${liteCap})`)
  } finally { h.shutdown() }
})

test('KEEP: the mountains are an outline, so the keep is the one mass (design pass)', async () => {
  // 2026-10-16 -- on the tube the ridges' '▄' rim and '▒'/'░' haze rastered
  // as the same stepped blocks, at the same tier, as the castle, and the
  // keep did not separate from the mountains. The ridges are now one
  // line-drawn rim each. Read off the open right-hand third of the frame,
  // clear of the crag and below the moon: no shade block at all, and a rim
  // line present.
  const h = await bootKeep()
  try {
    h.advance(1500)
    let blocks = 0, rim = 0
    for (let y = 9; y < CANVAS_BOT; y++) {
      const r = h.row(y)
      for (let x = 66; x < 80; x++) {
        if ('░▒▓█▄▀'.includes(r[x])) blocks++
        if ('_-/\\'.includes(r[x])) rim++
      }
    }
    assert.equal(blocks, 0, `${blocks} shade blocks in the mountains -- they should be an outline`)
    assert.ok(rim >= 14, `only ${rim} rim cells -- the ridges are not drawn`)
  } finally { h.shutdown() }
})


test('KEEP: the mist is a sparse pixel haze, no wisp glyphs (polish)', async () => {
  // 2026-10-16 the mist went from '░▒' blocks to '~'/'─' wisps; 2026-10-20
  // the wisps went too: on the tube the '─' bodies read as solid shelves
  // and '~' rasters as 'N' on this font. The mist is putGlyph() pixels now.
  // Read back over two seconds of frames: no wisp or block glyph in the
  // open air of the mist rows, haze bitmaps present at DIM and sparse (a
  // haze, not a fill), and moving.
  // Mutation-checked: with the old wisp branch restored, the first
  // assertion goes red; with KEEP_MIST_MAX at 0.9 the density one does.
  const h = await bootKeep()
  try {
    h.advance(1000)
    const { KEEP_MIST_TOP } = await import(`../visuals/keep.js?v=${globalThis.SIGNAL_BUILD}`)
    const S = h.program._keepScene
    const { cols } = h.term
    const cellPx = h.term.font.cellW * h.term.font.cellH
    const popcount = (w) => { let n = 0; while (w) { n += w & 1; w >>>= 1 } return n }
    const AIR = new Set([0, 2]) // SKY, RIDGE in keep.js
    let junk = 0, haze = 0, notDim = 0, lit = 0, px = 0, maxCell = 0
    const frames = []
    for (let f = 0; f < 20; f++) {
      h.advance(100)
      let snap = ''
      for (let y = KEEP_MIST_TOP; y < CANVAS_BOT; y++) {
        const r = h.row(y)
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x
          if (!AIR.has(S.kind[i])) continue
          if ('░▒▓█~─≈'.includes(r[x])) junk++
          const g = h.term.gfx[i]
          if (!g) continue
          haze++
          snap += `${x},${y}:${g.join('.')};`
          if (attrAt(h, x, y) !== DIM) notDim++
          let c = 0
          for (const w of g) c += popcount(w)
          lit += c
          maxCell = Math.max(maxCell, c / cellPx)
          px += cellPx
        }
      }
      frames.push(snap)
    }
    assert.equal(junk, 0, `${junk} wisp/block glyphs in the open-air mist`)
    assert.ok(haze > 20 * 30, `only ${haze} haze cells over 20 frames`)
    assert.equal(notDim, 0, `${notDim} haze cells not at DIM`)
    assert.ok(lit / px < 0.12, `haze cells are ${(100 * lit / px).toFixed(0)}% lit on average -- a fill, not a haze`)
    assert.ok(maxCell < 0.5, `a haze cell is ${(100 * maxCell).toFixed(0)}% lit -- reads as a shade block`)
    assert.notEqual(frames[0], frames[frames.length - 1], 'the haze does not drift')
  } finally { h.shutdown() }
})

test('KEEP: the windows carry the swell and outshine the moon (polish)', async () => {
  // 2026-10-20 -- the critique found the moon (NORMAL) the brightest thing
  // in the frame and no difference in torchlight between LOUD and MUTED.
  // The moon is DIM now; lit windows run MUTED (quiet) .. BRIGHT (loud).
  // Two halves: torch() itself, quiet vs loud over many seconds of flicker
  // (the swell must move the tier, not just the flicker), and the grid --
  // every moon cell under every window while muted, the windows' floor.
  // Mutation-checked: with the old curve (warm 0.7..1.2 on a 0.55..1.1
  // flicker) the quiet/loud split goes red; with the moon back at NORMAL
  // the ordering does.
  const { torch, torchCell } = await import(`../visuals/keep.js?v=${globalThis.SIGNAL_BUILD}`)
  const quiet = { level: 0.15, mid: 0.15, bass: 0.1, pulse: 0 }
  const loud = { level: 0.8, mid: 0.65, bass: 0.6, pulse: 0 }
  let qBright = 0, lBright = 0, qMuted = 0, n = 0
  for (let k = 0; k < 400; k++) {
    const t = k * 0.05, w = { i: k % 6 }
    const qa = torchCell(torch(w, t, quiet, false))[1], la = torchCell(torch(w, t, loud, false))[1]
    n++
    if (qa === BRIGHT) qBright++
    if (la === BRIGHT) lBright++
    if (qa & (MUTED | DIM)) qMuted++
  }
  assert.ok(lBright / n > 0.6, `loud windows BRIGHT on only ${lBright}/${n} samples`)
  assert.equal(qBright, 0, 'quiet windows reached BRIGHT -- no swell left to show')
  assert.ok(qMuted / n > 0.6, `quiet windows sit at MUTED on only ${qMuted}/${n} samples`)

  const level = (a) => a & BRIGHT ? 255 : a & FAINT ? 100 : a & DIM ? 150 : a & MUTED ? 180 : 205
  const h = await bootKeep()
  try {
    const S = h.program._keepScene
    const { cols } = h.term
    const moonCells = []
    for (let i = 0; i < S.kind.length; i++) if (S.kind[i] === 1) moonCells.push(i) // MOON
    assert.ok(moonCells.length >= 8, 'no moon in the scene')
    h.program.muted = true
    h.advance(1000)
    const moonMax = Math.max(...moonCells.map((i) => level(h.term.attrs[i])))
    const winMin = Math.min(...S.windows.map((w) => level(h.term.attrs[w.y * cols + w.x])))
    assert.ok(winMin > moonMax, `muted: a window (${winMin}) is not brighter than the moon (${moonMax})`)
  } finally { h.shutdown() }
})

test('KEEP: the crag is one flat shade, darker than the masonry (polish)', async () => {
  // 2026-10-20 -- two shades of stepped blocks ('▒' with '▓' flecks and
  // '▄' edges) read as brick rubble. One glyph, FAINT, lighter-inked than
  // the keep's '▓'.
  const h = await bootKeep()
  try {
    h.advance(500)
    const S = h.program._keepScene
    const { KEEP_ART_TOP, KEEP_ART } = await import(`../visuals/keep.js?v=${globalThis.SIGNAL_BUILD}`)
    const glyphs = new Set()
    const attrs = new Set()
    for (let y = KEEP_ART_TOP + KEEP_ART.length; y < CANVAS_BOT; y++) {
      for (let x = 0; x < h.term.cols; x++) {
        const i = y * h.term.cols + x
        if (S.kind[i] !== 3) continue // ROCK
        glyphs.add(S.ch[i]); attrs.add(S.attr[i])
      }
    }
    assert.deepEqual([...glyphs], ['░'], `crag glyphs: ${[...glyphs].join('')}`)
    assert.deepEqual([...attrs], [FAINT])
  } finally { h.shutdown() }
})
