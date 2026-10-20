// SIGNAL -- visualizer effect "RIPPLE" (CITY LIGHTS), labelled TOKYO BAY.
//
// ---- 2026-10-18: the bay in pixels (third build) ----
//
// What Matt said, live on build 2026-10-18.1: "Bayside, maybe try a
// different style." What the real tube showed (the before sheet): the
// 2026-10-16 skyline read as a thin box-drawing OUTLINE -- '▄' roofs, '░'
// faces, '■' windows, a '/ \ ─ ┼' lattice -- a schematic of a city, not a
// city at night, and the KICK tile was barely distinguishable from LOUD:
// the kick's work was a random 25% of windows changing state, which in a
// still is just a different random arrangement of the same dots. Tuning
// could not fix either; both are the character grid's limits.
//
// What this is instead -- style: BEAM-RESOLUTION PIXEL ART, every canvas
// cell an 8x16 bitmap through putGlyph() (the technique FLAME proved, and
// Matt approved FLAME live). The canvas becomes a 640x336 picture and the
// city is drawn the way a night city actually looks: building SILHOUETTES
// cut out of a dithered horizon glow, defined by nothing but their lit
// windows (2-3 pixel squares, hundreds of them), rather than outlined.
//
// Subject: Tokyo Bay at night -- one nameable picture, Tokyo Tower standing
// over the skyline across the water, a suspension bridge strung with lights
// on the left (the Rainbow Bridge, as seen from the Odaiba shore -- the
// view every city-pop night-drive edit cuts to), a crescent moon, and the
// bay below holding a true REFLECTION: the sky's own pixels mirrored and
// wobbled row by row, one tier dimmer, so the city's light runs down into
// the water as broken streaks. CITY LIGHTS' freqNote is Bay FM 78.0; the
// bay was always the place. Kept from the old effect: the bay, the tower
// as the thing that answers the beat, rain-ring water. Dropped: every
// box-drawing glyph, the signs, the per-window churn.
//
// The musical element is ONE thing: the tower's light.
//  - THE KICK (a rising edge on `pulse`, as DANCEFLOOR reads it -- a real
//    onset with a tap, syntheticAudio's own ~0.9s pulse without one): the
//    tower lights up from its base to the antenna (BRIGHT climbing the
//    lattice over ~0.1s, held ~0.3s, easing back to NORMAL), its aureole
//    swells, and a RING leaves its reflection and spreads slowly out across
//    the bay (70px/s, a flattened ellipse, alive 4.5s, at most five at once)
//    -- the station's name for this effect, on the water where rain always
//    belonged. The ring is what makes the kick readable in a still: after a
//    kick there is a fresh ring under the tower, between kicks there is none.
//  - LEVEL (eased over ~0.7s, never per-frame) sets the aureole's size
//    around the tower's main deck, so a loud passage glows wider than a
//    quiet one without anything flickering.
//  The city itself does not dance: windows switch on and off on their own
//  slow clock (each re-decides every ~30s, staggered), aircraft lights
//  blink on a 2s cycle, the water moves. City pop is warm and calm, and a
//  skyline that strobes with the hi-hat is not a city.
//
// The rubric (visuals/index.js), point by point:
//  1. ONE SUBJECT -- Tokyo Tower over the bay at night.
//  2. ONE MUSICAL ELEMENT -- the tower's light: kick = light-up + ring on
//     the water; level = aureole size. KICK vs LOUD: a ring vs no ring.
//  3. BRIGHTNESS ORDER -- the tower is NORMAL at rest and the only thing
//     ever BRIGHT; front-rank windows and bridge lights MUTED; back-rank
//     windows, cables, moon DIM; glow, stars and roofs FAINT; reflections
//     one tier under their source.
//  4. SHAPES, NOT SOUP -- no characters on the canvas at all. Mass is
//     negative space (a building is where the glow is not); nothing fills a
//     cell solid (the moon is the one solid shape, a few cells, at DIM).
//  5. FOUR STATES -- NO TAP: synthetic kicks every ~0.9s, rings on the
//     water; MUTED: no kicks, no rings, no aureole, the windows a tier down
//     (the set is quiet, the picture faint but whole), the tower still
//     NORMAL, blinkers and water still moving; quiet: a tight aureole;
//     loud: a wide one.
//  6. REAL-RADIO TEST -- it is the picture on the record sleeve (and the
//     view out of the hotel window) that this station plays.
//
// One attribute per cell is the constraint pixel art meets on this tube:
// a cell's pixels all glow at its attribute. So each cell takes the
// brightest tier any of its pixels wants, and drops pixels more than one
// tier under that -- otherwise a cell holding a FAINT glow dot and a
// NORMAL tower strut would light the glow dot at NORMAL. Where the tower
// crosses windows, the windows go; that reads as the tower in front.
//
// Round by round, off the real tube (2026-10-18, tools/viz-sheet.mjs):
//  - round 1: the picture read at a glance -- but the horizon glow, at 0.42
//    density, rastered as a striped slab where the buildings dip near the
//    tower (now 0.16), and the aureole, drawn in two tiers, showed the cell
//    grid as a box around its inner tier (now one tier, shape by density).
//  - rounds 2-3: no ring anywhere. A 1px dotted crest at MUTED was the same
//    texture as the reflection's own dashes and disappeared into it. Each
//    ring is now a dark trough with a 3x2-pixel crest just outside it, the
//    crest NORMAL for its first second.
//  - round 4: that crest bloomed into the heaviest line on screen, past the
//    tower. Round 5 (final): a 2x1 MUTED crest, the trough doing the work;
//    the rings read as fine ripples and the tower stays the brightest thing.
//  - The machine was loaded to ~0.3fps for these, which puts a sheet's KICK
//    tile ~6s after its kick, past any ring's life; the beat was judged off
//    a capture with the page clock slowed 8x (record-demo.mjs's trick), so
//    the tile lands ~0.7s after the kick as it does at a normal 1-3fps.
//
// Cost: the picture renders at RENDER_HZ (30), plus once on the frame of a
// kick so the beat never lands late; between renders the draw re-puts the
// same bitmaps, which cellgrid.js skips as no-ops. Two bitmaps per cell,
// alternated per render (FLAME's rule: a same-reference putGlyph is a
// no-op, so an in-place rewrite would never re-raster). Buffers are built
// on first draw, not at boot (FLAME's heap lesson with dead-feedback).
// Everything static is a pure function of the grid size, built once in
// sceneTables(); a term of any width draws what a fresh init would.
//
// ---- 2026-10-20 polish ----
// The critique (CRITIQUE-1020, KEEP with one minor note): the bridge's deck
// and cables carried the same weight as the tower lattice, so the eye had
// two subjects on the left half. The cause was the one-attribute-per-cell
// rule above, not the tiers on paper: the deck was DIM, but a MUTED lamp
// every 4px on it and a MUTED light every 5px on the cables put a lamp in
// EVERY cell the bridge crossed, so every cell went MUTED and the 2px deck
// and the cables drew at MUTED end to end -- the tower's weight, a tier
// under. Now the deck is one pixel, and the deck lamps and cable lights sit
// every 16px (one cell in two), so half the bridge draws at its own DIM and
// the lit half is a string of lamps, not a bar. Nothing else changed.
//
// ---- history, condensed ----
// 45th pass: RIPPLE was rain rings expanding from random points over a
// faint full-screen '.' ':' neon shimmer. 2026-10-16 review: a dotted
// texture with no subject, the kick at 3.4x on the reactivity probe.
// 2026-10-16 rebuild (BAYSIDE): a box-drawn night skyline with a lattice
// broadcast tower, window grids, rooftop signs, a moon and the rain rings
// moved onto a bay reflection. Lessons kept: a kick that flashes and drops
// back measured 1.5x (the drop is a second change as big as the flash), so
// the ring here travels and fades rather than blinking; '█' slabs bloom
// past anything at any tier on CITY LIGHTS' heavy bloomAmt, so the one
// solid shape (the moon) is small and DIM; random '- = ~' on the water did
// not read as a reflection, so the water here is the sky's actual pixels.
// That build's design-pass fixes (reflection read off lit windows, moon in
// strokes) were all character-grid workarounds this one no longer needs.
// 2026-09-12 audit (M5): every effect-clock time on the program object
// (ring starts, the kick time, the render clock) is cleared in reset().
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// Tiers, dark to light: a pixel's value in the picture buffer (-1 = dark).
export const TIERS = [FAINT, DIM, MUTED, NORMAL, BRIGHT]
export const T_BRIGHT = 4, T_NORMAL = 3

