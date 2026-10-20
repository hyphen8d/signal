// SIGNAL -- visualizer effect "DANCEFLOOR" (MIRRORBALL, 2026-09-13).
//
// A disco at its peak: a mirror ball hanging on a short cord at the top of
// the frame, faceted like a mosaic and slowly turning, one spotlight burning
// a bright point on its upper left; the flecks of light it throws sweeping
// around the room together; and below, a lit dance floor in perspective --
// the Saturday Night Fever floor -- whose pattern of lit tiles steps with the
// kick, with four dancers at its back edge changing pose on the same beat.
//
// Why it fits: MIRRORBALL is disco, boogie and funk, 1974-83 -- four on the
// floor. Every other station's effect keeps its audio hooks to amplitude and
// a soft accent; here the beat IS the subject, so the one discrete event this
// effect has is a step on every kick, and it has to land in time.
//
// The rules that shaped the look:
// - THE GLARE TRAP. The 2026-09-13 tube check found '█' fills blooming into
//   glowing slabs on the real CRT even at FAINT, and a lit tile floor is that
//   exact failure waiting to happen. So the floor is GRID LINES around dark
//   tiles; a lit tile fills with '░' (a '▒' only for the instant of the kick)
//   and keeps a dark margin inside its lines where the tile is wide enough;
//   only a minority of tiles are lit at once; and nothing on the floor ever
//   reaches BRIGHT. The ball is facets and an outline, not a disc -- the only
//   '█' in the frame is the spotlight's point on it and a few facet glints.
// - The spots are ONE rotation, not sparkle. Each fleck is a fixed reflection
//   direction on the ball, turned by the same angle as the facets: on the
//   curved back wall they all travel the same way, fastest in the middle and
//   slowing into the corners; on the floor they circle the spot under the
//   ball. Each carries a short dim tail at where it was a moment ago, so the
//   direction of travel reads in a single frame.
//
// Audio, on AMPLITUDE and on the beat only (never a `t *` frequency -- the
// rotation is a constant): a rising edge on `pulse` steps the floor pattern
// (pulse jumps to 1 on a real onset, and on syntheticAudio's own ~0.9s
// pulse, so the step lands in time with or without a tap; the synthetic
// random `onset` flag is deliberately NOT read, or the floor would step off
// the beat); level, latched at each step, gates how many tiles light, and
// sets how many spots are lit; treble adds facet glints; bass swells the lit
// tiles and the lines around them; a kick with bass behind it flares the
// spots for as long as the pulse lasts. Muted, SILENT_AUDIO leaves the ball
// turning and a few dim spots still moving, and the floor dark.
//
// 2026-10-16 (design pass). The critique, judged off the real tube: the lit
// tiles ignored the perspective -- irregular stair-step blobs like tetromino
// pieces, and with no tap solid NORMAL '▒' slabs (syntheticAudio's pulse sits
// over 0.55 for a good part of every beat) -- and the ball, a DIM dotted
// outline, was dimmer than the floor it hangs over. Changed, as specified: a
// lit tile fills with '░' only, DIM at rest and MUTED on the kick, and only
// the cells a column clear of its rails on EVERY row (MARGIN), so each lit
// tile is its own trapezoid inside its rails and rungs and two lit
// neighbours can no longer fuse into one blob. (The inset is horizontal
// only: the back rows are one and two rows deep, and a vertical inset would
// leave them nothing to light. The two edge tiles of the back row are one
// row of three cells and keep no fill at all -- they stay dark.) The ball's
// sides are '( )' and its whole outline is one MUTED ring, and its lit
// facets are NORMAL with the thresholds lowered so they show -- the
// brightest structure in the frame apart from its glints and the spot.
// tests/visual-dancefloor.test.mjs holds both.
//
// 2026-10-20 (polish). The critique, off the real tube: the ball read as a
// SKULL -- its '■' facets and the spotlight's '█' made two blocks side by
// side in the upper half (eyes) and a row below (teeth); and the lit tiles
// were still '░' staircases sloping with the rails, tetromino blobs despite
// the 10-16 fix. Its offered character fixes were measured before trying
// them, and neither fits this size: a tile's fill is 1-6 cells across, so
// "light only the columns common to every row of the tile" leaves the outer
// tiles a single column or nothing at all (8 of 32 tiles come out empty,
// six more one column wide). And the set rule the same critique proposes --
// anything round goes through pixels -- names the ball outright. So, keeping
// the subject, the composition and the beat exactly as they were:
// - The BALL is pixels (putGlyph, FROST's packing): a disc round on the
//   face, tiled with a regular longitude/latitude mosaic whose joints turn
//   with OMEGA, lit from the upper left; every glint is a small four-point
//   star ON THE RIM, cut out of a dark halo, the spotlight's fixed on the
//   upper left and the treble's on the same lit arc -- never a symmetric
//   pair, never inside the disc. No '█', '■' or outline glyph remains.
// - The FLOOR is pixels too: panels and dark joints, in the same
//   perspective, the same tiles lighting on the same steps. A lit panel is
//   its exact trapezoid, so there is no staircase to see and two lit tiles
//   cannot fuse across a joint. It has no line glyphs at all -- which is
//   also the critique's set note answered (OUTRUN's floor is lit LINES;
//   this one is lit PANELS). The glare trap still governs: panels are
//   pre-dithered to half coverage, DIM at rest and MUTED on the kick.
// - The dancers are MUTED (were DIM), as asked, to read over the panels.
// - The floor's spots are pixel flecks (a character there would punch a
//   cell-sized hole in a panel); the wall's are still '•' characters.
// Cost: a frame that re-packed every floor and ball cell took ~13ms in the
// harness, so the floor is re-rendered only when a step, the kick's tier,
// a bass step or mute changes it, plus the cells a fleck is in; the ball at
// BALL_FPS. Every cell is still put every frame (re-put as it stands).
//
// Stored state: the step counter, the level latched at the last step, the
// previous frame's pulse and the effect-clock time of the last step (the
// rate limit). Everything else is a pure function of (x, y, t, audio); the
// floor geometry is compiled to lookup tables once per grid width.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, auMul, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- the turn -----------------------------------------------------------------
// Radians a second, shared by the facets and every spot -- that sharing is
// what makes it one ball turning. 2026-09-13 -- 0.12 is about a turn a
// minute: the spots cross the middle of the wall at ~5 columns a second,
// slow enough to follow one, fast enough that the room never looks paused.
export const OMEGA = 0.12

