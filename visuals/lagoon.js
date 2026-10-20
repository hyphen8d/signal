// SIGNAL -- visualizer effect "LAGOON" (TRADEWINDS).
//
// ---- 2026-10-20: the lagoon in pixels (third build) ----
//
// The critique (2026-10-20, ranked REDRAW): on the real tube the palm read
// as an A-frame tent (two long '/' diagonals with '////' on top), the moon
// as a ring of '▄▀▌▐' bars around two '▓' slabs -- a gear, a no-entry sign
// -- the island as a stepped '▓' ziggurat, and the kick could not be found:
// LOUD and KICK differed by one '(' beside a torch. The one thing that
// worked was the column of dashes under the moon. This is the thin,
// one-tier character schematic Matt rejected on 2026-10-18, when four
// effects were redrawn in per-cell pixel bitmaps and shipped; he approved
// redrawing this one the same way. Subject, station and composition kept.
//
// What it is now -- style: BEAM-RESOLUTION PIXEL ART, every canvas cell an
// 8x16 bitmap through putGlyph() (FLAME's technique; TOKYO BAY's scene
// cache, tier packing and two-buffer alternation, copied rather than
// shared so neither effect can break the other). The canvas is a 640x336
// picture of the exotica record sleeve: a big FULL moon low over a lagoon,
// its light broken into a glitter path of dashes that widens toward you, a
// volcanic island on the horizon cut out of the haze, a leaning palm with
// drooping feathered fronds framing the left, and two tiki torches burning
// on the near beach at the right.
//
// What I chose and why:
//  - The torches carry the night, and the beat. The set notes flag
//    moon-over-reflection as overused (TOKYO BAY, NEON HEART, AURORA), and
//    asked that if LAGOON keeps its moon it be big and full and the WATER
//    be the subject. So: the moon stays -- an exotica cover without one is
//    not this sleeve -- but FULL (TOKYO BAY's is a thin crescent, KEEP's a
//    small disc), dithered, DIM, scenery; the glitter path is the largest
//    lit shape in the frame; and the only things that ever reach NORMAL
//    are the two flames. The scene stays asymmetric (palm left, moon right
//    of centre, torches right), per the note against centred objects.
//  - The flames are FLAME's DOOM propagation in a small box per torch (half
//    resolution, 28x72 sim cells, 2px each), so they lick and taper like
//    the DISTORTION FIELD fire rather than flicker as glyphs. Propagation
//    alone is too slow to show a kick -- heat climbs one sim row a step, so
//    doubling a flame takes ~0.3s -- so the kick also throws a PLUME: heat
//    laid up the flame's centre to twice its height at once, with the bed
//    boosted behind it. The doubled flame is there on the next frame.
//  - The water has its own clock and does not dance (trade winds, not a
//    beat): the glitter rows drift and wobble, swell dashes cross the
//    lagoon, foam laps the sand. One musical element, rubric 2.
//  - The palm is a silhouette with mass, not a stroke: a FAINT dithered
//    trunk with dark ring notches and a 1px DIM moonlit edge, six fronds
//    each a DIM spine with a comb of FAINT leaflets hanging off it. On a
//    near-black sky a pure-black silhouette would be invisible; a low tone
//    with a lit edge is how the sleeve paintings did it too.
//  - No `≈`/`~` anywhere (they raster as NNNN). No characters at all.
//
// The musical element is ONE thing: the torch fire.
//  - THE KICK (a rising edge on `pulse`, TOKYO BAY's and DANCEFLOOR's rule
//    -- a real onset with a tap, syntheticAudio's own ~0.9s pulse without
//    one): both flames jump to twice their height (the plume, then a
//    boosted bed easing back over ~0.5s), the hottest core goes BRIGHT for
//    ~0.3s, a handful of sparks fly up off each, and the pool of firelight
//    on the sand under each widens with it. KICK beside LOUD: two tall torches
//    and sparks vs two short ones.
//  - LEVEL (eased over ~0.7s) sets the resting height: a quiet passage
//    burns low, a loud one tall, nothing flickers with the hi-hat.
//
// The rubric (visuals/index.js), point by point:
//  1. ONE SUBJECT -- a tiki night on a lagoon: moon, glitter path, palm,
//     island, torches. One postcard.
//  2. ONE MUSICAL ELEMENT -- the torch fire: kick = doubled flames, BRIGHT
//     core, sparks, wider glow; level = resting height.
//  3. BRIGHTNESS ORDER -- flames NORMAL (BRIGHT only on a kick), the only
//     things at that tier; glitter core, moon limb, torch cups MUTED; moon
//     face, palm edges, island rim, outer glitter, foam, firelight DIM;
//     palm fill, island grain, swell, sand, stars FAINT.
//  4. SHAPES, NOT SOUP -- no characters on the canvas. Soft things (the
//     moon, haze, glow, flame) are dither density; nothing fills a cell
//     solid.
//  5. FOUR STATES -- NO TAP: synthetic kicks every ~0.9s, so the torches
//     roar and spark on a pulse; MUTED: no kicks, flames at their floor
//     (low, steady, never out), water still moving; quiet: low flames;
//     loud: tall ones.
//  6. REAL-RADIO TEST -- it is the picture on the record sleeve this
//     station plays (the Martin Denny / Arthur Lyman covers).
//
// One attribute per cell, as TOKYO BAY found: each cell takes the brightest
// tier any of its pixels wants and drops pixels more than one tier under
// it, or a FAINT glow pixel sharing a cell with a NORMAL flame would light
// at NORMAL. Where a flame crosses haze, the haze goes.
//
// Cost: the picture renders at RENDER_HZ (30), and on the frame of a kick
// so the beat never lands late; the fire steps at SIM_HZ (60) with a
// catch-up clamp. Between renders the draw re-puts the same bitmaps, which
// cellgrid.js skips. Two bitmaps per cell, flipped only when a cell is
// repacked (a same-reference putGlyph is a no-op). Rows above everything
// that moves are repacked only when the stars' 0.5s tick changes. The
// static scene is built once per grid size (sceneTables); buffers on first
// draw, not at boot (FLAME's heap lesson with dead-feedback).
//
// Round by round (2026-10-20, tools/viz-preview.mjs, then viz-sheet):
//  - round 1: the postcard read at once, but the flames were thin sparkly
//    sticks and LOUD vs KICK was a matter of hunting; a FAINT glow round
//    each flame drew a dotted box (the packer drops it in the flame's own
//    cells and keeps it in the rest). The horizon haze read as a belt.
//  - rounds 2-3: wider fire box and cup. Flames packed at three tiers came
//    out squared off at cell edges, so they are two tiers now (MUTED and
//    NORMAL) with density doing the falloff. A flat bed burned as a block;
//    a peaked bed burns as a teardrop.
//  - round 4: the kicked flame floated above its torch -- the cup was DIM,
//    two tiers under the flame, and the packer dropped it from the shared
//    cells. The cup is MUTED now and BRIGHT keeps clear of its cells. The
//    glow moved to the sand. The haze belt went; the island got a grain of
//    its own instead, so it reads as mass, not a rim.
//  - rounds 5-7: the moon's maria went through a face (ordered-dither
//    crosses), static (hash grain) and a paw print (a third level) before
//    settling on two flat halftone levels in the real moon's arrangement
//    -- dark west and north, bright south. The crown grew two parrot heads
//    where leaflets piled up at the top of the upward fronds; the leaflets
//    now start a fifth of the way out.
//  - viz-sheet 1 (the real tube): the picture and the kick both read;
//    the moon, at 69% density, bloomed into the brightest object on the
//    screen and its maria into a hook. Face to 50%, maria to 28%, a mare
//    added inside the hook.
//  - the first scene build cost ~140ms (Math.sin per pixel in hash2, and
//    Math.hypot); an integer hash and plain sqrt brought it to ~30-60ms.
//
// ---- history, condensed ----
// 2026-09-13 (first build): replaced TRADEWINDS' borrow of RIPPLE's rain
// rings; a composed postcard in characters -- '0@#' moon face, '/' palm,
// '▓' island, '(W)' torches, '='/'-' reflection. Its lesson kept here: the
// water is horizontal (rows and dashes), nothing expands from a point.
// 2026-09-13 (audit L6): a BRIGHT '@' fill did not slab only because '@' is
// stroked -- coverage, not tier, is what makes a slab. Kept: nothing here
// fills a cell solid.
// 2026-10-16 (design pass): moon to a half-block rim, trunk one stroke a
// row, five arching fronds, a 3-row BRIGHT flame column on onset. On the
// tube all three still read as schematic and the column never showed in a
// KICK tile -- the character grid's limit, which is why this build exists.
// 2026-09-12 audit (M5) shape: every effect-clock time on the program
// object (the kick, the render clock, the sim clock) is cleared in reset().
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