// --- geometry (fractions of the canvas, so any width draws the same) -------
export const HORIZON = 0.6        // the far shore, as a share of the canvas height
export const TOWER_FX = 0.62      // Tokyo Tower's column
export const TOWER_TOP = 10       // its antenna tip, in pixels below the canvas top
const MOON = { fx: 0.85, y: 44, r: 13, ox: 5, oy: -3, r2: 11.5 }
const BRIDGE = { pa: 0.07, pb: 0.31, end: 0.42, deckUp: 15, pylonUp: 80 }
// A pixel on the face is ~1.2x as tall as it is wide (9-dot advance, 25 rows
// on 4:3), so a circle in pixels is squashed by this much vertically.
const PX_ASPECT = 1.2

// --- the beat -----------------------------------------------------------------
// Same edge and rate limit DANCEFLOOR uses, for the same reasons (a late
// fallback-ticker frame, a hi-hat onset).
export const BEAT_RISE = 0.2
export const STEP_GAP_S = 0.22
// The flare's time constant. BRIGHT while flare > FLARE_BRIGHT: ~0.3s.
export const FLARE_S = 0.5
const FLARE_BRIGHT = 0.55
// The light-up climbs the tower base to tip in this long.
const CLIMB_S = 0.1
// Rings of light on the bay, one per kick.
export const RING_SLOTS = 5
export const RING_LIFE = 4.5
export const RING_SPEED = 70      // px/s across the water
const RING_FLAT = 0.22            // ellipse height over width: the bay seen from low
export const RENDER_HZ = 30

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const dither = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16

