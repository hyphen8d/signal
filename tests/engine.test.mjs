// src/ -- the engine, tested where it can be tested without a GPU. The
// frame loop's survival contract (2026-09-12 audit, M4), the shader clock's
// CPU-side wrap and the roll bar's integrated phase (L11), and DotCanvas
// plotting at the edges (L12). Everything here drives the real class with a
// stub term/crt: Screen.frame() is plain JS around a rAF, and the two clock
// helpers are exported precisely so this file can hold them to a number.

import test from 'node:test'
import assert from 'node:assert/strict'

const { Screen } = await import('../src/screen.js?v=engine')
const { CLOCK_WRAP_S, wrapClock, advanceRollPhase } = await import('../src/crt.js?v=engine')
const { DotCanvas } = await import('../src/vector.js?v=engine')

/** A Screen on stubs: a term nothing dirties, a crt that counts renders, a
 *  program whose frame() throws on the frames listed. rAF is captured so the
 *  test can pump it by hand and see whether the chain is still alive. */
function stubScreen(throwOn = []) {
  const rafs = []
  globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length }
  globalThis.cancelAnimationFrame = () => {}
  const term = { cols: 80, rows: 25, dirty: false, cy: 0, markRow() {}, raster() { return [] }, fb: null }
  const crt = { renders: 0, resize() {}, render() { this.renders++ }, upload() {}, dispose() {}, setPhosphor() {} }
  let n = 0
  const program = {
    frames: 0,
    frame() { n++; this.frames++; if (throwOn.includes(n)) throw new Error(`frame ${n} blew up`) },
  }
  const config = { RENDER: { cursor: false, blinkMs: 480, pixelBudget: 1 } }
  const screen = new Screen({}, term, crt, program, config)
  const pump = (t) => { const cb = rafs.pop(); rafs.length = 0; cb(t) }
  return { screen, crt, program, rafs, pump }
}

function quietConsole(fn) {
  const orig = console.error
  const lines = []
  console.error = (...a) => lines.push(a.join(' '))
  try { return { out: fn(), lines } } finally { console.error = orig }
}

test('a throw in the frame path costs one frame, not the loop (M4)', () => {
  const { screen, crt, program, rafs, pump } = stubScreen([2])
  const { lines } = quietConsole(() => {
    screen.frame(16)
    assert.equal(rafs.length, 1, 'the first frame armed the next')
    pump(32)                                    // this one throws
    assert.equal(rafs.length, 1, 'the throwing frame STILL armed the next -- the whole point')
    pump(48)
    pump(64)
  })
  assert.equal(program.frames, 4, 'the program kept being ticked after the throw')
  assert.equal(crt.renders, 3, 'every non-throwing frame still rendered')
  assert.equal(screen.frameErrors, 1)
  assert.equal(lines.length, 1, 'and the throw was reported, once')
  assert.match(lines[0], /frame 2 blew up/)
})

test('a throw on every frame is reported at most once per ERR_EVERY_MS, with a count (M4)', () => {
  const every = Array.from({ length: 400 }, (_, i) => i + 1)
  const { screen, pump } = stubScreen(every)
  const { lines } = quietConsole(() => {
    screen.frame(0)
    for (let i = 1; i < 400; i++) pump(i * 16)   // ~6.4s of frames, all throwing
  })
  assert.equal(screen.frameErrors, 400, 'every throw was counted')
  assert.ok(lines.length >= 2 && lines.length <= 3, `reported ${lines.length} times for 400 throws over 6.4s`)
  assert.match(lines[1], /\+\d+ more since the last report/, 'the second report says how many it swallowed')
})

test('stop() is honoured from inside the throwing frame: no rAF after dispose', () => {
  const { screen, rafs } = stubScreen([1])
  quietConsole(() => {
    screen.stopped = true          // dispose() without a GL context to free
    screen.frame(16)
  })
  assert.equal(rafs.length, 0, 'a stopped screen does not re-arm, even from finally')
})

test('the shader clock wraps on the CPU at a whole number of frames (L11)', () => {
  assert.equal(CLOCK_WRAP_S * 60 % 1, 0, 'the wrap period is a whole number of 1/60s frames')
  assert.equal(wrapClock(0), 0)
  assert.equal(wrapClock(CLOCK_WRAP_S), 0)
  assert.equal(wrapClock(CLOCK_WRAP_S + 0.5), 0.5)
  // The failure this exists for: a three-day session. In float32 the raw
  // clock's per-frame step is quantised to the float's spacing at that
  // magnitude (1/64s at 72h -- a 6% error that makes the grain skip and
  // the roll bar judder); the wrapped one resolves 1/60 to a rounding error.
  const t = 3 * 24 * 3600
  const step = 1 / 60
  const raw = Math.fround(t + step) - Math.fround(t)
  assert.ok(Math.abs(raw - step) > step * 0.05, `raw float32 clock at 72h steps ${raw}, not 1/60 (the bug)`)
  const wrapped = Math.fround(wrapClock(t + step)) - Math.fround(wrapClock(t))
  assert.ok(Math.abs(wrapped - step) < step * 0.001, `wrapped clock steps ${wrapped}`)
})

test('the roll bar phase is continuous across the clock wrap and a speed change (L11)', () => {
  let phase = 0
  const dt = 1 / 60
  // Run up to the wrap at 0.33 crossings/s and step across it.
  for (let i = 0; i < CLOCK_WRAP_S * 60; i++) phase = advanceRollPhase(phase, dt, 0.33)
  const before = phase
  phase = advanceRollPhase(phase, dt, 0.33)
  const d = (phase - before + 1) % 1
  assert.ok(Math.abs(d - 0.33 * dt) < 1e-9, `one frame of phase across the wrap, got ${d}`)
  assert.ok(phase >= 0 && phase < 1)
  // A glitch ramps the speed: the bar accelerates rather than teleporting.
  const p0 = phase
  phase = advanceRollPhase(phase, dt, 1.1)
  assert.ok(Math.abs(((phase - p0 + 1) % 1) - 1.1 * dt) < 1e-9, 'a speed change moves the bar by one frame at the new speed')
  // Garbage in, phase held: a backwards clock or a tab asleep for an hour.
  assert.equal(advanceRollPhase(0.4, -1, 0.33), 0.4)
  assert.equal(advanceRollPhase(0.4, 3600, 0.33), 0.4)
  assert.equal(advanceRollPhase(0.4, NaN, 0.33), 0.4)
})

test('a dot just off the top or left edge is dropped, not snapped to 0 (L12)', () => {
  const term = { cols: 4, rows: 2, advance: 8, font: { cellH: 16 } }
  const dc = new DotCanvas(term)
  dc.plot(-0.5, 1)
  dc.plot(1, -0.5)
  assert.ok(dc.cells.every((c) => c === 0), 'nothing lit by dots at x or y in (-1, 0)')
  dc.plot(0.9, 0.9)
  assert.notEqual(dc.cells[0], 0, 'a dot inside cell 0 still lights it')
  dc.clear()
  dc.plot(dc.w - 0.5, dc.h - 0.5)
  assert.notEqual(dc.cells[dc.cells.length - 1], 0, 'and the far corner still lands in the last cell')
})
