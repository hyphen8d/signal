// SIGNAL -- visualizer effect "OUTRUN". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.
//
// 2026-10-16 (design pass) -- the critique, off the real tube: the sun did
// not read as a sun ("a stepped temple or mound"); the horizon glow, drawn
// full width AFTER the sun, erased the sun's bottom two rows -- exactly
// where its slice-gaps were; the skyline was FAINT `█` slabs; the BRIGHT
// `=` rungs outshone the sun; and a roadside scatter of `' , \ .` hid the
// vanishing-point grid. What changed:
//   - THE SUN is a disc at the tube's real cell aspect (SUN_ASPECT: a cell
//     is ~2.3x as tall as it is wide on the 4:3 face, and the old disc used
//     1:1, which is why it stood tall and narrow like a temple), drawn in
//     half-blocks so it has twice the vertical resolution, solid and
//     BRIGHT, with the genre's slices cut across its lower half and
//     thickening toward the horizon. No `░▒▓` gradient -- those raster as
//     stepped rectangles, which was the other half of "temple".
//   - The glow rows skip the sun's span, and the skyline skips it too.
//   - The skyline is `▓` in DIM (the brief's fix said `▓`; DIM rather than
//     FAINT, since FAINT is not there at all under some tints).
//   - The rungs are capped at NORMAL, the horizon line is NORMAL: the sun
//     is the one BRIGHT thing on screen.
//   - The roadside scatter is cut by ~70% (GRASS_SCALE).
//   - THE BEAT. The rubric wants one, and the old notes refused an onset
//     hook because a per-beat FLASH would strobe a slow drive. So the beat
//     is not a flash: a kick SWELLS the sun (radius +SUN_SWELL rows,
//     easing back over ~0.4s) and steps its slices down half a row -- the
//     classic sunset's slow stripe crawl, advanced by the music. Bass leans
//     the sun's size a little, as it used to lean its shading.
//   - MUTED was never handled here (the effect read p._au alone, so muted
//     looked exactly like NO TAP). Muted, the road coasts at its quiet
//     floor and the sun drops to NORMAL: faint, still driving.
//
// 2026-10-20 (polish) -- the critique, off the real tube: the sun read as
// "a stepped dome on two loose bars" (a hamburger, a UFO) -- half-blocks
// still stair-step a curve, and the slices were whole cell rows; the grid
// was broken `\` `/` marks with 2-3 row gaps mixed with roadside `' , "`,
// which read as RAIN, not a floor; the horizon and rungs were `=====` rows
// that read as text underlines; the skyline was four isolated `▓` posts.
// The kick's swell passed (rubric 2) and is kept as it was. Following the
// set rule that soft and round things go through pixels, and keeping the
// subject and composition (sun on the horizon, skyline, receding grid,
// palms, birds and stars):
//   - THE SUN is a pixel disc (term.putGlyph, NEON HEART's packer), round
//     at the face's real aspect, BRIGHT, anti-aliased at its rim, with its
//     slices cut as dark pixel gaps that thicken toward the horizon
//     (SLICE_PERIOD / SLICE_GAP_MAX). The kick still swells it and steps the
//     slices down.
//   - THE GRID is pixels: true perspective, so the rungs are continuous
//     lines that thicken as they come toward the viewer and the rails are
//     unbroken lines out of the vanishing point (each rail fills the whole
//     span it crosses in a pixel row, so a shallow one never breaks into
//     dashes). Rungs MUTED at most, rails up to MUTED, both fading into the
//     distance; the horizon a 2px NORMAL line. Full width -- the floor is
//     the grid.
//   - The roadside scatter is gone (it was the "rain").
//   - THE SKYLINE is one continuous silhouette band either side of the sun:
//     black bodies that occlude the horizon glow, a MUTED outline along the
//     roofline, a few dim windows.
//   - The palms are pixel silhouettes (a leaning trunk, drooping fronds)
//     planted between the rails, at the same perspective as the grid --
//     their old `\*/` and `|||` marks were half of the rain.
//   - Stars and birds stay characters, in the sky's empty cells.
// Per-cell beam tiers here (NEON HEART's: the lowest tier that reaches a
// cell's brightest pixel), unlike ORBIT's single tier: this picture is
// lines on black, which a tier per cell draws solid, and the sun has to be
// BRIGHT where the floor must not be.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, auMul } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2, visualizerLevelAttr } = await import(`./shared.js?v=${V}`)