// Pixel owners in the sky, painted back to front. Exported for the tests.
export const OWN = { SKY: 0, MOON: 1, BACK: 2, TOWER: 3, FRONT: 4, BRIDGE: 5 }

const sceneCache = new Map()
/** The static picture at one grid size: the sky layer, the window list, the
 *  tower's pixels, the blinkers. Built once per size and cached. */
export function sceneTables(cols, cw = 8, ch = 16) {
  const key = `${cols}x${cw}x${ch}`
  let S = sceneCache.get(key)
  if (S) return S
  const rows = VIZ_BOT - 1
  const W = cols * cw, H = rows * ch
  const HY = Math.round(H * HORIZON)
  const sky = new Int8Array(W * HY).fill(-1)
  const own = new Uint8Array(W * HY)
  const set = (x, y, v, o) => {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || x >= W || y < 0 || y >= HY) return
    sky[y * W + x] = v; own[y * W + x] = o
  }
  const tx = Math.round(W * TOWER_FX)

  // Horizon glow: the city's light on the haze, densest at the shore. The
  // buildings are what is cut out of it.
  const GLOW = 56
  for (let y = HY - GLOW; y < HY; y++) {
    const d = Math.pow((y - (HY - GLOW)) / GLOW, 2) * 0.16
    for (let x = 0; x < W; x++) if (d > dither(x, y)) sky[y * W + x] = 0
  }
  // Stars, high up, a few of them DIM.
  for (let y = 0; y < HY - 90; y++) for (let x = 0; x < W; x++) {
    const h = hash2(x * 1.7, y * 2.3)
    if (h < 0.0016) sky[y * W + x] = h < 0.0004 ? 1 : 0
  }
  // The moon: a disc minus an offset disc, DIM, upper right.
  const mx = Math.round(W * MOON.fx)
  for (let y = MOON.y - 20; y <= MOON.y + 20; y++) for (let x = mx - 18; x <= mx + 18; x++) {
    const dx = x - mx, dy = (y - MOON.y) * PX_ASPECT
    const ex = dx - MOON.ox, ey = dy - MOON.oy
    if (dx * dx + dy * dy <= MOON.r * MOON.r && ex * ex + ey * ey > MOON.r2 * MOON.r2) set(x, y, 1, OWN.MOON)
  }

  // Buildings: a back rank (taller, DIM windows) and a front rank (lower,
  // MUTED windows). Low around the tower, so its whole lattice shows.
  const buildings = []
  const rank = (layer, seed, wMin, wSpan, hMin, hSpan) => {
    let x = -6, i = 0
    while (x < W) {
      const w = wMin + Math.floor(hash2(i, seed) * wSpan)
      let h = hMin + Math.floor(hash2(i, seed + 1) * hSpan)
      if (layer === 0 && hash2(i, seed + 3) < 0.2) h += 34
      const x0 = x, x1 = x + w - 1
      if (x1 >= tx - 50 && x0 <= tx + 50) h = Math.min(h, layer === 0 ? 30 : 16)
      buildings.push({ layer, x0, x1, top: HY - h, i })
      x += w + (hash2(i, seed + 2) < 0.4 ? 3 : 0)
      i++
    }
  }
  rank(0, 11, 18, 34, 36, 64)
  rank(1, 23, 22, 36, 12, 42)
  const paintBuilding = (b) => {
    const o = b.layer === 0 ? OWN.BACK : OWN.FRONT
    for (let y = b.top; y < HY; y++) for (let x = b.x0; x <= b.x1; x++) set(x, y, y === b.top ? 0 : -1, o)
  }
  for (const b of buildings) if (b.layer === 0) paintBuilding(b)

  // Tokyo Tower: antenna, top deck, an upper lattice, the main deck, and
  // legs splaying to an arch. In front of the back rank, behind the front.
  const yT = TOWER_TOP, yB = HY - 1, Ht = yB - yT
  const tset = (x, y) => set(x, y, T_NORMAL, OWN.TOWER)
  const hwAt = (y) => {
    const f = (y - yT) / Ht
    if (f < 0.52) return 2 + Math.max(0, (f - 0.24) / 0.28) * 6
    return 10 + 22 * Math.pow(Math.max(0, f - 0.58) / 0.42, 1.8)
  }
  const line = (x0, y0, x1, y1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let k = 0; k <= n; k++) tset(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n)
  }
  const yDeckTop = Math.round(yT + 0.21 * Ht), yMain = Math.round(yT + 0.52 * Ht)
  const yLegs = Math.round(yT + 0.58 * Ht)
  for (let y = yT; y < yDeckTop; y++) { tset(tx, y); if (y > yT + 0.1 * Ht) tset(tx + 1, y) }
  for (let y = yDeckTop; y < yDeckTop + 4; y++) for (let x = tx - 4; x <= tx + 5; x++) if (y !== yDeckTop + 2 || x === tx - 4 || x === tx + 5) tset(x, y)
  // The two lattices: legs as continuous lines, X bracing between them.
  const legs = (ya, yb, step, thick) => {
    let prevL = null, prevR = null
    for (let y = ya; y < yb; y++) {
      const hw = hwAt(y)
      const l = Math.round(tx - hw), r = Math.round(tx + 1 + hw)
      for (let k = 0; k < thick; k++) { tset(l + k, y); tset(r - k, y) }
      if (prevL !== null) { for (let x = Math.min(l, prevL); x <= Math.max(l, prevL); x++) tset(x, y); for (let x = Math.min(r, prevR); x <= Math.max(r, prevR); x++) tset(x, y) }
      prevL = l; prevR = r
    }
    for (let y = ya; y + step <= yb; y += step) {
      const l0 = Math.round(tx - hwAt(y)), r0 = Math.round(tx + 1 + hwAt(y))
      const y1 = y + step - 1
      const l1 = Math.round(tx - hwAt(y1)), r1 = Math.round(tx + 1 + hwAt(y1))
      line(l0, y, r1, y1); line(r0, y, l1, y1)
    }
  }
  legs(yDeckTop + 4, yMain, 10, 1)
  // The main deck: a two-storey box with a row of lit observation windows.
  for (let y = yMain; y < yLegs; y++) for (let x = tx - 13; x <= tx + 14; x++) {
    const edge = y === yMain || y === yLegs - 1 || x === tx - 13 || x === tx + 14
    if (edge || ((y - yMain) === 3 && x % 2 === 0)) tset(x, y)
  }
  legs(yLegs, yB - 10, 14, 2)
  // The base: legs down to the ground, an arch between them.
  for (let y = yB - 10; y <= yB; y++) {
    const hw = hwAt(y)
    for (let k = 0; k < 3; k++) { tset(Math.round(tx - hw) + k, y); tset(Math.round(tx + 1 + hw) - k, y) }
  }
  const archW = hwAt(yB) - 3
  for (let x = -archW; x <= archW; x++) {
    tset(tx + x, yB - Math.round(8 * Math.sqrt(Math.max(0, 1 - (x / archW) ** 2))))
  }
  for (let x = Math.round(tx - hwAt(yB - 10)); x <= Math.round(tx + 1 + hwAt(yB - 10)); x++) tset(x, yB - 10)

  for (const b of buildings) if (b.layer === 1) paintBuilding(b)

  // The bridge: two pylons, a main span sagging between them, side spans to
  // the deck, suspenders, a lit deck. Nearest of all.
  const pa = Math.round(W * BRIDGE.pa), pb = Math.round(W * BRIDGE.pb), bEnd = Math.round(W * BRIDGE.end)
  const yd = HY - BRIDGE.deckUp, yp = HY - BRIDGE.pylonUp
  const bset = (x, y, v) => set(x, y, v, OWN.BRIDGE)
  // 2026-10-20 polish: the deck is one pixel and its lamps one cell in two
  // (see the header) -- the lamps lift a whole cell to MUTED.
  for (let x = -2; x <= bEnd; x++) { bset(x, yd, 1); if (x % 16 === 4) bset(x, yd - 1, 2) }
  for (const px of [pa, pb]) {
    for (let y = yp; y < HY; y++) { bset(px - 1, y, 1); bset(px + 1, y, 1); if (y < yp + 3 || y === yp + 22) bset(px, y, 1) }
    bset(px, yp - 1, 2) // the pylon's aircraft light, a fixed point
  }
  const cable = (x0, y0, x1, y1, sag) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      const u = (x - x0) / (x1 - x0)
      const y = Math.round(y0 + (y1 - y0) * u + sag * 4 * u * (1 - u))
      bset(x, y, (x % 16 === 12) ? 2 : 1)
      if (x % 6 === 3) for (let yy = y + 2; yy < yd; yy += 2) bset(x, yy, 0)
    }
  }
  cable(pa, yp, pb, yp, yd - 5 - yp)
  cable(-4, yd - 3, pa, yp, 10)
  cable(pb, yp, bEnd, yd - 3, 10)

  // Windows, last, on the pixels each building still owns.
  const win = [] // [tier, id, ...pixel indices]
  for (const b of buildings) {
    const o = b.layer === 0 ? OWN.BACK : OWN.FRONT
    const pw = b.layer === 0 ? 5 : 6, sw = b.layer === 0 ? 2 : 3
    for (let y = b.top + 4; y + 2 < HY - 1; y += 6) {
      for (let x = b.x0 + 3; x + sw <= b.x1 - 2; x += pw) {
        const pix = []
        for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + sw; xx++) {
          if (xx < 0 || xx >= W) continue
          const i = yy * W + xx
          if (own[i] === o) pix.push(i)
        }
        if (pix.length) win.push({ tier: b.layer === 0 ? 1 : 2, id: hash2(x * 0.37 + b.layer, y * 1.31), pix })
      }
    }
  }
  const winStart = new Int32Array(win.length + 1)
  let n = 0
  win.forEach((w, k) => { winStart[k] = n; n += w.pix.length })
  winStart[win.length] = n
  const winPix = new Int32Array(n)
  win.forEach((w, k) => winPix.set(w.pix, winStart[k]))
  const winId = Float32Array.from(win, (w) => w.id)
  const winTier = Uint8Array.from(win, (w) => w.tier)

  // The tower's own pixels, for the light-up, with their height (0 = tip).
  const tp = []
  for (let i = 0; i < W * HY; i++) if (own[i] === OWN.TOWER) tp.push(i)
  const towerPix = Int32Array.from(tp)
  const towerUp = Float32Array.from(tp, (i) => 1 - (Math.floor(i / W) - yT) / Ht)

  // Aircraft-warning blinkers on the tallest roofs.
  const blink = buildings.filter((b) => b.layer === 0 && HY - b.top > 70).map((b) => ({
    x: Math.round((b.x0 + b.x1) / 2), y: b.top - 3, phase: hash2(b.i, 5),
  })).filter((b) => b.x > 0 && b.x < W - 2 && own[(b.y + 3) * W + b.x] === OWN.BACK)

  S = {
    cols, cw, ch, rows, W, H, HY, tx, mx, yMain, yLegs, yd, yT, Ht,
    sky, own, winStart, winPix, winId, winTier, towerPix, towerUp, blink, buildings,
  }
  sceneCache.set(key, S)
  return S
}

