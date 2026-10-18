// AURORA (DRIFT MODE, 2026-09-13; rebuilt to read 2026-10-16) -- what the
// effect promises, read back off the grid: curtains of light bright enough to
// see in the sky, a solid snow-capped ridge with pines, a lake below, a frame
// that ignores the fabricated pulse but answers an onset with a wave that
// travels and then clears, and a picture that is calm at rest. Each claim is
// checked by rendering and reading cells, not by asking the effect what it
// thinks it drew -- the lesson tests/visuals.test.mjs's header records from
// BREACH.
//
// 2026-10-16 (design pass) -- redrawn as light: thin hems and ray strokes,
// a FAINT `░` ridge with pines standing on it, a lake of streaks. The
// "subject reads", "outshines" and "muted" tests were rewritten for those
// glyphs (the old ones counted shade blocks as the light, which is exactly
// what the redraw removed), and "the sky is light, not blocks" is new.
//
// Run: node --test tests/visual-aurora.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'
import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'

const VIZ_BOT = 22
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000

async function bootAurora() {
  const h = await boot({ station: 'drift-mode' })
  h.powerOn()
  h.key('v')
  assert.equal(h.program.activeVisualKey(), 'aurora', 'drift-mode should land on aurora')
  // The same module instance the registry dispatches to: every app module is
  // instanced per full URL, and the registry imports it with this boot's tag.
  const { default: aurora, AURORA_HORIZON } = await import(`../visuals/aurora.js?v=${h.tag}`)
  return { h, aurora, HORIZON: AURORA_HORIZON }
}

/** Chars and attrs of the canvas rows 1..VIZ_BOT-1, as copies. */
function canvas(h) {
  const c = h.term.cols
  return { chars: h.term.chars.slice(c, c * VIZ_BOT), attrs: h.term.attrs.slice(c, c * VIZ_BOT) }
}

function changedCells(a, b) {
  let n = 0
  for (let i = 0; i < a.chars.length; i++) if (a.chars[i] !== b.chars[i] || a.attrs[i] !== b.attrs[i]) n++
  return n
}

/** Columns (x) where two canvases differ. */
function changedCols(a, b, cols) {
  const xs = []
  for (let i = 0; i < a.chars.length; i++) if (a.chars[i] !== b.chars[i] || a.attrs[i] !== b.attrs[i]) xs.push(i % cols)
  return xs
}

const cell = (h, x, y) => String.fromCodePoint(h.term.chars[y * h.term.cols + x])
const attr = (h, x, y) => h.term.attrs[y * h.term.cols + x]
// The sky's glyphs since the 2026-10-16 design pass: hem lines and joins,
// and ray strokes. Shade blocks are not among them anywhere.
const HEM = '─━▁▂┴┷'
const RAYS = '│¦:'
const SHADE = '░▒▓█'

/** The longest run of adjacent columns each holding a hem cell within one
 *  row of the previous column's -- a curtain's edge, read as a line. */
function longestHem(h, horizon) {
  const cols = h.term.cols
  let best = 0
  for (let y0 = 1; y0 < horizon; y0++) {
    for (let x0 = 0; x0 < cols; x0++) {
      if (!HEM.includes(cell(h, x0, y0))) continue
      let y = y0, n = 1
      for (let x = x0 + 1; x < cols; x++) {
        const ny = [y, y - 1, y + 1].find((yy) => yy >= 1 && yy < horizon && HEM.includes(cell(h, x, yy)))
        if (ny === undefined) break
        y = ny
        n++
      }
      if (n > best) best = n
    }
  }
  return best
}

const audio = (over) => ({
  level: 0.6, bass: 0.9, mid: 0.5, treble: 0.4,
  bands9: [0.2, 0.7, 0.4, 0.9, 0.3, 0.6, 0.5, 0.8, 0.1],
  onset: false, pulse: 0, ...over,
})

