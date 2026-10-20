// SIGNAL -- visualizer effect "DRIFT", drawn as ATRIUM (NEON STASIS).
//
// 2026-10-20 -- the pixel redraw. One big fountain in the middle of an
// empty mall after closing, still running for nobody: a jet standing out of
// an upper bowl and falling back as an umbrella of spray, the bowl spilling
// over in two sheets into a wide basin whose water carries slow rings. Behind
// it, in the dark, three shop windows are still lit -- two on the floor,
// one up on the balcony -- each a dithered glow cut by dark mullions under
// one neon script sign, and each spilling a little light across the floor.
// The kick makes the jet SPURT: it shoots up, a crown of spray bursts off
// the top and falls back under gravity, and a splash ring runs out across
// the basin.
//
// The critique (2026-10-20, viz-critic on real-tube sheets): REDRAW, ranked
// 4th worst. "A mall directory" -- a schematic of storefronts labelled
// ARCADE/BOOKS/FOODS with an escalator X, the fountain (the supposed
// subject) a 20x3 box at the bottom, the `===` window fills the brightest
// texture in the frame, and the kick a row of `≈` (which rasters as NNNN).
// The same thin one-tier character outline Matt rejected on 2026-10-18,
// when NEON HEART, TOKYO BAY, LAVA LAMP and DROP FORGE were rebuilt in
// pixels. Matt approved the redraw. The critic's plan, which this follows:
// keep the station's idea (an empty mall after closing) but recompose it
// around ONE object, in pixels -- the fountain big and central, 10+ rows;
// two or three lit windows behind as glow rectangles with dark mullions and
// one sign each, no text; escalators, side bays and palms dropped; the kick
// spurts the jet and the spray falls over ~0.5s (DROP FORGE's spark
// gravity); closing-time lights-out kept, on the windows.
//
// What was chosen, and why:
//   - STYLE: per-cell pixel bitmaps through term.putGlyph(), FROST's
//     renderer: a 0..255 luminance field at framebuffer resolution, each
//     cell drawn at the lowest beam tier its brightest pixel needs (or a
//     per-cell floor tier, below) and dithered down to its own intensity
//     with FLAME's 4x4 ordered screen. Water is soft and round -- a column,
//     an umbrella, falling sheets, rings -- which characters cannot draw
//     and pixels can (the set rule the critique proposed).
//   - THE JET IS NOT A LINE. The 2026-10-16 character cut threw the jet up
//     to row 6, a thin line from the basin through the escalators that
//     split the picture down the middle, and the fix then was to cap it
//     under the floor line. Here the jet is allowed height -- it is the
//     subject -- and is kept from reading as a line three ways: it has
//     BODY (a solid core tapering from ~7px, sheathed in a dithered mist),
//     it ENDS in a shape (the umbrella of droplets falling back from its
//     top, wider the louder it is), and the windows stand to either side of
//     it, so it rises through dark air rather than across anything. Even
//     the kick's top (JET_MIN_Y) stops short of the canvas top.
//   - WINDOWS NOT DIRECTORY. No text in them. A lit window is DIM-tier glow
//     at about half density -- brightest under its ceiling strip, falling
//     off toward the floor -- with dark mullions, a transom and a few dark
//     display stands, so it reads as a lit room behind glass. Its sign is a
//     neon capsule with a script squiggle in it: a sign, unreadable from
//     here, as a mall's signs are across an atrium.
//   - PER-CELL FLOOR TIER. FROST takes each cell's tier from its brightest
//     pixel, so a uniform glow at value v renders as a near-solid block at
//     tier(v) -- a slab. The windows, the floor spill and the basin's stone
//     instead set a floor tier for their cells (DIM, FAINT, DIM), so their
//     glow is drawn at that tier as a density: the same tier across a whole
//     window face, so no cell seams (DROP FORGE's critique), and never a
//     slab.
//   - DROPPED: the escalators, the side walls and their bays, the
//     checkered floor seams, the palms and every storefront name. The
//     closing-time lights-out stays (storeDark, unchanged).
//   - Not a reflection: TOKYO BAY, NEON HEART and LAGOON already mirror
//     their subject in water (the critique's set-level note), so the floor
//     takes only a soft spill of window light and the basin only rings.
//   - Composition: the fountain is centred, but the windows are not
//     mirrored -- a wide one low left, a narrower one right, one small one
//     up on the balcony right -- so it is a place, not one more centred
//     symmetric object (the set-level note's worry).
//
// How audio maps (amplitude and one discrete event; no `t *` frequencies on
// audio, so nothing teleports):
//   - THE KICK: a rising edge on `pulse` of BEAT_RISE, at least SPURT_GAP_S
//     after the last (DANCEFLOOR's idiom, so syntheticAudio's pulse drives
//     it with no tap). The jet's top shoots up SPURT_PX, a crown on it goes
//     BRIGHT for a moment, CROWN drops burst off it and fall under gravity
//     into the bowl and basin over ~0.6-0.9s, and a splash ring runs out
//     across the basin. Envelope: held SPURT_HOLD_S, then e^-age/SPURT_TAU_S
//     -- and held at full strength for SPURT_MIN_FRAMES drawn frames
//     whatever the clock says (FROST's SLOW MACHINES rule: on a set drawing
//     a few frames a second a clock-timed spurt fell between frames).
//   - LEVEL (eased over ~0.8s): the jet's resting height, how wide the
//     umbrella opens, how far the overflow sheets arc, and how many rings
//     run in the basin (1..3).
//   - bands9: each window's glow breathes with one band through a ~0.8s
//     smoother -- the stores breathe with the music rather than pump.
//   - Closing time, independent of the audio: now and then a store's lights
//     go out (window dark, sign down to an unlit tube) and come back later.
//     A pure function of (store, t), so nothing to reset.
//
// The rubric, point by point:
//   1. ONE SUBJECT: a fountain in a dark mall. Nameable in two seconds.
//   2. ONE MUSICAL ELEMENT: the jet. The kick spurts it; level sets its
//      height. The windows breathe slowly with the bands, which is scenery
//      swelling, not a second beat. Still an ambient station's swell (the
//      tube's downbeat bloom stays excluded for 'drift' in visualizer.js).
//   3. BRIGHTNESS ORDER: jet core NORMAL (the crown BRIGHT only in a
//      spurt) > umbrella, overflow and basin rim MUTED > rings, bowl water,
//      windows and signs DIM > basin stone, floor spill FAINT > dark air.
//   4. SHAPES, NOT SOUP: no characters on the canvas at all -- every lit
//      cell is a bitmap -- and no `≈`/`~` (the glyph rasters as NNNN).
//   5. FOUR STATES: NO TAP spurts to syntheticAudio's pulse at its level.
//      Quiet: a low jet with a narrow umbrella, one ring. Loud: a tall jet,
//      a wide umbrella, three rings. MUTED: the fountain turned down to a
//      bubbling trickle in the bowl, a thin overflow and one slow ring, the
//      windows still lit -- the mall after the music stopped, not a blank.
//   6. REAL-RADIO TEST: a fountain in a mall at night is the picture on the
//      sleeve of half the records this station plays.
//
// Cost: the static scene (bowls, basin, stem, balcony, window frames) is
// painted once per width into `base`; per frame the field is copied from
// it, the windows' interiors are lit from precomputed pixel lists, the
// water is drawn, and every cell is packed -- re-put (a no-op) when its
// words and tier match what is already up, so an unchanged cell costs no
// raster. Measured 2026-10-20 in the harness on a loaded dev box: ~2.2-2.6ms
// a frame (FLAME ~0.9-1.0ms in the same run), the first frame ~80ms cold
// (~30ms to rebuild once warm) -- under NEON HEART's 190ms hitch.
// tests/visual-drift.test.mjs holds a loose regression bound on both.
//
// ---- history (condensed) ----
// Until 2026-10-16 DRIFT was four sine terms rendered as a density ramp over
// the whole canvas: it moved a lot with the audio (40% of the canvas
// between quiet and loud) and still read as wallpaper. 2026-10-16 rebuilt
// it as ATRIUM in characters: a one-point-perspective mall, two floors of
// named storefronts, crossing escalators, palms, a fountain in the
// foreground. The design pass that night made the basin solid box rules,
// the windows dot screens instead of `░` slabs (solid rectangles on the
// tube), and capped the jet under the floor line after the first cut threw
// it up to row 6 as a line splitting the frame. Lessons kept: the jet must
// not read as a line (above); the kick must say "now" and settle inside a
// beat; signs never outshine the fountain; the key stays 'drift' -- it is
// also activeVisualKey's fallback for an unknown visual.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- the beat -----------------------------------------------------------------
export const BEAT_RISE = 0.2
export const SPURT_GAP_S = 0.22
export const SPURT_HOLD_S = 0.06
export const SPURT_TAU_S = 0.3
export const SPURT_MIN_FRAMES = 3
// How far a spurt lifts the jet's top, in framebuffer pixels (~3.5 rows).
export const SPURT_PX = 58
// Drops in a spurt's crown, and how long the longest-lived one flies.
export const CROWN = 26
export const CROWN_S = 0.9
// Gravity, framebuffer pixels per second squared, for every drop.
const GRAV = 300
// The crown falls faster: it has to come down from the spurt's top to the
// bowl in well under a second, or it hangs in the air after the jet has
// sunk back and reads as a separate firework.
const CROWN_GRAV = 900
// Seconds for a basin ring to run from the jet to the wall.
const RING_S = 3.4

