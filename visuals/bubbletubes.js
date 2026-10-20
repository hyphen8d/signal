// SIGNAL -- visualizer effect "DJ BOOTH" (SYNAPSE), key 'bubbletubes'.
// Split out of program.js in the 2026-08-25 audit; `this` became `p` (the
// program object). The key is kept through every redraw so a saved
// override and stations.js's `visual: 'bubbletubes'` still land here.
//
// 2026-10-20 -- the pixel redraw. The 2026-10-20 critique ranked the
// 2026-10-16 booth REDRAW: the DJ read as a box-headed robot (`[ - - ]` on
// a box body), the decks as cassettes or batteries (rounded rectangles
// round `( (•) )`), the front panel was an empty box a third of the frame
// tall, and everything sat on one thin MUTED/DIM outline tier with the
// brightest marks the `◆` tonearm glyphs -- the schematic look Matt
// rejected on 2026-10-18, when NEON HEART, TOKYO BAY, LAVA LAMP and DROP
// FORGE were redrawn in per-cell pixel bitmaps. Matt approved redrawing
// this one the same way. The critique also said two things about the
// SET: front-on, two round things flanking a box, this was a near-twin of
// BOOM BAP's thumbnail (change the angle: three-quarter, from the floor,
// decks low, the DJ dominant); and beams from above over a crowd along the
// bottom echoed UPRISING (use cones of light, keep the crowd as
// silhouettes). What it said WORKED, and is kept: the kick re-aims the
// beams and the new aim holds, the clearest beat on the character half of
// the roster.
//
// What it is now, drawn in putGlyph() pixel bitmaps (FROST's machinery:
// an intensity framebuffer, ordered-dithered per cell against the cell's
// beam tier, two bitmaps per cell):
//   - THE DJ, a black silhouette with a lit rim, backlit -- head in
//     headphones (the band thickens the crown, two cups bulge either
//     side), shoulders, the near arm down on the near deck, the far hand
//     on the mixer. He stands right of centre and is the largest thing in
//     the frame. Behind him a soft haze, which is what makes him read as
//     a silhouette rather than a hole.
//   - THE BOOTH, three-quarter from the front-left and from the floor: the
//     front lip rises as it recedes, the top's depth shrinks with it, the
//     left end shows. Two platters on it as foreshortened discs -- dark
//     vinyl, a lit rim and plinth edge, a bright label ring, grooves that
//     catch a highlight turning at 33 1/3, a tonearm laid in -- the near
//     one bigger than the far one (that perspective is what keeps this
//     from being BOOM BAP's pair). A small mixer between, its two channel
//     lights on bass and level. The face is two rows tall, with the
//     station's callsign across it at MUTED, letter by letter riding the
//     slope (font bitmaps stamped into the pixels, so it stays crisp).
//   - THE RIG: six cans on the riser BEHIND the booth, each throwing a
//     dithered wedge of light up and out through the room -- cones from
//     below and behind, not dashed V-beams from above (UPRISING's). Where
//     a beam crosses the DJ he cuts it.
//   - THE CROWD, in front: dark heads and shoulders along the bottom edge,
//     cut out of a faint floor spill, with a dim edge; hands up over a
//     share of them.
//
// How audio maps -- the kick is the one discrete event, and it STEPS:
//   - THE KICK (a rising edge on `pulse` of BEAT_RISE, KICK_GAP_S apart --
//     DANCEFLOOR's rule; the synthetic random `onset` flag is not read, or
//     the lights would change off the beat) moves the rig to its next
//     CHASE step, the way a lighting desk's chase is clocked off the kick,
//     and the new aim HOLDS until the next one: set LOUD beside KICK and
//     the beams point somewhere else. For KICK_HOLD_S -- and at least
//     KICK_MIN_FRAMES drawn frames, so a 2fps machine still sees it
//     (NEON HEART's slow-machine rule) -- the beams and lenses flash BRIGHT,
//     the DJ's rim goes BRIGHT and his far arm is up with a fist.
//   - Level, latched at each kick, sets how many hands in the crowd are up
//     until the next one; level (eased over ~1s) sets the beams' resting
//     brightness.
//   - The mixer's lights follow bass and level continuously; the platters
//     turn whatever the music does (ambient life: a deck turns with the
//     radio muted too).
// Without a tap it runs on syntheticAudio(t), whose ~0.9s pulse clocks the
// chase. Muted, SILENT_AUDIO: the rig holds its last aim at its resting
// tier, hands down, mixer dark, decks turning -- lit, never blank.
//
// The rubric, point by point:
//   1. One subject: a DJ at the decks, nameable in two seconds; the
//      silhouette is the largest shape in the frame.
//   2. One musical element: the rig, re-aimed on the kick and held.
//   3. Brightness order: the DJ's rim and the label rings at NORMAL, the
//      beams NORMAL at the lens fading to DIM/FAINT up the room, the booth
//      DIM, the haze, floor and crowd edges FAINT; BRIGHT only on the kick.
//   4. Shapes, not characters: no character anywhere on the canvas; every
//      soft or round thing (cones, discs, heads, haze) is pixels -- the
//      critique's proposed set rule.
//   5. Four states: NO TAP steps on the synthetic pulse; MUTED is the lit
//      rig holding still; quiet and loud differ in the beams' level and the
//      hands; KICK differs from LOUD across the whole top of the frame.
//   6. Real-radio test: the picture a club-night broadcast would hang in
//      the set's window.
//
// Cost (tests/visual-bubbletubes.test.mjs holds the picture; measured in
// the harness against FROST on the same loaded box): the first frame ~2/3
// of FROST's, per frame about FLAME's. What got it there, so nobody undoes
// it: the scene is laid out in display units (the canvas is always 533 x
// 336 of them whatever the column count), shapes are convex primitives
// turned into per-row SPANS (a silhouette is a fill() per span, and a rim
// is the same shape grown by RIM_W drawn first) rather than tested per
// pixel; the haze, floor and the whole booth are one static picture copied
// in with a memcpy each frame (scaling it by the level each frame cost more
// than everything else); the arm-up pose is built on the first kick; and a
// cell whose pixels hash the same as last frame re-puts the bitmap it
// already has instead of being re-dithered (the haze in the beams drifts
// at 12 steps a second, not per frame, so that cache holds).
//
// History, condensed:
// 2026-10-16 (design pass) -- the booth in characters: a truss of six
// `▼` cans with `/ | \` beams raking down, the DJ in `╭─╮` headphones,
// two stadium-shaped decks with `(●)` labels either side of a mixer, the
// callsign on a box panel, `●` heads along the bottom. It replaced BUBBLE
// TUBES because that was a generic nine-bar EQ with the roster's largest
// slab area (solid `█`/`▓` columns), an invisible kick and MUTED as nine
// equal stubs; the jukebox tubes were not rebuilt because round '0'
// bubbles "didn't read well" (62nd pass) and a jukebox is a lounge
// picture, not tech house's. SYNAPSE is tech house off the current club
// circuit, and the booth is the one picture that music has of itself.
// 61st pass -- BUBBLE TUBES (MIDNIGHT NEON, replaced NEON SIGN): nine tubes,
// one per spectrum band off A.bands9, filled like VU bars with an idle
// floor; a 3-tier fade put tall columns' tops in FAINT/DIM, invisible on
// the tube, so it went two-tier ('█' BRIGHT, '▓' NORMAL). 62nd pass -- the
// bubble pool dropped with the bubbles. 64th pass -- SILENT_AUDIO while
// muted (see tap.js).
// (65th/67th-pass removal notes for GEIGER, BLAST FIELD and NEON SIGN that
// used to sit in this object live above VISUAL_METHODS in visuals/index.js.)
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- the kick -----------------------------------------------------------------
// DANCEFLOOR's / BOOM BAP's edge: a rise in `pulse` of at least BEAT_RISE
// since the last frame, at least KICK_GAP_S after the last kick.
export const BEAT_RISE = 0.2
export const KICK_GAP_S = 0.22
// How long the flash (lenses and the DJ's rim BRIGHT, beams up a tier, the
// fist up) lasts -- and at least KICK_MIN_FRAMES drawn frames whatever the
// clock says, so a 2fps machine still sees it (NEON HEART's slow-machine
// rule). The rig's new AIM outlives it: that is what a still catches.
export const KICK_HOLD_S = 0.16
export const KICK_MIN_FRAMES = 3