// A pixel on the face is ~1.2x as tall as it is wide (TOKYO BAY's measure).
const PX_ASPECT = 1.2

// --- geometry (x as fractions of the canvas width) -------------------------
export const HORIZON = 0.56          // share of the canvas height
export const MOON = { fx: 0.64, y: 76, r: 50 }
// Torches: x, and the cup's height above the sand it stands in. The nearer
// one is taller and further right -- all the perspective two props need.
export const TORCHES = [{ fx: 0.80, up: 54 }, { fx: 0.925, up: 78 }]
const PALM = { base: [0.07, 318], ctrl: [0.035, 175], crown: [0.2, 66] }
// Fronds: [angle in degrees (0 = right, -90 = up), length px, droop px].
const FRONDS = [
  [-14, 128, 74], [-50, 92, 74], [-128, 84, 70], [-166, 104, 70],
  [22, 92, 44], [152, 78, 40],
]

// --- the beat --------------------------------------------------------------
export const BEAT_RISE = 0.2
export const STEP_GAP_S = 0.22
export const KICK_S = 0.45           // the boost's time constant
const KICK_BRIGHT = 0.5              // core BRIGHT while boost > this: ~0.3s
export const RENDER_HZ = 30
export const SIM_HZ = 60

// --- the fire --------------------------------------------------------------
const FW = 28, FH = 72                // sim cells per torch (2x2 px each)
const COOL = 6                        // mean heat lost per sim row
const SPARK_MAX = 40

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const dither = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
// An integer hash to 0..1 for integer inputs. shared.js's hash2 is a
// Math.sin per call, and Math.hypot is slow in V8: between them the first
// scene build took ~140ms (a visible hitch on entry, NEON HEART's 190ms
// lesson) until the per-pixel loops moved to these two.
function ihash(a, b) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const len2 = (a, b) => Math.sqrt(a * a + b * b)