// --- geometry (framebuffer pixels from the canvas top, row 1) ----------------
export const BALCONY_Y = 54     // the upper floor's slab edge
export const FLOOR_LINE_Y = 196 // where the far wall meets the floor
export const BOWL_Y = 194       // the upper bowl's water surface (centre)
export const RIM_Y = 270        // the basin's rim (centre of its ellipse)
export const BASIN_BOT = 320    // the basin's foot
// The highest the jet's top may reach, on any kick at any level.
export const JET_MIN_Y = 22

// Beam levels, src/term.js; pixel intensities are on the same scale.
const LV_BRIGHT = 255, LV_NORMAL = 205, LV_MUTED = 180, LV_DIM = 150, LV_FAINT = 100
const L_JET = 205, L_CROWN = 255, L_DROP = 182, L_RIM = 182
const CELL_MIN = 12
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16)
const clamp01 = (v) => Math.max(0, Math.min(1, v))

export const tierOf = (m) => (m >= 232 ? BRIGHT : m >= 193 ? NORMAL : m >= 166 ? MUTED : m >= 126 ? DIM : FAINT)
const levelOf = (a) => (a === BRIGHT ? LV_BRIGHT : a === NORMAL ? LV_NORMAL : a === MUTED ? LV_MUTED : a === DIM ? LV_DIM : LV_FAINT)
const attrOfLevel = (l) => (l >= LV_BRIGHT ? BRIGHT : l >= LV_NORMAL ? NORMAL : l >= LV_MUTED ? MUTED : l >= LV_DIM ? DIM : FAINT)

