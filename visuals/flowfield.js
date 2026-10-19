// SIGNAL -- visualizer effect "LAVA LAMP" (key 'flowfield', GREEN ROOM).
// Split out of program.js in the 2026-08-25 audit; `this` became `p` (the
// program object). The key is still FLOW FIELD's, so stations.js needs no
// change; the history of what this file drew before is kept at the bottom.
//
// 2026-10-18 -- REBUILT in pixels, new subject: a lava lamp in a hazy room.
//
// What Matt said of VANITY (build 2026-10-18.1, live): "Vanity. Same." --
// still needs work, try a different style. The capture showed why: a
// box-drawn mirror, a ring of 'o' bulbs, a setlist, a bottle, an ashtray,
// one thin `( ) /` smoke line. Thin box-drawing OUTLINES -- a schematic of a
// room, clip-art -- and the KICK tile was barely distinguishable from LOUD
// (the bulbs going 'O' -> '☼' is a few dozen glyph swaps on a 1fps still).
// And the one thing the station is named for, the haze, was the one thing
// characters cannot draw: soft drifting smoke is a density, and a cell holds
// a glyph or nothing. Tuning the vanity would not fix any of that.
//
// What this is instead, and why:
//
// - STYLE: per-cell pixel bitmaps through term.putGlyph(), the renderer
//   FLAME proved (Matt approved FLAME live). Every pixel of the canvas gets
//   a density, and a 4x4 ordered dither turns density into lit pixels, so
//   tone is HOW MANY pixels are lit, not which glyph was picked. That is the
//   only way on this tube to draw a soft, drifting haze, and the only way to
//   draw a round, glowing blob rather than an 'O'. Same beam bytes as text,
//   so bloom, scanlines and persistence apply. The two flame.js traps are
//   kept: two bitmaps per cell, alternated per render (a same-reference
//   putGlyph is a no-op), and a separate `lit` flag, because NORMAL is
//   attribute 0 and cannot mean "blank".
// - SUBJECT: a lava lamp. Nameable in two seconds by its silhouette alone --
//   the tapered cap, the bulging glass, the flared base -- and the one object
//   that says "the room you're let into" without saying anything more
//   explicit (the station's joke is the frequency, 420.0, never a cartoon).
//   The vanity's mirror said "backstage"; the lamp says this backstage. It
//   stands on a shelf edge, in a room full of haze that the lamp lights.
// - THE HAZE is the scenery, not a second subject: slow banks of smoke
//   (value-noise fbm, stretched sideways, heavier toward the ceiling)
//   drifting across and up the whole canvas at fixed rates. The lamp's light
//   catches it -- haze near the lamp is denser and a tier brighter -- and
//   the lamp's body stands dark against that lit haze, which is what gives
//   the cap and base MASS instead of an outline: a silhouette, with one thin
//   rim and a highlight stripe down the metal.
//
// The rubric, point by point:
// 1. ONE SUBJECT: the lamp. The haze is its light made visible; the shelf
//    is one line under it.
// 2. ONE MUSICAL ELEMENT: the lamp's light. Smoothed loudness (LOUD_TAU,
//    a breath, not a flicker) sets how far the glow reaches into the haze
//    and how fast the wax climbs (an accumulated phase, never `t *` scaled
//    by level -- the old FLOW FIELD's jump). A KICK -- a rising edge of the
//    pulse or a real onset, at most one per KICK_GAP_S -- flares it: every
//    blob swells and goes BRIGHT, the liquid lights, and the halo blows out
//    across the haze to most of the canvas. Held KICK_HOLD_S then released
//    on KICK_TAU, long enough to read as the room's light pumping on the
//    beat rather than a one-frame strobe.
// 3. BRIGHTNESS ORDER: the wax (NORMAL, BRIGHT only on a kick) > the glass,
//    its liquid and the lamp's rim (MUTED) > lit haze (MUTED, sparse) >
//    unlit haze and the lamp body's fill (DIM, sparser still). Glass reads
//    over haze by density, not just tier.
// 4. SHAPES, NOT SOUP: no shade-block glyphs anywhere -- the canvas is
//    bitmaps or blanks. The blobs are solid round masses with a soft dithered
//    fringe; the haze is sparse dither, never a field of `░`.
// 5. FOUR STATES. NO TAP: syntheticAudio -- breathes and flares on its fake
//    pulse. MUTED: SILENT_AUDIO -- the lamp is still ON (a lamp does not
//    need the music), the wax still drifts at its slowest, but it drops to
//    MUTED, the halo pulls in close and nothing flares: dim, alive, not
//    blank. Quiet: a short glow, slow wax. Loud: a wide glow, quicker wax.
// 6. REAL-RADIO TEST: a lava lamp on the shelf beside the set in a smoky
//    room -- the most real thing any of these effects shows.
//
// What the rounds of looking changed (tools/viz-sheet.mjs captures, plus a
// beam-framebuffer dump from the harness for the KICK, since at this box's
// ~0.5-1fps swiftshader the sheet's KICK tile lands seconds after the onset
// and shows a settled frame for every effect):
// - Round 1: the wax fused into one column the height of the glass (the
//   metaball kernel's long tails -- see WAX_EDGE) and the haze read as
//   camouflage blots. Compact kernel, smaller blobs; the haze domain-warped
//   and stretched into layers.
// - Round 2: right, but the haze lay evenly over the whole room, so the
//   lamp did not seem to light anything. The far haze was thinned and the
//   lit share raised (0.22 + 0.75L -> 0.13 + 1.0L), so the smoke is visibly
//   brightest round the lamp. The flare's release was cut (0.4s -> 0.3s,
//   BRIGHT above 0.5 rather than 0.35): at 120bpm the old one left the wax
//   BRIGHT for most of every beat, which is a lamp, not a pulse.
//
// COST. The first cut took ~3x FLAME's time per frame, which on this tube
// is a dropped frame. Three fixes: the haze noise is sampled every 8px and
// interpolated (it is smooth at that scale); the room away from the lamp is
// a 4x4 block per dither tile, so its lit pixels are a table lookup
// (BAYER_MASK) rather than per-pixel work -- ~85% of the canvas; and the
// per-row shading is its own function (see shadeRow on V8's OSR). Rebuilt
// at most RENDER_HZ; frames between re-put the same bitmaps. Now under
// FLAME's per-frame cost in the same bench.
//
// `decay: 0.88` is kept: the haze and the wax move a pixel at a time, and
// the tube's afterglow smooths those steps into drift. (tests/crt-base and
// tests/visual-flame also lean on this effect's decay sitting above most
// stations' own -- a reason not to drop it casually.)
//
// State on p: _lava (lazily allocated buffers, built on first draw -- see
// flame.js on why not at boot), _lavaLoud (smoothed loudness), _lavaPhase
// (the wax's accumulated phase -- a position, carried over between visits),
// _lavaLastT / _lavaRenderT / _lavaKickAt (absolute effect-clock values,
// cleared by reset(): CLAUDE.md's rule for any `t + n` kept on p),
// _lavaKickAmt, _lavaPrevPulse.
//
// --- history -----------------------------------------------------------------
// 2026-10-16 (design pass) -- VANITY: a dressing-room mirror ringed with
// bulbs, a setlist, a bottle and ashtray, one thin line of smoke. Replaced
// FLOW FIELD's streak texture with a picture; the bulbs were the beat, '●'
// was tried and dropped because in ter-u16n it is a SMALL dot (glyph size is
// part of the brightness order). Rejected 2026-10-18 -- see above.
// 2026-09-21 -- FLOW FIELD became the first effect to set its own afterglow
// (0.88, Cyberspace TERMINAL's matrix-saver trick).
// 57th pass -- FLOW FIELD built for MOMENTUM: a wind map, a drifting angle
// field rendered as streak glyphs. 59th pass unassigned; 2026-08-26 re-homed
// on GREEN ROOM on the argument that it read as smoke. The 2026-10-16
// critique: it read as streaks. This pass finally draws smoke as smoke.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)