const sceneCache = new Map()
/** The static picture at one grid size, built once and cached. */
export function sceneTables(cols, cw = 8, ch = 16) {
  const key = `${cols}x${cw}x${ch}`
  let S = sceneCache.get(key)
  if (S) return S
  const rows = VIZ_BOT - 1
  const W = cols * cw, H = rows * ch
  const HY = Math.round(H * HORIZON)
  const base = new Int8Array(W * H).fill(-1)
  const at = (x, y) => (x < 0 || x >= W || y < 0 || y >= H) ? -1 : y * W + x
  const set = (x, y, v) => { const i = at(Math.round(x), Math.round(y)); if (i >= 0) base[i] = v }
  const raise = (x, y, v) => { const i = at(Math.round(x), Math.round(y)); if (i >= 0 && base[i] < v) base[i] = v }

  // Sand: the bank under the palm, left, and the beach under the torches,
  // right; open water between, so the glitter path reaches the viewer.
  const sandTop = new Int16Array(W)
  for (let x = 0; x < W; x++) {
    const left = 46 - x * 0.3
    const right = Math.min(70, (x - W * 0.66) * 0.36)
    sandTop[x] = Math.round(H - Math.max(0, left, right))
  }

  // Horizon haze: densest at the waterline, so the island is cut out of it.
  // The island: a volcano with a long low shoulder, dark, a DIM rim.
  const island = new Int16Array(W)
  for (let x = 0; x < W; x++) {
    const cone = 44 - Math.abs(x - W * 0.33) * 0.55
    const shoulder = 15 - Math.abs(x - W * 0.42) * 0.13
    const spit = x > W * 0.24 && x < W * 0.5 ? 3 : 0
    island[x] = Math.round(Math.max(0, cone, shoulder, spit))
  }
  for (let x = 0; x < W; x++) {
    const h = island[x]
    if (!h) continue
    // Mass, not an outline: a sparse FAINT grain of jungle under the rim.
    for (let y = HY - h; y < HY; y++) base[y * W + x] = 0.16 > ihash(x, y + 101) ? 0 : -1
    set(x, HY - h, 1)
    // The steep flanks need the rim down their side too, or they gap.
    const hn = Math.max(island[x - 1] || 0, island[x + 1] || 0)
    for (let y = HY - hn; y < HY - h; y++) set(x, y, 1)
  }
  // Two small palms on the shoulder, the postcard's second palm.
  for (const fx of [0.435, 0.462]) {
    const x0 = Math.round(W * fx), y0 = HY - island[Math.round(W * fx)]
    for (let k = 0; k < 11; k++) set(x0 + Math.round(k * 0.25), y0 - k, 1)
    const cx = x0 + 3, cy = y0 - 11
    for (const [dx, dy] of [[-6, 3], [-4, -1], [5, -1], [7, 3], [1, -3]]) {
      for (let k = 1; k <= 6; k++) set(cx + dx * k / 6, cy + dy * k / 6 + (k * k) / 14, 1)
    }
  }
  // The horizon itself: a broken FAINT line where the water starts.
  for (let x = 0; x < W; x++) if (!island[x] && hash2(x * 0.31, 7) > 0.35) base[HY * W + x] = 0

  // The moon: a full disc, DIM, dithered with three darker maria and a
  // little limb darkening, a 1px MUTED edge, a FAINT halo.
  const mx = Math.round(W * MOON.fx), my = MOON.y, R = MOON.r
  // Maria as [x, y, r] in moon radii, flattened: this loop runs once per
  // grid size, before the JIT has warmed, so it is written plainly.
  const maria = [-0.5, 0.05, 0.26, -0.42, -0.25, 0.24, -0.18, -0.42, 0.2, 0.08, -0.36, 0.17, 0.3, -0.2, 0.17, 0.38, 0.08, 0.13, -0.35, 0.3, 0.14, -0.2, -0.08, 0.2]
  const ry = Math.ceil((R * 1.7) / PX_ASPECT)
  for (let y = Math.max(0, my - ry); y <= Math.min(H - 1, my + ry); y++) {
    for (let x = Math.max(0, mx - Math.ceil(R * 1.7)); x <= Math.min(W - 1, mx + R * 1.7); x++) {
      const i = y * W + x
      const ux = (x - mx) / R, uy = ((y - my) * PX_ASPECT) / R
      const r2 = ux * ux + uy * uy
      if (r2 < 1) {
        if (r2 > (1 - 1.5 / R) ** 2) { base[i] = 2; continue }
        let mare = false
        for (let k = 0; k < maria.length && !mare; k += 3) {
          const dx = ux - maria[k], dy = uy - maria[k + 1]
          mare = dx * dx + dy * dy < maria[k + 2] * maria[k + 2]
        }
        // Two flat halftone levels, face and maria, not a smooth ramp: a
        // gradient through the ordered dither draws '#' crosses at every
        // step, and the maria read as a face (round 4); a hash grain
        // instead read as static (round 5); a third, darker level for the
        // maria read as a paw print (round 6). On the tube (viz-sheet 1)
        // the face at 69% density bloomed into the brightest thing on the
        // screen, past the flames -- KEEP's moon problem -- so it is half
        // lit now, the maria under a third.
        base[i] = (mare ? 0.28 : 0.5) > dither(x, y) ? 1 : -1
      } else if (r2 < 2.89) {
        const r = Math.sqrt(r2)
        base[i] = 0.16 * Math.pow(1 - (r - 1) / 0.7, 2.4) > dither(x, y) ? 0 : -1
      }
    }
  }

  // Sand: sparse FAINT grain under each bank, densest at the waterline.
  for (let x = 0; x < W; x++) for (let y = sandTop[x]; y < H; y++) {
    const i = y * W + x
    const wet = y - sandTop[x] < 3
    base[i] = (wet ? 0.3 : 0.07) > dither(x * 3 + 1, y) && ihash(x + 7, y) > 0.25 ? 0 : -1
  }

  // The palm: a curved trunk, FAINT, its moonward edge DIM, ring notches.
  const [b0, b1] = [[W * PALM.base[0], PALM.base[1]], [W * PALM.ctrl[0], PALM.ctrl[1]]]
  const crown = [W * PALM.crown[0], PALM.crown[1]]
  let arc = 0, prev = null
  for (let k = 0; k <= 700; k++) {
    const s = k / 700, u = 1 - s
    const x = u * u * b0[0] + 2 * u * s * b1[0] + s * s * crown[0]
    const y = u * u * b0[1] + 2 * u * s * b1[1] + s * s * crown[1]
    if (prev) arc += len2(x - prev[0], (y - prev[1]) * PX_ASPECT)
    prev = [x, y]
    const half = (9.5 - 4.5 * s) / 2
    const notch = arc % 9 < 1.4
    const yy = Math.round(y)
    for (let px = Math.round(x - half); px <= Math.round(x + half); px++) {
      const edge = px > x + half - 1.6
      if (notch && !edge) { set(px, yy, -1); continue }
      if (edge) raise(px, yy, 1)
      else if (0.55 > dither(px, yy)) raise(px, yy, 0)
    }
  }
  // Fronds: a DIM spine arching off the crown and falling, a comb of FAINT
  // leaflets hanging from it, longest mid-frond -- the feathered silhouette
  // that says palm (and not tent, roof or star).
  for (const [deg, len, droop] of FRONDS) {
    const a = (deg * Math.PI) / 180
    const ca = Math.cos(a), sa = Math.sin(a) / PX_ASPECT
    const steps = Math.ceil(len * 1.5)
    let px = crown[0], py = crown[1]
    for (let k = 1; k <= steps; k++) {
      const u = k / steps
      const x = crown[0] + ca * len * u
      const y = crown[1] + sa * len * u + (droop * u * u) / PX_ASPECT
      const tx = x - px, ty = y - py
      px = x; py = y
      raise(x, y, 1)
      raise(x, y + 1, u < 0.6 ? 1 : 0)
      if (k % 3) continue
      // Leaflets: down and forward from the spine, both sides of it.
      const tl = len2(tx, ty) || 1
      const fx = tx / tl, fy = ty / tl
      // None near the crown: leaflets there piled into a hooded knob that
      // read as a parrot's head (round 4).
      const lf = (3 + 17 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.8)) * Math.min(1, Math.max(0, (u - 0.2) / 0.3))
      for (const side of [1, -1]) {
        // The perpendicular on this side, bent toward hanging down.
        let nx = -fy * side, ny = fx * side
        if (ny < 0) { nx = -nx; ny = -ny }
        let dx = nx * 0.55 + fx * 0.45, dy = ny * 0.55 + fy * 0.45 + 0.6
        const dl = len2(dx, dy); dx /= dl; dy /= dl
        const L = side > 0 ? lf : lf * 0.4
        for (let j = 1; j < L; j++) raise(x + dx * j, y + (dy * j) / PX_ASPECT + (j * j) / (L * 6), 0)
      }
    }
  }
  // The crown's knot, and three coconuts' worth of mass under it.
  for (let dy = -5; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    if (dx * dx + (dy * PX_ASPECT) ** 2 < 36 && 0.6 > dither(Math.round(crown[0] + dx), Math.round(crown[1] + dy))) raise(crown[0] + dx, crown[1] + dy, 0)
  }

  // The torches: a bamboo pole, DIM down its lit side with node bands, and
  // a flared cup, MUTED at the lip. The flames are drawn per render.
  const torches = TORCHES.map(({ fx, up }) => {
    const tx = Math.round(W * fx)
    const sand = sandTop[tx]
    const cupY = sand - up
    for (let y = cupY + 12; y < Math.min(H, sand + 5); y++) {
      const node = (y - cupY) % 13 === 0
      for (let dx = -1; dx <= 1; dx++) set(tx + dx, y, dx === 1 || node ? 1 : 0)
      if (node) { set(tx - 2, y, 0); set(tx + 2, y, 0) }
    }
    for (let y = cupY; y < cupY + 12; y++) {
      const half = Math.round(7 - (y - cupY) * 0.4)
      for (let dx = -half; dx <= half; dx++) {
        const lip = y === cupY
        // MUTED throughout, walls and a woven band: one tier under the
        // flame, so the packer keeps the cup in the cells the flame shares.
        if (lip || Math.abs(dx) === half) set(tx + dx, y, 2)
        else if ((y - cupY) % 4 === 2 && (dx & 1)) set(tx + dx, y, 2)
      }
    }
    return { tx, cupY }
  })

  // Stars: high, few, none near the moon.
  const stars = []
  // Placed by index rather than by testing every pixel (cheaper to build).
  const nStars = Math.round(W * (HY - 52) * 0.0017)
  for (let k = 0; k < nStars; k++) {
    const x = Math.floor(ihash(k, 1) * W), y = 2 + Math.floor(ihash(k, 2) * (HY - 52))
    if (base[y * W + x] >= 0 || len2(x - mx, (y - my) * PX_ASPECT) < R * 1.8) continue
    stars.push(y * W + x, ihash(k, 3) < 0.25 ? 1 : 0, Math.floor(ihash(k, 4) * 1000))
  }

  S = { cols, cw, ch, rows, W, H, HY, mx, my, R, sandTop, island, base, torches, stars: Int32Array.from(stars), crown }
  sceneCache.set(key, S)
  return S
}