/** Lights out? A pure function of a store's id and the effect clock: each
 *  store keeps its own ~25s cycle, offset so they do not go together, and is
 *  dark for roughly a fifth of its cycles. */
export function storeDark(id, t) {
  const period = 23 + (id % 5) * 2.7
  const k = Math.floor((t + id * 7.3) / period)
  return hash2(id * 3.1, k) < 0.22
}

/** The jet's top, in framebuffer y, for an eased level and a spurt
 *  envelope. Muted it is a bubble just over the bowl. */
export function jetTop(level, env, muted) {
  if (muted) return BOWL_Y - 9
  return Math.max(JET_MIN_Y, Math.round(148 - 66 * clamp01(level) - SPURT_PX * env))
}

/** The spurt, 1 at the kick falling to 0. `frames` counts drawn frames
 *  since the kick -- see SLOW MACHINES in FROST's header. */
export function spurtEnv(age, frames) {
  if (age < 0 || age > 3) return 0
  if (frames < SPURT_MIN_FRAMES || age < SPURT_HOLD_S) return 1
  return Math.exp(-(age - SPURT_HOLD_S) / SPURT_TAU_S)
}

/** Everything that depends only on the width, built on first draw (most
 *  sessions never open this effect) and rebuilt if the width changes. */
export function geometry(cols, cellW = 8, cellH = 16) {
  const adv = cellW + 1
  const rows = VIZ_BOT - 1
  const FW = cols * adv, FH = rows * cellH
  const cx = Math.round(FW / 2)
  // Fountain widths shrink on a narrow grid, never grow past the 80-col art.
  const k = Math.min(1, FW / 720)
  const windows = [
    // storeDark id, glow slot, band, interior x0..x1/y0..y1, sign box. The
    // ids are chosen so every store is lit through the first half-minute of
    // a visit (id 0 is dark from t = 0, and 1 for most of its first cycle).
    { id: 3, slot: 0, band: 1, x0: Math.round(FW * 0.045), x1: Math.round(FW * 0.335), y0: 98, y1: 190, sign: [Math.round(FW * 0.09), Math.round(FW * 0.29), 72, 88] },
    { id: 8, slot: 1, band: 4, x0: Math.round(FW * 0.665), x1: Math.round(FW * 0.935), y0: 108, y1: 190, sign: [Math.round(FW * 0.71), Math.round(FW * 0.89), 84, 100] },
    { id: 14, slot: 2, band: 7, upper: true, x0: Math.round(FW * 0.625), x1: Math.round(FW * 0.815), y0: 14, y1: 46, sign: null },
  ]
  return {
    cols, cellW, cellH, adv, rows, FW, FH, cx, k,
    windows,
    bowlRx: Math.round(66 * k), bowlRy: 8,
    basinRx: Math.round(206 * k), basinRy: 15,
    stemHw: Math.max(4, Math.round(8 * k)),
  }
}