// OUTRUN flair -- palm trees and city skyline. 2026-10-20: palms are
// planted between rails, in rail units (rail k sits at k x RAIL_SPACING
// world units from the road's centre line).
export const OUTRUN_PALM_RAILS = [-4.5, -2.5, 2.5, 4.5]

// The sun. Radius in ROWS (one row = 16 framebuffer pixels); its width
// comes from the face's aspect, not from a constant: 8x16 cells plus the
// blank ninth column, stretched onto a 4:3 face, make a framebuffer pixel
// ~0.74 as wide as it is tall (the ~2.3:1 cell the 10-16 pass measured).
export const HORIZON_Y = 8
export const SUN_R = 6.2
export const SUN_SWELL = 0.9
const SWELL_TAU = 0.22
// Slices across the lower SLICE_FRAC of the sun: a dark gap every
// SLICE_PERIOD pixels, 1px thin at the top of the band and SLICE_GAP_MAX
// at the horizon. A kick steps them down by SLICE_STEP pixels.
export const SLICE_FRAC = 0.55
export const SLICE_PERIOD = 9
export const SLICE_GAP_MAX = 5
const SLICE_STEP = 3

// The floor's perspective. A pixel row d pixels under the horizon sees
// the ground at depth z = FOCAL / d (camera one unit up). Rungs every
// RUNG_SPACING units of depth, RUNG_WIDTH thick; rails RAIL_SPACING units
// apart across the road, out to RAILS either side.
export const FOCAL = 400
export const RUNG_SPACING = 1.5
const RUNG_WIDTH = 0.07
export const RAIL_SPACING = 0.3
const RAILS = 12

// Pixel intensities, on src/term.js's 0..255 beam scale.
const LV_BRIGHT = 255, LV_NORMAL = 205, LV_MUTED = 180, LV_DIM = 150, LV_FAINT = 100
const SUN_LUM = 255, SUN_LUM_MUTED = 205
const HORIZON_LUM = 205, HORIZON_LUM_MUTED = 150
// Floor lines: far .. near. Rungs top out at MUTED; so do rails.
const RUNG_FAR = 128, RUNG_NEAR = 180
const RAIL_FAR = 135, RAIL_NEAR = 186
const PALM_FAR = 120, PALM_NEAR = 176
const SKY_EDGE = 176, WINDOW_LUM = 140
// A short, dim fringe over the horizon line. 26px of it showed as dithered
// boxes beside the sun and over the low roofs (a cell tier per cell).
const GLOW_LUM = 90, GLOW_PX = 9
const CELL_MIN = 12
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16)
export const tierOf = (m) => (m >= 232 ? BRIGHT : m >= 193 ? NORMAL : m >= 166 ? MUTED : m >= 126 ? DIM : FAINT)
const levelOf = (a) => (a === BRIGHT ? LV_BRIGHT : a === NORMAL ? LV_NORMAL : a === MUTED ? LV_MUTED : a === DIM ? LV_DIM : LV_FAINT)
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Framebuffer geometry for a term: pixel aspect, the horizon's pixel row,
 *  the sun's centre. Exported so tests read the same numbers. */
export function geometry(term) {
  const { cellW, cellH } = term.font
  const adv = cellW + 1
  const FW = term.cols * adv, FH = (VIZ_BOT - 1) * cellH
  // Display width of one framebuffer pixel, relative to its height.
  const pxW = (4 / 3) / (FW / (term.rows * cellH))
  // The horizon is the top of row HORIZON_Y; canvas pixel row 0 is row 1.
  const hY = (HORIZON_Y - 1) * cellH
  return { cellW, cellH, adv, FW, FH, pxW, hY, cx: FW / 2 }
}

/** Is the sun lit at framebuffer pixel (X, Y)? Returns coverage 0..1 (the
 *  rim is anti-aliased); 0 in a slice gap. */