// --- the lamp, in canvas pixels (y from the top of canvas row 1) ------------
// Tall and slender: the tube stretches cells 1.2x tall, so this stands ~4:1.
export const CAP_TOP = 26, CAP_BOT = 66      // tapered cap
export const GLASS_TOP = 66, GLASS_BOT = 244 // the bulging glass
export const COLLAR_BOT = 254                // a band where glass meets base
export const BASE_BOT = 320                  // flared base; the shelf is under it
export const SHELF_Y = 321
const SHELF_HW = 232

/** Half-width of the lamp at pixel row y, and what part of it that row is:
 *  0 none, 1 cap, 2 glass, 3 collar, 4 base. A pure function of y. */
export function lampRow(y) {
  if (y >= CAP_TOP && y < CAP_BOT) {
    const s = (y - CAP_TOP) / (CAP_BOT - CAP_TOP)
    return [1, 13 + 12 * s]
  }
  if (y >= GLASS_TOP && y < GLASS_BOT) {
    const s = (y - GLASS_TOP) / (GLASS_BOT - GLASS_TOP)
    const hw = s < 0.76 ? 23 + 23 * Math.pow(s / 0.76, 1.15) : 46 - 10 * Math.pow((s - 0.76) / 0.24, 2)
    return [2, hw]
  }
  if (y >= GLASS_BOT && y < COLLAR_BOT) return [3, 38]
  if (y >= COLLAR_BOT && y < BASE_BOT) {
    const s = (y - COLLAR_BOT) / (BASE_BOT - COLLAR_BOT)
    return [4, 31 + 27 * Math.pow(s, 1.3)]
  }
  return [0, 0]
}