function build(term) {
  const G = geometry(term.cols, term.font.cellW, term.font.cellH)
  const { FW, FH, cols, rows, cellH, adv, cx } = G
  const base = new Uint16Array(FW * FH)
  const floor = new Uint8Array(cols * rows) // per-cell floor beam level (0 = none)
  const cellList = (m) => { const out = []; for (let i = 0; i < m.length; i++) if (m[i]) out.push(i); return Int32Array.from(out) }
  const cellOf = (x, y) => Math.floor(y / cellH) * cols + Math.floor(x / adv)
  const setMax = (x, y, v) => {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || x >= FW || y < 0 || y >= FH) return
    const i = y * FW + x
    if (v > base[i]) base[i] = v
  }

  // The balcony's slab edge and the floor line: structure, faint.
  for (let x = 0; x < FW; x++) {
    if (Math.abs(x - cx) < 34) continue // the jet's air stays dark
    setMax(x, BALCONY_Y, 88); setMax(x, BALCONY_Y + 1, 60)
    setMax(x, FLOOR_LINE_Y, 58)
  }

  // Windows: frames (dark glass edge) into the base; the interior pattern
  // into a list the draw lights at the window's current glow.
  for (const w of G.windows) {
    const { x0, x1, y0, y1 } = w
    for (let x = x0 - 2; x <= x1 + 2; x++) { setMax(x, y0 - 2, 70); setMax(x, y1 + 1, 70) }
    for (let y = y0 - 2; y <= y1 + 1; y++) { setMax(x0 - 2, y, 70); setMax(x1 + 2, y, 70) }
    const idx = [], pat = []
    const span = x1 - x0, h = y1 - y0
    const nm = Math.max(2, Math.round(span / 52))
    const mull = []
    for (let m = 1; m < nm; m++) mull.push(x0 + Math.round((m * span) / nm))
    const transom = y0 + Math.min(16, Math.round(h * 0.2))
    // A few display stands, dark against the glow, in the lower part.
    const stands = []
    if (h > 50) {
      for (let s = 0; s < nm; s++) {
        const a = x0 + Math.round(((s + 0.2 + 0.25 * hash2(w.id, s)) * span) / nm)
        const b = a + Math.round(span / nm * (0.3 + 0.2 * hash2(s, w.id + 9)))
        stands.push([a, b, y1 - Math.round(h * (0.22 + 0.18 * hash2(w.id + 3, s)))])
      }
    }
    // Per column: a mullion (-1), or the row a display stand starts at.
    const colTop = new Int32Array(span + 1).fill(1e9)
    for (const [a, b, top] of stands) for (let x = a; x <= b; x++) colTop[x - x0] = Math.min(colTop[x - x0], top)
    for (const mx of mull) for (let x = mx - 1; x <= mx + 1; x++) colTop[x - x0] = -1
    for (let y = y0; y <= y1; y++) {
      if (y === transom || y === transom + 1) continue
      for (let x = x0; x <= x1; x++) {
        if (y >= colTop[x - x0]) continue
        const u = (y - y0) / h
        // The ceiling strip of the shop: brightest, then falling to the floor.
        const v = y - y0 < 3 && y < transom ? 1.25 : 1 - 0.4 * u
        idx.push(y * FW + x); pat.push(v)
      }
    }
    w.idx = Int32Array.from(idx); w.pat = Float32Array.from(pat)
    // The window's cells, which take the DIM floor tier while it is lit.
    const cs = new Uint8Array(cols * rows)
    for (let y = y0; y <= y1; y += 4) for (let x = x0; x <= x1; x++) cs[cellOf(x, y)] = 1
    for (let x = x0; x <= x1; x++) cs[cellOf(x, y1)] = 1
    w.cells = cellList(cs)
    // Its spill across the floor: a soft wedge widening toward you. (The
    // balcony's window is too high to light the floor.)
    const sIdx = [], sPat = [], sCells = new Uint8Array(cols * rows)
    for (let y = FLOOR_LINE_Y + 2; y < (w.upper ? 0 : FH); y++) {
      const d = (y - FLOOR_LINE_Y) / (FH - FLOOR_LINE_Y)
      const spread = d * (x1 - x0) * 0.6
      const a = Math.round(x0 - spread * (x0 < cx ? 1 : 0.4)), b = Math.round(x1 + spread * (x1 > cx ? 1 : 0.4))
      for (let x = Math.max(0, a); x <= Math.min(FW - 1, b); x++) {
        const edge = Math.min(x - a, b - x) / 40
        // Fades in under the floor line too, so the wedge has no hard top.
        const v = (1 - d) * (1 - d) * (1 - d) * Math.min(1, edge) * Math.min(1, (y - FLOOR_LINE_Y) / 10)
        if (v < 0.05) continue
        sIdx.push(y * FW + x); sPat.push(v); sCells[cellOf(x, y)] = 1
      }
    }
    w.sIdx = Int32Array.from(sIdx); w.sPat = Float32Array.from(sPat); w.sCells = cellList(sCells)
  }

  // The basin: a wide ellipse. Its far rim and near rim lit, the water
  // inside the ellipse, the stone face below the near rim.
  const { basinRx: rx, basinRy: ry, bowlRx, bowlRy, stemHw, k } = G
  const ax = 0.74 // a framebuffer pixel's width in display units (4:3 face)
  for (let x = cx - rx; x <= cx + rx; x++) {
    const u = (x - cx) / rx
    const e = Math.sqrt(Math.max(0, 1 - u * u))
    const yb = RIM_Y - ry * e, yf = RIM_Y + ry * e
    setMax(x, yb, L_RIM - 14); setMax(x, yb - 1, 120)
    setMax(x, yf, L_RIM); setMax(x, yf + 1, L_RIM - 20)
    // The stone face: from the near rim down to the foot, which bows with it.
    const foot = BASIN_BOT - 6 * (1 - e)
    for (let y = Math.ceil(yf + 2); y <= foot; y++) {
      const i = y * FW + x
      if (y < FH && x >= 0 && x < FW) {
        base[i] = Math.max(base[i], y >= foot - 1 ? 64 : 18 + 8 * e)
        floor[cellOf(x, y)] = LV_FAINT
      }
    }
  }
  // The basin's water: dark, with a faint sheen.
  for (let y = RIM_Y - ry + 2; y <= RIM_Y + ry - 2; y++) {
    const dy = (y - RIM_Y) / ry
    const hw = rx * Math.sqrt(Math.max(0, 1 - dy * dy)) - 3
    for (let x = Math.round(cx - hw); x <= cx + hw; x++) {
      if (hash2(x >> 2, y) < 0.07) setMax(x, y, 40)
    }
  }

  // The stem, from the basin's water up to the bowl: lit edges, dark body.
  const stemTop = BOWL_Y + bowlRy + 3
  for (let y = stemTop; y <= RIM_Y; y++) {
    const flare = y > RIM_Y - 14 ? Math.round((y - (RIM_Y - 14)) * 0.6) : 0
    const hw = stemHw + flare + (y < stemTop + 6 ? 6 - (y - stemTop) : 0)
    setMax(cx - hw, y, 150); setMax(cx + hw, y, 120)
  }
  // The upper bowl: lit lip all round, the underside curving into the stem.
  for (let x = cx - bowlRx; x <= cx + bowlRx; x++) {
    const u = (x - cx) / bowlRx
    const e = Math.sqrt(Math.max(0, 1 - u * u))
    setMax(x, BOWL_Y - bowlRy * e, L_RIM - 10)
    setMax(x, BOWL_Y + bowlRy * e, L_RIM)
    setMax(x, BOWL_Y + bowlRy * e + 1, 150)
    // The underside: a curve from the lip down into the stem.
    const ud = BOWL_Y + bowlRy * e + 1 + (bowlRy + 2) * e * e
    setMax(x, ud, 110)
    for (let y = BOWL_Y - Math.floor(bowlRy * e) + 1; y < BOWL_Y + bowlRy * e; y++) {
      if (hash2(x >> 1, y) < 0.3) setMax(x, y, 70)
    }
  }
  for (let x = cx - bowlRx; x <= cx + bowlRx; x++) {
    floor[cellOf(x, BOWL_Y)] = Math.max(floor[cellOf(x, BOWL_Y)], LV_DIM)
  }

  G.base = base
  G.floorBase = floor
  G.floor = new Uint8Array(cols * rows)
  G.lum = new Uint16Array(FW * FH)
  G.bufs = [0, 1].map(() => Array.from({ length: cols * rows }, () => new Uint16Array(cellH)))
  G.shown = new Array(cols * rows).fill(null)
  G.shownAttr = new Int16Array(cols * rows).fill(-1)
  G.ax = ax
  G.k = k
  return G
}

