// ORBIT (SLOW ORBIT's visualizer, 2026-09-13) rendered through the real
// program and read back off the grid: the planet is a solid disc, the
// station is visible in front of it and hidden behind it, and the orbit
// resumes sanely after a long visit, exit and re-entry.
//
// 2026-10-20 (polish) -- the planet and its halo are pixel bitmaps now
// (term.putGlyph), so a planet cell is a SPACE in the character plane with
// a bitmap in term.gfx. "Content" below counts both; the shape and halo
// tests read the bitmaps.
//
// Run: node --test tests/visual-orbit.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

// Attribute bits, src/cellgrid.js.
const BRIGHT = 1, DIM = 4, MUTED = 32, NORMAL = 0
const attrAt = (h, x, y) => h.term.attrs[y * h.term.cols + x]

const CANVAS_TOP = 1
const VIZ_BOT = 22

const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000

/** Boot on SLOW ORBIT, enter the visualizer, and hand back the SAME module
 *  instance the registry holds (the harness stamps each boot's ?v=). */
async function bootOrbit() {
  const h = await boot({ station: 'slow-orbit' })
  h.powerOn()
  h.key('v')
  assert.equal(h.program.activeVisualKey(), 'orbit', 'slow-orbit should land on orbit')
  const mod = await import(`../visuals/orbit.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, mod }
}

const gfxAt = (h, x, y) => h.term.gfx[y * h.term.cols + x]
/** Lit pixels in a cell's bitmap (0 for a character cell). */
const pix = (h, x, y) => {
  const b = gfxAt(h, x, y)
  let n = 0
  if (b) for (const w of b) for (let v = w; v; v &= v - 1) n++
  return n
}
const canvasText = (h) => {
  let s = ''
  for (let y = CANVAS_TOP; y < VIZ_BOT; y++) s += h.row(y) + '\n'
  return s
}
/** The canvas as text plus every bitmap's pixel count: what changed. */
const canvasFrame = (h) => {
  let s = canvasText(h)
  for (let y = CANVAS_TOP; y < VIZ_BOT; y++) for (let x = 0; x < h.term.cols; x++) s += pix(h, x, y) + ','
  return s
}
/** Cells with something in them: a character or a lit bitmap. */
const content = (h) => {
  let n = 0
  for (let y = CANVAS_TOP; y < VIZ_BOT; y++) {
    const row = h.row(y)
    for (let x = 0; x < row.length; x++) if (row[x] !== ' ' || pix(h, x, y) > 0) n++
  }
  return n
}

test('ORBIT: paints every canvas cell each frame, and nothing outside rows 1..21', async () => {
  const { h, mod } = await bootOrbit()
  const fx = mod.default
  const realDraw = fx.draw
  try {
    h.advance(1000)
    const outside = []
    let frames = 0
    let short = 0
    fx.draw = function (p, s, t) {
      const put = s.term.put, putGlyph = s.term.putGlyph
      const seen = new Set()
      const watch = (fn) => function (x, y, ...rest) {
        if (y < CANVAS_TOP || y >= VIZ_BOT) outside.push(`${x},${y}`)
        else seen.add(y * 1000 + x)
        return fn.call(this, x, y, ...rest)
      }
      s.term.put = watch(put)
      s.term.putGlyph = watch(putGlyph)
      try { realDraw.call(this, p, s, t) } finally { s.term.put = put; s.term.putGlyph = putGlyph }
      frames++
      if (seen.size < (VIZ_BOT - CANVAS_TOP) * s.term.cols) short++
    }
    h.advance(3000)
    assert.ok(frames > 100, `draw should have run (ran ${frames})`)
    assert.deepEqual(outside.slice(0, 5), [], `${outside.length} puts landed outside the canvas`)
    assert.equal(short, 0, `${short} frames left canvas cells unpainted`)
    const n = content(h)
    assert.ok(n > 500, `canvas should carry a planet's worth of content (saw ${n})`)
  } finally { fx.draw = realDraw; h.shutdown() }
})

test('ORBIT: moves -- frames a second and a half apart differ', async () => {
  const { h } = await bootOrbit()
  try {
    h.advance(1500)
    const a = canvasFrame(h)
    h.advance(1500)
    assert.notEqual(canvasFrame(h), a)
  } finally { h.shutdown() }
})