/** Is window k lit at time t? Each window re-decides on its own slow clock,
 *  staggered, so the city changes a light or two a second, never in step. */
const WIN_EPOCH_S = 30
export function windowLit(S, k, t) {
  const id = S.winId[k]
  const frac = S.winTier[k] === 1 ? 0.34 : 0.46
  return hash2(id * 91.7, Math.floor(t / WIN_EPOCH_S + id * 13)) < frac
}

function allocScene(p, term) {
  const { cellW, cellH } = term.font
  const S = sceneTables(term.cols, cellW, cellH)
  const cells = term.cols * S.rows
  const cellOf = new Int16Array(S.W)
  for (let x = 0; x < S.W; x++) cellOf[x] = Math.floor(x / cellW)
  p._rippleScene = {
    S,
    lv: new Int8Array(S.W * S.H),
    bufs: [0, 1].map(() => Array.from({ length: cells }, () => new Uint16Array(cellH))),
    // Which of the two bitmaps each cell shows: flipped only when that cell
    // is repacked, since the sky's cells are not repacked every render.
    which: new Uint8Array(cells),
    lit: new Uint8Array(cells),
    attr: new Uint8Array(cells),
    cellOf,
    rowMax: new Int8Array(term.cols),
    rowBits: new Uint16Array(term.cols),
    // The cell row the shore falls in, and everything under it, is the
    // water's: repacked every render. Above it, only when the sky changed.
    waterRow: Math.floor(S.HY / cellH),
    skyKey: '',
  }
  p._rippleRenderT = -Infinity
}

