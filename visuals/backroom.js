// SIGNAL -- visualizer effect "BACKROOM" (AFTER HOURS).
//
// 2026-10-20 -- REDRAWN in pixels. Same subject, new renderer.
//
// The critique (2026-10-20, ranked REDRAW): "with effort, a stage with a bass
// on it; at a glance, a tangle of lines." Every figure -- the bass's `( )`
// body with a `+` bridge, the box-headed players, the piano lid, the `JAZZ`
// sign -- was a thin outline at one weight, overlapping in the middle forty
// columns; the spotlight was a sparse `·` stipple between `/` and `\` and did
// not read as light; the brightest things on the screen were the lamp housing
// and the candle's `█`, so the eye went to a square on a table, not to the
// bass; and LOUD, MUTED and KICK were the same picture. That is the
// one-tier character schematic Matt rejected on 2026-10-18 when NEON HEART,
// TOKYO BAY, LAVA LAMP and DROP FORGE were rebuilt as per-cell pixel bitmaps.
// Two character passes (09-13, 10-16) had already failed to fix it: `/ \ | -`
// cannot make a cone of light. Matt approved the redraw, keeping the subject.
//
// What this is now: the same room -- a trio in ONE spotlight at two in the
// morning, the chairs going up on the tables -- drawn through putGlyph()
// bitmaps (FLAME's renderer; LAVA LAMP's dither and block fast path):
//
// - THE CONE is a dithered wedge of light, densest on its axis under the lamp
//   and fading to soft edges, with smoke as slow value-noise density INSIDE
//   it only (LAVA LAMP's haze, clipped to the beam), rising. It pools on the
//   boards as a lit ellipse. Outside it the room is black but for a faint
//   spill that lets the furniture stand against something.
// - THE BASSIST AND HIS BASS are one dark silhouette cut out of the lit cone,
//   left of the axis: scroll, neck, sloped shoulders, C-bouts, the lower
//   bout, the endpin, the player behind it with one hand up the neck and one
//   at the strings. No outline: a 1px rim of light on the side that faces
//   the lamp (NORMAL -- the brightest line in the frame), a band of sheen
//   down the varnish under it, the strings and the bridge catching the spot.
//   The bass leads because its scroll-and-bouts outline is the single most
//   legible jazz silhouette there is, and a silhouette is its natural form.
// - THE TENOR (pork-pie hat, the horn's bell turned up toward the bass) and
//   THE PIANO (lid up, pianist hunched at the keys) are silhouettes at the
//   cone's right edge, rimmed a tier down; the ride cymbal on its stand is at
//   the left edge, saying "drummer" without drawing one.
// - THE TABLES in front are silhouettes against a floor that is barely there,
//   two with chairs upturned on them, one with a candle that is now a few
//   MUTED pixels and its warmth on the tabletop -- an accessory, not a lead.
// - The vertical `JAZZ` window is gone: it read as a caption.
//
// The rubric, point by point:
// 1. ONE SUBJECT: a jazz trio in a spotlight, the bass in front. Nameable by
//    the bass silhouette alone.
// 2. ONE MUSICAL ELEMENT: the light. Loudness, smoothed over ~1s (LOUD_TAU),
//    sets the cone's density and width, so a loud chorus visibly fills the
//    room with light and a ballad pulls it in. A kick -- a rising edge of the
//    pulse or a real onset, at most one per KICK_GAP_S -- is a soft swell of
//    the same light: the cone and the pool thicken and widen a little and the
//    varnish on the bass catches it, held KICK_HOLD_S and released over
//    KICK_TAU. A swell, not a strobe: this is a ballad room.
// 3. BRIGHTNESS ORDER: the bass's rim, sheen, bridge (NORMAL) and the lamp's
//    lens > the cone, the pool and the other players'
//    rims (MUTED/DIM, by density) > the piano, the furniture, the room spill
//    (DIM/FAINT, sparse). Tier levels on this tube are close (FAINT 100 ..
//    NORMAL 205), so the order is mostly carried by DENSITY: the rim is a
//    solid line, the cone is a dither. Nothing is ever BRIGHT.
// 4. SHAPES, NOT SOUP: no characters at all on the canvas -- bitmaps or
//    blanks -- so no shade blocks and no `~`/`≈`.
// 5. FOUR STATES. NO TAP: syntheticAudio, so the light breathes and swells on
//    its fake pulse. MUTED: SILENT_AUDIO -- the cone sits at its floor (still
//    on; a spot does not need the music), nothing swells, the candle burns
//    steady, the smoke still climbs. Quiet: a narrow, thin cone. Loud: wide
//    and full.
// 6. REAL-RADIO TEST: the photograph on a late-night jazz record's sleeve.
//
// Composition: an asymmetric place picture (the set-level note: the
// one-centred-object composition is now the roster's default; the place
// pictures keep their scenes). The lamp is left of centre, the bass left of
// its axis, the piano running off the right edge.
//
// Fixed art at ABSOLUTE pixel positions, designed for 80 columns (640px): a
// wider grid shows more dark room to the right, a narrower one crops the
// piano. The 2026-09-13 audit's lesson (L5 -- a mask indexed `y * 80`) holds
// in the new form: every buffer is sized from term.cols and rebuilt when it
// changes, and tests/visuals.test.mjs compares the first 80 columns of a
// 100-column frame against the 80-column one.
//
// COST. The silhouettes are painted once per width into a per-pixel code
// mask (M_* below). Each render the light is
// computed on a 4x4-pixel block grid -- one dither tile per block, so a cell
// with no figure in it is two BAYER_MASK lookups a pixel row -- and only
// cells that hold part of a figure walk their pixels. Rebuilt at most
// RENDER_HZ; the frames between re-put the same bitmaps. Measured in the
// harness on a box at load ~9 (2 cores): first frame ~150-170ms against
// FLAME 142, LAVA LAMP 114 and NEON HEART 143 in the same run; per frame
// ~2.8ms against FLAME's 5.3.
//
// What the rounds of looking changed (tools/viz-preview.mjs):
// - The bass first stood left of the cone's axis, in its dim edge, with its
//   scroll at the lamp: it read as a small instrument beside a big man. It
//   moved in toward the axis, and the neck was shortened so the scroll sits
//   at the player's brow, where a real one does.
// - Lit only by a rim on its light side (from overhead that is the TOP of
//   each bout, nearly nothing), the bass merged into its player. The varnish
//   streak down the right of each bout and the faint far edge are what
//   separate them; they are the reason the bass reads as the subject.
// - A tier step between neighbouring cells shows as a hard-edged block: the
//   cone first stepped DIM -> MUTED -> NORMAL by density and the rim went
//   BRIGHT on a kick, and every one of those boundaries drew a rectangle.
//   The cone and pool are one tier now, the swell is density alone, and haze
//   sharing a cell with a brighter piece of the cast is thinned by the tier
//   ratio (TIER_LEVEL).
// - The floor in front of the stage was a flat grey field; it is a 1-in-16
//   dither that fades out toward the viewer.
// - The first mask asked each of 215k pixels which shape it was in; the
//   first frame took ~0.9s. Painting each shape over its own bounds is the
//   same picture (see painter()).
//
// State on p: _backroom (lazily allocated buffers -- see flame.js on why not
// at boot), _backroomLoud (smoothed loudness: a level, carried over between
// visits), _backroomLastT / _backroomRenderT / _backroomKickAt (absolute
// effect-clock values, cleared by reset(): CLAUDE.md's rule for any `t + n`
// kept on p), _backroomKickAmt, _backroomPrevPulse.
//
// --- history -----------------------------------------------------------------
// 2026-09-13 -- built for AFTER HOURS in characters: a stage under one
//   spotlight, the trio, smoke, cafe tables, a candle and a `JAZZ` neon. Its
//   rules were "silhouettes are outlines around dark interiors, never filled
//   masses" (UPRISING's and KEEP's `█` fills bloomed into slabs on the tube)
//   and "the spotlight is the bright thing" -- the second never came true in
//   characters. Audio was amplitude only: bass shimmered the strings and
//   nodded the bassist, treble glinted the ride, an onset was a rate-limited
//   glint; the critique found none of it visible on the tube.
// 2026-10-16 (design pass) -- smoke cut to `.`/`·`/`'` wisps capped at MUTED
//   (the `░▒` smoke had formed a slab in front of the tenor), the cone given
//   a fixed stipple and continuous `_/` edges, the bass held at NORMAL and
//   every other player at DIM. Still a tangle of one-weight lines; replaced
//   by the pixel redraw above. The pixel version keeps the room, the cast
//   and the ballad-room restraint, and drops the neon, the nod and the
//   cymbal glint (one musical element, not four).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)