test('ORBIT: the planet is a solid round disc of pixels with space around it', async () => {
  // 2026-10-20 (polish) -- the critique: "a coffee bean". The ▓▒░ crescent
  // rastered as vertical stripes and the disc stood as an upright egg (a
  // 2:1 cell assumed where the face gives 2.4:1). Every disc cell is a
  // bitmap now, and the disc is round in DISPLAY units.
  const { h, mod } = await bootOrbit()
  try {
    h.advance(4000)
    const g = mod.glyphCell(mod.orbitAt(h.program._orbitClock))
    let disc = 0, notPix = 0, far = 0, farBlank = 0
    for (let y = CANVAS_TOP; y < VIZ_BOT; y++) {
      const row = h.row(y)
      for (let x = 0; x < row.length; x++) {
        if (mod.inPlanet(x, y)) {
          disc++
          const onGlyph = y === g.y && x >= g.x && x < g.x + mod.ORBIT_GLYPH.length
          if (!onGlyph && !(row[x] === ' ' && pix(h, x, y) > 0)) notPix++
        } else if (!mod.inPixels(x, y)) {
          far++
          if (row[x] === ' ') farBlank++
        }
      }
    }
    // Radius 18 cols x 7.5 rows: pi*18*7.5 ~ 424 cells.
    assert.ok(disc > 360 && disc < 500, `disc should be ~424 cells (saw ${disc})`)
    assert.equal(notPix, 0, `${notPix} disc cells are not lit bitmaps -- not a solid pixel planet`)
    assert.ok(!/[░▒▓]/.test(canvasText(h)), 'shade blocks on the canvas -- they raster as stripes')
    // Space beyond the halo stays mostly black: stars and a dotted track.
    assert.ok(farBlank / far > 0.85, `only ${(100 * farBlank / far).toFixed(0)}% of open space is black`)
    // Round on the 4:3 face: the disc's widest row and tallest column,
    // converted to display units (8x16 cells + the blank ninth column,
    // stretched onto 4:3), agree within 8%.
    const { cellW, cellH } = h.term.font
    const adv = cellW + 1
    const pxW = (4 / 3) / ((h.term.cols * adv) / (h.term.rows * cellH)) // display width of one fb pixel
    let w = 0, hgt = 0
    for (let x = 0; x < h.term.cols; x++) if (mod.inPlanet(x, mod.ORBIT_CY)) w++
    for (let y = 0; y < h.term.rows; y++) if (mod.inPlanet(mod.ORBIT_CX, y)) hgt++
    const ratio = (w * adv * pxW) / (hgt * cellH)
    assert.ok(Math.abs(ratio - 1) < 0.08, `disc is ${ratio.toFixed(2)}x as wide as tall on the face -- not round`)
  } finally { h.shutdown() }
})

test('ORBIT: the station shows in front of the disc and is hidden behind it', async () => {
  const { h, mod } = await bootOrbit()
  try {
    let front = 0, behind = 0
    const bad = []
    // A lap and a bit, sampled every 100ms.
    for (let i = 0; i < (mod.ORBIT_LAP_S + 4) * 10; i++) {
      h.advance(100)
      const o = mod.orbitAt(h.program._orbitClock)
      const g = mod.glyphCell(o)
      let covered = true
      for (let k = 0; k < mod.ORBIT_GLYPH.length; k++) if (!mod.inPlanet(g.x + k, g.y)) covered = false
      if (!covered) continue
      const text = canvasText(h)
      if (o.front) {
        front++
        const got = h.row(g.y).slice(g.x, g.x + mod.ORBIT_GLYPH.length)
        if (got !== mod.ORBIT_GLYPH) bad.push(`front @${h.program._orbitClock.toFixed(1)}: ${JSON.stringify(got)}`)
      } else {
        behind++
        // 2026-10-16 (design pass) -- was '[]', the old glyph's core; with
        // the new glyph that check could never fire. '■' is drawn by
        // nothing but the station.
        if (text.includes('■')) bad.push(`behind @${h.program._orbitClock.toFixed(1)}: glyph drawn through the planet`)
      }
    }
    assert.ok(front > 20, `should sample the near pass over the disc (saw ${front})`)
    assert.ok(behind > 20, `should sample the far pass behind the disc (saw ${behind})`)
    assert.deepEqual(bad.slice(0, 5), [], `${bad.length} frames got occlusion wrong`)
  } finally { h.shutdown() }
})

test('ORBIT: re-entry after a long visit resumes the orbit where it was', async () => {
  // _orbitLastT is an effect-clock reading, ~120s ahead of the restarted
  // clock on re-entry. Two things keep that harmless, either one alone:
  // reset() clears it, and draw() refuses a negative delta. Mutation-checked
  // 2026-09-13 with BOTH removed: the first frame back stepped the orbit
  // 118s backwards and this test went red. (Removing either alone stays
  // green by design -- draw() overwrites the value every frame, so a stale
  // one cannot freeze the orbit the way FLAME's did.)
  // 2026-09-13 (audit L12) -- the two minutes are compressed: the entry stamp
  // is moved back 120s instead of rendering 7500 frames of it. What this bug
  // class needs is an effect clock ~120s ahead at exit, and the draw's t is
  // computed from _vizEnterAt (visualizer.js), so that is exactly the state a
  // real long visit leaves. The jump itself is one clamped 0.1s step, so "accumulated over
  // the first visit" is measured against the boot's random seed, not as >100s.
  const { h, mod } = await bootOrbit()
  try {
    const seed = h.program._orbitClock
    h.advance(1000)
    h.program._vizEnterAt -= 120000
    h.advance(2000)
    const before = h.program._orbitClock
    h.key('e')
    h.advance(500)
    h.key('v')
    h.advance(2000)
    const t = effectT(h)
    assert.ok(h.program._orbitLastT <= t + 0.05,
      `last-seen clock ${h.program._orbitLastT.toFixed(1)}s is ahead of the effect clock at ${t.toFixed(1)}s`)
    const advanced = h.program._orbitClock - before
    // Two seconds of frames on the new visit; the exit itself adds nothing.
    assert.ok(advanced > 1.5 && advanced < 2.5, `orbit advanced ${advanced.toFixed(2)}s over a 2s re-entry`)
    // It resumes from where it was rather than restarting the lap.
    assert.ok(before - seed > 2, 'orbit clock should have accumulated over the first visit')
    assert.ok(Math.abs(h.program._orbitBreath) <= 1)
    const a = canvasFrame(h)
    assert.ok(content(h) > 500, 'frame should still carry content after re-entry')
    h.advance(1500)
    assert.notEqual(canvasFrame(h), a, 'frame should still move after re-entry')
    assert.ok(Number.isFinite(mod.orbitAt(h.program._orbitClock).x))
  } finally { h.shutdown() }
})