// --- the rig ------------------------------------------------------------------
export const CANS = 6
// Each step of the chase is a lean per can: -1 left, 0 straight up, +1
// right. Converge, fan out, straight up, cross, cross the other way -- each
// step re-aims every can but (wrapping round) four of six, so each kick
// visibly re-aims the room.
export const CHASE = [
  [1, 1, 1, -1, -1, -1],
  [-1, -1, -1, 1, 1, 1],
  [0, 0, 0, 0, 0, 0],
  [1, -1, 1, -1, 1, -1],
  [-1, 1, -1, 1, -1, 1],
]
export const LEAN_RAD = 0.42
const BEAM_HALF = 0.05   // radians either side of the beam's axis
const BEAM_BASE = 3      // display units of width at the lens

// --- the scene, in DISPLAY units ----------------------------------------------
// X runs 0..SCENE_W across the canvas whatever the column count (the face is
// 4:3, so the canvas is always 533 display units wide by 336 tall); one unit
// is one framebuffer row tall. A framebuffer pixel is `aspect` units wide.
export const SCENE_W = 533
export const DJ_X = 285
export const HEAD = { x: DJ_X, y: 104, rx: 24, ry: 29 }
// The booth, three-quarter view from the floor, front-left: the front lip
// runs from F0 to F1, rising as it recedes; the top's depth shrinks with it.
const F0 = [40, 250], F1 = [490, 224]
const DEPTH = [30, -46]
const SHRINK = 0.3
const FACE_H = 34
const boothF = (u) => [F0[0] + (F1[0] - F0[0]) * u, F0[1] + (F1[1] - F0[1]) * u]
const boothS = (u) => 1 - SHRINK * u
const boothAt = (u, v) => { const f = boothF(u), s = boothS(u); return [f[0] + DEPTH[0] * s * v, f[1] + DEPTH[1] * s * v] }
/** The booth's back edge at display X -- where the DJ disappears behind it. */
const B0 = boothAt(0, 1), B1 = boothAt(1, 1)
const backY = (X) => B0[1] + (B1[1] - B0[1]) * (X - B0[0]) / (B1[0] - B0[0])
// The two decks: centre (display), radii. The near one is bigger -- the
// perspective is what keeps this from being BOOM BAP's front-on pair.
function deckAt(u, r) {
  const c = boothAt(u, 0.5), s = boothS(u)
  return { x: c[0], y: c[1], rx: r * s, ry: r * s * 0.32 }
}
export const DECKS = [deckAt(0.19, 64), deckAt(0.79, 62)]
export const MIXER_U = 0.5
const CAN_X = [44, 118, 192, 380, 452, 512]

