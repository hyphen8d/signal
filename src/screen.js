// Host layer: font fetch, grid + renderer construction, frame loop, keyboard.
// The only file here that touches the DOM.

import { parseBDF } from './bdf.js'
import { Term } from './term.js'
import { CRT } from './crt.js'

// 2026-08-25 audit: config is passed in by the caller (see mount) rather
// than imported here. This file used to `await import('../config.js?t=' +
// Date.now())` -- one of three separate config imports in the pre-audit
// build, each a separate module instance, which is what broke CRT's
// phosphor identity check (see main.js's comment). The engine now takes
// its config as a plain object and never touches config.js itself, which
// also makes it usable standalone with any config shape.

async function loadFont(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`font ${url}: ${res.status}`)
  return parseBDF(await res.text())
}

/** A running tube. Construct via mount(). */
export class Screen {
  constructor(canvas, term, crt, program, config) {
    this.canvas = canvas
    this.term = term
    this.crt = crt
    this.program = program
    this.config = config
    this.cols = term.cols
    this.rows = term.rows

    this.raf = 0
    this.t0 = 0
    this.blinkAt = 0
    this.stopped = false

    this.onKeyDown = e => { this.program?.key?.(this, e) }
    this.onKeyUp = e => { this.program?.keyUp?.(this, e) }
  }

  /** Set the beam tint by name. See PHOSPHORS in config.js. */
  setPhosphor(name) { this.crt.setPhosphor(name) }

  /** Minimum gap between console reports of a frame-path throw (see frame). */
  static ERR_EVERY_MS = 5000

  start() {
    addEventListener('keydown', this.onKeyDown)
    addEventListener('keyup', this.onKeyUp)
    this.program?.init?.(this)
    this.raf = requestAnimationFrame(t => this.frame(t))
  }

  // 2026-09-12 (audit, M4): the loop survives a throw. The next
  // requestAnimationFrame used to be the last statement of the body, so one
  // exception anywhere in the frame path -- a visual's draw(), a weather
  // redraw, a game step -- ended the chain for good: the tube froze on its
  // last frame while YouTube played on, the fallback ticker kept draining
  // effects into a grid nobody rasterised, and the fault panel never showed
  // because that panel is wired to webglcontextlost, a dead context, not a
  // dead loop. A "leave it on all afternoon" app has hours of exposure per
  // session to a bug that looks like a hung machine. Re-arming from a
  // `finally` means a bad frame costs one frame: the program keeps
  // ticking, the picture keeps rendering, and the throw is still loud in
  // the console. The console line is rate-limited (first one, then one per
  // ERR_EVERY_MS with a count) because a throw that repeats every frame
  // would otherwise log sixty times a second and choke the tab it was meant
  // to help debug. Rendering is deliberately NOT skipped on the bad frame's
  // way out: the rasteriser and the CRT are independent of what threw, and
  // a frame that still renders is the difference between a hiccup and a
  // freeze.
  frame(t) {
    if (this.stopped) return
    try {
      this._frame(t)
    } catch (err) {
      this._frameError(err, t)
    } finally {
      if (!this.stopped) this.raf = requestAnimationFrame(ts => this.frame(ts))
    }
  }

  _frame(t) {
    if (!this.t0) this.t0 = t
    const { term, crt } = this
    const { RENDER } = this.config

    if (RENDER.cursor && t - this.blinkAt > RENDER.blinkMs) {
      this.blinkAt = t
      term.cursorVisible = !term.cursorVisible
      // Just the cursor's row: raster() works out which rows a blink or a
      // move actually touches (see Term.raster's cursor note).
      term.markRow(term.cy)
    }
    term.showCursor = RENDER.cursor

    this.program?.frame?.(this, (t - this.t0) / 1000)

    // The tube renders every frame (noise, roll bar and persistence are all
    // per-frame); the rasteriser runs only over the rows whose cells changed,
    // and only those rows are uploaded (see CellGrid.dirtyRows).
    if (term.dirty) {
      const bands = term.raster()
      if (bands.length) crt.upload(term.fb, bands)
    }

    crt.resize(RENDER.pixelBudget)
    crt.render(t / 1000)
  }

  /** Report a frame-path throw without flooding: the first one verbatim,
   *  then at most one line per ERR_EVERY_MS carrying how many were
   *  swallowed in between. `frameErrors` is the running total, readable by
   *  a test or a console. */
  _frameError(err, t) {
    this.frameErrors = (this.frameErrors || 0) + 1
    this._errPending = (this._errPending || 0) + 1
    if (this._errAt != null && t - this._errAt < Screen.ERR_EVERY_MS) return
    const suppressed = this._errPending - 1
    this._errAt = t
    this._errPending = 0
    console.error(`frame: ${err?.stack || err}` + (suppressed ? ` (+${suppressed} more since the last report)` : ''))
  }

  /** Stop the loop and free the GL context. Not restartable. */
  dispose() {
    this.stopped = true
    cancelAnimationFrame(this.raf)
    removeEventListener('keydown', this.onKeyDown)
    removeEventListener('keyup', this.onKeyUp)
    this.crt.dispose()
  }
}

/**
 * Start a tube on a canvas and run a program on it.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{init?: Function, frame?: Function, key?: Function, keyUp?: Function}} program
 * @param {{FONT: object, GRID: object, RENDER: object, SCREEN: object,
 *   PHOSPHORS: object, PHOSPHOR: string}} config the config.js module (or
 *   any object of the same shape)
 * @returns {Promise<Screen>}
 */
export async function mount(canvas, program, config) {
  const { FONT, GRID, RENDER, SCREEN, PHOSPHORS, PHOSPHOR } = config
  const font = await loadFont(FONT.regular)

  const term = new Term(font, GRID.cols, GRID.rows, GRID.padX, GRID.padY)
  const crt = new CRT(canvas, term.w, term.h, {
    superSample: RENDER.superSample,
    params: SCREEN,
    phosphors: PHOSPHORS,
    phosphor: PHOSPHOR,
  })

  // Cuts load behind the roman. Until one arrives BOLD is the smear and ITALIC
  // is roman, as on a family that has neither.
  if (FONT.bold) loadFont(FONT.bold).then(f => { term.bold = f; term.dirty = true }).catch(() => {})
  if (FONT.italic) loadFont(FONT.italic).then(f => { term.italic = f; term.dirty = true }).catch(() => {})

  const screen = new Screen(canvas, term, crt, program, config)
  screen.start()
  return screen
}