// --- the stage, in canvas pixels (y = 0 is the top of canvas row 1) ---------
// Cells are 8x16 and the tube stretches them ~1.2x tall, so a pixel shows
// slightly taller than it is wide; the shapes below are drawn for that.
export const LAMP_X = 300        // the spot's axis, left of centre
export const LENS_Y = 14         // the cone starts at the lens
export const FLOOR_Y = 238       // the boards: feet and the pool stand here
const LIP_Y = 250                // the stage's front edge
const FACE_BOT = 262             // the dark front of the stage
const STAGE_L = 70, STAGE_R = 580
export const HW_TOP = 9          // the cone's half-width at the lens...
export const HW_FLOOR = 165      // ...and on the boards, before the music widens it

/** The cone's half-width at pixel row y for a width multiplier `wm`. */
export const coneHalfWidth = (y, wm = 1) => (HW_TOP + (HW_FLOOR - HW_TOP) * (y - LENS_Y) / (FLOOR_Y - LENS_Y)) * wm

// --- the music ----------------------------------------------------------------
const LOUD_TAU = 1.0             // the light follows loudness over about a second
export const KICK_GAP_S = 0.4    // least time between two swells
export const KICK_HOLD_S = 0.12  // a swell holds this long at full...
const KICK_TAU = 0.35            // ...then releases on this time constant
const BEAT_RISE = 0.3            // a pulse jump this big is a kick
const RENDER_HZ = 30
const clamp01 = (v) => Math.min(1, Math.max(0, v || 0))