function allocScene(p, term) {
  const { cellW, cellH } = term.font
  const S = sceneTables(term.cols, cellW, cellH)
  const cells = term.cols * S.rows
  const cellOf = new Int16Array(S.W)
  for (let x = 0; x < S.W; x++) cellOf[x] = Math.floor(x / cellW)
  p._lagoon = {
    S,
    lv: new Int8Array(S.W * S.H),
    bufs: [0, 1].map(() => Array.from({ length: cells }, () => new Uint16Array(cellH))),
    which: new Uint8Array(cells),
    lit: new Uint8Array(cells),
    attr: new Uint8Array(cells),
    cellOf,
    rowMax: new Int8Array(term.cols),
    rowBits: new Uint16Array(term.cols),
    heat: S.torches.map(() => new Uint8Array(FW * FH)),
    sparks: [],
    tick: -1,
    dirtyTop: 0,
  }
  p._lagoonRenderT = -Infinity
  p._lagoonSimT = 0
}

export default {
  key: 'lagoon',
  label: 'LAGOON',
  /** Seeds this effect's state on the program object (once, at boot). The
   *  picture buffers are built lazily on first draw. */
  init(p) {
    p._lagoon = null
    p._lagoonStep = 0
    p._lagoonLvl = 0.4
    p._lagoonPrevPulse = 0
    p._lagoonKickAt = -Infinity
    p._lagoonRenderT = -Infinity
    p._lagoonSimT = 0
    p._lagoonLastT = 0
  },
  /** Re-arms clocks on every visualizer entry (2026-09-12 audit, M5): the
   *  kick time, the render clock and the fire's step clock are effect-clock
   *  times, and the clock restarts at 0. The eased level carries over. */
  reset(p) {
    p._lagoonKickAt = -Infinity
    p._lagoonPrevPulse = 0
    p._lagoonRenderT = -Infinity
    p._lagoonSimT = 0
    p._lagoonLastT = 0
    if (p._lagoon) { p._lagoon.sparks.length = 0; p._lagoon.tick = -1 }
  },
  draw(p, s, t) {
    const { term } = s
    if (!p._lagoon || p._lagoon.S.cols !== term.cols || p._lagoon.S.ch !== term.font.cellH) allocScene(p, term)
    const L = p._lagoon
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    if (t < p._lagoonLastT) { p._lagoonLastT = t; p._lagoonRenderT = -Infinity; p._lagoonSimT = t }
    const dt = Math.min(0.25, t - p._lagoonLastT)
    p._lagoonLastT = t

    // The beat.
    const pulse = A.pulse || 0
    let kicked = false
    if (!muted && pulse - p._lagoonPrevPulse >= BEAT_RISE && t - p._lagoonKickAt >= STEP_GAP_S) {
      kicked = true
      p._lagoonStep++
      p._lagoonKickAt = t
    }
    p._lagoonPrevPulse = pulse
    const target = muted ? 0 : Math.min(1, Math.max(0, A.level || 0))
    p._lagoonLvl += (target - p._lagoonLvl) * Math.min(1, dt / 0.7)

    // The fire: fixed steps, at most 4 a frame, then snap (FLAME's rule).
    if (kicked) plume(p, L)
    let steps = 0
    while (t - p._lagoonSimT >= 1 / SIM_HZ && steps < 4) {
      p._lagoonSimT += 1 / SIM_HZ
      stepFire(p, L, p._lagoonSimT)
      steps++
    }
    if (t - p._lagoonSimT > 0.25) p._lagoonSimT = t

    if (kicked || t - p._lagoonRenderT >= 1 / RENDER_HZ) {
      p._lagoonRenderT = t
      render(p, L, t, muted)
    }
    const cols = term.cols
    for (let cy = 0; cy < L.S.rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      if (L.lit[i]) term.putGlyph(cx, cy + 1, L.bufs[L.which[i]][i], L.attr[i])
      else term.put(cx, cy + 1, ' ')
    }
  },
}