// --- the beat ---------------------------------------------------------------
// A step is a rise in `pulse` of at least BEAT_RISE since the last frame.
// 2026-09-13 -- 0.2, not 0.5: the fallback ticker can hand the effect a
// frame 250ms late, by which point syntheticAudio's pulse has already
// decayed to ~0.25, and a stricter edge would drop that beat.
export const BEAT_RISE = 0.2
// The least time between two steps. A real tap can fire onsets on a hi-hat
// or a double kick; the floor steps on the beat, not on every transient.
// 0.22s still admits eighth notes up to ~136bpm, which disco never exceeds.
export const STEP_GAP_S = 0.22
// Steps per pattern: two bars of four, then the floor changes routine.
const STEPS_PER_PATTERN = 8

// --- the pixels -----------------------------------------------------------------
// 2026-10-20 (polish) -- the ball and the floor are drawn as cell bitmaps
// through putGlyph() (FLAME's renderer, packed the way FROST packs): a
// beam-intensity buffer the size of the canvas, each cell drawn at the
// lowest tier that reaches its brightest pixel and dithered (4x4 Bayer) by
// lum / that tier's level. Everything else -- the dancers, the wall's spots,
// the cord -- stays characters. Why the two moved is in the header's
// 2026-10-20 note.
const LV_BRIGHT = 255, LV_NORMAL = 205, LV_MUTED = 180, LV_DIM = 150, LV_FAINT = 100
const tierOf = (m) => (m >= 232 ? BRIGHT : m >= 193 ? NORMAL : m >= 166 ? MUTED : m >= 126 ? DIM : FAINT)
const levelOf = (a) => (a === BRIGHT ? LV_BRIGHT : a === NORMAL ? LV_NORMAL : a === MUTED ? LV_MUTED : a === DIM ? LV_DIM : LV_FAINT)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16)
// Below this a cell is left dark rather than drawn as a few stray dots.
const CELL_MIN = 14

/** The pixel geometry for a term: cell size, the framebuffer's width, the
 *  physical aspect of a pixel (FROST's formula: the face is 4:3), and the
 *  buffers -- built once per term (keyed on the term itself: the cache
 *  below records what THAT grid is showing, so two terms of one size must
 *  not share it). The aspect is the 80-column desktop face's, whatever the
 *  width: this is fixed art centred on column 40 (audit L5's rule -- a
 *  wider term gets dark room either side, not a wider ball). */
const PIX = new WeakMap()
const ART_COLS = 80
function pixFor(term) {
  let P = PIX.get(term)
  if (P) return P
  const { cellW, cellH } = term.font
  const adv = cellW + 1
  const FW = term.cols * adv, FH = VIZ_BOT * cellH
  P = {
    cols: term.cols, cellW, cellH, adv, FW, FH,
    aspect: (4 / 3) / ((ART_COLS * adv) / (term.rows * cellH)),
    lum: new Uint8Array(FW * FH),
    // Two bitmaps per cell, alternated PER CELL each time that cell is
    // packed (RIPPLE's `which`): putGlyph() skips a same-reference re-put, so
    // a bitmap rewritten in place never shows -- and a cell is only packed
    // when something in it changed, so a per-frame flip could land on the
    // reference the cell is still showing.
    bufs: [0, 1].map(() => Array.from({ length: term.cols * VIZ_BOT }, () => new Uint16Array(cellH))),
    which: new Uint8Array(term.cols * VIZ_BOT),
    // What each cell shows now (null: blank), so an unchanged cell is
    // re-put for the cost of a compare.
    shown: new Array(term.cols * VIZ_BOT).fill(null),
    attr: new Uint8Array(term.cols * VIZ_BOT),
    floorKey: '', ballKey: '', spotCells: [],
  }
  PIX.set(term, P)
  return P
}

/** Packs the cell (c, r) from the buffer: putGlyph at the tier of its
 *  brightest pixel, or -- when it holds nothing -- a blank (`blank`) or
 *  nothing at all (so what is drawn there already stays). */