// The wax: five free blobs and two pools (one resting on the bottom of the
// glass, a smaller one stuck under the cap), summed as a metaball field.
// w: the blob's own rate against the shared phase; o: its offset; r: radius.
const BLOBS = [
  { w: 0.71, o: 0.0, r: 12, xw: 1.3, xo: 0.4 },
  { w: 0.93, o: 2.1, r: 9, xw: 1.7, xo: 2.0 },
  { w: 0.58, o: 4.0, r: 14, xw: 1.1, xo: 4.4 },
  { w: 1.17, o: 1.2, r: 7, xw: 2.1, xo: 1.0 },
  { w: 0.83, o: 5.3, r: 10, xw: 1.5, xo: 3.3 },
]
// The metaball kernel is COMPACT -- (1 - d^2/4r^2)^2 inside 2r, nothing
// beyond -- so two blobs only merge when they actually meet. The first cut
// summed r^2/d^2, whose long tails added up across seven blobs and fused the
// wax into one column the height of the glass: a lamp full of wax, not a
// lamp with wax in it. A lone blob's edge (d = r) sits at WAX_EDGE.
const WAX_EDGE = 0.5625
const WAX_FRINGE = 0.3

// --- the music ----------------------------------------------------------------
export const KICK_GAP_S = 0.22   // least time between two kicks
export const KICK_HOLD_S = 0.14  // the flare holds this long at full...
const KICK_TAU = 0.3             // ...then releases on this time constant
const BEAT_RISE = 0.3            // a pulse jump this big is a kick
const LOUD_TAU = 0.6             // the glow's breath, seconds
const RENDER_HZ = 30             // the bitmaps are rebuilt at most this often
const clamp01 = (v) => Math.min(1, Math.max(0, v || 0))

// Pixel tiers -> attributes. 0 is "nothing here", never an attribute
// (NORMAL is attribute 0 -- flame.js's trap).
const TIER_ATTR = [0, FAINT, DIM, MUTED, NORMAL, BRIGHT]
// 4x4 ordered dither: a regular screen reads as a deliberate treatment.
const BAYER_RAW = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const BAYER = BAYER_RAW.map((v) => (v + 0.5) / 16)
// BAYER_MASK[n * 4 + row]: the 4-pixel row of one dither tile with n of its
// 16 pixels lit, leftmost pixel in the high bit. (d > BAYER[k] for d = n/16
// is exactly BAYER_RAW[k] < n, so the fast path and the per-pixel path agree.)
const BAYER_MASK = new Uint8Array(17 * 4)
for (let n = 0; n <= 16; n++) {
  for (let r = 0; r < 4; r++) {
    let m = 0
    for (let c = 0; c < 4; c++) if (BAYER_RAW[r * 4 + c] < n) m |= 8 >> c
    BAYER_MASK[n * 4 + r] = m
  }
}