// Beam levels (framebuffer intensity; the tiers are 100 FAINT .. 255 BRIGHT).
const LV_BRIGHT = 255, LV_NORMAL = 205, LV_MUTED = 180, LV_DIM = 150, LV_FAINT = 100
const RIM = 205          // the DJ's backlit edge: the subject, NORMAL
const LABEL = 205        // the platters' label rings
const CELL_MIN = 12
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16)
// A pixel is lit where its intensity, over its cell's tier level, beats the
// ordered-dither threshold -- tabulated per tier as plain intensities.
const levelOf = (a) => (a === BRIGHT ? LV_BRIGHT : a === NORMAL ? LV_NORMAL : a === MUTED ? LV_MUTED : a === DIM ? LV_DIM : LV_FAINT)
const THRESH = new Map([BRIGHT, NORMAL, MUTED, DIM, FAINT].map((a) => [a, Float32Array.from(BAYER, (b) => b * levelOf(a))]))
export const tierOf = (m) => (m >= 232 ? BRIGHT : m >= 193 ? NORMAL : m >= 166 ? MUTED : m >= 126 ? DIM : FAINT)

// --- shapes -------------------------------------------------------------------
const inEll = (X, Y, cx, cy, rx, ry) => { const a = (X - cx) / rx, b = (Y - cy) / ry; return a * a + b * b <= 1 }

// Shape primitives, in display units -- an ellipse (optionally cut off below
// yMax), a capsule, a rectangle -- each turned into one span per row.
// Testing every pixel of a bounding box against the whole union, then
// finding its edge pixel by pixel, was most of a 450ms first frame.
const ell = (cx, cy, rx, ry, yMax = Infinity) => ({ k: 0, cx, cy, rx, ry, yMax })
const cap = (ax, ay, bx, by, r) => ({ k: 1, ax, ay, bx, by, r })
const rect = (x0, y0, x1, y1) => ({ k: 2, x0, y0, x1, y1 })
const roundBox = (cx, cy, hx, hy, r) => [
  rect(cx - hx + r, cy - hy, cx + hx - r, cy + hy), rect(cx - hx, cy - hy + r, cx + hx, cy + hy - r),
  ell(cx - hx + r, cy - hy + r, r, r), ell(cx + hx - r, cy - hy + r, r, r),
  ell(cx - hx + r, cy + hy - r, r, r), ell(cx + hx - r, cy + hy - r, r, r),
]
/** One primitive's span on row Y, display X [lo, hi], grown by `g`, or
 *  null. Every primitive is convex, so a row meets it in one interval. */
function primSpan(q, Y, g) {
  if (q.k === 0) {
    if (Y > q.yMax) return null
    const ry = q.ry + g, t = (Y - q.cy) / ry
    if (t <= -1 || t >= 1) return null
    const hw = (q.rx + g) * Math.sqrt(1 - t * t)
    return [q.cx - hw, q.cx + hw]
  }
  if (q.k === 2) return Y < q.y0 - g || Y > q.y1 + g ? null : [q.x0 - g, q.x1 + g]
  // A capsule: the two end discs and the swept strip between them.
  const r = q.r + g
  let lo = Infinity, hi = -Infinity
  for (const [cx, cy] of [[q.ax, q.ay], [q.bx, q.by]]) {
    const d = Y - cy
    if (d * d < r * r) { const hw = Math.sqrt(r * r - d * d); lo = Math.min(lo, cx - hw); hi = Math.max(hi, cx + hw) }
  }
  const dx = q.bx - q.ax, dy = q.by - q.ay, L2 = dx * dx + dy * dy, rL = r * Math.sqrt(L2)
  let a = -Infinity, b = Infinity
  // 0 <= (X-ax)dx + (Y-ay)dy <= L2
  const k0 = (Y - q.ay) * dy
  if (dx !== 0) { const u = (0 - k0) / dx + q.ax, v = (L2 - k0) / dx + q.ax; a = Math.max(a, Math.min(u, v)); b = Math.min(b, Math.max(u, v)) } else if (k0 < 0 || k0 > L2) b = -Infinity
  // |(X-ax)dy - (Y-ay)dx| <= rL
  const k1 = (Y - q.ay) * dx
  if (dy !== 0) { const u = (k1 - rL) / dy + q.ax, v = (k1 + rL) / dy + q.ax; a = Math.max(a, Math.min(u, v)); b = Math.min(b, Math.max(u, v)) } else if (Math.abs(k1) > rL) b = -Infinity
  if (a <= b) { lo = Math.min(lo, a); hi = Math.max(hi, b) }
  return lo <= hi ? [lo, hi] : null
}
/** A shape (a union of primitives) as framebuffer spans [start, end) --
 *  writing them is a fill() per span, and a union's overlaps just write the
 *  same value twice. `cutX(y)`, if given, clips every span to X <= it. */