test('ORBIT: muted, the halo settles and the picture stays up', async () => {
  const { h } = await bootOrbit()
  try {
    h.advance(3000)
    h.program.muted = true
    h.advance(4000)
    assert.ok(h.program._orbitBreath < 0.02, `breath should settle muted (was ${h.program._orbitBreath.toFixed(3)})`)
    assert.ok(content(h) > 500, 'muted frame should still show the planet')
  } finally { h.shutdown() }
})

test('ORBIT: brightness order -- the station is the only BRIGHT thing; the planet is NORMAL', async () => {
  // 2026-10-20 (polish) -- every pixel cell is drawn at one tier, NORMAL,
  // with brightness in the dither density (per-cell tiers tiled the sphere
  // into boxes). The station glyph stays BRIGHT wherever it shows.
  const { h, mod } = await bootOrbit()
  try {
    for (let i = 0; i < 20; i++) {
      h.advance(700)
      const g = mod.glyphCell(mod.orbitAt(h.program._orbitClock))
      for (let y = CANVAS_TOP; y < VIZ_BOT; y++) {
        for (let x = 0; x < h.term.cols; x++) {
          if (gfxAt(h, x, y)) assert.equal(attrAt(h, x, y), NORMAL, `pixel cell ${x},${y} is not NORMAL`)
        }
      }
      for (let k = 0; k < mod.ORBIT_GLYPH.length; k++) {
        const x = g.x + k
        if (h.row(g.y)[x] === mod.ORBIT_GLYPH[k]) assert.equal(attrAt(h, x, g.y), BRIGHT, 'station glyph should be BRIGHT')
      }
    }
  } finally { h.shutdown() }
})

test('ORBIT: the breath widens the halo (polish)', async () => {
  // 2026-10-20 (polish) -- the critique: the halo looked the same MUTED and
  // LOUD. The breath is the halo's WIDTH now: the glow outside the limb
  // carries far more lit pixels at full breath than at rest.
  // Mutation-checked: with HALO_WB set to 0 this goes red.
  const { h, mod } = await bootOrbit()
  try {
    h.program.muted = true // breath settles to 0 and stays there
    h.advance(4000)
    const halo = []
    for (let y = CANVAS_TOP; y < VIZ_BOT; y++) {
      for (let x = 0; x < h.term.cols; x++) if (mod.inPixels(x, y) && !mod.inPlanet(x, y)) halo.push([x, y])
    }
    const lit = () => halo.reduce((n, [x, y]) => n + pix(h, x, y), 0)
    const calm = lit()
    assert.ok(calm > 200, `the resting rim should still be there (${calm} px)`)
    // Hold the breath high: muted, one frame cannot ease it below ~0.98.
    h.program._orbitBreath = 1
    h.advance(16)
    assert.ok(h.program._orbitBreath > 0.9, 'breath fell in one frame')
    const full = lit()
    assert.ok(full > calm * 1.6, `full breath lit ${full} halo px against ${calm} at rest -- no swell`)
  } finally { h.shutdown() }
})

test('ORBIT: the orbit track is visible -- near half MUTED in open space (polish)', async () => {
  // 2026-10-20 (polish) -- at FAINT the track could not be seen on green,
  // so the station sat alone with nothing behind it. Near half MUTED, far
  // half DIM. Mutation-checked: the near half at FAINT goes red.
  const { h, mod } = await bootOrbit()
  try {
    h.program.muted = true // shortest trail, so the track is what is read
    h.advance(2000)
    let near = 0, far = 0
    for (let k = 0; k < 96; k++) {
      const o = mod.orbitAt((k / 96) * mod.ORBIT_LAP_S)
      const x = Math.round(o.x), y = Math.round(o.y)
      if (mod.inPixels(x, y) || y < CANVAS_TOP || y >= VIZ_BOT) continue
      if (h.row(y)[x] !== '·') continue
      const a = attrAt(h, x, y)
      if (o.front && a === MUTED) near++
      if (!o.front && a === DIM) far++
    }
    assert.ok(near >= 6, `near-half track dots at MUTED: ${near}`)
    assert.ok(far >= 6, `far-half track dots at DIM: ${far}`)
  } finally { h.shutdown() }
})