function packCell(term, P, c, r, blank) {
  const { lum, FW, cellW, cellH, adv } = P
  const base = r * cellH * FW + c * adv
  let m = 0
  for (let py = 0; py < cellH; py++) {
    const o = base + py * FW
    for (let px = 0; px < cellW; px++) if (lum[o + px] > m) m = lum[o + px]
  }
  const ci = r * P.cols + c
  if (m < CELL_MIN) { P.shown[ci] = null; if (blank) term.put(c, r, ' '); return }
  const attr = tierOf(m)
  const inv = 1 / levelOf(attr)
  P.which[ci] ^= 1
  const bits = P.bufs[P.which[ci]][ci]
  let any = 0
  for (let py = 0; py < cellH; py++) {
    const o = base + py * FW
    const b4 = (py & 3) * 4
    let w = 0
    for (let px = 0; px < cellW; px++) if (lum[o + px] * inv > BAYER[b4 + (px & 3)]) w |= 1 << (cellW - 1 - px)
    bits[py] = w
    any |= w
  }
  P.shown[ci] = any ? bits : null
  P.attr[ci] = attr
  if (any) term.putGlyph(c, r, bits, attr)
  else if (blank) term.put(c, r, ' ')
}

/** Re-puts what cell (c, r) already shows (a no-op on the grid when nothing
 *  else drew there), or a blank. */
function reput(term, P, c, r) {
  const ci = r * P.cols + c
  if (P.shown[ci]) term.putGlyph(c, r, P.shown[ci], P.attr[ci])
  else term.put(c, r, ' ')
}

// --- the ball -----------------------------------------------------------------
// The ball's box on the grid, centre and pixel radius (vertical; the
// horizontal radius is this over the pixel aspect, so it is round on the
// face, not on the framebuffer). The cord comes down from row 1.
// 2026-10-20 -- was a hand-drawn 15x7 character outline ('.-‾‾‾-.', '( )')
// with a '■'/':'/'·' checker of facets inside: see the header's note.
export const BALL_X0 = 31
export const BALL_Y0 = 2
export const BALL_W = 19
export const BALL_H = 7
export const BALL_CX = 40
export const BALL_CY = 5
export const BALL_R = 52
// Facets: a regular grid of longitude and latitude, the grout between them
// one dark pixel, the longitude lines carried round by the turn.
// 2026-09-13 -- 10 facets across the visible half; 2026-10-20 -- 14, with
// 12 latitude bands, so a facet is ~15x12 pixels at the equator: a mosaic
// you can see is a mosaic, compressing to slivers at the limb.
const FACETS_PER_RAD = 14 / Math.PI
const LAT_PER_RAD = 12 / Math.PI
// The light falls from the upper left, toward the viewer.
const LIGHT = (() => { const v = [-0.55, -0.62, 0.56], n = Math.hypot(...v); return v.map((c) => c / n) })()
// Glints sit on the RIM only, in its lit upper-left arc -- never two in a
// symmetric pair (the 10-20 critique's "skull": two block glints side by
// side in the upper half read as eyes). The spotlight's is fixed; up to
// MAX_GLINTS more twinkle along the arc with the treble.
export const SPOT_GLINT_ANGLE = 3.75          // radians, screen angle (0 = right, y down)
export const GLINT_ARC = [3.1, 4.6]           // the lit arc a treble glint may appear on
export const MAX_GLINTS = 3
// How often the ball is re-rendered: the turn moves an equator facet about
// eight pixels a second, so 20 renders a second is every pixel of it.
const BALL_FPS = 20

/** Where a glint at screen angle `ang` sits: the cell holding it, and its
 *  pixel centre. Exported so the tests can find the spotlight's glint. */
export function glintAt(term, ang) {
  const P = pixFor(term)
  const cx = BALL_CX * P.adv + P.cellW / 2, cy = BALL_CY * P.cellH + P.cellH / 2
  const rr = BALL_R * 0.96
  const x = cx + Math.cos(ang) * rr / P.aspect, y = cy + Math.sin(ang) * rr
  return { px: x, py: y, c: Math.floor(x / P.adv), r: Math.floor(y / P.cellH) }
}

/** The ball's per-pixel geometry, which never changes: each disc pixel's
 *  longitude (and its left and upper neighbours'), whether a latitude joint
 *  runs through it, its latitude band, the light it catches and whether it
 *  is on the limb. Only the longitude moves with the turn, so a frame is
 *  three floors and a compare per pixel. */
function ballTable(P) {
  if (P.ball) return P.ball
  const { FW, aspect, adv, cellW, cellH } = P
  const cx = BALL_CX * adv + cellW / 2, cy = BALL_CY * cellH + cellH / 2
  const R = BALL_R, Rx = R / aspect
  const x0 = Math.floor(cx - Rx - 1), x1 = Math.ceil(cx + Rx + 1)
  const y0 = Math.floor(cy - R - 1), y1 = Math.ceil(cy + R + 1)
  const lonOf = (dx, dy) => Math.atan2(dx, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)))
  const latOf = (dy) => Math.floor((Math.asin(Math.max(-1, Math.min(1, -dy))) + Math.PI / 2) * LAT_PER_RAD)
  const px = [], lon = [], lonL = [], lonU = [], band = [], latJoint = [], lam = [], limb = []
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / R
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) * aspect / R
      const rr = dx * dx + dy * dy
      if (rr > 1) continue
      const nz = Math.sqrt(Math.max(0, 1 - rr))
      px.push(y * FW + x)
      lon.push(lonOf(dx, dy))
      lonL.push(lonOf(dx - aspect / R, dy))
      lonU.push(lonOf(dx, dy - 1 / R))
      const fj = latOf(dy)
      band.push(fj)
      latJoint.push(fj !== latOf(dy - 1 / R) ? 1 : 0)
      lam.push(Math.max(0, dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2]))
      limb.push(rr > 0.9 ? 1 : 0)
    }
  }
  P.ball = {
    cx, cy, px: Int32Array.from(px), lon: Float32Array.from(lon), lonL: Float32Array.from(lonL),
    lonU: Float32Array.from(lonU), band: Int16Array.from(band), latJoint: Uint8Array.from(latJoint),
    lam: Float32Array.from(lam), limb: Uint8Array.from(limb),
  }
  return P.ball
}