// --- haze: value noise, two octaves -----------------------------------------
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

/** Haze density at canvas pixel (x, y), effect time t: banks of smoke,
 *  stretched sideways, drifting right and rising, heavier toward the
 *  ceiling. A pure function of (x, y, t) at FIXED rates -- nothing from the
 *  audio -- so the music can never jump it. */
export function hazeAt(x, y, t, H) {
  // Domain-warped, so the banks curl rather than sit in round patches, and
  // stretched ~8:1 sideways, so they lie in layers the way smoke does in a
  // still room. The first cut was 3:1 with a tight threshold and rendered
  // as camouflage: hard-edged blots, which is a texture, not a haze.
  const w = vnoise(x / 110 + 3.7, y / 46 - t * 0.07)
  const u = x / 150 + t * 0.04 + 1.1 * w
  const v = y / 19 + t * 0.2 + 0.6 * w
  const n = 0.65 * vnoise(u, v) + 0.35 * vnoise(u * 2.3 + 7.1, v * 2.1 - t * 0.1)
  return smooth(0.38, 0.92, n) * (0.25 + 0.75 * (1 - y / H))
}

export default {
  key: 'flowfield',
  label: 'LAVA LAMP',
  decay: 0.88,
  init(p) {
    p._lava = null
    p._lavaLoud = 0.4
    p._lavaPhase = 0
    p._lavaLastT = null
    p._lavaRenderT = -Infinity
    p._lavaKickAt = -Infinity
    p._lavaKickAmt = 0
    p._lavaPrevPulse = 0
  },
  /** Buffers for a grid `term.cols` wide: two bitmaps per cell, the cell's
   *  lit flag and attribute, and the coarse haze grid. */
  alloc(p, term) {
    const { cellW, cellH } = term.font
    const rows = VIZ_BOT - 1
    const W = term.cols * cellW, H = rows * cellH
    const GW = (W >> 2) + 2, GH = (H >> 2) + 2
    p._lava = {
      cols: term.cols, rows, cellW, cellH, W, H, GW, GH,
      roomN: new Uint8Array(GW * GH), // the room per 4x4 block: lit pixels of 16
      roomT: new Uint8Array(GW * GH), // ...and its tier (lit by the lamp or not)
      HW8: (W >> 3) + 2, HH8: (H >> 3) + 2, hz8: new Float32Array(((W >> 3) + 2) * ((H >> 3) + 2)),
      haloX: new Float32Array(GW),
      ctx: { cx: 0, nb: 0, waxTier: 0, liquidTier: 0, liquid: 0, muted: false },
      bx: new Float32Array(8), by: new Float32Array(8), bir2: new Float32Array(8), biy: new Float32Array(8),
      bufs: [0, 1].map(() => Array.from({ length: term.cols * rows }, () => new Uint16Array(cellH))),
      lit: new Uint8Array(term.cols * rows),
      tier: new Uint8Array(term.cols * rows),
      front: 0,
    }
  },
  /** Re-arms the clocks on every visualizer entry. The loudness and the
   *  wax's phase are a level and a position, not clocks, and carry over. */
  reset(p) {
    p._lavaLastT = null
    p._lavaRenderT = -Infinity
    p._lavaKickAt = -Infinity
    p._lavaKickAmt = 0
    p._lavaPrevPulse = 0
  },
  draw(p, s, t) {
    const { term } = s
    if (!p._lava || p._lava.cols !== term.cols) this.alloc(p, term)
    const F = p._lava
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    // --- clocks: the breath, the wax, the kick ---------------------------
    const dt = p._lavaLastT === null ? 0 : Math.min(0.25, Math.max(0, t - p._lavaLastT))
    p._lavaLastT = t
    if (p._lavaLoud === undefined) p._lavaLoud = 0.4
    p._lavaLoud += (clamp01(A.level) - p._lavaLoud) * (1 - Math.exp(-dt / LOUD_TAU))
    const loud = muted ? 0 : p._lavaLoud
    // Accumulated, so a change of level changes the SPEED of the wax, never
    // where it is.
    p._lavaPhase = (p._lavaPhase || 0) + dt * (0.16 + 0.26 * loud)
    const pulse = A.pulse || 0
    if (!muted && t - p._lavaKickAt >= KICK_GAP_S &&
        (pulse - (p._lavaPrevPulse || 0) >= BEAT_RISE || A.onset)) {
      p._lavaKickAt = t
      p._lavaKickAmt = 0.7 + 0.3 * clamp01(A.bass)
      p._lavaRenderT = -Infinity // the flare lands on this frame, not the next render tick
    }
    p._lavaPrevPulse = pulse
    const since = t - p._lavaKickAt
    const kick = muted || !(since >= 0) ? 0
      : p._lavaKickAmt * (since < KICK_HOLD_S ? 1 : Math.exp(-(since - KICK_HOLD_S) / KICK_TAU))

    // A clock that went backwards (re-entry) re-renders at once.
    if (t < p._lavaRenderT) p._lavaRenderT = -Infinity
    if (t - p._lavaRenderT >= 1 / RENDER_HZ) {
      p._lavaRenderT = t
      renderLamp(F, t, p._lavaPhase, loud, kick, muted)
    }
    const bufs = F.bufs[F.front]
    for (let cy = 0; cy < F.rows; cy++) {
      for (let cx = 0; cx < F.cols; cx++) {
        const i = cy * F.cols + cx
        // Re-put every frame: anything that wrote over a cell in between
        // gets the picture back on this tick (same-reference is a no-op).
        if (F.lit[i]) term.putGlyph(cx, cy + 1, bufs[i], TIER_ATTR[F.tier[i]])
        else term.put(cx, cy + 1, ' ')
      }
    }
  },
}