function ringSlot() { return { startT: -Infinity, amp: 1 } }

export default {
  key: 'ripple',
  label: 'TOKYO BAY',
  /** Seeds this effect's state on the program object (once, at boot). The
   *  picture buffers are built lazily on first draw. */
  init(p) {
    p._rippleScene = null
    p._ripples = Array.from({ length: RING_SLOTS }, ringSlot)
    p._rippleStep = 0
    p._rippleLvl = 0.4
    p._ripplePrevPulse = 0
    p._rippleKickAt = -Infinity
    p._rippleRenderT = -Infinity
    p._rippleLastT = 0
  },
  /** Re-arms clocks on every visualizer entry (2026-09-12 audit, M5): the
   *  ring starts, the kick time and the render clock are all effect-clock
   *  times, and the clock restarts at 0. The eased level is not a clock and
   *  carries over. */
  reset(p) {
    for (const r of p._ripples) { r.startT = -Infinity; r.amp = 1 }
    p._rippleKickAt = -Infinity
    p._ripplePrevPulse = 0
    p._rippleRenderT = -Infinity
    p._rippleLastT = 0
    if (p._rippleScene) p._rippleScene.skyKey = ''
  },
  draw(p, s, t) {
    const { term } = s
    if (!p._rippleScene || p._rippleScene.S.cols !== term.cols || p._rippleScene.S.ch !== term.font.cellH) allocScene(p, term)
    const R = p._rippleScene
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    if (t < p._rippleLastT) { p._rippleLastT = t; p._rippleRenderT = -Infinity }
    const dt = Math.min(0.25, t - p._rippleLastT)
    p._rippleLastT = t

    // The beat.
    const pulse = A.pulse || 0
    let kicked = false
    if (!muted && pulse - p._ripplePrevPulse >= BEAT_RISE && t - p._rippleKickAt >= STEP_GAP_S) {
      kicked = true
      p._rippleStep++
      p._rippleKickAt = t
      let slot = p._ripples[0]
      for (const r of p._ripples) if (r.startT < slot.startT) slot = r
      slot.startT = t
      slot.amp = 0.8 + 0.4 * Math.min(1, A.bass || 0)
    }
    p._ripplePrevPulse = pulse
    // Level, eased: the aureole breathes with the music, never flickers.
    const target = Math.min(1, Math.max(0, A.level || 0))
    p._rippleLvl += (target - p._rippleLvl) * Math.min(1, dt / 0.7)

    if (kicked || t - p._rippleRenderT >= 1 / RENDER_HZ) {
      p._rippleRenderT = t
      render(p, R, t, muted)
    }
    const cols = term.cols
    for (let cy = 0; cy < R.S.rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      // Re-put every frame: the same reference is a no-op in cellgrid.js,
      // and a cell something else wrote over in between gets the picture back.
      if (R.lit[i]) term.putGlyph(cx, cy + 1, R.bufs[R.which[i]][i], R.attr[i])
      else term.put(cx, cy + 1, ' ')
    }
  },
}