/** The kick's boost at time t: 1 on the kick, easing to 0. */
export function boostAt(p, t) {
  const since = t - p._lagoonKickAt
  return since >= 0 ? Math.exp(-since / KICK_S) : 0
}
/** Resting flame height in sim rows (2px each) for the eased level. */
const restRows = (p) => 13 + 10 * p._lagoonLvl

/** The kick's plume: heat laid up each flame's centre to twice its resting
 *  height at once, so the doubled flame is on screen the next frame instead
 *  of ~0.3s later when propagation would have carried it there. Sparks. */
function plume(p, L) {
  const tall = Math.min(FH - 2, restRows(p) * 2)
  L.heat.forEach((heat, ti) => {
    const nearer = ti === L.S.torches.length - 1 ? 1 : 0.8
    const rows = Math.round(tall * nearer)
    const bed = rows * COOL
    for (let k = 0; k < rows; k++) {
      const y = FH - 1 - k
      const v = bed * (1 - k / rows)
      const sway = Math.round(Math.sin(k * 0.35 + ti) * 1.2)
      const w = Math.max(0, Math.round(4.6 * (1 - k / rows)))
      for (let dx = -w; dx <= w; dx++) {
        const i = y * FW + (FW >> 1) + sway + dx
        const vv = Math.min(255, v * (1 - Math.abs(dx) / (w + 1.5)))
        if (heat[i] < vv) heat[i] = vv
      }
    }
    const { tx, cupY } = L.S.torches[ti]
    for (let k = 0; k < 6 && L.sparks.length < SPARK_MAX; k++) {
      L.sparks.push({ x: tx + (Math.random() - 0.5) * 8, y: cupY - rows * 2 * (0.4 + Math.random() * 0.5), vx: (Math.random() - 0.5) * 0.9, vy: -(1.4 + Math.random() * 1.6), life: 1 })
    }
  })
}