/** Where blob `b` is at wax phase `ph`, in glass-relative terms: s (0 top,
 *  1 bottom), the x swing as a share of the glass, and its stretch. */
export function blobAt(b, ph) {
  const a = ph * b.w + b.o
  // Rise and fall with a dwell at each end: a cosine pushed through a
  // smoothstep, so the wax lingers at the top and bottom like real wax.
  const c = 0.5 - 0.5 * Math.cos(a)
  const e = c * c * (3 - 2 * c)
  const sy = 0.1 + 0.78 * e
  const vel = Math.abs(Math.sin(a)) * (1 - Math.abs(2 * c - 1))
  return { sy, sx: 0.42 * Math.sin(ph * b.xw + b.xo), stretch: 1.1 + 0.55 * vel }
}

function renderLamp(F, t, ph, loud, kick, muted) {
  const { W, H, GW, GH, roomN, roomT } = F
  const cx = W >> 1

  // The lamp's light: a halo centred low in the glass, reaching further as
  // the music gets louder and blowing out on a kick.
  const gy0 = (GLASS_TOP + GLASS_BOT) * 0.56
  const reach = muted ? 0.55 : 0.75 + 0.6 * loud + 1.3 * kick
  const irx2 = 1 / Math.pow(70 * reach, 2), iry2 = 1 / Math.pow(105 * reach, 2)
  const glow = muted ? 0.45 : 0.7 + 0.3 * loud + 0.6 * kick
  // The room -- haze lit by the lamp -- on a coarse grid every 4 pixels,
  // bilinear per pixel below. Everything costly (the noise, the halo's exp)
  // happens here, 1/16th as often as per pixel.
  // The noise itself is smooth at 8px, so it is sampled there and
  // interpolated onto the 4px blocks; the halo is separable, so its exp is
  // a row term times a column term. Together those were most of a render.
  const { hz8, HW8, HH8, haloX } = F
  for (let gy = 0; gy < HH8; gy++) for (let gx = 0; gx < HW8; gx++) hz8[gy * HW8 + gx] = hazeAt(gx * 8, gy * 8, t, H)
  for (let gx = 0; gx < GW; gx++) { const dx = gx * 4 + 2 - cx; haloX[gx] = Math.exp(-dx * dx * irx2) }
  for (let gy = 0; gy < GH; gy++) {
    const y = gy * 4 + 2, dy = y - gy0
    const ly = glow * Math.exp(-dy * dy * iry2)
    const hy = y / 8, h0 = Math.min(HH8 - 2, hy | 0), fy = hy - h0
    for (let gx = 0; gx < GW; gx++) {
      // Light this faint does nothing: cut to zero, so the far room is
      // exactly the haze whatever the music does (a test holds that).
      const L0 = ly * haloX[gx], L = L0 < 0.01 ? 0 : L0
      const i = gy * GW + gx
      const hx = (gx * 4 + 2) / 8, k0 = Math.min(HW8 - 2, hx | 0), fx = hx - k0
      const j = h0 * HW8 + k0
      const a = hz8[j] + (hz8[j + 1] - hz8[j]) * fx
      const b = hz8[j + HW8] + (hz8[j + HW8 + 1] - hz8[j + HW8]) * fx
      const d = (a + (b - a) * fy) * (0.13 + 1.0 * L) + 0.06 * L
      roomN[i] = Math.min(16, Math.round(d * 16))
      roomT[i] = L > 0.3 ? 3 : 2
    }
  }

  // The wax, placed once per render.
  const swell = 1 + 0.22 * kick
  const gh = GLASS_BOT - GLASS_TOP
  const bx = F.bx, by = F.by, bir2 = F.bir2, biy = F.biy
  let nb = 0
  for (const b of BLOBS) {
    const q = blobAt(b, ph)
    const y = GLASS_TOP + q.sy * gh
    const r = b.r * swell
    const hw = lampRow(y | 0)[1]
    bx[nb] = cx + q.sx * (hw - r * 1.2); by[nb] = y
    bir2[nb] = 1 / (4 * r * r); biy[nb] = 1 / (q.stretch * q.stretch); nb++
  }
  // The pools: one resting on the bottom (wide and flat), one stuck under the cap.
  bx[nb] = cx; by[nb] = GLASS_BOT + 4; bir2[nb] = 1 / Math.pow(2 * 26 * swell, 2); biy[nb] = 1 / 0.25; nb++
  bx[nb] = cx + 4 * Math.sin(ph * 0.9); by[nb] = GLASS_TOP - 3; bir2[nb] = 1 / Math.pow(2 * 10 * swell, 2); biy[nb] = 1 / 0.45; nb++
  const waxTier = muted ? 3 : kick > 0.5 ? 5 : 4
  const liquidTier = muted ? 2 : 3
  const liquid = muted ? 0.1 : 0.14 + 0.08 * loud + 0.22 * kick

  F.front ^= 1
  F.lit.fill(0)
  F.tier.fill(0)
  const R = F.ctx
  R.cx = cx; R.nb = nb; R.waxTier = waxTier; R.liquidTier = liquidTier; R.liquid = liquid; R.muted = muted
  const bufs = F.bufs[F.front]
  for (let py = 0; py < H; py++) shadeRow(F, R, bufs, py)
}

