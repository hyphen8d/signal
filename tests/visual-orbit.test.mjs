// ORBIT (SLOW ORBIT's visualizer, 2026-09-13) rendered through the real
// program and read back off the grid: the planet is a solid disc, the
// station is visible in front of it and hidden behind it, and the orbit
// resumes sanely after a long visit, exit and re-entry.
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

const canvasText = (h) => {
  let s = ''
  for (let y = CANVAS_TOP; y < VIZ_BOT; y++) s += h.row(y) + '\n'
  return s
}
const nonSpace = (h) => canvasText(h).replace(/[\s]/g, '').length

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
      const put = s.term.put
      const seen = new Set()
      s.term.put = function (x, y, ...rest) {
        if (y < CANVAS_TOP || y >= VIZ_BOT) outside.push(`${x},${y}`)
        else seen.add(y * 1000 + x)
        return put.call(this, x, y, ...rest)
      }
      try { realDraw.call(this, p, s, t) } finally { s.term.put = put }
      frames++
      if (seen.size < (VIZ_BOT - CANVAS_TOP) * s.term.cols) short++
    }
    h.advance(3000)
    assert.ok(frames > 100, `draw should have run (ran ${frames})`)
    assert.deepEqual(outside.slice(0, 5), [], `${outside.length} puts landed outside the canvas`)
    assert.equal(short, 0, `${short} frames left canvas cells unpainted`)
    const n = nonSpace(h)
    assert.ok(n > 500, `canvas should carry a planet's worth of content (saw ${n})`)
  } finally { fx.draw = realDraw; h.shutdown() }
})

test('ORBIT: moves -- frames a second and a half apart differ', async () => {
  const { h } = await bootOrbit()
  try {
    h.advance(1500)
    const a = canvasText(h)
    h.advance(1500)
    assert.notEqual(canvasText(h), a)
  } finally { h.shutdown() }
})

test('ORBIT: the planet is a solid round disc with space around it', async () => {
  const { h, mod } = await bootOrbit()
  try {
    h.advance(4000)
    let disc = 0, blank = 0, far = 0, farBlank = 0
    for (let y = CANVAS_TOP; y < VIZ_BOT; y++) {
      const row = h.row(y)
      for (let x = 0; x < row.length; x++) {
        const dx = x - mod.ORBIT_CX, dy = (y - mod.ORBIT_CY) * mod.ORBIT_ASPECT
        const r = Math.sqrt(dx * dx + dy * dy)
        if (mod.inPlanet(x, y)) {
          disc++
          if (row[x] === ' ') blank++
        } else if (r > mod.ORBIT_R + mod.ORBIT_HALO + 1) {
          far++
          if (row[x] === ' ') farBlank++
        }
      }
    }
    // Radius 17 cols x 8.5 rows: roughly pi*17*8.5 ~ 450 cells.
    assert.ok(disc > 380 && disc < 520, `disc should be ~450 cells (saw ${disc})`)
    assert.equal(blank, 0, `${blank} cells inside the disc are empty -- not a solid planet`)
    // Space beyond the halo stays mostly black: stars and a dotted track.
    assert.ok(farBlank / far > 0.85, `only ${(100 * farBlank / far).toFixed(0)}% of open space is black`)
    // Round, not a box: the centre row is ~2x wider in cells than the disc
    // is tall, and the rows near the top are much narrower than the middle.
    const width = (y) => { let n = 0; for (let x = 0; x < 80; x++) if (mod.inPlanet(x, y)) n++; return n }
    assert.ok(width(mod.ORBIT_CY) > 2.5 * width(mod.ORBIT_CY - 8), 'disc should narrow towards its poles')
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
    const a = canvasText(h)
    assert.ok(nonSpace(h) > 500, 'frame should still carry content after re-entry')
    h.advance(1500)
    assert.notEqual(canvasText(h), a, 'frame should still move after re-entry')
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
    assert.ok(nonSpace(h) > 500, 'muted frame should still show the planet')
  } finally { h.shutdown() }
})