test('AURORA: draws a full canvas and never touches row 0 or the footer rows', async () => {
  const { h, aurora } = await bootAurora()
  try {
    h.advance(3000)
    const lit = h.rows().slice(1, VIZ_BOT).join('').replace(/ /g, '').length
    assert.ok(lit > 250, `only ${lit} non-space cells on the canvas`)
    // Sentinel the rows the effect must not own, draw once directly, and
    // check every sentinel survived.
    const cols = h.term.cols
    const outside = [0, ...Array.from({ length: h.term.rows - VIZ_BOT }, (_, i) => VIZ_BOT + i)]
    for (const y of outside) for (let x = 0; x < cols; x++) h.term.put(x, y, '#')
    // 2026-09-13 (audit M7) -- and every canvas cell must be written by that
    // draw. The sentinel half alone stayed green with the sky's blank-cell
    // put deleted; a per-cell hit map is what can see a hole.
    const put = h.term.put
    const hit = new Uint8Array(cols * VIZ_BOT)
    h.term.put = function (x, y, ...rest) {
      if (y >= 1 && y < VIZ_BOT && x >= 0 && x < cols) hit[y * cols + x] = 1
      return put.call(this, x, y, ...rest)
    }
    try { aurora.draw(h.program, h.screen, 12.3) } finally { h.term.put = put }
    for (const y of outside) assert.equal(h.row(y), '#'.repeat(cols), `row ${y} was drawn on`)
    let missed = 0
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) if (!hit[y * cols + x]) missed++
    assert.equal(missed, 0, `${missed} canvas cells were not repainted this frame`)
  } finally { h.shutdown() }
})

test('AURORA: moves -- frames two seconds apart differ', async () => {
  const { h } = await bootAurora()
  try {
    h.advance(2000)
    const a = canvas(h)
    h.advance(2000)
    const b = canvas(h)
    assert.ok(changedCells(a, b) >= 5, `only ${changedCells(a, b)} cells changed in 2s`)
  } finally { h.shutdown() }
})