/** Renders the ball into the pixel buffer. */
function ballPixels(P, t, glints) {
  const { lum, FW, aspect, cellH } = P
  const B = ballTable(P)
  const { cx, cy } = B
  const R = BALL_R
  const rot = OMEGA * t
  for (let k = 0; k < B.px.length; k++) {
    const fi = Math.floor((B.lon[k] + rot) * FACETS_PER_RAD)
    let v
    // Grout: the pixel where the facet changes from its left or upper
    // neighbour.
    if (B.latJoint[k] || fi !== Math.floor((B.lonL[k] + rot) * FACETS_PER_RAD) || fi !== Math.floor((B.lonU[k] + rot) * FACETS_PER_RAD)) v = 18
    else {
      const h = hash2(((fi % 60) + 60) % 60, B.band[k] * 1.7 + 3)
      // Every facet catches something (ambient), the lit ones a lot, and
      // the hash makes them a mosaic of mirrors rather than a shaded disc.
      v = 52 + 172 * Math.pow(B.lam[k], 1.3) * (0.4 + 0.6 * h)
    }
    // The limb: a thin lit rim, so the shadow side still has an edge.
    if (B.limb[k] && v < 132) v = 132
    lum[B.px[k]] = v > 228 ? 228 : v
  }
  // The cord, in pixels from the top of the canvas row 2 down to the ball.
  const cxp = Math.round(cx)
  for (let py = BALL_Y0 * cellH; py < cy - R + 2; py++) lum[py * FW + cxp] = Math.max(lum[py * FW + cxp], 150)
  // Glints: a four-pointed star, BRIGHT, on the rim, cut out of a small
  // dark halo -- without it the star's cell packs at BRIGHT with the
  // facets around it nearly solid, and the star is lost in its own cell.
  for (const { ang, s } of glints) {
    const gx = cx + Math.cos(ang) * R * 0.96 / aspect, gy = cy + Math.sin(ang) * R * 0.96
    const arm = Math.round(4 + 4 * s)
    for (let y = Math.round(gy - arm * 0.75) - 1; y <= Math.round(gy + arm * 0.75) + 1; y++) {
      for (let x = Math.round(gx - arm) - 1; x <= Math.round(gx + arm) + 1; x++) {
        if (y < 0 || y >= P.FH || x < 0 || x >= FW) continue
        const d = Math.hypot((x - gx) / arm, (y - gy) / (arm * 0.75))
        if (d <= 1.05 && lum[y * FW + x] > 30) lum[y * FW + x] = 30
      }
    }
    for (let k = -arm; k <= arm; k++) {
      const fall = 255 - Math.abs(k) * (60 / arm)
      const hx = Math.round(gx + k), hy = Math.round(gy)
      const vx = Math.round(gx), vy = Math.round(gy + k * 0.75)
      if (hy >= 0 && hy < P.FH && hx >= 0 && hx < FW) lum[hy * FW + hx] = Math.max(lum[hy * FW + hx], fall)
      if (vy >= 0 && vy < P.FH && vx >= 0 && vx < FW) lum[vy * FW + vx] = Math.max(lum[vy * FW + vx], fall)
    }
  }
}

// --- the floor --------------------------------------------------------------
// One-point perspective. A floor line at offset o (in tiles from the
// centre) sits at x = 40 + o * spacingAt(y). TILES_X tiles across at every
// depth, so the floor is a trapezoid: ~28 columns wide at its back edge, the
// full width at the front.
export const VANISH_Y = 4
export const FRONT_Y = VIZ_BOT - 1   // 21
export const TILE_W = 10              // columns per tile on the front row
export const TILES_X = 8
// The rows the across-the-floor joints sit on, back to front. 2026-09-13 --
// gaps of 1, 2, 3 rows and a cropped fourth: equal gaps read as a wall
// of shelves, not a floor, and this is as much perspective as nine rows hold.
export const LINE_ROWS = [10, 12, 15, 19]
export const TILES_Z = LINE_ROWS.length   // the fourth runs off the bottom
export const FLOOR_TOP = LINE_ROWS[0]
// Depth in tile rows -> screen row, for the tiles and the spots on the
// floor: the line rows, plus a virtual line past the bottom for the cropped
// front row.
const DEPTH_ROWS = [...LINE_ROWS, 24]
export const spacingAt = (y) => TILE_W * (y - VANISH_Y) / (FRONT_Y - VANISH_Y)
// Grout half-width in pixels: the dark joint between two panels. The floor
// IS panels and joints -- no line glyphs -- which is what keeps it from
// sharing OUTRUN's lit-line grid (the 10-20 critique's set note).
const GROUT_PX = 1.4
// How much of a panel's pixels a lit panel lights at its tier (Bayer
// coverage), and an unlit one. Under 0.6 on purpose: full coverage at any
// tier blooms into a slab on the tube (THE GLARE TRAP, above). The panels
// are PRE-dithered at their own tier's level (a pixel is that level or 0):
// the packer takes a cell's tier from its brightest pixel, so a panel
// written as an even lum of level x coverage would land a tier or two down
// and then fill its cell solid -- the first cut of this pass did exactly
// that, and its kick panels were flat slabs.
const LIT_COVER = 0.5
const DARK_COVER = 0.12
const panelPx = (lit, P, px, py) => {
  const b = BAYER[(py & 3) * 4 + (px & 3)]
  return lit ? (b < P.litCover ? P.litLv : 0) : (b < DARK_COVER ? LV_FAINT : 0)
}