/** Flare of the tower at time t: 1 on the kick, easing to 0. */
export function flareAt(p, t) {
  const since = t - p._rippleKickAt
  return since >= 0 ? Math.exp(-since / FLARE_S) : 0
}

function render(p, R, t, muted) {
  const { S } = R
  const since = t - p._rippleKickAt
  const flare = muted ? 0 : flareAt(p, t)
  // Everything the sky shows this render, quantized: the aureole's radius in
  // 2px steps, how far up the tower the kick's light has climbed, and the
  // half-second tick the windows and blinkers change on. The sky is rebuilt
  // and repacked only when this changes -- most renders it does not.
  const rad = muted ? 0 : 18 + 2 * Math.round((34 * p._rippleLvl + 26 * flare) / 2)
  const climb = flare > FLARE_BRIGHT ? Math.min(4, Math.floor(Math.max(0, since) / CLIMB_S * 4)) + 1 : 0
  const tick = Math.floor(t * 2)
  const key = `${rad}|${climb}|${tick}|${muted}`
  if (key !== R.skyKey) {
    R.skyKey = key
    renderSky(R, tick / 2, rad, climb / 5, muted)
    pack(R, 0, R.waterRow)
  }
  renderWater(p, R, t, muted)
  pack(R, R.waterRow, S.rows)
}