function stepFire(p, L, t) {
  const boost = boostAt(p, t)
  const rest = restRows(p)
  // A slow lean: the trade wind bends both flames the same way at once.
  const lean = Math.sin(t * 0.37) * 0.35
  L.heat.forEach((heat, ti) => {
    const nearer = ti === L.S.torches.length - 1 ? 1 : 0.8
    const bed = rest * nearer * COOL * (1 + boost)
    const base = (FH - 1) * FW
    for (let x = 0; x < FW; x++) {
      const d = Math.abs(x - (FW >> 1) + 0.5) / 4.6
      // Peaked, not flat: the edges cool out low and the centre stands tall,
      // which is the teardrop. Two slow sines wander the peak (FLAME's grate).
      const wob = 0.12 * Math.sin(t * 5.3 + x * 0.9 + ti) + 0.1 * Math.sin(t * 8.1 - x * 1.7)
      const v = d < 1 ? bed * Math.pow(1 - d, 1.1) * (0.9 + wob + Math.random() * 0.2) : 0
      heat[base + x] = Math.min(255, Math.max(0, v))
    }
    for (let y = 1; y < FH; y++) {
      const up = (y - 1) * FW, row = y * FW
      for (let x = 0; x < FW; x++) {
        const v = heat[row + x]
        if (!v) { heat[up + x] = 0; continue }
        const r = Math.random()
        const dx = x + ((r * 3 + lean) | 0) - 1
        if (dx < 0 || dx >= FW) continue
        const cool = (Math.random() * (2 * COOL + 1)) | 0
        heat[up + dx] = v > cool ? v - cool : 0
      }
    }
    // A stray spark now and then, so a resting torch still breathes.
    if (Math.random() < 0.03 && L.sparks.length < SPARK_MAX) {
      const { tx, cupY } = L.S.torches[ti]
      L.sparks.push({ x: tx + (Math.random() - 0.5) * 6, y: cupY - rest * 2 * 0.7, vx: (Math.random() - 0.5) * 0.5, vy: -(0.9 + Math.random()), life: 0.7 })
    }
  })
  for (let i = L.sparks.length - 1; i >= 0; i--) {
    const sp = L.sparks[i]
    sp.x += sp.vx + lean * 0.6
    sp.y += sp.vy
    sp.vy *= 0.985
    sp.life -= 1 / (SIM_HZ * 1.1)
    if (sp.life <= 0 || sp.y < 2) L.sparks.splice(i, 1)
  }
}