/** Where a floor pixel is: tile (i, j) and how far it is from the nearest
 *  joint in pixels, or null off the floor. Coordinates are in cell units
 *  with integer = cell centre (so they line up with spacingAt and the old
 *  character geometry). */
function floorAt(X, Y, adv, cellH) {
  if (Y < FLOOR_TOP) return null
  let j = 0
  while (j + 1 < DEPTH_ROWS.length - 1 && Y >= DEPTH_ROWS[j + 1]) j++
  const sp = spacingAt(Y)
  const u = (X - BALL_CX) / sp + TILES_X / 2
  if (u < 0 || u >= TILES_X) return null
  const i = Math.floor(u)
  const fu = u - i
  const dxJoint = Math.min(fu, 1 - fu) * sp * adv
  const dyJoint = Math.min(Y - DEPTH_ROWS[j], DEPTH_ROWS[j + 1] - Y) * cellH
  return { i, j, joint: Math.min(dxJoint, dyJoint) }
}

/** What the canvas pixel (px, py) is on the floor (framebuffer pixels, the
 *  default cell size): a tile index (i + j * TILES_X), -1 for a joint, -2
 *  off the floor. The tests read the bitmaps back against this. */
export function panelAtPixel(px, py, adv = 9, cellH = 16) {
  const f = floorAt((px + 0.5) / adv - 0.5, (py + 0.5) / cellH - 0.5, adv, cellH)
  return !f ? -2 : f.joint < GROUT_PX ? -1 : f.i + f.j * TILES_X
}

/** Tile index the CENTRE of cell (x, y) falls in, or -1, on a grid `cols`
 *  wide. */
export function floorTileAt(x, y, cols = 80) {
  if (x < 0 || x >= cols || y < FLOOR_TOP || y >= VIZ_BOT) return -1
  const f = floorAt(x, y, 9, 16)
  return f ? f.i + f.j * TILES_X : -1
}

/** A pixel-space point well inside tile (i, j): its centre at the middle of
 *  its depth band. For the tests, to ask whether that tile is lit. */
export function tileCentre(i, j) {
  const Y = j < 3 ? (DEPTH_ROWS[j] + DEPTH_ROWS[j + 1]) / 2 : (DEPTH_ROWS[3] + FRONT_Y) / 2
  return { x: BALL_CX + (i + 0.5 - TILES_X / 2) * spacingAt(Y), y: Y }
}

/** The floor's per-pixel geometry, built once per term size: which panel
 *  each pixel of the floor rows belongs to, or -1 for a joint or off the
 *  floor. */
function floorTable(P) {
  if (P.floor) return P.floor
  const { FW, adv, cellH } = P
  const y0 = FLOOR_TOP * cellH
  const tile = new Int8Array(FW * (VIZ_BOT * cellH - y0)).fill(-1)
  for (let py = y0; py < VIZ_BOT * cellH; py++) {
    // Cell units, integer = cell centre: row r spans r-0.5..r+0.5.
    const Y = (py + 0.5) / cellH - 0.5
    for (let px = 0; px < FW; px++) {
      const f = floorAt((px + 0.5) / adv - 0.5, Y, adv, cellH)
      if (f && f.joint >= GROUT_PX) tile[(py - y0) * FW + px] = f.i + f.j * TILES_X
    }
  }
  P.floor = { y0, tile }
  return P.floor
}

/** Renders the floor's panels into the pixel buffer. */
function floorPixels(P) {
  const { lum, FW, lit } = P
  const { y0, tile } = floorTable(P)
  const off = y0 * FW
  for (let k = 0; k < tile.length; k++) {
    const i = tile[k]
    lum[off + k] = i < 0 ? 0 : panelPx(lit[i], P, k % FW, y0 + (k - k % FW) / FW)
  }
}

/** The same, for the pixels of one cell only (to take a spot back out). */
function floorCellPixels(P, c, r) {
  const { lum, FW, lit, adv, cellW, cellH } = P
  const { y0, tile } = floorTable(P)
  for (let py = r * cellH; py < (r + 1) * cellH; py++) {
    for (let px = c * adv; px < c * adv + cellW; px++) {
      const i = tile[(py - y0) * FW + px]
      lum[py * FW + px] = i < 0 ? 0 : panelPx(lit[i], P, px, py)
    }
  }
}

/** Whether tile (i, j) is lit on step n with level lvl (0..1). The floor
 *  runs four routines, eight steps each; every one lights at most a third of
 *  the floor before the level gate, and the gate thins it further when the
 *  music is quiet. Pure, so a step is the only thing that changes it. */