function renderSky(R, t, rad, climb, muted) {
  const { S, lv } = R
  const { W, HY, tx } = S
  lv.set(S.sky)
  // The aureole: the tower's light on the haze, centred on the main deck.
  const cy0 = S.yMain + 3
  if (rad > 0) for (let y = Math.max(0, Math.floor(cy0 - rad / PX_ASPECT)); y < Math.min(HY, cy0 + rad / PX_ASPECT); y++) {
    for (let x = Math.max(0, Math.floor(tx - rad)); x < Math.min(W, tx + rad); x++) {
      const i = y * W + x
      if (S.own[i] !== OWN.SKY || lv[i] >= 1) continue
      const dx = x - tx, dy = (y - cy0) * PX_ASPECT
      const d = Math.sqrt(dx * dx + dy * dy) / rad
      if (d >= 1) continue
      // One tier throughout: two tiers drew the cell grid's box around the
      // inner one (2026-10-18 round 2). The shape is the density alone.
      if (Math.pow(1 - d, 1.8) * 0.45 > dither(x, y)) lv[i] = 1
    }
  }
  // Windows.
  for (let k = 0; k < S.winId.length; k++) {
    if (!windowLit(S, k, t)) continue
    // Muted, the city's lights sit a tier down: the set is quiet, the
    // picture faint but whole, and the tower still the brightest thing.
    const tier = S.winTier[k] - (muted ? 1 : 0)
    for (let j = S.winStart[k]; j < S.winStart[k + 1]; j++) lv[S.winPix[j]] = tier
  }
  // Blinkers: a 2x2 light, on for one second in two.
  for (const b of S.blink) {
    if (((t * 0.5 + b.phase) % 1) >= 0.5) continue
    for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) lv[(b.y + yy) * W + b.x + xx] = 2
  }
  // The tower: NORMAL, and BRIGHT from the base up as far as the kick's
  // light has climbed (climb 0 = none).
  for (let j = 0; j < S.towerPix.length; j++) {
    lv[S.towerPix[j]] = climb > 0 && S.towerUp[j] <= climb ? T_BRIGHT : T_NORMAL
  }
}