test('AURORA: the subject reads -- bright curtains in the sky, a solid ridge, pines, a lake', async () => {
  // 2026-10-16 -- the reason for the rebuild. The 2026-09-13 drawing was
  // all DIM/FAINT `|` and `:` with a one-cell `/\` outline for mountains;
  // in a real capture it read as scribbles. So this asserts LIGHT, not
  // shape alone: curtain cells in shaded blocks, a real share of them at
  // NORMAL or BRIGHT, and a ridge filled solid rather than outlined.
  const { h, aurora, HORIZON } = await bootAurora()
  try {
    h.advance(1000)
    const p = h.program
    p.muted = false
    p._au = audio({ level: 0.75 })
    p._auroraLastT = null
    aurora.draw(p, h.screen, 21.7)
    const cols = h.term.cols
    const edge = p._auroraEdge
    const pineRow = p._auroraPine
    // 2026-10-16 (design pass) -- the light is LINES now, not blocks: the
    // block version passed every assertion this test then made while the
    // real tube showed hard-edged rectangles. So: hem cells (a line through
    // or along a cell) in the sky, a real share of them at NORMAL or
    // BRIGHT, rays standing on them, and the hems CONTINUOUS -- long runs
    // of adjacent columns, each a step of at most one row from the last.
    let hems = 0, strong = 0, rays = 0
    for (let y = 1; y < HORIZON - 2; y++) {
      for (let x = 0; x < cols; x++) {
        if (y > HORIZON - edge[x]) continue
        const ch = cell(h, x, y)
        if (HEM.includes(ch)) {
          hems++
          const a = attr(h, x, y)
          if (a === NORMAL || a === BRIGHT) strong++
        } else if (RAYS.includes(ch) && (HEM + RAYS).includes(cell(h, x, y + 1))) rays++
      }
    }
    assert.ok(hems >= 60, `only ${hems} hem cells in the sky`)
    assert.ok(strong >= 30, `only ${strong} hem cells at NORMAL or BRIGHT -- the sky does not read`)
    assert.ok(rays >= 25, `only ${rays} ray cells standing on a hem or a ray -- no rays`)
    assert.ok(longestHem(h, HORIZON) >= 25, `longest continuous hem is ${longestHem(h, HORIZON)} columns -- broken, not a curtain`)
    // The ridge is a FAINT `░` mass from the crest down to the shore in
    // every column with a peak, snow (`▀`) on the crest row only.
    let peakCols = 0, snow = 0
    for (let x = 0; x < cols; x++) {
      const e = edge[x]
      for (let y = HORIZON - e + 1; y <= HORIZON; y++) {
        const ch = cell(h, x, y)
        assert.ok(ch === '░' || (ch === '▀' && y === HORIZON - e + 1), `ridge at ${x},${y} is '${ch}'`)
        assert.equal(attr(h, x, y), FAINT, `ridge at ${x},${y} lit above FAINT`)
        if (ch === '▀') snow++
      }
      if (e >= 1) peakCols++
    }
    assert.ok(peakCols >= cols * 0.6, `only ${peakCols} columns carry a peak`)
    assert.ok(snow >= 3, `only ${snow} snow cells`)
    // Pines stand ON the land -- each in the sky cell directly above the
    // ridge or shore, never in a row the land itself fills.
    let pines = 0
    for (let x = 0; x < cols; x++) {
      for (let y = 1; y <= HORIZON; y++) {
        if (cell(h, x, y) !== '▲') continue
        pines++
        assert.equal(y, HORIZON - Math.max(1, edge[x]), `pine at ${x},${y} is not standing on the land (crest row ${HORIZON - edge[x] + 1})`)
        assert.equal(pineRow[x], y, `pine at ${x},${y} the effect did not plant`)
      }
    }
    assert.ok(pines >= 8, `only ${pines} pines`)
    assert.ok(/^░+$/.test(h.row(HORIZON)), `shore row carries something else: ${h.row(HORIZON)}`)
    // The lake: streaks of the hems' light, never a block, never above DIM.
    let reflected = 0
    for (let y = HORIZON + 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        const a = attr(h, x, y), ch = cell(h, x, y)
        if (ch === ' ') continue
        assert.ok('─~'.includes(ch), `lake cell ${x},${y} is '${ch}', not a streak`)
        assert.ok(a === FAINT || a === DIM, `lake cell ${x},${y} lit at attr ${a}`)
        if (a === DIM) reflected++
      }
    }
    assert.ok(reflected >= 8, `only ${reflected} DIM streak cells in the lake`)
  } finally { h.shutdown() }
})

test('AURORA: the sky is light, not blocks -- no shade block above the land, and an unbroken hem, in every state', async () => {
  // 2026-10-16 (design pass) -- the critique's finding, held as a rule: a
  // shade block rasters as a solid rectangle on the tube, so a curtain drawn
  // in them read as blocks (loud) or barcode (quiet). Loud, a kick in
  // flight, quiet and muted: nothing from `░▒▓█` in the sky, and each state
  // keeps a hem long enough to read as one curtain's edge.
  const { h, aurora, HORIZON } = await bootAurora()
  try {
    h.advance(1000)
    const p = h.program
    const cols = h.term.cols
    const states = [
      ['loud', false, audio({ level: 1, bands9: new Array(9).fill(1) }), false],
      ['kick', false, audio({ level: 0.95, bass: 1, onset: true }), true],
      ['quiet', false, audio({ level: 0.1, bands9: new Array(9).fill(0.1) }), false],
      ['muted', true, audio({ level: 0 }), false],
    ]
    for (const [name, muted, A, kick] of states) {
      for (const t0 of [9.4, 61.2, 240.5]) {
        p.muted = muted
        aurora.reset(p)
        p._au = A
        aurora.draw(p, h.screen, t0)
        if (kick) { // let the wave bloom: it rises over WAVE_RISE
          p._au = { ...A, onset: false }
          for (let f = 1; f <= 12; f++) aurora.draw(p, h.screen, t0 + f / 60)
        }
        const edge = p._auroraEdge
        for (let y = 1; y < HORIZON; y++) for (let x = 0; x < cols; x++) {
          if (y > HORIZON - edge[x]) continue
          assert.ok(!SHADE.includes(cell(h, x, y)), `${name} t=${t0}: shade block '${cell(h, x, y)}' in the sky at ${x},${y}`)
        }
        const run = longestHem(h, HORIZON)
        assert.ok(run >= 15, `${name} t=${t0}: longest hem is ${run} columns`)
      }
    }
  } finally { h.shutdown() }
})