test('ORBIT: shapes, not character soup -- shaded disc, ( ) limb, BRIGHT station (design pass)', async () => {
  // 2026-10-16 -- the lit side was runs of '# % = * + -' and read as text;
  // the night side's ':' dots vanished on the tube; the station was no
  // brighter than the planet. Now: the disc is only shade blocks and the
  // limb, every disc row is closed by '(' ... ')', and the station glyph is
  // BRIGHT wherever it shows.
  const { h, mod } = await bootOrbit()
  try {
    for (let i = 0; i < 30; i++) {
      h.advance(500)
      const o = mod.orbitAt(h.program._orbitClock)
      const g = mod.glyphCell(o)
      for (let y = 1; y < VIZ_BOT; y++) {
        const row = h.row(y)
        let first = -1, last = -1
        for (let x = 0; x < row.length; x++) {
          if (!mod.inPlanet(x, y)) continue
          if (first < 0) first = x
          last = x
          const onGlyph = y === g.y && x >= g.x && x < g.x + mod.ORBIT_GLYPH.length
          if (onGlyph) continue
          assert.ok('░▒▓()'.includes(row[x]), `disc cell ${x},${y} is '${row[x]}' -- character soup`)
        }
        if (first < 0) continue
        const onGlyph = (x) => y === g.y && x >= g.x && x < g.x + mod.ORBIT_GLYPH.length
        if (!onGlyph(first)) assert.equal(row[first], '(', `row ${y} limb should open with '('`)
        if (!onGlyph(last)) assert.equal(row[last], ')', `row ${y} limb should close with ')'`)
      }
      // Lit side present: some ▓ on the disc.
      assert.ok(canvasText(h).includes('▓'), 'no lit crescent on the disc')
      for (let k = 0; k < mod.ORBIT_GLYPH.length; k++) {
        const x = g.x + k
        if (h.row(g.y)[x] === mod.ORBIT_GLYPH[k]) assert.equal(attrAt(h, x, g.y), BRIGHT, 'station glyph should be BRIGHT')
      }
    }
  } finally { h.shutdown() }
})

test('ORBIT: the halo is one continuous ring that steps up a tier on the breath (design pass)', async () => {
  // 2026-10-16 -- the old halo was a graded band thinner than a tier step,
  // and its breathing never showed on the tube. Every cell touching the
  // disc is now a '·', and the whole ring steps one tier (DIM->MUTED on the
  // night half, MUTED->NORMAL sunward) when the breath passes the step.
  // Mutation-checked: with the ring's attr pinned to DIM this goes red.
  const { h, mod } = await bootOrbit()
  try {
    h.program.muted = true // breath settles to 0 and stays there
    h.advance(4000)
    const ring = []
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < 80; x++) if (mod.touchesPlanet(x, y)) ring.push([x, y])
    assert.ok(ring.length > 80, `ring has only ${ring.length} cells`)
    const glyphRow = mod.glyphCell(mod.orbitAt(h.program._orbitClock)).y
    const read = () => ring.filter(([, y]) => y !== glyphRow && y !== glyphRow).map(([x, y]) => [h.row(y)[x], attrAt(h, x, y)])
    const calm = read()
    const notDot = calm.filter(([c]) => c !== '·' && c !== ' ').length
    // A trail dot or the orbit track may land on a ring cell; the ring must
    // otherwise be whole.
    assert.ok(calm.filter(([c]) => c === '·').length / calm.length > 0.95, `ring is broken (${notDot} non-dot cells)`)
    assert.ok(calm.every(([c, a]) => c !== '·' || a === DIM || a === MUTED), 'calm ring should sit at DIM/MUTED')
    // Swell: hold the breath high and the ring steps up.
    h.program.muted = false
    const step = mod.ORBIT_BREATH_STEP
    let up = 0
    for (let i = 0; i < 5; i++) {
      h.program._orbitBreath = 1
      h.program.muted = true // target 0, but one frame cannot ease 1 below the step
      h.advance(16)
      const now = read()
      for (let k = 0; k < now.length; k++) if (now[k][0] === '·' && calm[k][0] === '·' && now[k][1] !== calm[k][1]) up++
    }
    assert.ok(h.program._orbitBreath > step, 'breath fell through the step in one frame')
    assert.ok(up > ring.length * 0.8 * 5, `only ${up} ring cells stepped up on the breath`)
  } finally { h.shutdown() }
})