function render(p, L, t, muted) {
  const { S, lv } = L
  lv.set(S.base)
  // Stars: each on its own slow twinkle, changed on a 0.5s tick.
  const tick = Math.floor(t * 2)
  const st = S.stars
  for (let k = 0; k < st.length; k += 3) {
    const ph = st[k + 2]
    if (((tick + ph) % 11) < 2) continue
    lv[st[k]] = st[k + 1]
  }
  let top = renderWater(L, t)
  top = Math.min(top, renderTorches(p, L, t, muted))
  // Rows above everything that moved (this render and the last) are
  // repacked only when the stars' tick changes.
  const from = tick !== L.tick ? 0 : Math.max(0, Math.floor(Math.min(top, L.dirtyTop) / S.ch))
  L.tick = tick
  L.dirtyTop = top
  pack(L, from, S.rows)
}

/** The lagoon: the moon's glitter path, swell, foam. Own clock only.
 *  Returns the topmost pixel row it drew. */
function renderWater(L, t) {
  const { S, lv } = L
  const { W, H, HY, mx, sandTop } = S
  for (let y = HY + 1; y < H; y++) {
    const d = y - HY
    if (d % 3 === 2) continue // the dark between swells
    const row = y * W
    // The glitter path: rows of dashes under the moon, widening toward the
    // viewer, each row pushed sideways by the swell (TOKYO BAY's wobble).
    const amp = 1 + d * 0.05
    const cx = mx + amp * Math.sin(d * 0.5 - t * 1.6 + 2 * Math.sin(d * 0.11 + t * 0.4))
    const halfW = 7 + d * 0.42
    const sl = 3 + Math.floor(d * 0.07)
    const phase = Math.floor(t * 3 + d * 0.37)
    const x0 = Math.max(0, Math.floor(cx - halfW)), x1 = Math.min(W - 1, Math.ceil(cx + halfW))
    for (let x = x0; x <= x1; x++) {
      if (y >= sandTop[x]) continue
      const off = x - cx + 2048
      const seg = Math.floor(off / sl)
      if (off - seg * sl < 1) continue
      const e = Math.abs(x - cx) / halfW
      const presence = 1 - Math.pow(e, 1.4)
      const h = ihash(seg * 131 + d, phase)
      if (h >= presence * 0.78) continue
      lv[row + x] = e < 0.38 && h < presence * 0.5 ? 2 : 1
    }
    // Swell: FAINT dashes across the whole lagoon, longer and more of them
    // toward the viewer, drifting slowly with the wind.
    if (d % 3 === 0 && d > 3) {
      const n = 2 + Math.floor(d / 22)
      for (let g = 0; g < n; g++) {
        const len = 5 + Math.floor(d * 0.14 + hash2(g, d) * 8)
        const gx = Math.floor((hash2(d * 0.7, g * 3.1) * W + t * (3 + d * 0.06) * (g % 2 ? 1 : -0.6)) % W + W) % W
        for (let x = gx; x < Math.min(W, gx + len); x++) if (y < sandTop[x] && lv[row + x] < 0) lv[row + x] = 0
      }
    }
  }
  // Foam: the waterline along each beach, lapping -- lit where the lap's
  // crest is, so the edge comes and goes rather than sitting as a rule.
  for (let x = 0; x < W; x++) {
    const sy = sandTop[x]
    if (sy >= H) continue
    const lap = Math.sin(t * 0.9 - x * 0.05) + 0.4 * Math.sin(t * 1.7 + x * 0.13)
    if (lap > 0.2) lv[(sy - 1) * W + x] = 1
    if (lap > 0.95 && sy - 4 > HY) lv[(sy - 4) * W + x] = 0
  }
  return HY
}