export function tileLit(i, j, n, lvl) {
  const routine = Math.floor(n / STEPS_PER_PATTERN) % 4
  const s = n % STEPS_PER_PATTERN
  let on
  if (routine === 0) {
    // Diagonals marching back-left to front-right.
    on = ((i + j - n) % 4 + 4) % 4 === 0
  } else if (routine === 1) {
    // A pair of columns opening from the centre out, alternate rows.
    on = (i === 4 + (s % 4) || i === 3 - (s % 4)) && (j + n) % 2 === 0
  } else if (routine === 2) {
    // A thinned checkerboard that flips every beat.
    on = (i + j) % 2 === n % 2 && hash2(i * 3 + j * 11, n) < 0.45
  } else {
    // Rings from the middle of the floor, stepping outward.
    const d = Math.floor(Math.abs(i - 3.5)) + Math.abs(j - 1)
    on = d % 3 === n % 3
  }
  return on && hash2(i * 5 + j * 13 + 1, n * 3 + 7) < 0.5 + 0.5 * lvl
}

// --- the spots ----------------------------------------------------------------
// SPOT_N reflection directions, fixed on the ball: a starting azimuth, an
// elevation (above -0.25 lands on the wall, below on the floor) and a rank
// that decides which light first as the level rises.
export const SPOT_N = 44
const SPOTS = Array.from({ length: SPOT_N }, (_, i) => ({
  az: hash2(i, 1.5) * Math.PI * 2,
  el: hash2(i + 7, 2.5) * 2 - 1,
  rank: hash2(i + 3, 3.5),
}))
// The back wall spans rows 1..WALL_BOT; wall spots project from azimuth as
// x = 40 + WALL_R * sin(az), visible on the far half only.
export const WALL_BOT = 9
const WALL_R = 44
// The point on the floor under the ball, in tile rows of depth, and how far
// out the floor spots circle it.
const FOOT_D = 1.7
// How far back in time a spot's tail is drawn.
const TAIL_S = 0.35
export const SPOT_HEAD = '•'
export const SPOT_TAIL = '·'

/** A spot's cell at time t, or null when it is behind the viewer or off the
 *  floor. Exported so the tests can ask where the rotation should put one. */
export function spotCell(spot, t) {
  const az = spot.az + OMEGA * t
  const c = Math.cos(az), sn = Math.sin(az)
  if (spot.el > -0.25) {
    if (c < 0.12) return null
    const y = Math.round(1 + (1 - (spot.el + 0.25) / 1.25) * (WALL_BOT - 1))
    return { x: Math.round(BALL_CX + WALL_R * sn), y, wall: true, edge: c }
  }
  // Floor: a circle about the foot of the ball, far side (cos > 0) at the back.
  const r = 0.7 + (spot.el + 1) / 0.75 * 2.6
  const d = FOOT_D - r * c * 0.6
  if (d < 0.15 || d >= 3.9) return null
  const k = Math.min(3, Math.floor(d))
  const y = Math.round(DEPTH_ROWS[k] + (d - k) * (DEPTH_ROWS[k + 1] - DEPTH_ROWS[k]))
  if (y <= FLOOR_TOP || y >= VIZ_BOT) return null
  const X = r * sn * 1.2
  if (Math.abs(X) > TILES_X / 2 - 0.2) return null
  return { x: Math.round(BALL_CX + X * spacingAt(y)), y, wall: false, edge: 1 }
}

// --- the dancers --------------------------------------------------------------
// Four figures at the back edge of the floor, feet on its back line, in
// poses that change on the beat. Thin line glyphs, never filled.
// 2026-09-13 -- first stood ON the back tile row, where their limbs tangled
// with the grid lines and the one-row tiles and read as floor noise; on the
// back line they stand clear against the dark wall, two either side of the
// ball, just outside its bottom rows.
const POSES = [
  [' o/', '/| ', '/ \\'],   // the point
  ['\\o ', ' |\\', '/ \\'],
  ['\\o/', ' | ', '/ \\'],   // hands up
  [' o ', '/|\\', '< \\'],
]
export const DANCER_Y = FLOOR_TOP - 3   // heads; feet on the row above the back line
export const DANCER_X = [27, 31, 49, 53]   // clear of the ball's columns 33..47


const tier = (v) => v > 0.8 ? NORMAL : v > 0.55 ? MUTED : v > 0.28 ? DIM : FAINT