test('AURORA: nothing in the landscape outshines the curtains -- at any level, muted included', async () => {
  // 2026-10-16 -- the first rebuild gave the two tallest peaks a two-row
  // `█` snow cap with a MUTED half cap on top, and under DRIFT MODE's bloom
  // they were the brightest things on screen: the eye went to the mountains
  // before the aurora. The aurora is the subject. So at every audio level
  // the brightest ridge/snow/pine/half-cap cell must rank at or below the
  // brightest curtain cell, and the landscape is never NORMAL or BRIGHT.
  const { h, aurora, HORIZON } = await bootAurora()
  try {
    h.advance(1000)
    const p = h.program
    const cols = h.term.cols
    const RANK = new Map([[FAINT, 0], [DIM, 1], [MUTED, 2], [NORMAL, 3], [BRIGHT, 4]])
    const rank = (a) => RANK.get(a) ?? 3
    const cases = [
      ['loud', false, audio({ level: 1, bands9: new Array(9).fill(1) })],
      ['mid', false, audio({ level: 0.5 })],
      ['quiet', false, audio({ level: 0.05, bands9: new Array(9).fill(0.05) })],
      ['muted', true, audio({ level: 0 })],
    ]
    for (const [name, muted, A] of cases) {
      for (const t of [11.1, 47.3, 133.9]) {
        p.muted = muted
        p._au = A
        p._auroraLastT = null
        aurora.draw(p, h.screen, t)
        const edge = p._auroraEdge
        let sky = -1, land = -1, where = ''
        for (let y = 1; y <= HORIZON; y++) {
          for (let x = 0; x < cols; x++) {
            const ch = cell(h, x, y)
            if (ch === ' ') continue
            const r = rank(attr(h, x, y))
            // 2026-10-16 (design pass): the pines are land too (they stand
            // above the crest row now), and the sky's light is its hems and
            // rays -- the `▄` half caps and the block curtains are gone.
            const isLand = y === HORIZON || y > HORIZON - edge[x] || ch === '▲'
            if (isLand) { if (r > land) { land = r; where = `${x},${y} '${ch}'` } }
            else if ((HEM + RAYS).includes(ch) && r > sky) sky = r
          }
        }
        assert.ok(sky >= 0, `${name} t=${t}: no curtain light at all`)
        assert.ok(land <= 2, `${name} t=${t}: landscape cell ${where} lit above MUTED`)
        assert.ok(land <= sky, `${name} t=${t}: landscape ${where} (rank ${land}) outshines the curtains (rank ${sky})`)
      }
    }
  } finally { h.shutdown() }
})

test('AURORA: the fabricated pulse is ignored -- pulse maxed vs zeroed draws the identical frame', async () => {
  // syntheticAudio() fabricates a pulse every 0.9s; an ambient station must
  // not breathe on it. The draw is called directly with a controlled _au,
  // gains snapped (lastT null), so the frame is a pure function of the audio
  // object and t.
  const { h, aurora } = await bootAurora()
  try {
    h.advance(1000)
    const p = h.program
    p.muted = false
    const drawWith = (A) => {
      p._au = A
      p._auroraLastT = null
      aurora.draw(p, h.screen, 37.5)
      return canvas(h)
    }
    const calm = drawWith(audio({ pulse: 0 }))
    const beat = drawWith(audio({ pulse: 1 }))
    assert.equal(changedCells(calm, beat), 0, 'the pulse changed the frame')
    // Positive control: the same call DOES see the audio it is given.
    const quiet = drawWith(audio({ level: 0.05 }))
    const loud = drawWith(audio({ level: 1 }))
    assert.ok(changedCells(quiet, loud) > 40, 'level made no visible difference -- the control is broken')
  } finally { h.shutdown() }
})