// Pixel tiers -> attributes. 0 is "nothing here", never an attribute
// (NORMAL is attribute 0 -- flame.js's trap).
const TIER_ATTR = [0, FAINT, DIM, MUTED, NORMAL, BRIGHT]
const T_FAINT = 1, T_DIM = 2, T_MUTED = 3, T_NORMAL = 4
// 4x4 ordered dither (LAVA LAMP's): BAYER_MASK[n * 4 + row] is the 4-pixel
// row of one tile with n of its 16 pixels lit, leftmost pixel in the high bit.
const BAYER_RAW = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const BAYER_MASK = new Uint8Array(17 * 4)
for (let n = 0; n <= 16; n++) {
  for (let r = 0; r < 4; r++) {
    let m = 0
    for (let c = 0; c < 4; c++) if (BAYER_RAW[r * 4 + c] < n) m |= 8 >> c
    BAYER_MASK[n * 4 + r] = m
  }
}

// --- the cast: shapes painted into an owner buffer ----------------------------
// Owners, front to back: a lower number stands in front of a higher one, and
// the painters run back to front so a nearer shape overwrites a farther one.
// 2026-10-20 -- the first cut asked every pixel of the canvas "which shape
// are you in?" through a chain of point-in-shape tests, and the first frame
// took ~0.5-0.9s (NEON HEART's 190ms was already a visible hitch). Painting
// each shape over its own bounding box is the same picture for a fraction of
// the work. A pixel belongs to a shape when its CENTRE is inside it.
// The art's right-hand end: a grid wider than 80 columns shows dark room
// beyond it (tests/visuals.test.mjs reads that room as empty past col 86).
const ART_W = 688
const O_TABLES = 1, O_BASS = 2, O_BASSIST = 3, O_TENOR = 4, O_RIDE = 5, O_PIANO = 6, O_LAMP = 7

/** A painter over an owner buffer W x H; shapes outside it are clipped. */
function painter(own, W, H) {
  const X1 = Math.min(W, ART_W)
  let o = 0, dx = 0
  const set = (x, y) => {
    if (x < 0 || x >= X1 || y < 0 || y >= H) return
    own[y * W + x] = o
    if (x < own.rowL[y]) own.rowL[y] = x
    if (x > own.rowR[y]) own.rowR[y] = x
  }
  return {
    /** Which owner the next shapes belong to, and a sideways offset for them. */
    as(owner, offset = 0) { o = owner; dx = offset },
    rect(x0, y0, x1, y1) {
      for (let y = Math.ceil(y0 - 0.5); y + 0.5 <= y1; y++) for (let x = Math.ceil(x0 + dx - 0.5); x + 0.5 <= x1 + dx; x++) set(x, y)
    },
    ell(cx, cy, rx, ry) {
      cx += dx
      for (let y = Math.ceil(cy - ry - 0.5); y + 0.5 <= cy + ry; y++) {
        const k = 1 - ((y + 0.5 - cy) / ry) ** 2
        if (k < 0) continue
        const hw = rx * Math.sqrt(k)
        for (let x = Math.ceil(cx - hw - 0.5); x + 0.5 <= cx + hw; x++) set(x, y)
      }
    },
    /** A capsule of radius r along each segment of the point list. */
    limb(pts, r) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const ax = pts[i][0] + dx, ay = pts[i][1], bx = pts[i + 1][0] + dx, by = pts[i + 1][1]
        const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1
        for (let y = Math.ceil(Math.min(ay, by) - r - 0.5); y + 0.5 <= Math.max(ay, by) + r; y++) {
          for (let x = Math.ceil(Math.min(ax, bx) - r - 0.5); x + 0.5 <= Math.max(ax, bx) + r; x++) {
            const px = x + 0.5, py = y + 0.5
            const k = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / l2))
            const qx = px - ax - k * ex, qy = py - ay - k * ey
            if (qx * qx + qy * qy <= r * r) set(x, y)
          }
        }
      }
    },
    /** Rows y0..y1, each spanning [fn(y)[0], fn(y)[1]] (y at the pixel centre). */
    rows(y0, y1, fn) {
      for (let y = Math.ceil(y0 - 0.5); y + 0.5 <= y1; y++) {
        const [l, r] = fn(y + 0.5)
        for (let x = Math.ceil(l + dx - 0.5); x + 0.5 <= r + dx; x++) set(x, y)
      }
    },
  }
}

