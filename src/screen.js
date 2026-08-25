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

  start() {
    addEventListener('keydown', this.onKeyDown)
    addEventListener('keyup', this.onKeyUp)
    this.program?.init?.(this)
    this.raf = requestAnimationFrame(t => this.frame(t))
  }

  frame(t) {
    if (this.stopped) return
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
    this.raf = requestAnimationFrame(ts => this.frame(ts))
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