export default {
  key: 'dancefloor',
  label: 'DANCEFLOOR',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._dancefloorStep = 0
    p._dancefloorLvl = 0.5
    p._dancefloorPrevPulse = 0
    p._dancefloorBeatAt = -Infinity
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // 2026-09-13 -- _dancefloorBeatAt is an absolute effect-clock value that
    // the rate limit reads: left over from a long visit it sits minutes in
    // the future of the restarted clock and refuses every step until the
    // clock catches up -- a floor frozen for as long as the last visit was.
    // The draw deliberately does not self-heal it; this is what keeps it
    // honest, and tests/visual-dancefloor.test.mjs can see it. The previous
    // pulse is cleared too, so the first kick after entry is a rising edge.
    // The step count is not a clock and carries over: the floor picks up its
    // routine where it left off.
    p._dancefloorBeatAt = -Infinity
    p._dancefloorPrevPulse = 0
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const P = pixFor(term)
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    // --- the beat -------------------------------------------------------------
    const pulse = A.pulse || 0
    if (!muted && pulse - p._dancefloorPrevPulse >= BEAT_RISE && t - p._dancefloorBeatAt >= STEP_GAP_S) {
      p._dancefloorStep++
      p._dancefloorBeatAt = t
      p._dancefloorLvl = Math.min(1, Math.max(0, A.level))
    }
    p._dancefloorPrevPulse = pulse
    const n = p._dancefloorStep
    const bass = auMul(A, A.bass, 0, 1)
    const treble = auMul(A, A.treble, 0, 1)
    const level = auMul(A, A.level, 0, 1)
    // A kick with bass behind it: how hard the spots flare, for as long as
    // the pulse lasts. Stateless -- the pulse is the envelope.
    const flare = muted ? 0 : pulse * pulse * Math.min(1, Math.max(0, (bass - 0.45) / 0.3))

    // --- the floor: panels and joints, in pixels ------------------------------
    // A lit panel is DIM at rest and MUTED while the kick's pulse is up --
    // never up to the ball's NORMAL; bass widens its coverage a little (in
    // four steps). Muted, every panel is dark. The panels are re-rendered
    // and re-packed only when that changes -- a step, the kick's tier, a
    // bass step, mute -- since packing the whole floor every frame was most
    // of the effect's cost; between, a cell is re-put as it stands.
    const litTier = pulse > 0.55 ? MUTED : DIM
    const cover = LIT_COVER + 0.035 * Math.round(4 * bass)
    const floorKey = `${muted ? 'm' : n}|${litTier}|${cover}|${p._dancefloorLvl}`
    const floorDirty = floorKey !== P.floorKey
    if (floorDirty) {
      P.floorKey = floorKey
      const lit = P.lit || (P.lit = new Uint8Array(TILES_X * TILES_Z))
      for (let k = 0; k < lit.length; k++) lit[k] = !muted && tileLit(k % TILES_X, (k - k % TILES_X) / TILES_X, n, p._dancefloorLvl) ? 1 : 0
      P.litLv = levelOf(litTier)
      P.litCover = cover
      floorPixels(P)
    }

    // --- the spots ------------------------------------------------------------
    // Level decides how many of the ball's reflections are lit; muted, a
    // few still turn, faint. On the wall they are characters (the wall is
    // empty dark, and a '•' is exactly a fleck); on the floor they go into
    // the pixel buffer, so a fleck crossing a panel lights the panel rather
    // than punching a character-sized hole in it. Tails first, so a head
    // always wins its cell.
    const litN = muted ? 0.22 : 0.3 + 0.6 * level
    const wall = []
    const spotCells = new Set()
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < SPOT_N; i++) {
        const sp = SPOTS[i]
        if (sp.rank >= litN) continue
        const now = spotCell(sp, t)
        if (!now) continue
        if (pass === 0) {
          // The tail sits in the cell next to the head on the side it came
          // from, however far the spot moved in TAIL_S -- a gap between the
          // two reads as two spots.
          const was = spotCell(sp, t - TAIL_S)
          if (!was || Math.abs(was.x - now.x) > 6 || Math.abs(was.y - now.y) > 2) continue
          const tx = now.x + Math.sign(was.x - now.x), ty = now.y + Math.sign(was.y - now.y)
          if ((tx !== now.x || ty !== now.y) && tx >= 0 && tx < cols && ty >= 1 && ty < VIZ_BOT) {
            if (now.wall) wall.push([tx, ty, SPOT_TAIL, muted ? FAINT : DIM])
            else spotPixels(P, tx, ty, muted ? 60 : 120, 1, spotCells)
          }
          continue
        }
        if (now.x < 0 || now.x >= cols) continue
        // Spots fade into the wall's corners, where they would be glancing.
        const v = muted ? 0.3 : Math.min(1, now.edge * 1.6) * (0.62 + 0.25 * level)
        const flash = flare > 0.5 && sp.rank < 0.35
        if (now.wall) wall.push([now.x, now.y, SPOT_HEAD, flash ? BRIGHT : tier(v + flare * 0.3)])
        else spotPixels(P, now.x, now.y, flash ? 255 : muted ? 110 : 150 + 60 * Math.min(1, v + flare * 0.3), 2, spotCells)
      }
    }

    // --- the ball ---------------------------------------------------------------
    // The spotlight's glint always (NORMAL under mute, BRIGHT otherwise);
    // treble opens the gate for up to MAX_GLINTS more along the lit arc,
    // each living a fifth of a second. Never two at mirrored places: they
    // are all on one arc of the rim. Re-rendered at BALL_FPS, not every
    // frame: the turn moves a facet a pixel every ~1/8s at the equator.
    const glints = [{ ang: SPOT_GLINT_ANGLE, s: muted ? 0.3 : flare > 0.5 ? 1 : 0.6 }]
    const slot = Math.floor(t * 5)
    if (!muted) {
      for (let k = 0; k < MAX_GLINTS; k++) {
        if (hash2(slot, k * 7 + 1) > 0.25 + 0.6 * treble) continue
        const ang = GLINT_ARC[0] + (GLINT_ARC[1] - GLINT_ARC[0]) * hash2(slot * 3 + 1, k * 11 + 5)
        if (Math.abs(ang - SPOT_GLINT_ANGLE) < 0.3) continue   // never fused with the spotlight's
        glints.push({ ang, s: 0.25 + 0.35 * hash2(slot, k + 40) })
      }
    }
    const ballKey = `${Math.floor(t * BALL_FPS)}|${glints.map((g) => g.ang.toFixed(2) + g.s).join(',')}|${muted}`
    const ballDirty = ballKey !== P.ballKey
    if (ballDirty) {
      P.ballKey = ballKey
      P.lum.fill(0, 0, FLOOR_TOP * P.cellH * P.FW)
      ballPixels(P, t, glints)
      if (muted) {
        // Under mute the spotlight's glint is the ball's brightest, but NORMAL.
        const g = glintAt(term, SPOT_GLINT_ANGLE)
        capCell(P, g.c, g.r, 228)
      }
    }

    // --- pack: the sky, the floor and the ball -------------------------------------
    // Rows above the floor are the dark wall: blank, then the ball's cells
    // (only where it has pixels) and the characters over it.
    for (let y = 1; y < FLOOR_TOP; y++) {
      for (let x = 0; x < cols; x++) {
        const inBall = x >= BALL_X0 && x < BALL_X0 + BALL_W && y >= BALL_Y0 - 1 && y < BALL_Y0 + BALL_H + 1
        if (!inBall) term.put(x, y, ' ')
        else if (ballDirty) packCell(term, P, x, y, true)
        else reput(term, P, x, y)
      }
    }
    // The floor: every cell when the panels changed, else only the cells a
    // spot is in now or was in last frame; the rest re-put as they stand.
    const dirty = new Set(spotCells)
    for (const ci of P.spotCells) dirty.add(ci)
    for (let y = FLOOR_TOP; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        if (floorDirty || dirty.has(y * cols + x)) packCell(term, P, x, y, true)
        else reput(term, P, x, y)
      }
    }
    // Take this frame's spots back out of the buffer, so the floor under
    // them is clean panel again for whatever packs those cells next.
    for (const ci of spotCells) floorCellPixels(P, ci % cols, (ci - ci % cols) / cols)
    P.spotCells = [...spotCells]
    // What the last frame drew, for the tests: which floor cells a fleck
    // was painted into (cell index y * cols + x). Layout, not a clock.
    p._dancefloorSpotCells = spotCells


    // --- the dancers ------------------------------------------------------------
    // Each changes pose on the beat, offset from its neighbours so the four
    // never move as one. Silhouettes against the wall: their cells blank
    // what is behind them. 2026-10-20 (polish) -- MUTED (was DIM), as the
    // critique asked, so they read over the floor's panels.
    for (let d = 0; d < DANCER_X.length; d++) {
      const pose = POSES[(n + d * 3) % POSES.length]
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const ch = pose[r][c]
          const x = DANCER_X[d] - 1 + c, y = DANCER_Y + r
          if (ch !== ' ') term.put(x, y, ch, muted ? DIM : MUTED)
        }
      }
    }
    // The wall's spots, over everything but the ball.
    for (const [x, y, ch, a] of wall) {
      if (ballCovers(P, x, y)) continue
      term.put(x, y, ch, a)
    }
    // The cord, from the ceiling.
    term.put(BALL_CX, 1, '│', DIM)
  },
}