// The bass: an axis leaning a little toward its player, a body profile down
// that axis. 2026-09-13's note still holds at this size -- sloped shoulders
// narrower than the lower bout and a pinched waist are what separate it from
// a cello or a guitar.
export const BASS_X = 266        // the axis at the bottom of the body
const BASS_TILT = 0.1            // columns of lean per pixel of height
const BODY_TOP = 122, BODY_BOT = 226
export const BRIDGE_Y = 186
const NUT_Y = 72
export const SCROLL_Y = 56
export const bassAxis = (y) => BASS_X + (BODY_BOT - y) * BASS_TILT
// Half-width down the body, s = 0 at the shoulders to 1 at the bottom.
const PROFILE = [[0, 9], [0.08, 22], [0.18, 29], [0.27, 30], [0.37, 26], [0.45, 22], [0.53, 28], [0.64, 38], [0.76, 42]]
/** The body's half-width at pixel row y (0 off the body). */
export function bassHalfWidth(y) {
  if (y < BODY_TOP || y > BODY_BOT) return 0
  const s = (y - BODY_TOP) / (BODY_BOT - BODY_TOP)
  if (s >= 0.76) return 42 * Math.sqrt(Math.max(0, 1 - ((s - 0.76) / 0.24) ** 2))
  for (let i = 1; i < PROFILE.length; i++) {
    const [s1, w1] = PROFILE[i]
    if (s <= s1) {
      const [s0, w0] = PROFILE[i - 1]
      const k = (s - s0) / (s1 - s0)
      return w0 + (w1 - w0) * (k * k * (3 - 2 * k))
    }
  }
  return 42
}
function paintBass(P) {
  P.as(O_BASS)
  P.rows(BODY_TOP, BODY_BOT, (y) => { const a = bassAxis(y), w = bassHalfWidth(y); return [a - w, a + w] })
  P.rows(BODY_BOT, FLOOR_Y, (y) => [bassAxis(y) - 1.2, bassAxis(y) + 1.2]) // the endpin
  P.rows(NUT_Y, BODY_TOP, (y) => [bassAxis(y) - 3, bassAxis(y) + 3])       // the neck
  P.rows(SCROLL_Y + 4, NUT_Y, (y) => [bassAxis(y) - 4, bassAxis(y) + 3])   // the pegbox
  P.ell(bassAxis(SCROLL_Y) + 1, SCROLL_Y + 1, 6, 6)                         // the scroll
}
// The bassist, behind and to the right of his bass: one hand high on the
// neck, the other down at the strings.
function paintBassist(P) {
  P.as(O_BASSIST)
  P.ell(310, 80, 10, 11)                                         // head
  P.rect(303, 90, 313, 100)                                      // neck
  P.rows(96, 172, (y) => {                                       // torso
    const hw = y < 108 ? 23 * Math.sqrt(Math.max(0, 1 - ((108 - y) / 12) ** 2)) : 23 - 6 * (y - 108) / 64
    return [312 - hw, 312 + hw]
  })
  P.limb([[292, 106], [272, 124], [bassAxis(100) + 3, 100]], 5)
  P.limb([[330, 108], [336, 150], [bassAxis(176) + 8, 176]], 5)
  P.limb([[304, 170], [302, FLOOR_Y - 3]], 7)                    // legs
  P.limb([[322, 170], [330, FLOOR_Y - 3]], 7)
  P.ell(334, FLOOR_Y - 2, 11, 3)
}
// The tenor faces the bass across the axis: pork-pie hat, the horn hanging in
// front of him, its bell turned up toward the bass.
const TX = 398
function paintTenor(P) {
  P.as(O_TENOR, TX - 392)
  P.ell(392, 74, 10, 11)                                         // head
  P.rect(381, 54, 401, 66)                                       // the hat's crown...
  P.rect(373, 64, 409, 67)                                       // ...and brim
  P.rect(389, 84, 399, 94)
  P.rows(90, 170, (y) => {
    const hw = y < 102 ? 22 * Math.sqrt(Math.max(0, 1 - ((102 - y) / 12) ** 2)) : 22 - 6 * (y - 102) / 68
    return [398 - hw, 398 + hw]
  })
  P.limb([[390, 168], [386, FLOOR_Y - 3]], 7)
  P.limb([[406, 168], [412, FLOOR_Y - 3]], 7)
  P.ell(380, FLOOR_Y - 2, 11, 3)
  // The horn: crook from the mouth, body down, the bow, the bell up and out.
  P.limb([[381, 80], [370, 88], [366, 100]], 2)
  P.limb([[366, 100], [362, 158]], 4.5)
  P.limb([[362, 158], [356, 170], [346, 164]], 5.5)
  P.limb([[346, 164], [340, 140]], 7)
  P.ell(339, 136, 11, 5)                                         // the bell's mouth
  // Arms: both hands on the horn.
  P.limb([[384, 100], [372, 126], [365, 116]], 5)
  P.limb([[410, 102], [400, 146], [366, 146]], 5)
}
// The ride cymbal on its stand at the left edge of the light -- the edge of a
// kit, enough to say drummer without drawing one.
function paintRide(P) {
  P.as(O_RIDE)
  P.ell(186, 140, 30, 3)
  P.ell(186, 137, 5, 3)
  P.rect(185, 140, 187, 212)
  P.limb([[186, 210], [170, FLOOR_Y - 1]], 1.2)
  P.limb([[186, 210], [202, FLOOR_Y - 1]], 1.2)
}
// The end of the grand, lid up, with the pianist hunched at the keys.
function paintPiano(P) {
  P.as(O_PIANO, 22)
  P.rect(456, 146, 650, 172)                                     // the case...
  P.ell(650, 159, 8, 13)                                         // ...and its tail
  P.limb([[466, 146], [650, 62]], 2.5)                           // the lid, propped
  P.limb([[588, 146], [604, 96]], 1.2)                           // the prop stick
  P.rect(470, 172, 478, FLOOR_Y)                                 // legs
  P.rect(620, 172, 628, FLOOR_Y)
  P.ell(438, 108, 10, 11)                                        // the pianist
  P.limb([[434, 122], [428, 186]], 14)
  P.limb([[440, 128], [458, 150]], 5)
  P.rect(408, 188, 450, 194)                                     // his bench
  P.limb([[440, 186], [452, 200], [452, FLOOR_Y - 2]], 6)
  P.rect(412, 194, 416, FLOOR_Y)
  P.rect(442, 194, 446, FLOOR_Y)
}
function paintLamp(P) {
  P.as(O_LAMP)
  P.rect(LAMP_X - 110, 1, LAMP_X + 110, 3)                      // the batten
  P.rect(LAMP_X - 2, 3, LAMP_X + 2, 6)
  P.rows(5, LENS_Y - 2, (y) => { const k = 1 - ((y - 11) / 6) ** 2; const w = k > 0 ? 15 * Math.sqrt(k) : -1; return [LAMP_X - w, LAMP_X + w] })
}
// Foreground tables: the top seen nearly edge-on, the pedestal cropped by the
// canvas bottom; chairs upside down on two of them, legs in the air.
export const TABLES = [
  { x: 72, chairs: true },
  { x: 214, chairs: false },
  { x: 470, chairs: false, candle: true },
  { x: 604, chairs: true },
]
const TOP_Y = 292
export const CANDLE = { x: 476, y: 282 } // the flame's base, on the third table
function paintTables(P, H) {
  P.as(O_TABLES)
  for (const tb of TABLES) {
    P.ell(tb.x, TOP_Y, 40, 4)
    P.rect(tb.x - 2, TOP_Y, tb.x + 2, H)
    P.ell(tb.x, 334, 18, 2)
    if (tb.chairs) {
      for (const side of [-1, 1]) {
        const cx = tb.x + side * 17
        P.rect(cx - 14, 282, cx + 14, 287)                       // seat
        P.limb([[cx - 12, 282], [cx - 15, 250]], 2)              // legs up
        P.limb([[cx + 12, 282], [cx + 15, 250]], 2)
        P.limb([[cx + side * 13, 288], [cx + side * 15, 304]], 1.6) // the back, hanging
      }
    }
    if (tb.candle) P.rect(CANDLE.x - 2, CANDLE.y, CANDLE.x + 2, TOP_Y - 3)
  }
}
/** The whole cast as an owner per pixel, painted back to front. */
function paintCast(W, H) {
  const own = new Uint8Array(W * H)
  // Each row's painted span, so the mask pass walks only where the cast is.
  own.rowL = new Int16Array(H).fill(32767)
  own.rowR = new Int16Array(H).fill(-1)
  const P = painter(own, W, H)
  paintLamp(P); paintPiano(P); paintRide(P); paintTenor(P); paintBassist(P); paintBass(P); paintTables(P, H)
  return own
}