/** Flames, glow and sparks. Returns the topmost pixel row it drew. */
function renderTorches(p, L, t, muted) {
  const { S, lv } = L
  const { W, H } = S
  const boost = muted ? 0 : boostAt(p, t)
  const hot = boost > KICK_BRIGHT
  let top = H
  L.heat.forEach((heat, ti) => {
    const { tx, cupY } = S.torches[ti]
    const ox = tx - FW, oy = cupY - FH * 2
    // Firelight: a pool of it on the sand round the pole's foot, as wide as
    // the flame is tall -- so the kick throws it wider too. On the sand, not
    // round the flame: a glow in the air shares cells with the flame, and
    // the packer cut it into a box round the fire (2026-10-20, round 4).
    const fh = restRows(p) * 2 * (1 + boost) * (ti === S.torches.length - 1 ? 1 : 0.8)
    const sy0 = S.sandTop[tx], gr = 12 + fh * 0.9
    for (let y = Math.max(0, Math.floor(sy0 - gr / 5)); y <= Math.min(H - 1, Math.ceil(sy0 + gr / 4)); y++) {
      for (let x = Math.max(0, Math.floor(tx - gr)); x <= Math.min(W - 1, tx + gr); x++) {
        const i = y * W + x
        if (lv[i] >= 1 || y < S.sandTop[x] - 2) continue
        const dd = len2((x - tx) / gr, (y - sy0) / (gr / 4.5))
        if (dd < 1 && 0.4 * Math.pow(1 - dd, 1.3) > dither(x, y)) lv[i] = 1
      }
    }
    // The flame, from the heat field at 2x2 pixels a cell.
    for (let sy = 0; sy < FH; sy++) for (let sx = 0; sx < FW; sx++) {
      const v = heat[sy * FW + sx]
      if (v < 6) continue
      // Two tiers only, so the packer's one-tier rule never squares a flame
      // off at a cell edge; density does the falloff.
      // BRIGHT only clear of the cup's cells, or it would drop the cup.
      const tier = v >= 60 ? (hot && v >= 120 && oy + sy * 2 < cupY - 16 ? 4 : 3) : 2
      const tone = Math.min(0.94, v / 60)
      for (let yy = 0; yy < 2; yy++) {
        const y = oy + sy * 2 + yy
        if (y < 0 || y >= H) continue
        if (y < top) top = y
        for (let xx = 0; xx < 2; xx++) {
          const x = ox + sx * 2 + xx
          if (x < 0 || x >= W || tone <= dither(x, y)) continue
          const i = y * W + x
          if (lv[i] < tier) lv[i] = tier
        }
      }
    }
  })
  // Sparks: 2x2, cooling NORMAL -> MUTED -> DIM as they rise.
  for (const sp of L.sparks) {
    const x = Math.round(sp.x), y = Math.round(sp.y)
    if (x < 0 || x >= W - 1 || y < 0 || y >= H - 1) continue
    const tier = sp.life > 0.6 ? 3 : sp.life > 0.3 ? 2 : 1
    for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) {
      const i = (y + yy) * W + x + xx
      if (lv[i] < tier) lv[i] = tier
    }
    if (y < top) top = y
  }
  return top
}

/** Picture -> one bitmap and one attribute per cell, for cell rows
 *  [r0, r1): the brightest tier in the cell, and only pixels within one
 *  tier of it. TOKYO BAY's packer. */
function pack(L, r0, r1) {
  const { S, lv, cellOf, rowMax, rowBits } = L
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
      if (rowMax[cx] < 0) { L.lit[ci] = 0; continue }
      L.lit[ci] = 1
      L.attr[ci] = TIERS[rowMax[cx]]
      L.which[ci] ^= 1
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
        if (L.lit[ci]) L.bufs[L.which[ci]][ci][py] = rowBits[cx]
      }
    }
  }
}