function shapeSpans(G, prims, g = 0, cutX = null) {
  const { FW, FH, aspect } = G
  const out = []
  for (const q of prims) {
    const top = q.k === 0 ? q.cy - q.ry : q.k === 2 ? q.y0 : Math.min(q.ay, q.by) - q.r
    const bot = q.k === 0 ? Math.min(q.cy + q.ry, q.yMax) : q.k === 2 ? q.y1 : Math.max(q.ay, q.by) + q.r
    for (let y = Math.max(0, Math.floor(top - g)); y <= Math.min(FH - 1, Math.ceil(bot + g)); y++) {
      const sp = primSpan(q, y, g)
      if (!sp) continue
      let hi = sp[1]
      if (cutX) hi = Math.min(hi, cutX(y))
      const xa = Math.max(0, Math.ceil(sp[0] / aspect)), xb = Math.min(FW - 1, Math.floor(hi / aspect))
      if (xa <= xb) out.push(y * FW + xa, y * FW + xb + 1)
    }
  }
  return Int32Array.from(out)
}
const fillSpans = (lum, spans, v) => { for (let k = 0; k < spans.length; k += 2) lum.fill(v, spans[k], spans[k + 1]) }
// Rim width, display units: the lit edge a silhouette carries.
const RIM_W = 1.6

// The DJ, as a silhouette: head in headphones (the band thickens the crown,
// the two cups bulge either side), neck, shoulders, a torso that drops
// behind the booth, the near arm down on the near deck, the far arm on the
// mixer -- or, on the kick, in the air.
function djBody() {
  const h = HEAD
  return [
    ell(h.x, h.y, h.rx, h.ry),
    ell(h.x, h.y + 1, h.rx + 3.5, h.ry + 3.5, h.y - 8),                  // the band
    ell(h.x - h.rx - 1, h.y + 3, 7, 11), ell(h.x + h.rx + 1, h.y + 3, 7, 11), // cups
    cap(DJ_X, 126, DJ_X, 140, 11),                                       // neck
    cap(DJ_X - 36, 158, DJ_X + 36, 158, 17),                             // shoulders
    ...roundBox(DJ_X, 200, 46, 46, 16),                                  // torso
  ]
}
function djArms(up) {
  const sx = DJ_X - 40, rx = DJ_X + 40
  const hand = DECKS[0]
  const hx = hand.x + hand.rx * 0.62, hy = hand.y - 2
  const near = [cap(sx, 162, sx - 40, 196, 10), cap(sx - 40, 196, hx, hy, 8.5), ell(hx - 2, hy + 1, 9, 6)]
  if (up) return [...near, cap(rx, 160, rx + 34, 118, 10), cap(rx + 34, 118, rx + 46, 68, 8.5), ell(rx + 47, 58, 10, 12)]
  const m = boothAt(MIXER_U + 0.03, 0.5)
  return [...near, cap(rx + 2, 162, rx + 22, 200, 10), cap(rx + 22, 200, m[0] + 6, m[1] - 2, 8.5), ell(m[0] + 4, m[1] - 1, 9, 6)]
}

/** Grid cells the DJ's head silhouette covers -- where a test looks for
 *  the subject. */
export function headCellsFor(term) {
  const g = gridOf(term)
  const out = []
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    const X = (c * g.adv + g.cellW / 2) * g.aspect, Y = r * g.cellH + g.cellH / 2
    if (inEll(X, Y, HEAD.x, HEAD.y, HEAD.rx * 0.8, HEAD.ry * 0.8)) out.push({ x: c, y: r + 1 })
  }
  return out
}
/** The cell under a display-unit point. */
export function cellAt(term, X, Y) {
  const g = gridOf(term)
  return { x: Math.floor(X / g.aspect / g.adv), y: 1 + Math.floor(Y / g.cellH) }
}
function gridOf(term) {
  const { cellW, cellH } = term.font
  const adv = cellW + 1
  const FW = term.cols * adv
  return { cols: term.cols, rows: VIZ_BOT - 1, cellW, cellH, adv, FW, FH: (VIZ_BOT - 1) * cellH, aspect: (4 / 3) / (FW / (term.rows * cellH)) }
}

/** Convex quad's horizontal span on row Y, display units, or null. */
function quadSpan(q, Y) {
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4]
    if ((Y < ay && Y < by) || (Y > ay && Y > by)) continue
    if (ay === by) { lo = Math.min(lo, ax, bx); hi = Math.max(hi, ax, bx); continue }
    const X = ax + (bx - ax) * (Y - ay) / (by - ay)
    lo = Math.min(lo, X); hi = Math.max(hi, X)
  }
  return lo <= hi ? [lo, hi] : null
}

/** One pose of the DJ as two span lists: `rim` (the shape grown by RIM_W)
 *  and `body` (the shape). The body is cut at the booth's back edge -- he
 *  stands behind it -- and so is its rim, so the cut grows no edge; the
 *  arms are not cut (they reach over it onto the decks). */
function djPose(G, up) {
  const cut = (y) => B0[0] + (y - B0[1]) * (B1[0] - B0[0]) / (B1[1] - B0[1])
  const body = djBody(), arms = djArms(up)
  const rim = [shapeSpans(G, body, RIM_W, cut), shapeSpans(G, arms, RIM_W)]
  const fill = [shapeSpans(G, body, 0, cut), shapeSpans(G, arms, 0)]
  return { rim, fill }
}

/** Geometry and buffers for one grid width, built on first draw (FLAME's
 *  laziness: most sessions never open this effect). */