// Mask codes: what a pixel is, for the render.
const M_OPEN = 0      // the light shows here (cone, pool, spill, floor)
const M_DARK = 1      // inside a silhouette
const M_RIM = 2       // the bass and bassist's lit edge: NORMAL
const M_SHEEN = 3     // the varnish streak down the bass's bouts
const M_SHEEN2 = 10   // ...and its soft fringe
const M_EDGE = 11     // the bass body's far edge, faint
const M_STRING = 4    // the strings, catching the spot
const M_BRIDGE = 5
const M_RIM2 = 6      // tenor, cymbal, lamp: a tier down
const M_RIM3 = 7      // piano, pianist, furniture: out of the light, DIM
const M_LENS = 8
const M_FLAME = 9     // the candle's flame box; lit per render

// The tier each code draws at (the flame and M_RIM vary; their usual tier).
const CODE_TIER = [0, 0, T_NORMAL, T_NORMAL, T_MUTED, T_NORMAL, T_MUTED, T_DIM, T_NORMAL, T_MUTED, T_NORMAL, T_MUTED]
// Beam level per tier (src/term.js), for thinning the light in a cell that a
// brighter piece of the cast shares: a cell has one attribute, so the haze in
// it is lit at the figure's tier, and at full density that shows as a
// hard-edged brighter block round every rim. Scaled by the level ratio, the
// haze keeps its brightness and only the block's edge is left.
const TIER_LEVEL = [0, 100, 150, 180, 205, 255]