export function sunCoverage(X, Y, G, r, slice) {
  const dy = G.hY - (Y + 0.5)
  if (dy <= 0) return 0
  const rp = r * G.cellH
  const dx = (X + 0.5 - G.cx) * G.pxW
  const dist = Math.sqrt(dx * dx + dy * dy)
  const cov = clamp01(rp - dist + 0.5)
  if (cov <= 0) return 0
  const band = rp * SLICE_FRAC
  if (dy < band) {
    const gap = 1 + Math.round((SLICE_GAP_MAX - 1) * (1 - dy / band))
    const u = (((Math.floor(dy) - slice * SLICE_STEP) % SLICE_PERIOD) + SLICE_PERIOD) % SLICE_PERIOD
    if (u < gap) return 0
  }
  return cov
}

/** Per-width state, built on first draw and rebuilt if the width changes:
 *  the pixel buffer, the skyline's roofline, and the bitmap buffers. */
function build(term) {
  const G = geometry(term)
  const { FW, FH, cellH } = G
  const cols = term.cols, rows = VIZ_BOT - 1
  // Skyline: contiguous buildings, 1-3 cells wide, 8-34px tall. Heights are
  // hashed per building so the roofline is stable frame to frame.
  const roof = new Int16Array(FW)
  const bld = new Int16Array(FW)
  const windows = []
  let id = 0
  for (let X = 0; X < FW; id++) {
    const w = Math.round((1 + hash2(id, 512) * 2.2) * G.adv)
    const ht = 8 + Math.floor(hash2(id, 514) * hash2(id, 515) * 30) + Math.floor(hash2(id, 513) * 6)
    for (let k = 0; k < w && X + k < FW; k++) { roof[X + k] = ht; bld[X + k] = id }
    // A few windows: 2x2 dots on a 5px grid, one in three lit.
    for (let wy = G.hY - ht + 5; wy < G.hY - 3; wy += 5) {
      for (let wx = X + 3; wx < X + w - 3; wx += 5) {
        if (hash2(wx, wy) > 0.72) windows.push([wx, wy, id])
      }
    }
    X += w
  }
  // The sun's widest reach, so the skyline keeps clear of it however far
  // the kick swells it (a gap that tracked the swell made the skyline's
  // inner ends twitch on every beat).
  const sunClear = ((SUN_R + SUN_SWELL + 0.4) * cellH) / G.pxW + 2 * G.adv
  return {
    ...G, cols, rows, roof, bld, windows, sunClear,
    lum: new Uint8Array(FW * FH),
    // Two bitmaps per cell, alternated per frame: putGlyph() skips a
    // same-reference re-put, so a bitmap rewritten in place never shows.
    bufs: [0, 1].map(() => Array.from({ length: cols * rows }, () => new Uint16Array(cellH))),
    front: 0,
  }
}

/** Lights a horizontal span of a pixel row, keeping the brighter value. */
function span(G, Y, x0, x1, v) {
  if (Y < 0 || Y >= G.FH) return
  const a = Math.max(0, Math.floor(x0)), b = Math.min(G.FW - 1, Math.floor(x1))
  const o = Y * G.FW
  for (let x = a; x <= b; x++) if (v > G.lum[o + x]) G.lum[o + x] = v
}