export default {
  key: 'drift',
  label: 'ATRIUM',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._drift = null
    p._driftSpurtAt = -99
    p._driftPrevSpurtAt = -99
    p._driftSpurts = 0
    p._driftSpurtFrames = 99
    p._driftPrevPulse = 0
    p._driftGlow = new Float32Array(4)
    p._driftLevel = 0.5
    p._driftLastT = null
  },
  /** Re-arms clocks on every visualizer entry. The spurt stamps are
   *  effect-clock values: carried across a re-entry they sit minutes in the
   *  future of the restarted clock and the rate limit refuses every spurt
   *  until it catches up (the 2026-09-12 audit's shape). _driftLastT is the
   *  smoothers' last-frame stamp, an effect-clock value too. */
  reset(p) {
    p._driftSpurtAt = -99
    p._driftPrevSpurtAt = -99
    p._driftSpurtFrames = 99
    p._driftPrevPulse = 0
    p._driftLastT = null
  },
  draw(p, s, t) {
    const { term } = s
    if (!p._drift || p._drift.cols !== term.cols) p._drift = build(term)
    const G = p._drift
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    // --- the kick ---------------------------------------------------------------
    const pulse = A.pulse || 0
    if (!muted && pulse - (p._driftPrevPulse || 0) >= BEAT_RISE && t - p._driftSpurtAt >= SPURT_GAP_S) {
      p._driftPrevSpurtAt = p._driftSpurtAt
      p._driftSpurtAt = t
      p._driftSpurts = (p._driftSpurts + 1) | 0
      p._driftSpurtFrames = 0
    } else if (p._driftSpurtFrames < 99) p._driftSpurtFrames++
    p._driftPrevPulse = pulse
    const env = muted ? 0 : spurtEnv(t - p._driftSpurtAt, p._driftSpurtFrames)

    // --- the smoothers ----------------------------------------------------------
    // The first frame of a visit snaps to the signal rather than easing in
    // from wherever the last visit left off.
    const first = p._driftLastT == null
    let dt = first ? 0 : t - p._driftLastT
    if (!(dt >= 0)) dt = 0
    if (dt > 0.25) dt = 0.25
    p._driftLastT = t
    const ease = first ? 1 : 1 - Math.exp(-dt / 0.8)
    p._driftLevel += ((muted ? 0 : clamp01(A.level || 0)) - p._driftLevel) * ease
    const level = p._driftLevel
    const bands = A.bands9 || SILENT_AUDIO.bands9
    if (!p._driftGlow) p._driftGlow = new Float32Array(4)

    const { FW, FH, cx, lum, floor, k } = G
    lum.set(G.base)
    floor.set(G.floorBase)
    const plot = (x, y, v) => {
      x = Math.round(x); y = Math.round(y)
      if (x < 0 || x >= FW || y < 0 || y >= FH) return
      const i = y * FW + x
      if (v > lum[i]) lum[i] = v
    }

    // --- the windows: lit rooms behind glass, and their signs -------------------
    for (const w of G.windows) {
      const b = clamp01(bands[w.band] || 0)
      const glow = (p._driftGlow[w.slot] += (b - p._driftGlow[w.slot]) * ease)
      const dark = storeDark(w.id, t)
      if (!dark) {
        const g = 62 + 34 * glow
        const { idx, pat } = w
        for (let n = 0; n < idx.length; n++) { const v = pat[n] * g; if (v > lum[idx[n]]) lum[idx[n]] = v }
        for (const c of w.cells) if (floor[c] < LV_DIM) floor[c] = LV_DIM
        const sg = 20 + 8 * glow
        const { sIdx, sPat } = w
        for (let n = 0; n < sIdx.length; n++) { const v = sPat[n] * sg; if (v > lum[sIdx[n]]) lum[sIdx[n]] = v }
        for (const c of w.sCells) if (floor[c] < LV_FAINT) floor[c] = LV_FAINT
      }
      if (w.sign) {
        // A neon capsule with a script squiggle in it; an unlit tube when
        // the store is closed. Top of the scenery tiers, under the jet.
        const [sx0, sx1, sy0, sy1] = w.sign
        const v = dark ? 62 : 150 + 22 * glow
        const r = (sy1 - sy0) / 2, my = (sy0 + sy1) / 2
        for (let x = sx0; x <= sx1; x++) {
          const ex = x < sx0 + r ? (sx0 + r - x) / r : x > sx1 - r ? (x - (sx1 - r)) / r : 0
          const h = r * Math.sqrt(Math.max(0, 1 - ex * ex))
          plot(x, my - h, v); plot(x, my + h, v)
          if (ex > 0.92) for (let y = my - h; y <= my + h; y++) plot(x, y, v)
        }
        for (let x = sx0 + r + 4; x <= sx1 - r - 4; x++) {
          if (hash2(Math.floor(x / 13), w.id) < 0.18) continue // gaps between "words"
          plot(x, my + Math.sin(x * 0.42 + w.id) * (r * 0.42), v)
        }
      }
    }

    // --- the basin's water: rings, and the kick's splash -------------------------
    const { basinRx: rx, basinRy: ry, bowlRx } = G
    const rings = muted ? 1 : 1 + Math.round(level * 2)
    const ring = (rr, v) => {
      // An ellipse of the basin's proportions, radius rr in x.
      const n = Math.max(48, Math.round(rr * 4))
      for (let q = 0; q < n; q++) {
        const a = (q / n) * Math.PI * 2
        plot(cx + Math.cos(a) * rr, RIM_Y + Math.sin(a) * rr * (ry / rx), v)
      }
    }
    for (let r = 0; r < rings; r++) {
      const ph = ((t / RING_S) + r / 3) % 1
      const rr = G.stemHw + 10 + ph * (rx - G.stemHw - 16)
      ring(rr, ph < 0.7 ? 150 : 150 * (1 - (ph - 0.7) / 0.3) + 20)
    }
    if (env > 0.02) ring(G.stemHw + 14 + (1 - env) * (rx - G.stemHw - 20), 120 + 66 * env)

    // --- the overflow: two falling sheets from the bowl's lip into the basin -----
    const reach = (muted ? 10 : 16 + 34 * level) * k
    const drop = RIM_Y - 4 - BOWL_Y
    for (const side of [-1, 1]) {
      for (let strand = 0; strand < 3; strand++) {
        const sr = reach * (0.75 + strand * 0.15)
        for (let y = BOWL_Y + 2; y < RIM_Y - 3; y++) {
          const u = (y - BOWL_Y) / drop
          // Falling water: dashes running downward, so the sheet moves.
          if (((y + strand * 3 - t * 90) % 11 + 11) % 11 > (muted ? 5 : 8)) continue
          const x = cx + side * (bowlRx + 1 + sr * Math.sqrt(u))
          plot(x, y, strand === 1 ? 176 : 150)
        }
      }
    }

    // --- the jet ------------------------------------------------------------------
    const top = jetTop(level, env, muted)
    const foot = BOWL_Y - 2
    const H = foot - top
    for (let y = top; y <= foot; y++) {
      const u = (y - top) / Math.max(1, H) // 0 at the top, 1 at the foot
      const hw = (2 + 3 * u) * (muted ? 0.8 : 1)
      const wob = muted ? 0 : Math.sin(y * 0.3 - t * 7) * 0.6
      for (let x = Math.floor(cx - hw - 7); x <= Math.ceil(cx + hw + 7); x++) {
        const d = Math.abs(x - cx - wob)
        if (d <= hw) plot(x, y, y - top < 4 && env > 0.55 ? L_CROWN : L_JET)
        else {
          // The mist sheathing the column, thinning outward.
          const m = 110 * Math.exp(-(d - hw) / 2.6)
          if (m > 14 && hash2(x, y + Math.floor(t * 20)) < 0.65) plot(x, y, m)
        }
      }
    }
    // The umbrella: drops leaving the top and falling back outward to the
    // bowl. Each is a pure function of (i, t): no particle list to leak.
    if (!muted) {
      const N = 64
      const spread = 30 + 70 * level
      for (let i = 0; i < N; i++) {
        const per = 0.9 + 0.5 * hash2(i, 41)
        const ph = (t / per + hash2(i, 42)) % 1
        const cyc = Math.floor(t / per + hash2(i, 42))
        const a = ph * per * 1.25
        const side = hash2(i, cyc) < 0.5 ? -1 : 1
        const vx = side * spread * (0.35 + 0.65 * hash2(i + 9, cyc))
        const vy = -(20 + 40 * hash2(cyc, i + 3))
        const x0 = cx + side * 2
        const pos = (u) => [x0 + vx * u, top + 2 + vy * u + 0.5 * GRAV * u * u]
        const [xa, ya] = pos(Math.max(0, a - 0.025)), [xb, yb] = pos(a)
        if (yb > BOWL_Y - 2) continue
        const v = L_DROP - 50 * ph
        for (let q = 0; q <= 3; q++) plot(xa + (xb - xa) * q / 3, ya + (yb - ya) * q / 3, v)
      }
    } else {
      // Muted: the fountain turned down -- a bubbling crown on the bowl.
      for (let i = 0; i < 10; i++) {
        const a = (t * 1.3 + hash2(i, 5)) % 1
        plot(cx + (hash2(i, Math.floor(t * 1.3 + hash2(i, 5))) - 0.5) * 18, BOWL_Y - 3 - 6 * Math.sin(a * Math.PI), 150)
      }
    }
    // The crown: the last two spurts' drops, flung out from the top of the
    // jet and falling under gravity into the bowl and on into the basin.
    if (!muted) {
      for (const [kt, seed] of [[p._driftPrevSpurtAt, p._driftSpurts - 1], [p._driftSpurtAt, p._driftSpurts]]) {
        const a = t - kt
        if (!(a >= 0 && a < CROWN_S)) continue
        const topK = jetTop(level, 1, false)
        for (let n = 0; n < CROWN; n++) {
          const r1 = hash2(n, seed), r2 = hash2(seed, n + 31), r3 = hash2(n + 7, seed * 3)
          const life = 0.5 + r3 * (CROWN_S - 0.5)
          if (a > life) continue
          const side = n & 1 ? 1 : -1
          const vx = side * (50 + r1 * 170) * k, vy = -(10 + r2 * 70)
          const pos = (u) => [cx + vx * u, topK + vy * u + 0.5 * CROWN_GRAV * u * u]
          const [xa, ya] = pos(Math.max(0, a - 0.03)), [xb, yb] = pos(a)
          if (yb > RIM_Y) continue
          const age = a / life
          const v = age < 0.2 && n < 5 ? L_CROWN : age < 0.6 ? L_JET : L_DROP - 20
          for (let q = 0; q <= 4; q++) {
            const x = xa + (xb - xa) * q / 4, y = ya + (yb - ya) * q / 4
            plot(x, y, v); plot(x + 1, y, v)
          }
        }
      }
    }

    // --- pixels to cells -----------------------------------------------------------
    // Two bitmaps per cell: write into whichever one is NOT on screen.
    // putGlyph() skips a same-reference re-put, so a bitmap rewritten in
    // place never re-rasters -- and an unchanged cell re-puts the one that
    // is up, which costs no raster at all.
    const [b0, b1] = G.bufs
    const { cols, cellW, cellH, adv, rows, shown, shownAttr } = G
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ci = r * cols + c
        const base = r * cellH * FW + c * adv
        let m = 0
        for (let py = 0; py < cellH; py++) {
          const o = base + py * FW
          for (let px = 0; px < cellW; px++) if (lum[o + px] > m) m = lum[o + px]
        }
        if (m < CELL_MIN) {
          if (shown[ci] !== null) { shown[ci] = null; shownAttr[ci] = -1 }
          term.put(c, r + 1, ' ')
          continue
        }
        const lv = Math.max(levelOf(tierOf(m)), floor[ci])
        const attr = attrOfLevel(lv)
        const inv = 1 / lv
        const bits = shown[ci] === b0[ci] ? b1[ci] : b0[ci]
        let any = 0, same = shown[ci] !== null && shownAttr[ci] === attr
        const prev = shown[ci]
        for (let py = 0; py < cellH; py++) {
          const o = base + py * FW
          const b4 = (py & 3) * 4
          let w = 0
          for (let px = 0; px < cellW; px++) {
            if (lum[o + px] * inv > BAYER[b4 + (px & 3)]) w |= 1 << (cellW - 1 - px)
          }
          bits[py] = w
          any |= w
          if (same && prev[py] !== w) same = false
        }
        if (!any) {
          if (shown[ci] !== null) { shown[ci] = null; shownAttr[ci] = -1 }
          term.put(c, r + 1, ' ')
        } else if (same) {
          // Unchanged: re-put the bitmap already up (a no-op, no raster).
          term.putGlyph(c, r + 1, prev, attr)
        } else {
          term.putGlyph(c, r + 1, bits, attr)
          shown[ci] = bits; shownAttr[ci] = attr
        }
      }
    }
  },
}