/** Compiles the cast into a code per pixel for a canvas W x H. */
function buildMask(W, H) {
  const X1 = Math.min(W, ART_W)
  const own = paintCast(W, H)
  const ownAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : x >= X1 ? 0 : own[y * W + x]
  const mask = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = own.rowL[y], xEnd = own.rowR[y]; x <= xEnd; x++) {
      const o = own[y * W + x]
      if (!o) continue
      // Toward the light: the lamp for everything on the stage.
      let lx = LAMP_X - x, ly = LENS_Y - y
      const len = Math.hypot(lx, ly) || 1
      lx /= len; ly /= len
      const n1 = ownAt(Math.round(x + lx), Math.round(y + ly))
      // Lit edge: the neighbour toward the light is open, or a shape behind.
      const rim = n1 === 0 || n1 > o
      let code = M_DARK
      if (o === O_BASS || o === O_BASSIST) {
        if (rim) code = M_RIM
        else if (o === O_BASS && y >= BODY_TOP && y <= BODY_BOT) {
          // The varnish: a highlight streak down the right of each bout,
          // where the top plate turns toward the lamp, and the far edge of
          // the body catching the smoke's scatter -- together they are what
          // keep the bass's outline inside the one silhouette it makes with
          // its player.
          const u = x + 0.5 - bassAxis(y + 0.5), r = u / Math.max(1, bassHalfWidth(y + 0.5))
          const ring = ownAt(x - 1, y) !== O_BASS || ownAt(x + 1, y) !== O_BASS || ownAt(x, y + 1) !== O_BASS
          if (ring) code = M_EDGE
          else if (Math.abs(r - 0.5) < 0.07) code = M_SHEEN
          else if (Math.abs(r - 0.5) < 0.17) code = M_SHEEN2
        }
        if (o === O_BASS && code === M_DARK) {
          const u = x + 0.5 - bassAxis(y + 0.5)
          if (y >= BRIDGE_Y - 1 && y <= BRIDGE_Y + 1 && Math.abs(u) <= 9) code = M_BRIDGE
          else if (y >= NUT_Y && y < BRIDGE_Y - 1 && (Math.abs(u + 1.5) < 0.5 || Math.abs(u - 1.5) < 0.5)) code = M_STRING
          else if (y > BRIDGE_Y + 1 && y <= BRIDGE_Y + 14 && Math.abs(u) <= 4 - (y - BRIDGE_Y) / 5) code = M_DARK // tailpiece
        }
      } else if (rim) {
        code = o === O_PIANO || o === O_TABLES ? M_RIM3 : M_RIM2
        if (o === O_LAMP && y < 6) code = M_DARK
      }
      if (o === O_LAMP && y >= LENS_Y - 3 && Math.abs(x - LAMP_X) <= 9) code = M_LENS
      mask[y * W + x] = code
    }
  }
  // The candle's flame: a box the render lights pixel by pixel.
  for (let y = CANDLE.y - 9; y <= CANDLE.y; y++) for (let x = CANDLE.x - 2; x <= CANDLE.x + 2; x++) {
    if (x >= 0 && x < W && y >= 0 && y < H) mask[y * W + x] = M_FLAME
  }
  mask.rowL = own.rowL
  mask.rowR = own.rowR
  for (let y = CANDLE.y - 9; y <= CANDLE.y && y < H; y++) {
    mask.rowL[y] = Math.min(mask.rowL[y], CANDLE.x - 2)
    mask.rowR[y] = Math.max(mask.rowR[y], Math.min(W - 1, CANDLE.x + 2))
  }
  return mask
}