function build(term) {
  const g = gridOf(term)
  const { FW, FH, aspect } = g
  const G = { ...g, lum: new Uint16Array(FW * FH), base: new Uint16Array(FW * FH), crowd: null, crowdKey: '' }

  // The background, at unit gain: the backlight haze round the DJ's head
  // and shoulders -- what makes him a silhouette -- and the floor spill the
  // crowd stands in.
  const base = G.base
  const GLOW = new Uint8Array(1025)   // by squared distance, 1/1024 steps
  for (let q = 0; q < 1024; q++) { const d = Math.sqrt(q / 1024); GLOW[q] = 96 * (1 - d) * (1 - d) }
  // Computed on even rows and copied down to odd ones: it is a soft
  // dithered haze, and this loop was the largest single cost of the first
  // frame.
  for (let y = 0; y < FH; y++) {
    if (y & 1) { base.copyWithin(y * FW, (y - 1) * FW, y * FW); continue }
    const spill = y > 254 ? 46 * Math.min(1, (y - 254) / 56) : 0
    if (spill) base.fill(spill, y * FW, y * FW + FW)
    const dy = (y - 125) / 150, dy2 = dy * dy
    if (dy2 >= 1) continue
    const hw = 170 * Math.sqrt(1 - dy2)
    const xa = Math.max(0, Math.ceil((DJ_X - hw) / aspect)), xb = Math.min(FW - 1, Math.floor((DJ_X + hw) / aspect))
    const k = aspect / 170, x0 = DJ_X / 170, row = y * FW
    for (let x = xa; x <= xb; x++) {
      const dx = x * k - x0
      const v = GLOW[((dx * dx + dy2) * 1024) | 0]
      if (v > spill) base[row + x] = v
    }
  }

  // The DJ, both poses. The body is cut at the booth's back edge (he stands
  // behind it); the arms are not (they reach over it onto the decks).
  // The arm-up pose is built on the first kick, not here: it is cheap, but
  // the first frame is the one that hitches (NEON HEART's 190ms).
  G.dj = [djPose(G, false), null]

  // The booth: left end, front face, top -- each a flat tier -- then the
  // decks and the mixer on the top, then the callsign across the face.
  // Painted straight into the room: the booth is static, so it rides the
  // per-frame copy of the background rather than being drawn each frame.
  const st = base
  const at = (X, Y) => { const x = Math.round(X / aspect), y = Math.round(Y); return x >= 0 && x < FW && y >= 0 && y < FH ? y * FW + x : -1 }
  const top = [boothAt(0, 0), boothAt(1, 0), boothAt(1, 1), boothAt(0, 1)]
  const faceH = (u) => FACE_H * boothS(u)
  const face = [boothAt(0, 0), boothAt(1, 0), [boothAt(1, 0)[0], boothAt(1, 0)[1] + faceH(1)], [F0[0], F0[1] + faceH(0)]]
  const side = [boothAt(0, 1), boothAt(0, 0), [F0[0], F0[1] + faceH(0)], [boothAt(0, 1)[0], boothAt(0, 1)[1] + faceH(0) * 0.8]]
  const minY = Math.floor(B1[1]) - 4, maxY = Math.ceil(F0[1] + FACE_H) + 2
  const mix = [boothAt(MIXER_U - 0.07, 0.18), boothAt(MIXER_U + 0.07, 0.18), boothAt(MIXER_U + 0.07, 0.82), boothAt(MIXER_U - 0.07, 0.82)]
  for (let y = minY; y <= maxY && y < FH; y++) {
    // Painted back to front: top, face, the left end, the mixer on the top.
    for (const [q, v] of [[top, 42], [face, 22], [side, 30], [mix, 24]]) {
      const sp = quadSpan(q, y)
      if (!sp) continue
      const xa = Math.max(0, Math.ceil(sp[0] / aspect)), xb = Math.min(FW - 1, Math.floor(sp[1] / aspect))
      if (xa <= xb) st.fill(v, y * FW + xa, y * FW + xb + 1)
    }
  }
  // Edges: the front lip DIM -- the booth's one bright line -- the back
  // edge and the face's corners fainter.
  const line = (a, b, v, step = 0.4) => {
    const n = Math.ceil(Math.hypot((b[0] - a[0]) / aspect, b[1] - a[1]) / step)
    for (let k = 0; k <= n; k++) { const i = at(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n); if (i >= 0) st[i] = Math.max(st[i], v) }
  }
  line(top[0], top[1], 150); line(top[3], top[2], 96); line(top[0], top[3], 120)
  line(face[3], top[0], 96); line(face[2], top[1], 80)
  line(mix[0], mix[1], 90); line(mix[3], mix[2], 70)
  // Mixer knobs: two rows of dots across it.
  for (let k = 0; k < 3; k++) for (const v of [0.35, 0.6]) {
    const p = boothAt(MIXER_U - 0.04 + 0.04 * k, v)
    for (let dy = -1; dy <= 0; dy++) { const i = at(p[0], p[1] + dy); if (i >= 0) { st[i] = 130; if (i + 1 < FW * FH) st[i + 1] = 130 } }
  }
  // The decks: dark vinyl on a plinth edge, the rim, grooves, the label
  // ring (the bright part), the spindle, and the tonearm laid in from its
  // pivot behind the platter's right.
  G.decks = DECKS.map((d) => {
    const groove = []
    const x0 = Math.floor((d.x - d.rx - 2) / aspect), x1 = Math.ceil((d.x + d.rx + 2) / aspect)
    for (let y = Math.floor(d.y - d.ry - 2); y <= Math.ceil(d.y + d.ry + 5); y++) {
      for (let x = x0; x <= x1; x++) {
        const X = x * aspect, i = y * FW + x
        const nx = (X - d.x) / d.rx, ny = (y - d.y) / d.ry
        const r = Math.sqrt(nx * nx + ny * ny)
        // Plinth/platter edge: the platter's thickness, under its front half.
        const ny2 = (y - 4 - d.y) / d.ry
        if (r > 1 && Math.sqrt(nx * nx + ny2 * ny2) <= 1 && y > d.y) { st[i] = 76; continue }
        if (r > 1) continue
        const rim = r > 1 - 1.6 / d.ry && r > 1 - 1.4 * aspect / d.rx
        if (rim) st[i] = 150
        else if (r < 0.26) st[i] = 96
        else if (Math.abs(r - 0.3) < 0.045) st[i] = LABEL
        else {
          st[i] = 8
          // Grooves: a ring every few units; the rotating highlight lights
          // the ones under it, frame by frame.
          if (r > 0.38 && r < 0.93 && Math.floor(r * d.rx / 3.2) % 2 === 0) groove.push(i, Math.atan2(ny, nx) * 1000 | 0)
        }
        if (r < 0.06 * 58 / d.rx * 1.6) st[i] = LABEL
      }
    }
    const piv = [d.x + d.rx * 0.98, d.y - d.ry * 0.9]
    const tip = [d.x + d.rx * 0.48, d.y + d.ry * 0.35]
    line(piv, [d.x + d.rx * 0.82, d.y + d.ry * 0.5], 160, 0.3); line([d.x + d.rx * 0.82, d.y + d.ry * 0.5], tip, 160, 0.3)
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const i = at(piv[0] + dx * aspect, piv[1] + dy); if (i >= 0) st[i] = 140 }
    return { ...d, groove: Int32Array.from(groove) }
  })
  // The callsign across the face, at MUTED, letter by letter riding the
  // face's slope (bitmaps straight off the font, so it is crisp).
  G.faceU = (u) => [boothF(u)[0], boothF(u)[1] + faceH(u) / 2]
  G.meterAt = [boothAt(MIXER_U - 0.055, 0.5), boothAt(MIXER_U + 0.055, 0.5)]
  G.nameFor = ''
  G.nameUnder = null

  // Cans: lens positions on the riser behind the booth's back edge.
  G.cans = CAN_X.map((X) => ({ X, Y: backY(Math.max(B0[0], Math.min(B1[0], X))) - 5 }))

  // Two bitmaps per cell, alternated per cell as it changes: putGlyph()
  // skips a same-reference re-put, so a bitmap rewritten in place never shows.
  const n = G.cols * G.rows
  G.bufs = [0, 1].map(() => Array.from({ length: n }, () => new Uint16Array(G.cellH)))
  G.cellHash = new Int32Array(n)
  G.cellAttr = new Int8Array(n).fill(-1)
  G.cellFront = new Uint8Array(n)
  G.cellAny = new Uint8Array(n)
  G.frames = 0
  return G
}