/** One pixel row of the canvas into the cell bitmaps. Its own function
 *  rather than the body of renderLamp's loop: as one function with the
 *  loops nested inside, V8 kept optimising it on-stack mid-loop and
 *  throwing that away on the way out (81 "exit from OSR'd inner loop"
 *  deopts in a 60-render bench, ~80ms a render). */
function shadeRow(F, R, bufs, py) {
  const { cellW, cellH, cols, roomN, roomT, GW, bx, by, bir2, biy } = F
  const { cx, nb, waxTier, liquidTier, liquid, muted } = R
  const tierOut = F.tier, lit = F.lit
  const gh = GLASS_BOT - GLASS_TOP
  {
    const cy = (py / cellH) | 0
    const ry = py - cy * cellH
    const lr = lampRow(py)
    const kind = lr[0], hwRow = lr[1]
    const g0 = py >> 2
    const sGlass = kind === 2 ? (py - GLASS_TOP) / gh : 0
    const liquidRow = liquid + 0.32 * Math.pow(sGlass, 4) * (muted ? 0.5 : 1)
    const metalRim = (kind === 1 && py < CAP_TOP + 2) || (kind === 3 && py < GLASS_BOT + 1) ||
      (kind === 4 && py < COLLAR_BOT + 1) || py >= BASE_BOT - 1
    const brow = (ry & 3) * 4
    // The lamp spans these columns on this row; every other cell is room
    // (or the dark under the shelf) and takes the block fast path.
    const lampX0 = kind ? cx - hwRow : 1e9, lampX1 = kind ? cx + hwRow : -1e9
    const r4 = ry & 3
    for (let ccx = 0; ccx < cols; ccx++) {
      const ci = cy * cols + ccx
      let bits = 0
      let tierMax = 0
      const cx0 = ccx * cellW
      if (py !== SHELF_Y && (cx0 + cellW <= lampX0 || cx0 > lampX1)) {
        if (py < SHELF_Y) {
          // A coarse block is 4x4 pixels, exactly one tile of the ordered
          // dither, so its lit pixels are a lookup: no per-pixel work for
          // the ~85% of the canvas that is haze.
          for (let b = cx0 >> 2, bEnd = (cx0 + cellW) >> 2; b < bEnd; b++) {
            const i0 = g0 * GW + b
            const m = BAYER_MASK[roomN[i0] * 4 + r4]
            bits = (bits << 4) | m
            if (m && roomT[i0] > tierMax) tierMax = roomT[i0]
          }
        }
        bufs[ci][ry] = bits
        if (bits) lit[ci] = 1
        if (tierMax > tierOut[ci]) tierOut[ci] = tierMax
        continue
      }
      for (let px0 = 0; px0 < cellW; px0++) {
        const px = ccx * cellW + px0
        const dx = px - cx
        const adx = dx < 0 ? -dx : dx
        let d = 0, tier = 0
        if (kind !== 0 && adx <= hwRow) {
          const edge = hwRow - adx
          if (kind === 2) {
            // The glass: its rim, the liquid (lit from the bulb below), the wax.
            if (edge < 1.5) { d = 0.8; tier = 3 }
            else {
              let f = 0
              for (let k = 0; k < nb; k++) {
                const ex = px - bx[k], ey = py - by[k]
                const q = 1 - (ex * ex + ey * ey * biy[k]) * bir2[k]
                if (q > 0) f += q * q
              }
              if (f >= WAX_EDGE) { d = 1; tier = waxTier }
              else if (f > WAX_FRINGE) { d = 0.2 + 0.6 * (f - WAX_FRINGE) / (WAX_EDGE - WAX_FRINGE); tier = waxTier }
              else { d = liquidRow; tier = liquidTier }
            }
          } else if (edge < 1.5 || metalRim) { d = 1; tier = 3 }
          // The metal: dark against the lit haze, one rim, one highlight.
          else if (dx < 0 && adx > hwRow * 0.4 && adx < hwRow * 0.58) { d = 0.5; tier = 3 }
          else { d = 0.07; tier = 2 }
        } else if (py === SHELF_Y) {
          if (adx < SHELF_HW) { d = 1 - 0.6 * adx / SHELF_HW; tier = 3 }
        } else if (py < SHELF_Y) {
          // The room, beside the lamp: the same block value the fast path
          // below reads, so the two meet without a seam.
          const i0 = g0 * GW + (px >> 2)
          d = roomN[i0] / 16; tier = roomT[i0]
        }
        if (d > BAYER[brow + (px0 & 3)]) {
          bits |= 1 << (cellW - 1 - px0)
          if (tier > tierMax) tierMax = tier
        }
      }
      bufs[ci][ry] = bits
      if (bits) lit[ci] = 1
      if (tierMax > tierOut[ci]) tierOut[ci] = tierMax
    }
  }
}
