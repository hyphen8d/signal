// ORBIT (SLOW ORBIT's visualizer, 2026-09-13) rendered through the real
// program and read back off the grid: the planet is a solid disc, the
// station is visible in front of it and hidden behind it, and the orbit
// resumes sanely after a long visit, exit and re-entry.
//
// Run: node --test tests/visual-orbit.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

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
        if (text.includes('[]')) bad.push(`behind @${h.program._orbitClock.toFixed(1)}: glyph drawn through the planet`)
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