/** Stamps the callsign across the booth's face, at MUTED, letter by letter
 *  riding the face's slope (bitmaps straight off the font, so it is crisp),
 *  first putting back whatever the last one covered. */
function stampName(G, term, name) {
  const base = G.base
  if (G.nameUnder) for (let k = 0; k < G.nameUnder.length; k += 2) base[G.nameUnder[k]] = G.nameUnder[k + 1]
  const under = []
  const glyphs = term.font.glyphs
  const { FW, aspect, cellW } = G
  const n = name.length
  for (let k = 0; k < n; k++) {
    const u = 0.5 + (k - (n - 1) / 2) * (11 / 450)   // 11 display units a letter
    const [X, Y] = G.faceU(u)
    const bits = glyphs.get(name.codePointAt(k))
    if (!bits) continue
    const x0 = Math.round(X / aspect - cellW / 2), y0 = Math.round(Y - 8)
    for (let r = 0; r < bits.length; r++) for (let c = 0; c < cellW; c++) {
      const i = (y0 + r) * FW + x0 + c
      if (bits[r] & (1 << (cellW - 1 - c)) && i >= 0 && i < base.length) { under.push(i, base[i]); base[i] = LV_MUTED }
    }
  }
  G.nameUnder = under
}

// Cheap integer hash -> 0..1, for which heads have their hands up on a step.
function hashStep(k, step) {
  const v = Math.sin(k * 12.9898 + step * 78.233) * 43758.5453
  return v - Math.floor(v)
}

/** The crowd for one chase step: heads and shoulders along the bottom edge,
 *  dark, with a lit top edge from the stage; hands up over `share` of them. */
