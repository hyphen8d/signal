// Headless harness for program.js (2026-08-25 audit).
//
// program.js has no module-level DOM dependencies, so Node can import it
// directly; everything it needs at runtime is stubbed here: a `window`, a
// `document`, `localStorage`, the YouTube API handshake globals, `fetch`
// (rejects -- no network in tests), and a FAKE CLOCK. `performance.now()`
// and `Date.now()` both read the harness's `now`, which only moves when a
// test calls advance(); advance() then drives program.frame() in 16ms
// steps and rasterises the real Term, so a test can power the set on, wait
// out the boot readout, open the guide, and assert on the text grid --
// exactly the sequences that used to break, replayed deterministically in
// a few milliseconds.
//
// The CRT is a stub with a real `params` object (program.js drives it) and
// the same setPhosphor()/clearPersist() contract as src/crt.js, counting
// persistence clears so a test can assert on them.
//
// Every boot() gets a fresh module instance of program.js/config.js/
// stations.js (unique `?v=` query per boot), since program.js keeps
// module-level state (audio handles, crtBase, the tap) that would otherwise
// leak between tests.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
let bootCount = 0
let font = null

export async function boot({ saved = null, mobile = false } = {}) {
  const tag = `test${++bootCount}`
  let now = 0
  const store = new Map()
  if (saved) store.set('signal:state:v1', JSON.stringify(saved))

  globalThis.window = globalThis
  globalThis.document = {
    hidden: false, visibilityState: 'visible', title: '', activeElement: null,
    addEventListener() {}, removeEventListener() {},
  }
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
  // config.js decides MOBILE_LITE once at import from matchMedia; force it.
  globalThis.matchMedia = () => ({ matches: mobile })
  globalThis.SIGNAL_YT_READY = false
  globalThis.SIGNAL_YT_QUEUE = []
  globalThis.SIGNAL_BUILD = tag
  globalThis.fetch = () => Promise.reject(new Error('no network in tests'))
  Object.defineProperty(globalThis, 'performance', {
    value: { now: () => now }, configurable: true, writable: true,
  })
  const realDateNow = Date.now
  Date.now = () => 1_800_000_000_000 + now

  // Fake timers, on the same clock. program.js deliberately keeps a few
  // things on real setTimeout/setInterval (the scan and preset dial sweeps,
  // the clock, audio scheduling) -- see the fx note at the top of the
  // program object. Under test those have to move with advance() too, or a
  // preset press never finishes its sweep. Timers due at a step run before
  // that step's frame(), in creation order among equals.
  const real = {
    setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval,
    clearTimeout: globalThis.clearTimeout, clearInterval: globalThis.clearInterval,
  }
  let timerSeq = 0
  const timers = new Map() // id -> { at, every, fn, args }
  globalThis.setTimeout = (fn, ms = 0, ...args) => { const id = ++timerSeq; timers.set(id, { at: now + Math.max(0, ms), every: 0, fn, args }); return id }
  globalThis.setInterval = (fn, ms = 0, ...args) => { const id = ++timerSeq; const every = Math.max(1, ms); timers.set(id, { at: now + every, every, fn, args }); return id }
  globalThis.clearTimeout = (id) => { timers.delete(id) }
  globalThis.clearInterval = (id) => { timers.delete(id) }
  const runDueTimers = () => {
    const due = [...timers.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])
    for (const [id, t] of due) {
      if (!timers.has(id)) continue // cleared by an earlier callback
      if (t.every) t.at += t.every // from the scheduled time, as a real interval does
      else timers.delete(id)
      t.fn(...t.args)
    }
  }

  if (!font) {
    const { parseBDF } = await import('../src/bdf.js')
    font = parseBDF(readFileSync(path.join(root, 'fonts', 'ter-u16n.bdf'), 'utf8'))
  }
  const { Term } = await import('../src/term.js')
  const config = await import(`../config.js?v=${tag}`)
  const { GRID, SCREEN, PHOSPHORS, PHOSPHOR } = config
  const term = new Term(font, GRID.cols, GRID.rows, GRID.padX, GRID.padY)
  const crt = {
    params: { ...SCREEN },
    phosphors: PHOSPHORS,
    phosphor: PHOSPHORS[PHOSPHOR],
    clears: 0,
    setPhosphor(name) {
      const tint = this.phosphors[name]
      if (!tint || tint === this.phosphor) return
      this.phosphor = tint
      this.clearPersist()
    },
    clearPersist() { this.clears++ },
  }
  const program = (await import(`../program.js?v=${tag}`)).default
  const screen = {
    term, crt, program, config,
    cols: term.cols, rows: term.rows,
    setPhosphor(name) { crt.setPhosphor(name) },
  }
  program.init(screen)

  const h = {
    screen, term, crt, program, config,
    get now() { return now },
    /** Dispatch a keydown the way screen.js would. */
    key(key, extra = {}) {
      program.key(screen, { key, shiftKey: false, preventDefault() {}, ...extra })
    },
    /** Move the fake clock forward, ticking frame() every `step` ms. */
    advance(ms, step = 16) {
      const end = now + ms
      while (now < end) {
        now = Math.min(end, now + step)
        runDueTimers()
        program.frame(screen, now / 1000)
        if (term.dirty) term.raster()
      }
    },
    /** Touch gestures, the way program.js reads them off touchstart/touchend. */
    touch(x0, y0, x1, y1, dt = 80) {
      const ev = (touches, changed) => ({ touches, changedTouches: changed, target: null, preventDefault() {} })
      program.onTouchStart(screen, ev([{ clientX: x0, clientY: y0 }], []))
      now += dt
      program.onTouchEnd(screen, ev([], [{ clientX: x1, clientY: y1 }]))
    },
    tap() { h.touch(100, 100, 100, 100) },
    /** dir > 0 swipes right (next station), < 0 left. */
    swipe(dir) { h.touch(100, 200, 100 + dir * 120, 200) },
    /** Like advance(), but with rAF starved: timers run, frame() never
     *  does -- a hidden, occluded or throttled tab. */
    idle(ms, step = 16) {
      const end = now + ms
      while (now < end) { now = Math.min(end, now + step); runDueTimers() }
    },
    /** Pending fake timers, for assertions. */
    timers() { return [...timers.values()] },
    row(y) {
      let s = ''
      for (let x = 0; x < term.cols; x++) s += String.fromCodePoint(term.chars[y * term.cols + x])
      return s
    },
    rows() { return Array.from({ length: term.rows }, (_, y) => h.row(y)) },
    /** Index of the first row containing `text`, or -1. */
    find(text) { return h.rows().findIndex((r) => r.includes(text)) },
    /** Power on from STANDBY and wait out the boot readout. */
    powerOn() {
      h.advance(600) // the cold-open flourish gates [P] for its first 500ms
      h.key('p')
      h.advance(4000)
      if (!program.poweredOn) throw new Error('powerOn(): set did not come up')
    },
    shutdown() {
      timers.clear()
      Object.assign(globalThis, real)
      Date.now = realDateNow
    },
  }
  return h
}