test('AURORA: an onset sends a wave of light along one curtain, which travels and then clears', async () => {
  // 2026-10-16 -- the one discrete event. Two runs of the same frames from
  // the same state, one with an onset on its first frame: the difference
  // between them IS the wave. It must show up, spread outward, and be gone
  // once its life is over.
  const { h, aurora } = await bootAurora()
  try {
    h.advance(1000)
    const p = h.program
    p.muted = false
    const cols = h.term.cols
    const run = (withOnset) => {
      aurora.reset(p)
      const shots = {}
      for (let f = 0; f <= 360; f++) {
        const t = 30 + f / 60
        p._au = audio({ onset: withOnset && f === 0 })
        aurora.draw(p, h.screen, t)
        if (f === 18 || f === 72 || f === 360) shots[f] = canvas(h)
      }
      return shots
    }
    const plain = run(false)
    const waved = run(true)
    const early = changedCols(plain[18], waved[18], cols)
    const later = changedCols(plain[72], waved[72], cols)
    assert.ok(early.length >= 8, `only ${early.length} cells lit by the wave 0.3s in`)
    const span = (xs) => Math.max(...xs) - Math.min(...xs)
    assert.ok(later.length >= 8 && span(later) > span(early) + 6,
      `the wave did not travel: span ${span(early)} at 0.3s, ${later.length ? span(later) : 0} at 1.2s`)
    assert.equal(changedCells(plain[360], waved[360]), 0, 'the wave never cleared')
    // Muted, an onset does nothing at all.
    p.muted = true
    aurora.reset(p)
    const before = p._auroraWaves.length
    p._au = audio({ onset: true })
    aurora.draw(p, h.screen, 50)
    assert.equal(p._auroraWaves.length, before, 'a muted onset started a wave')
  } finally { h.shutdown() }
})

test('AURORA: calm at rest -- steady audio changes under 1% of cells a frame, a strobing tap stays bounded', async () => {
  const { h } = await bootAurora()
  const { AUDIO_BUS } = await import(`../audio/tap.js?v=${h.tag}`)
  try {
    const cells = h.term.cols * (VIZ_BOT - 1)
    const worst = (frames, before) => {
      let prev = canvas(h), max = 0
      for (let i = 0; i < frames; i++) {
        before?.(i)
        h.advance(16)
        const cur = canvas(h)
        max = Math.max(max, changedCells(prev, cur))
        prev = cur
      }
      return max
    }
    AUDIO_BUS.active = true
    AUDIO_BUS.gated = false
    const steady = () => {
      AUDIO_BUS.level = 0.45
      AUDIO_BUS.bands9.fill(0.45)
      AUDIO_BUS.onset = false
      AUDIO_BUS.pulse = 0
    }
    steady()
    h.advance(3000)
    const rest = worst(400, steady)
    assert.ok(rest <= cells * 0.01, `steady audio: ${rest} cells changed in one frame (budget ${Math.floor(cells * 0.01)})`)
    // A live tap at its most hostile: level, every band and a beat all
    // slamming 0 <-> 1 on alternate frames. The eased gains and WAVE_GAP are
    // what keep this from strobing.
    const live = worst(400, (i) => {
      const v = i % 2
      AUDIO_BUS.level = v
      AUDIO_BUS.bands9.fill(v)
      AUDIO_BUS.onset = !!v
      AUDIO_BUS.pulse = v
    })
    assert.ok(live <= cells * 0.06, `strobing tap: ${live} cells changed in one frame (budget ${Math.floor(cells * 0.06)})`)
  } finally {
    AUDIO_BUS.active = false
    h.shutdown()
  }
})