function renderWater(p, R, t, muted) {
  const { S, lv } = R
  const { W, H, HY, tx } = S
  lv.fill(-1, W * HY)
  // The bay: the sky mirrored at the shore, one tier down, each pixel row
  // pushed sideways by the swell -- more the nearer it is.
  for (let y = HY; y < H; y++) {
    const depth = y - HY
    const sy = HY - 1 - depth
    if (sy < 0) break
    if (depth % 3 === 2) continue // the gaps between swells
    const amp = 0.6 + depth * 0.04
    const dx = Math.round(amp * Math.sin(depth * 0.5 - t * 2.2 + 2 * Math.sin(depth * 0.11 + t * 0.5)))
    const row = y * W, src = sy * W
    const x0 = Math.max(0, -dx), x1 = Math.min(W, W - dx)
    for (let x = x0; x < x1; x++) {
      const v = lv[src + x + dx]
      if (v >= 1) lv[row + x] = v - 1
    }
  }
  // Glints: short FAINT dashes drifting on the dark water, so the bay is
  // never black where nothing above it is lit.
  for (let y = HY + 4; y < H; y += 3) {
    const k = Math.floor(t * 0.6 + y * 0.37)
    for (let g = 0; g < 3; g++) {
      const gx = Math.floor(hash2(y + g * 31, k) * W), len = 3 + Math.floor(hash2(g, y + k) * 6)
      for (let x = gx; x < Math.min(W, gx + len); x++) if (lv[y * W + x] < 0) lv[y * W + x] = 0
    }
  }
  // The rings: flattened ellipses spreading from under the tower. Each is
  // a dark trough with a crest just outside it -- 2026-10-18 round 3: a 1px
  // dotted crest alone vanished into the reflection's own dashes on the
  // tube, so the trough clears a lane through the water for it. Round 4: a
  // 3x2 NORMAL crest bloomed into the heaviest line on screen, past the
  // tower; the crest is 2x1 at MUTED now and the trough does the work.
  // MUTED fading through DIM to FAINT; the far half one tier down.
  if (muted) return
  const cy = HY + 10
  const ellipse = (r, rx, fn) => {
    const ry = rx * RING_FLAT
    const n = Math.ceil(Math.PI * rx * 0.8)
    for (let k = 0; k < n; k++) {
      const th = (k / n) * Math.PI * 2
      const x = Math.round(tx + rx * Math.cos(th)), y = Math.round(cy + ry * Math.sin(th))
      if (y < HY + 1 || y >= H - 1 || x < 0 || x >= W - 2) continue
      fn(x, y, th, k)
    }
  }
  const live = p._ripples.filter((r) => t - r.startT >= 0 && t - r.startT <= RING_LIFE)
  for (const r of live) {
    const rx = 6 + (t - r.startT) * RING_SPEED * r.amp - 5
    if (rx > 3) ellipse(r, rx, (x, y) => { for (let yy = -1; yy < 2; yy++) for (let xx = 0; xx < 3; xx++) lv[(y + yy) * W + x + xx] = -1 })
  }
  for (const r of live) {
    const age = t - r.startT
    const tier = age < 1.6 ? 2 : age < 3.2 ? 1 : 0
    ellipse(r, 6 + age * RING_SPEED * r.amp, (x, y, th, k) => {
      // Broken here and there, like light on water -- a few gaps, not dots.
      if (hash2(Math.floor(k / 4), r.startT * 7) < 0.15) return
      const tr = Math.sin(th) < 0 ? Math.max(0, tier - 1) : tier
      for (let xx = 0; xx < 2; xx++) if (lv[y * W + x + xx] < tr) lv[y * W + x + xx] = tr
    })
  }
}

/** Picture -> one bitmap and one attribute per cell, for cell rows
 *  [r0, r1): the brightest tier in the cell, and only pixels within one tier
 *  of it (see the header). Linear passes over the picture, a cell row at a
 *  time. */
function pack(R, r0, r1) {
  const { S, lv, cellOf, rowMax, rowBits } = R
  const { W, cw, ch, cols } = S
  for (let cy = r0; cy < r1; cy++) {
    rowMax.fill(-1)
    const base = cy * ch * W
    for (let o = base, end = base + ch * W, x = 0; o < end; o++, x = x + 1 === W ? 0 : x + 1) {
      const v = lv[o]
      if (v > rowMax[cellOf[x]]) rowMax[cellOf[x]] = v
    }
    for (let cx = 0; cx < cols; cx++) {
      const ci = cy * cols + cx
      if (rowMax[cx] < 0) { R.lit[ci] = 0; continue }
      R.lit[ci] = 1
      R.attr[ci] = TIERS[rowMax[cx]]
      R.which[ci] ^= 1
    }
    for (let py = 0; py < ch; py++) {
      rowBits.fill(0)
      const o = base + py * W
      for (let x = 0; x < W; x++) {
        const v = lv[o + x]
        if (v < 0) continue
        const c = cellOf[x], m = rowMax[c]
        if (v >= m - 1) rowBits[c] |= 1 << (cw - 1 - (x - c * cw))
      }
      for (let cx = 0; cx < cols; cx++) {
        const ci = cy * cols + cx
        if (R.lit[ci]) R.bufs[R.which[ci]][ci][py] = rowBits[cx]
      }
    }
  }
}