function crowdFor(G, step, share) {
  const people = []
  for (let k = 0, X = 14; X < SCENE_W + 10; k++) {
    const r = 13 + 5 * hash2(k, 3)
    people.push({ X, Y: 304 + 14 * hash2(k, 5), r, k })
    X += 34 + 16 * hash2(k, 9)
  }
  const up = people.map((q) => hashStep(q.k, step) < share ? (hashStep(q.k, step + 0.5) < 0.3 ? 2 : 1) : 0)
  const prims = []
  people.forEach((q, j) => {
    prims.push(ell(q.X, q.Y, q.r * 0.8, q.r), ell(q.X, q.Y + q.r * 2.2, q.r * 2.2, q.r * 1.3))
    if (!up[j]) return
    const side = (q.k & 1) ? 1 : -1
    for (const sg of up[j] === 2 ? [-1, 1] : [side]) {
      const hx = q.X + sg * q.r * 1.75, hy = q.Y - q.r * 2.1
      prims.push(cap(q.X + sg * q.r * 1.25, q.Y + q.r * 1.3, hx, hy, 4.5), ell(hx, hy - 3, 6.5, 7))
    }
  })
  return { rim: shapeSpans(G, prims, RIM_W), fill: shapeSpans(G, prims, 0) }
}

export default {
  key: 'bubbletubes',
  label: 'DJ BOOTH',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._booth = null
    p._boothLastT = null
    p._boothKickAt = -Infinity
    p._boothKickFrames = 99
    p._boothPrevPulse = 0
    p._boothStep = 0
    p._boothHands = 0.3
    p._boothSpin = 0
    p._boothLoud = 0.4
    p._boothMeters = [0, 0]
  },
  /** Re-arms clocks on every visualizer entry. */
  reset(p) {
    // _boothKickAt and _boothLastT are absolute effect-clock values; carried
    // over a long visit they sit in the future of the restarted clock and the
    // gap rule would refuse every kick until it caught up. The step, the
    // platter angle and the meters are positions, not clocks, and carry over.
    p._boothKickAt = -Infinity
    p._boothKickFrames = 99
    p._boothLastT = null
    p._boothPrevPulse = 0
  },
  draw(p, s, t) {
    const { term } = s
    if (!p._booth || p._booth.cols !== term.cols) p._booth = build(term)
    const G = p._booth
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    const clamp01 = (v) => Math.min(1, Math.max(0, v || 0))

    // --- clocks -----------------------------------------------------------
    const dt = p._boothLastT === null ? 0 : Math.min(0.25, Math.max(0, t - p._boothLastT))
    p._boothLastT = t
    p._boothSpin += dt * (2 * Math.PI * 33.333 / 60)   // 33 1/3, for real
    p._boothLoud += (clamp01(A.level) - p._boothLoud) * (1 - Math.exp(-dt / 0.9))

    // --- the kick: step the chase ------------------------------------------
    const pulse = A.pulse || 0
    if (!muted && t - p._boothKickAt >= KICK_GAP_S && pulse - p._boothPrevPulse >= BEAT_RISE) {
      p._boothKickAt = t
      p._boothKickFrames = 0
      p._boothStep = (p._boothStep + 1) % 1e6
      p._boothHands = clamp01(A.level)
    } else if (p._boothKickFrames < 99) p._boothKickFrames++
    p._boothPrevPulse = pulse
    const flash = !muted && (t - p._boothKickAt < KICK_HOLD_S || p._boothKickFrames < KICK_MIN_FRAMES)
    const loud = muted ? 0.25 : p._boothLoud
    for (let i = 0; i < 2; i++) {
      const target = muted ? 0 : clamp01(i === 0 ? A.bass : A.level)
      const c = p._boothMeters[i]
      p._boothMeters[i] = c + (target - c) * (target > c ? 0.5 : 0.12)
    }

    const { FW, FH, aspect, lum, base } = G

    // --- the room: backlight haze and floor spill ---------------------------
    // One fixed picture -- the haze, the floor and the booth -- copied in
    // whole: a memcpy. Scaling it by the level every frame cost more than
    // everything else drawn here, and a flashed copy built on the first kick
    // was most of a cold first frame; the level and the kick show in the
    // beams, the lenses and the rims instead.
    const name = String(p.lockedStation?.callsign || 'SYNAPSE').slice(0, 14)
    if (G.nameFor !== name) { stampName(G, term, name); G.nameFor = name }
    lum.set(base)

    // --- the rig: six cans behind the booth, beams fanning up --------------
    // Each beam is a wedge of light from its lens: brightest at the lens,
    // falling off up the room, soft across its width. Where it crosses the
    // DJ he cuts it -- he is drawn over it, dark.
    const pattern = CHASE[p._boothStep % CHASE.length]
    // The haze in the beams drifts at 12 steps a second, not per frame: a
    // beam that changes every frame is a beam re-dithered every frame.
    const tq = Math.floor(t * 12) / 12
    const peak = flash ? 250 : 140 + 60 * Math.round(loud * 8) / 8
    for (let k = 0; k < CANS; k++) {
      const c = G.cans[k]
      const th = pattern[k] * LEAN_RAD + (c.X - DJ_X) / SCENE_W * 0.5
      const tn = Math.tan(th), sp = Math.tan(BEAM_HALF) / Math.cos(th)
      for (let y = Math.floor(c.Y); y >= 0; y--) {
        const dy = c.Y - y
        const along = dy / Math.cos(th)
        const I = peak * (0.45 + 0.55 * Math.exp(-along / 200)) * (0.9 + 0.1 * Math.sin(y * 0.11 - tq * 1.7 + k))
        const cx = c.X + dy * tn, w = BEAM_BASE + dy * sp
        const xa = Math.max(0, Math.floor((cx - w) / aspect)), xb = Math.min(FW - 1, Math.ceil((cx + w) / aspect))
        if (xa > xb) { if (cx < -w || cx > SCENE_W + w) break; continue }
        const row = y * FW
        for (let x = xa; x <= xb; x++) {
          const a = (x * aspect - cx) / w
          if (a < -1 || a > 1) continue
          const v = I * (1 - a * a)
          if (v > lum[row + x]) lum[row + x] = v
        }
      }
      // The lens.
      const lv = flash ? 300 : 150 + 40 * Math.round(loud * 8) / 8
      for (let y = Math.floor(c.Y - 3); y <= c.Y + 3; y++) for (let x = Math.floor((c.X - 6) / aspect); x <= (c.X + 6) / aspect; x++) {
        if (x >= 0 && x < FW && y >= 0 && y < FH && inEll(x * aspect, y, c.X, c.Y, 6, 3.5)) lum[y * FW + x] = lv
      }
    }

    // --- the booth -----------------------------------------------------------
    // The grooves catch the light under a highlight that turns with the
    // record: two arcs, opposite each other.
    for (let d = 0; d < 2; d++) {
      const gr = G.decks[d].groove
      const a0 = ((p._boothSpin + d * 1.3) % Math.PI + Math.PI) % Math.PI
      for (let j = 0; j < gr.length; j += 2) {
        let a = gr[j + 1] / 1000 - a0
        a -= Math.PI * Math.round(a / Math.PI)
        if (a > -0.35 && a < 0.35) lum[gr[j]] = 70 + 60 * (1 - Math.abs(a) / 0.35)
      }
    }
    // The mixer's two channel lights: bass and level.
    for (let i = 0; i < 2; i++) {
      const [mx, my] = G.meterAt[i]
      const v = 40 + 160 * Math.min(1, p._boothMeters[i] * 1.3)
      for (let dy = -2; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = Math.round(mx / aspect) + dx, y = Math.round(my) + dy
        if (x >= 0 && x < FW && y >= 0 && y < FH) lum[y * FW + x] = v
      }
    }

    // --- the DJ ----------------------------------------------------------------
    if (flash && !G.dj[1]) G.dj[1] = djPose(G, true)
    const pose = G.dj[flash ? 1 : 0]
    const rim = flash ? 300 : muted ? 172 : RIM
    for (const sp of pose.rim) fillSpans(lum, sp, rim)
    for (const sp of pose.fill) fillSpans(lum, sp, 0)

    // --- the crowd ---------------------------------------------------------------
    const share = muted ? 0 : Math.round((0.1 + 0.45 * p._boothHands) * 20) / 20
    const key = `${p._boothStep % 997}:${share}`
    if (G.crowdKey !== key) { G.crowd = crowdFor(G, p._boothStep, share); G.crowdKey = key }
    fillSpans(lum, G.crowd.rim, muted ? 92 : 100)
    fillSpans(lum, G.crowd.fill, 0)

    // --- pixels to cells ------------------------------------------------------------
    // Most of this picture holds still between kicks (the booth, the crowd,
    // the DJ, the dark), so each cell's pixels are hashed on the way past
    // and a cell whose hash and tier match last frame's re-puts the bitmap
    // it already has -- a no-op in CellGrid unless something else drew over
    // it -- instead of re-dithering. A changed cell is dithered into the
    // OTHER of its two bitmaps: a same-reference putGlyph() never re-rasters.
    const { cols, cellW, cellH, adv, rows, cellHash, cellAttr, cellFront, cellAny, bufs } = G
    const warm = G.frames++ > 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ci = r * cols + c
        const b0 = r * cellH * FW + c * adv
        let m = 0, h = 0x811c9dc5
        if (warm) {
          for (let py = 0; py < cellH; py++) {
            const o = b0 + py * FW
            for (let px = 0; px < cellW; px++) { const v = lum[o + px]; if (v > m) m = v; h = Math.imul(h ^ v, 16777619) }
          }
        } else {
          // The first frame: nothing to compare against, so no hashing --
          // it is the frame that has to be cheap.
          for (let py = 0; py < cellH; py++) {
            const o = b0 + py * FW
            for (let px = 0; px < cellW; px++) if (lum[o + px] > m) m = lum[o + px]
          }
        }
        if (m < CELL_MIN) { cellAttr[ci] = -1; term.put(c, r + 1, ' '); continue }
        const attr = tierOf(m)
        if (cellHash[ci] === h && cellAttr[ci] === attr) {
          if (cellAny[ci]) term.putGlyph(c, r + 1, bufs[cellFront[ci]][ci], attr)
          else term.put(c, r + 1, ' ')
          continue
        }
        cellHash[ci] = h; cellAttr[ci] = warm ? attr : -1
        const f = cellFront[ci] ^= 1
        const thr = THRESH.get(attr)
        const bits = bufs[f][ci]
        let any = 0
        for (let py = 0; py < cellH; py++) {
          const o = b0 + py * FW
          const b4 = (py & 3) * 4
          let w = 0
          for (let px = 0; px < cellW; px++) if (lum[o + px] > thr[b4 + (px & 3)]) w |= 1 << (cellW - 1 - px)
          bits[py] = w
          any |= w
        }
        cellAny[ci] = any ? 1 : 0
        if (any) term.putGlyph(c, r + 1, bits, attr)
        else term.put(c, r + 1, ' ')
      }
    }
  },
}