// --- smoke: value noise, two octaves (LAVA LAMP's) ----------------------------
function hashI(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const fx = x - xi, fy = y - yi
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = hashI(xi, yi), b = hashI(xi + 1, yi), c = hashI(xi, yi + 1), d = hashI(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const smooth = (e0, e1, x) => { const s = clamp01((x - e0) / (e1 - e0)); return s * s * (3 - 2 * s) }

/** Smoke density at (x, y), effect time t: slow sheets climbing through the
 *  beam and curling as they go. Fixed rates, nothing from the audio, so the
 *  music can never jump it. */
export function smokeAt(x, y, t) {
  const w = vnoise(x / 90 + 5.3, y / 60 + t * 0.05)
  const u = x / 64 + 0.9 * w + t * 0.03
  const v = (y + t * 11) / 30 + 0.7 * w
  const n = 0.65 * vnoise(u, v) + 0.35 * vnoise(u * 2.2 + 3.1, v * 2.4 + t * 0.08)
  return smooth(0.3, 0.8, n)
}

export default {
  key: 'backroom',
  label: 'BACKROOM',
  init(p) {
    p._backroom = null
    p._backroomLoud = 0.4
    p._backroomLastT = null
    p._backroomRenderT = -Infinity
    p._backroomKickAt = -Infinity
    p._backroomKickAmt = 0
    p._backroomPrevPulse = 0
  },
  /** Buffers for a grid `term.cols` wide: the cast's mask, the light's block
   *  grid, two bitmaps per cell, each cell's lit flag and tier. */
  alloc(p, term) {
    const { cellW, cellH } = term.font
    const rows = VIZ_BOT - 1
    const W = term.cols * cellW, H = rows * cellH
    const GW = W >> 2, GH = H >> 2
    const mask = buildMask(W, H)
    // Which cells hold any of the cast: only these walk their pixels.
    // cellMask: 0 none; else 1 + the brightest fixed tier any of the cast
    // reaches in that cell.
    const cellMask = new Uint8Array(term.cols * rows)
    for (let y = 0; y < H; y++) for (let x = mask.rowL[y], xEnd = mask.rowR[y]; x <= xEnd; x++) {
      const c = mask[y * W + x]
      if (!c) continue
      const ci = ((y / cellH) | 0) * term.cols + ((x / cellW) | 0)
      cellMask[ci] = Math.max(cellMask[ci], 1 + CODE_TIER[c])
    }
    p._backroom = {
      cols: term.cols, rows, cellW, cellH, W, H, GW, GH, mask, cellMask,
      HW8: (W >> 3) + 2, HH8: (H >> 3) + 2,
      sm8: new Float32Array(((W >> 3) + 2) * ((H >> 3) + 2)),
      blkN: new Uint8Array(GW * GH), blkT: new Uint8Array(GW * GH),
      bufs: [0, 1].map(() => Array.from({ length: term.cols * rows }, () => new Uint16Array(cellH))),
      lit: new Uint8Array(term.cols * rows),
      tier: new Uint8Array(term.cols * rows),
      front: 0,
      flameH: 0,
    }
  },
  /** Re-arms the clocks on every visualizer entry. Loudness is a level, not
   *  a clock, and carries over. */
  reset(p) {
    p._backroomLastT = null
    p._backroomRenderT = -Infinity
    p._backroomKickAt = -Infinity
    p._backroomKickAmt = 0
    p._backroomPrevPulse = 0
  },
  draw(p, s, t) {
    const { term } = s
    if (!p._backroom || p._backroom.cols !== term.cols) this.alloc(p, term)
    const F = p._backroom
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    const dt = p._backroomLastT === null ? 0 : Math.min(0.25, Math.max(0, t - p._backroomLastT))
    p._backroomLastT = t
    if (p._backroomLoud === undefined) p._backroomLoud = 0.4
    p._backroomLoud += (clamp01(A.level) - p._backroomLoud) * (1 - Math.exp(-dt / LOUD_TAU))
    const loud = muted ? 0 : p._backroomLoud
    const pulse = A.pulse || 0
    if (!muted && t - p._backroomKickAt >= KICK_GAP_S &&
        (pulse - (p._backroomPrevPulse || 0) >= BEAT_RISE || A.onset)) {
      p._backroomKickAt = t
      p._backroomKickAmt = 0.7 + 0.3 * clamp01(A.bass)
      p._backroomRenderT = -Infinity // the swell lands on this frame
    }
    p._backroomPrevPulse = pulse
    const since = t - p._backroomKickAt
    const kick = muted || !(since >= 0) ? 0
      : p._backroomKickAmt * (since < KICK_HOLD_S ? 1 : Math.exp(-(since - KICK_HOLD_S) / KICK_TAU))

    if (t < p._backroomRenderT) p._backroomRenderT = -Infinity
    if (t - p._backroomRenderT >= 1 / RENDER_HZ) {
      p._backroomRenderT = t
      renderRoom(F, t, loud, kick, muted)
    }
    const bufs = F.bufs[F.front]
    for (let cy = 0; cy < F.rows; cy++) {
      for (let cx = 0; cx < F.cols; cx++) {
        const i = cy * F.cols + cx
        if (F.lit[i]) term.putGlyph(cx, cy + 1, bufs[i], TIER_ATTR[F.tier[i]])
        else term.put(cx, cy + 1, ' ')
      }
    }
  },
}

/** The light on the block grid: cone, smoke, pool, lip, spill, floor, the
 *  candle's warmth. Then every pixel row into the cell bitmaps. */
function renderRoom(F, t, loud, kick, muted) {
  const { W, H, GW, GH, blkN, blkT, sm8, HW8, HH8 } = F
  // The one musical element: how much light, and how wide.
  const wm = 0.8 + 0.32 * loud + 0.06 * kick
  const dens = 0.3 + 0.45 * loud + 0.4 * kick
  const hwFloor = coneHalfWidth(FLOOR_Y, wm)
  for (let gy = 0; gy < HH8; gy++) {
    const y = gy * 8
    if (y > FLOOR_Y + 8) { for (let gx = 0; gx < HW8; gx++) sm8[gy * HW8 + gx] = 0; continue }
    const hw = coneHalfWidth(Math.max(LENS_Y, y), wm) + 16
    for (let gx = 0; gx < HW8; gx++) {
      const x = gx * 8
      sm8[gy * HW8 + gx] = Math.abs(x - LAMP_X) <= hw ? smokeAt(x, y, t) : 0
    }
  }
  const flick = muted ? 0.5 : hashI(CANDLE.x, Math.floor(t * 7))
  for (let gy = 0; gy < GH; gy++) {
    const y = gy * 4 + 2
    const hw = coneHalfWidth(y, wm)
    const sv = (FLOOR_Y - y) / (FLOOR_Y - LENS_Y)
    const hy = y / 8, h0 = Math.min(HH8 - 2, hy | 0), fy = hy - h0
    for (let gx = 0; gx < GW; gx++) {
      const x = gx * 4 + 2
      const adx = Math.abs(x - LAMP_X)
      let d = 0, tier = T_DIM
      if (y >= LENS_Y && y < FLOOR_Y) {
        const u = adx / hw
        if (u < 1) {
          const hx = x / 8, k0 = Math.min(HW8 - 2, hx | 0), fx = hx - k0
          const j = h0 * HW8 + k0
          const a = sm8[j] + (sm8[j + 1] - sm8[j]) * fx
          const b = sm8[j + HW8] + (sm8[j + HW8 + 1] - sm8[j + HW8]) * fx
          const smk = a + (b - a) * fy
          const edge = smooth(1, 0.72, u)
          d = dens * edge * (1 - 0.45 * u * u) * (0.7 + 0.3 * sv) * (0.3 + 1.15 * smk)
          // One tier for the whole cone: a tier step between neighbouring
          // cells shows as a hard-edged block on the tube, so the light's
          // strength is carried by density alone.
          tier = T_MUTED
        } else if (u < 1.6 && y > 60) {
          // Spill: a faint haze either side, so what stands at the cone's
          // edge has something to stand against.
          d = 0.08 * (1.6 - u) / 0.6 * (0.6 + 0.4 * loud); tier = T_FAINT
        }
      } else if (y >= FLOOR_Y && y < LIP_Y) {
        // The pool on the boards, and the boards beyond it.
        const q = ((x - LAMP_X) / (hwFloor * 1.02)) ** 2 + ((y - FLOOR_Y - 5) / 9) ** 2
        if (q < 1) {
          d = (0.35 + 0.5 * dens) * (1 - 0.6 * q)
          tier = T_MUTED
        } else if (x > STAGE_L && x < STAGE_R) { d = 0.08; tier = T_FAINT }
      } else if (y >= LIP_Y && y < LIP_Y + 4) {
        const k = adx / (hwFloor * 1.5)
        if (k < 1 && y < LIP_Y + 2) { d = 0.75 * (1 - k); tier = T_DIM }
        else if (x > STAGE_L && x < STAGE_R && y < LIP_Y + 2) { d = 0.1; tier = T_FAINT }
      } else if (y >= FACE_BOT) {
        // The room floor: barely there, a little spill from the stage that
        // dies away toward the viewer and to the sides.
        const k = 1 - adx / 360
        if (k > 0) { d = (0.025 + 0.06 * (1 - (y - FACE_BOT) / (H - FACE_BOT))) * k; tier = T_FAINT }
      }
      // The candle's warmth on its tabletop.
      const cq = ((x - CANDLE.x) / 26) ** 2 + ((y - TOP_Y + 4) / 9) ** 2
      if (cq < 1) { d = Math.max(d, (0.32 + 0.08 * flick) * (1 - cq)); tier = Math.max(tier, T_DIM) }
      const n = Math.min(16, Math.round(d * 16))
      blkN[gy * GW + gx] = n
      blkT[gy * GW + gx] = n ? tier : 0
    }
  }
  F.sheenN = Math.round(16 * (0.6 + 0.3 * kick))
  F.flameH = muted ? 7 : 5 + Math.round(flick * 4)
  F.flameLean = muted ? 0 : flick > 0.75 ? 1 : flick < 0.2 ? -1 : 0

  F.front ^= 1
  F.lit.fill(0)
  F.tier.fill(0)
  const bufs = F.bufs[F.front]
  for (let py = 0; py < H; py++) shadeRow(F, bufs, py)
}

/** One pixel row into the cell bitmaps. Its own function for the same reason
 *  as LAVA LAMP's shadeRow (V8's OSR deopts on nested loops). */
function shadeRow(F, bufs, py) {
  const { cellW, cellH, cols, W, GW, blkN, blkT, mask, cellMask, sheenN, flameH, flameLean } = F
  const cy = (py / cellH) | 0
  const ry = py - cy * cellH
  const r4 = ry & 3
  const g0 = (py >> 2) * GW
  const row = py * W
  for (let ccx = 0; ccx < cols; ccx++) {
    const ci = cy * cols + ccx
    const cx0 = ccx * cellW
    let bits = 0, tierMax = 0
    if (!cellMask[ci]) {
      // Nothing of the cast here: one dither tile per block, a lookup.
      for (let b = cx0 >> 2, bEnd = (cx0 + cellW) >> 2; b < bEnd; b++) {
        const m = BAYER_MASK[blkN[g0 + b] * 4 + r4]
        bits = (bits << 4) | m
        if (m && blkT[g0 + b] > tierMax) tierMax = blkT[g0 + b]
      }
    } else {
      const top = cellMask[ci] - 1
      const scale = top ? 1 / TIER_LEVEL[top] : 0
      for (let px0 = 0; px0 < cellW; px0++) {
        const px = cx0 + px0
        const k = BAYER_RAW[r4 * 4 + (px & 3)]
        let n = 0, tier = 0
        switch (mask[row + px]) {
          case M_OPEN: {
            const b = g0 + (px >> 2)
            tier = blkT[b]
            n = tier && tier < top ? Math.round(blkN[b] * TIER_LEVEL[tier] * scale) : blkN[b]
            break
          }
          case M_DARK: break
          case M_RIM: n = 16; tier = T_NORMAL; break
          case M_SHEEN: n = sheenN; tier = T_NORMAL; break
          case M_SHEEN2: n = sheenN >> 1; tier = T_NORMAL; break
          case M_EDGE: n = 9; tier = T_MUTED; break
          case M_STRING: n = 10; tier = T_MUTED; break
          case M_BRIDGE: n = 16; tier = T_NORMAL; break
          case M_RIM2: n = 13; tier = T_MUTED; break
          case M_RIM3: n = 13; tier = T_DIM; break
          case M_LENS: n = 16; tier = T_NORMAL; break
          case M_FLAME: {
            // A teardrop standing on the wick, its height and lean flickering.
            const h = CANDLE.y - py, dx = px - CANDLE.x - (h > flameH / 2 ? flameLean : 0)
            const half = h < 0 || h > flameH ? -1 : h < flameH * 0.6 ? 1.6 : 0.6
            if (Math.abs(dx) <= half) { n = 16; tier = T_MUTED }
            else { n = blkN[g0 + (px >> 2)]; tier = blkT[g0 + (px >> 2)] }
            break
          }
        }
        if (n > k) {
          bits |= 1 << (cellW - 1 - px0)
          if (tier > tierMax) tierMax = tier
        }
      }
    }
    bufs[ci][ry] = bits
    if (bits) F.lit[ci] = 1
    if (tierMax > F.tier[ci]) F.tier[ci] = tierMax
  }
}