test('AURORA: muted settles to faint light, never a blank frame', async () => {
  const { h, HORIZON } = await bootAurora()
  try {
    h.program.muted = true
    h.advance(10000)
    let lit = 0
    for (let y = 1; y < HORIZON - 6; y++) {
      for (let x = 0; x < h.term.cols; x++) {
        const ch = cell(h, x, y)
        if (ch === ' ') continue
        const a = attr(h, x, y)
        assert.ok(a !== NORMAL && a !== BRIGHT, `muted sky cell ${x},${y} lit at ${a}`)
        if ((HEM + RAYS).includes(ch)) lit++
      }
    }
    assert.ok(lit >= 25, `muted aurora is nearly gone (${lit} cells)`)
    // ...and not faint to the point of not being there: some of the hems are
    // still at MUTED (DIM and FAINT alone vanish under some phosphors).
    let seen = 0
    for (let y = 1; y < HORIZON; y++) for (let x = 0; x < h.term.cols; x++) {
      if (HEM.includes(cell(h, x, y)) && attr(h, x, y) === MUTED) seen++
    }
    assert.ok(seen >= 10, `only ${seen} muted hem cells at MUTED -- the muted sky is below what a tint shows`)
  } finally { h.shutdown() }
})

test('AURORA: re-entry after a long visit starts on a sane clock at the current level (M5 class)', async () => {
  // The effect clock restarts at 0 on entry. reset() clears _auroraLastT so
  // the first frame snaps the eased gains to what is playing NOW, and clears
  // the waves, whose start times are on that clock; without it, a loud visit
  // followed by mute and re-entry opens bright and fades.
  // 2026-09-13 (audit L12) -- the two minutes are compressed: the entry stamp
  // is moved back 120s instead of rendering 7500 frames of it. What this bug
  // class needs is an effect clock ~120s ahead at exit, and the draw's t is
  // computed from _vizEnterAt (visualizer.js), so that is exactly the state a
  // real long visit leaves.
  const { h } = await bootAurora()
  try {
    h.advance(1000)
    h.program._vizEnterAt -= 120000
    h.advance(5000)
    const loudGain = Array.from(h.program._auroraGain)
    h.key('e')
    h.advance(500)
    h.program.muted = true
    h.key('v')
    h.advance(16)
    const firstFrame = Array.from(h.program._auroraGain)
    assert.ok(h.program._auroraWaves.every((w) => w.t0 <= effectT(h) + 0.05), 'a wave from the last visit sits in the future')
    h.advance(20000)
    const settled = Array.from(h.program._auroraGain)
    for (let c = 0; c < settled.length; c++) {
      assert.ok(loudGain[c] - settled[c] > 0.1, `curtain ${c}: the visit was not louder than muted -- the test proves nothing`)
      assert.ok(Math.abs(firstFrame[c] - settled[c]) < 0.01,
        `curtain ${c} opened at gain ${firstFrame[c].toFixed(3)}, muted level is ${settled[c].toFixed(3)}`)
    }
    h.key('e')
    h.advance(500)
    h.program.muted = false
    h.key('v')
    h.advance(2000)
    const t = effectT(h)
    assert.ok(h.program._auroraLastT <= t + 0.05, `_auroraLastT ${h.program._auroraLastT} on a clock at ${t}`)
    assert.ok(h.program._auroraGain.every((g) => Number.isFinite(g) && g > 0 && g < 1.5), 'gains out of range')
    const lit = h.rows().slice(1, VIZ_BOT).join('').replace(/ /g, '').length
    assert.ok(lit > 250, `re-entered frame nearly empty (${lit})`)
  } finally { h.shutdown() }
})