/** A fleck of light on the floor, at cell (x, y): a small soft blob in the
 *  pixel buffer, `w` pixels either side of the cell's centre. */
function spotPixels(P, x, y, v, w, cells) {
  const { lum, FW, adv, cellW, cellH } = P
  if (y < FLOOR_TOP || y >= VIZ_BOT || x < 0 || x >= P.cols) return
  // The blob stays inside its own cell (at most 4 pixels either side of
  // the centre of an 8-pixel cell, 3 above and below), so one cell is dirty.
  cells.add(y * P.cols + x)
  const cx = x * adv + cellW / 2, cy = y * cellH + cellH / 2
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -w * 2; dx <= w * 2; dx++) {
      const d = (dx * dx) / (w * w * 4) + (dy * dy) / 9
      if (d > 1) continue
      const px = Math.round(cx + dx), py = Math.round(cy + dy)
      if (px < 0 || px >= FW || py < FLOOR_TOP * cellH || py >= P.FH) continue
      const o = py * FW + px
      lum[o] = Math.max(lum[o], Math.round(v * (1 - 0.5 * d)))
    }
  }
}

/** Caps every pixel in cell (c, r) at `v`. */
function capCell(P, c, r, v) {
  const { lum, FW, adv, cellW, cellH } = P
  for (let py = r * cellH; py < (r + 1) * cellH; py++) {
    for (let px = c * adv; px < c * adv + cellW; px++) if (lum[py * FW + px] > v) lum[py * FW + px] = v
  }
}

/** Whether the ball has pixels in cell (c, r). */
function ballCovers(P, c, r) {
  if (c < BALL_X0 || c >= BALL_X0 + BALL_W || r < BALL_Y0 - 1 || r >= BALL_Y0 + BALL_H + 1) return false
  const { lum, FW, adv, cellW, cellH } = P
  for (let py = r * cellH; py < (r + 1) * cellH; py++) {
    for (let px = c * adv; px < c * adv + cellW; px++) if (lum[py * FW + px] >= CELL_MIN) return true
  }
  return false
}