export default {
  key: 'outrun',
  label: 'OUTRUN',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    // OUTRUN's sky-field stars (45th pass) -- fixed positions/phases so the
    // sky doesn't reshuffle every frame. 45th pass: 26 -> 46 (live QA: "too
    // much white space").
    p._outrunStars = Array.from({ length: 46 }, () => ({
      x: Math.random() * term.cols,
      y: 1 + Math.random() * 6,
      phase: Math.random() * 10,
      speed: 0.5 + Math.random() * 0.8,
    }))
    // OUTRUN's birds (48th pass) -- live QA: "add some clouds on either
    // side of the sun or something that looks like seagulls/birds." A
    // handful of caret-glyph birds gliding across the upper sky,
    // alternating ^/v as a wingbeat, drifting slowly right and wrapping.
    p._outrunBirds = Array.from({ length: 6 }, () => ({
      x: Math.random() * term.cols,
      y: 1 + Math.random() * 4,
      speed: 0.6 + Math.random() * 1.0,
      flapPhase: Math.random() * 10,
      bobPhase: Math.random() * 10,
    }))
    // 2026-08-23 (live audio tap) -- OUTRUN's road-speed phase accumulator.
    // The road used to scroll on raw `t * 0.6`; with the tap live the RATE
    // of that scroll follows the track's level, which can't be done by
    // scaling `t` per frame (the geometry would teleport on every level
    // change), so the phase integrates instead. Neutral rate is exactly
    // 0.6/s. Reset on every visualizer entry alongside the effect clock.
    p._outrunPhase = 0
    p._outrunPhaseT = 0
    // 2026-10-16 (design pass) -- the kick: the sun's swell envelope, its
    // slice phase (steps taken), and the last onset/pulse state for the
    // rising edge.
    p._outrunSwell = 0
    p._outrunSlice = 0
    p._outrunPrevHit = false
    p._outrunG = null
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    p._outrunPhase = 0
    p._outrunPhaseT = 0
    p._outrunSwell = 0
    p._outrunPrevHit = false
  },
  // OUTRUN effect (44th pass, fidelity pass in the 45th) -- for CIRCUIT
  // CRUSH, which already carries the heaviest bloom on the roster and a
  // tagline that names the shot directly ("the long drive home"). The
  // genre's own signature image: a perspective grid receding to a
  // vanishing point, rungs sliding toward the viewer, a horizon-sliced
  // sun. Slowest, most hypnotic motion of the roster on purpose -- the
  // tagline is about a drive that never quite ends, not a rush.
  draw(p, s, t) {
    const { term } = s
    if (!p._outrunG || p._outrunG.cols !== term.cols) p._outrunG = build(term)
    const G = p._outrunG
    const { FW, FH, hY, cx, pxW, lum } = G
    // 2026-08-23 (live audio tap) -- the car drives at the music's
    // intensity, integrated per frame at a level-scaled rate (neutral
    // exactly 0.6/s). 65th pass: the range widened 0.5-1.5 -> 0.3-2.2, so
    // quiet passages coast and loud ones surge.
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : p._au
    if (t < p._outrunPhaseT) p._outrunPhaseT = t
    const dt = Math.min(0.1, Math.max(0, t - p._outrunPhaseT))
    p._outrunPhase += dt * 0.6 * auMul(A, A ? A.level : 0, 0.3, 2.2)
    p._outrunPhaseT = t
    // 2026-10-16 (design pass) -- the kick: a rising edge of onset/pulse,
    // never a level, so steady loud audio swells nothing.
    const hit = !!A && !muted && (A.onset || A.pulse > 0.6)
    if (hit && !p._outrunPrevHit) { p._outrunSwell = 1; p._outrunSlice = (p._outrunSlice + 1) % SLICE_PERIOD }
    p._outrunPrevHit = hit
    p._outrunSwell *= Math.exp(-dt / SWELL_TAU)
    const sunR = SUN_R + SUN_SWELL * p._outrunSwell + (A ? (A.bass - 0.5) * 0.5 : 0)
    // The road's scroll, in world units of depth: the old rungs moved 1.33
    // rung-spacings per unit of phase, and so do these.
    const off = p._outrunPhase * RUNG_SPACING * 1.333

    lum.fill(0)
    // --- sky: horizon glow, skyline, sun ------------------------------------
    const glowTop = muted ? GLOW_LUM * 0.6 : GLOW_LUM
    for (let k = 1; k <= GLOW_PX; k++) {
      const f = 1 - k / GLOW_PX
      span(G, hY - k, 0, FW - 1, Math.round(glowTop * f * f))
    }
    // Skyline: one continuous band, black bodies with a MUTED roofline
    // (and the steps between roofs), clear of the sun.
    const { roof, bld, windows, sunClear } = G
    for (let X = 0; X < FW; X++) {
      if (Math.abs(X + 0.5 - cx) < sunClear) continue
      const h = roof[X]
      for (let Y = hY - h + 1; Y < hY; Y++) lum[Y * FW + X] = 0
      lum[(hY - h) * FW + X] = SKY_EDGE
      // A vertical edge where the roof steps, so the outline is unbroken.
      const hp = X > 0 ? roof[X - 1] : h
      if (hp !== h && Math.abs(X - 0.5 - cx) >= sunClear) {
        for (let Y = hY - Math.max(h, hp); Y <= hY - Math.min(h, hp); Y++) lum[Y * FW + X] = SKY_EDGE
      }
    }
    // One slow-flickering window in three, per building.
    for (const [wx, wy, id] of windows) {
      if (Math.abs(wx + 1 - cx) < sunClear) continue
      if (hash2(id * 7 + wx, Math.floor(t * 0.4 + id)) < 0.55) continue
      span(G, wy, wx, wx + 1, WINDOW_LUM)
      span(G, wy + 1, wx, wx + 1, WINDOW_LUM)
    }
    // The sun (2026-10-20): a pixel disc, sliced; a slice gap is black, so
    // it cuts the glow behind it too.
    const sunLum = muted ? SUN_LUM_MUTED : SUN_LUM
    const rp = sunR * G.cellH
    const halfW = rp / pxW + 1
    const sy0 = Math.max(0, Math.floor(hY - rp - 1))
    const sx0 = Math.max(0, Math.floor(cx - halfW)), sx1 = Math.min(FW - 1, Math.ceil(cx + halfW))
    for (let Y = sy0; Y < hY; Y++) {
      const o = Y * FW
      for (let X = sx0; X <= sx1; X++) {
        const dy = hY - (Y + 0.5), dx = (X + 0.5 - cx) * pxW
        if (dx * dx + dy * dy > (rp + 1) * (rp + 1)) continue
        const c = sunCoverage(X, Y, G, sunR, p._outrunSlice)
        lum[o + X] = c > 0 ? Math.max(lum[o + X], Math.round(sunLum * c)) : 0
      }
    }
    // The horizon: a 2px NORMAL line, full width.
    const hl = muted ? HORIZON_LUM_MUTED : HORIZON_LUM
    span(G, hY, 0, FW - 1, hl)
    span(G, hY + 1, 0, FW - 1, hl)

    // --- floor: rungs and rails in perspective ------------------------------
    const a = RAIL_SPACING / pxW // framebuffer px of rail offset, per rail, per px of depth
    for (let Y = hY + 2; Y < FH; Y++) {
      const d = Y - hY
      const prox = clamp01(d / (FH - hY))
      // Distance fog: the far rungs bunch into a band of stripes at the
      // horizon, so they fade toward it -- distance, not texture.
      const fog = Math.pow(clamp01((d - 3) / 60), 0.7)
      // Rungs: is a rung line inside the depth this pixel row covers?
      const zN = FOCAL / (d + 0.5), zF = FOCAL / (d - 0.5)
      const lo = (zN - RUNG_WIDTH / 2 + off) / RUNG_SPACING, hi = (zF + RUNG_WIDTH / 2 + off) / RUNG_SPACING
      if (Math.floor(hi) >= Math.ceil(lo)) {
        // A row that spans more than one rung is distance mush: thin it to
        // a dither rather than letting the far grid fill in solid.
        const mush = (hi - lo > 0.5 ? 0.5 / (hi - lo) : 1) * fog
        span(G, Y, 0, FW - 1, Math.round((RUNG_FAR + (RUNG_NEAR - RUNG_FAR) * prox) * mush))
      }
      // Rails: each fills the span it crosses in this row, so a shallow
      // rail is a line, not dashes. Thicker as it nears; faded out of the
      // vanishing point, where they converge.
      const fade = clamp01(d / 50)
      const rv = Math.round((RAIL_FAR + (RAIL_NEAR - RAIL_FAR) * prox) * (0.15 + 0.85 * fade))
      const th = 0.5 + d / 220
      for (let k = -RAILS; k <= RAILS; k++) {
        const x0 = cx + k * a * (d - 0.5), x1 = cx + k * a * (d + 0.5)
        span(G, Y, Math.min(x0, x1) - th, Math.max(x0, x1) + th, rv)
      }
    }
    // Palms (48th pass; pixels 2026-10-20): planted between the rails at
    // the grid's own perspective, so a tree tracks the road it stands by.
    // Each loops from the distance to past the viewer at the road's speed.
    const PALM_SPAN = 12.5, PALM_FAR_Z = 14
    for (let i = 0; i < OUTRUN_PALM_RAILS.length; i++) {
      const z = PALM_FAR_Z - ((off + i * 3.1) % PALM_SPAN)
      const d = FOCAL / z
      const baseY = hY + d
      if (baseY >= FH + 40) continue
      const bx = cx + OUTRUN_PALM_RAILS[i] * a * d
      const v = Math.round(PALM_FAR + (PALM_NEAR - PALM_FAR) * clamp01(d / (FH - hY)))
      const tall = 0.34 * d
      const lean = Math.sign(OUTRUN_PALM_RAILS[i]) * 0.1 * d / pxW * 0.3
      const w = Math.max(0.5, d / 110)
      // Trunk: a gentle curve from the base up to the crown.
      const n = Math.ceil(tall)
      for (let k = 0; k <= n; k++) {
        const s2 = k / n
        const x = bx + lean * s2 * s2
        span(G, Math.round(baseY - k), x - w, x + w, v)
      }
      // Fronds: five arcs fanning out of the crown and drooping.
      const tx = bx + lean, ty = baseY - tall
      const L = 0.2 * d
      for (const ang of [-2.7, -2.2, -1.57, -0.94, -0.44]) {
        const m = Math.ceil(L * 1.5)
        for (let k = 1; k <= m; k++) {
          const u = k / m
          const x = tx + (Math.cos(ang) * u * L) / pxW
          const y = ty + Math.sin(ang) * u * L * 0.6 + u * u * L * 0.55
          span(G, Math.round(y), x - 0.5, x + 0.5, v)
        }
      }
    }

    // --- sky characters: stars and birds, in cells the pixels left empty ---
    const sky = new Map()
    for (const star of p._outrunStars) {
      if (star.y >= HORIZON_Y - 1) continue
      const tw = 0.15 + 0.12 * Math.sin(t * star.speed + star.phase)
      sky.set(Math.round(star.y) * term.cols + Math.round(star.x), ['.', visualizerLevelAttr(Math.max(0.05, tw))])
    }
    for (const bird of p._outrunBirds) {
      const bx = ((bird.x + t * bird.speed) % term.cols + term.cols) % term.cols
      const by = Math.round(bird.y + Math.sin(t * 0.6 + bird.bobPhase) * 0.6)
      if (by < 1 || by >= HORIZON_Y - 1) continue
      const flap = Math.sin(t * 6 + bird.flapPhase) > 0
      sky.set(by * term.cols + Math.round(bx), [flap ? '^' : 'v', MUTED])
    }

    // --- pack pixels into cells ---------------------------------------------
    G.front ^= 1
    const bufs = G.bufs[G.front]
    const { cols, cellW, cellH, adv, rows } = G
    for (let r = 0; r < rows; r++) {
      const y = r + 1
      for (let c = 0; c < cols; c++) {
        const base = r * cellH * FW + c * adv
        let m = 0
        for (let py = 0; py < cellH; py++) {
          const o = base + py * FW
          for (let px = 0; px < cellW; px++) if (lum[o + px] > m) m = lum[o + px]
        }
        if (m < CELL_MIN) {
          const ch = sky.get(y * cols + c)
          if (ch) term.put(c, y, ch[0], ch[1])
          else term.put(c, y, ' ')
          continue
        }
        const attr = tierOf(m)
        const inv = 1 / levelOf(attr)
        const bits = bufs[r * cols + c]
        let any = 0
        for (let py = 0; py < cellH; py++) {
          const o = base + py * FW
          const b4 = (py & 3) * 4
          let w = 0
          for (let px = 0; px < cellW; px++) {
            if (lum[o + px] * inv > BAYER[b4 + (px & 3)]) w |= 1 << (cellW - 1 - px)
          }
          bits[py] = w
          any |= w
        }
        if (any) term.putGlyph(c, y, bits, attr)
        else term.put(c, y, ' ')
      }
    }
    // 57th pass, 4th rewrite -- Tachometer Sync removed entirely, dropping
    // the RPM gauge from CIRCUIT CRUSH. (Its p._outrunRedline state
    // lingered as a dead field until the 2026-08-25 audit.)
  },
}
