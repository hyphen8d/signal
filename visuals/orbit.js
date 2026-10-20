// SIGNAL -- visualizer effect "ORBIT" (SLOW ORBIT, ZM 1092.0). 2026-09-13.
//
// A planet seen from space with a station going round it. The dial slot is
// the ISS's orbit ("92 minutes, one orbit"), and the station's lane is
// downtempo: warm pads over a beat that is still a beat. So the subject is
// the orbit itself -- one slow, inclined lap -- and the beat is the planet's
// atmosphere breathing, not anything flashing.
//
// It replaces a borrowed FLOW FIELD (GREEN ROOM's). Currents suited the lane
// "almost too well", which is the problem: the two read as the same thing.
// ORBIT deliberately has no streaks and no field -- one round body, one small
// moving object, and a lot of black.
//
// Layers, back to front: a starfield (slow parallax drift, treble twinkle);
// the planet (a lit disc with a terminator and rotating continents/cloud
// bands); a thin atmosphere halo just outside the limb (breathes on the
// pulse); a faint dotted orbit track; the station's fading trail; the
// station glyph. The far half of the orbit passes BEHIND the disc and is
// genuinely occluded cell by cell, which is what makes it read as a planet
// with depth rather than a circle with a sprite over it.
//
// 2026-10-16 (design pass) -- judged off the real tube (tools/viz-sheet.mjs),
// the planet read only loosely, as a dotted globe: the lit side and the
// continents were runs of '# % = * + -' (character soup, rubric 4), the
// night side's FAINT ':' dots vanished on green, the halo's breathing was
// thinner than a tier step and never showed, and '=[]=' was no brighter
// than the disc. Changed: the day side is a crescent of ▓▒░ (a planet is a
// solid body, the one place in this picture mass is the point), with land
// one shade DARKER and cloud one beam tier up; the light moved round so the
// crescent is a crescent; the night side is a FAINT ░ fill closed by a solid
// '(' ')' limb at MUTED; the halo is one continuous ring of '·' that steps a
// tier on the breath (DIM->MUTED, sunward MUTED->NORMAL) -- a swell, since
// SLOW ORBIT is ambient; the station is '═╡■╞═', BRIGHT on both passes, with
// a NORMAL->MUTED->DIM trail that no longer punches holes in the disc.
//
// 2026-10-20 (polish) -- the critique, off the real tube: "a coffee bean".
// The ▓▒░ crescent rastered as vertical stripes and the continents as
// stepped diagonal slabs (rubric 4); the disc stood as an upright egg,
// because the "row = 2 units" geometry assumed a 2:1 cell where the 4:3
// face gives ~2.4:1 (OUTRUN's header measured the same); the halo's tier
// step looked the same MUTED and LOUD (rubric 2); and the FAINT track was
// invisible, so the station sat alone at the left with nothing behind it.
// The set rule the critique proposed -- anything soft or round goes through
// pixels -- is exactly a planet. What changed, subject and composition kept:
//   - ORBIT_ASPECT 2 -> 2.4 (8x16 cells, the blank ninth column, a 4:3
//     face) and R 17 -> 18 columns, so the disc is round on the tube.
//   - THE PLANET is per-cell pixel bitmaps (term.putGlyph, NEON HEART's
//     packer): a dithered sphere lit by the same light, with a soft
//     terminator, mild limb darkening, continents as darker density
//     patches, cloud as lighter ones, a dim stippled night side. The
//     surface is one precomputed lon/lat map scrolled by the spin, so the
//     per-frame cost is a lookup per pixel, not trig.
//   - THE BREATH is the halo's WIDTH now, not a tier step: a 1-2px rim of
//     atmosphere at rest that widens into several pixels of dithered glow
//     on the swell (haloWidth()), brightest sunward. Muted, it is the thin
//     rim -- visibly different from LOUD.
//   - THE TRACK: the near half is MUTED (and crosses the planet's face as
//     pixel dots, in front of the disc), the far half DIM in open space and
//     occluded by the disc. The trail does the same, so the station's path
//     reads across the planet instead of stopping at the limb.
//   - Unchanged: the station '═╡■╞═' BRIGHT, the only BRIGHT thing; the
//     day side tops out at NORMAL; stars as characters.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2, visualizerLevelAttr } = await import(`./shared.js?v=${V}`)

// Geometry is in "square units": one unit = one column, and a row is
// ORBIT_ASPECT units tall. 2026-10-20: 2.4, not 2 -- an 8x16 cell plus its
// blank ninth column, stretched onto the 4:3 face, is 2.4x as tall as it is
// wide, and at 2 the disc stood as an egg. Radius 18 columns is 7.5 rows.
// Centred left of the middle so the orbit's right-hand swing and a strip
// of open stars share the other side.
export const ORBIT_CX = 33
export const ORBIT_CY = 11
export const ORBIT_R = 18
export const ORBIT_ASPECT = 2.4
// The halo's glow: e-folding width in square units (one unit is ~6.7
// display pixels), at rest and added at full breath.
export const HALO_W0 = 0.22
export const HALO_WB = 1.2
// Beyond this distance past the limb nothing is lit; with one more unit,
// the extent of the cells drawn as pixels.
export const ORBIT_HALO = 3.4

// The orbit: an ellipse in the orbital plane (semi-axes A x B square units)
// tilted in screen space by TILT radians -- rising to the right -- so it
// reads as inclined rather than edge-on. A = 30 keeps the glyph on screen at
// both ends (cols ~3..63). B = 7 puts the near pass ~3 rows below centre
// and the far pass ~3 above, both well inside the disc, so each crossing
// is an unambiguous in-front / behind moment.
export const ORBIT_A = 30
export const ORBIT_B = 7
export const ORBIT_TILT = -0.18
// One lap, seconds. 92 minutes compressed to 30s: slow enough that the
// station crosses the face of the planet over ~6s (never frantic), quick
// enough that someone watching for half a minute sees a whole lap,
// including the disappearance behind the limb, which is the effect's payoff.
export const ORBIT_LAP_S = 30
// Planet rotation, seconds per turn. At the disc centre that is ~1.3
// columns/s of surface drift -- visibly turning over a few seconds, calm
// beside the station, which moves ~6 columns/s at its fastest.
export const ORBIT_SPIN_S = 80
// Design pass: '=[]=' was four characters no brighter than the planet.
// Panels either side of a module, five wide, always BRIGHT.
export const ORBIT_GLYPH = '═╡■╞═'

// Light from upper-left and a little in front; z = 0.36 puts the
// terminator just right of centre, so the day side reads as a crescent and
// the night side as a dark disc (2026-10-16 design pass).
const LX = -0.86, LY = -0.36, LZ = 0.36
const TAU = Math.PI * 2

// Pixel intensities, on src/term.js's 0..255 beam scale.
const LV_NORMAL = 205, LV_MUTED = 180, LV_DIM = 150
// The day side's peak: NORMAL, never BRIGHT -- the station leads.
export const DAY_PEAK = 212
const PIX_MAX = 228 // under BRIGHT's 232 threshold, whatever `warm` does
// Night side: a stipple, land a shade darker, so the dark disc is a solid
// silhouette with the continents still faintly there.
const NIGHT_SEA = 40, NIGHT_LAND = 24, NIGHT_CLOUD = 50
// Halo at the limb, sunward and on the night side.
const HALO_SUN = 196, HALO_NIGHT = 140
// Track dots over the planet (near half only).
const TRACK_LUM = 175
const CELL_MIN = 12
// 4x4 ordered dither -- FLAME's / NEON HEART's.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16)
// ONE beam tier for every pixel cell, NORMAL, with brightness carried by
// dither density alone. NEON HEART picks each cell's tier from its
// brightest pixel, which suits a thin tube; on a filled sphere it tiled
// the disc into visible cell-sized boxes wherever two neighbours landed on
// different tiers (a track dot raising one night cell to MUTED drew a
// hollow square), the very blockiness the pixels were meant to remove.
const PIX_TIER = NORMAL, PIX_INV = 1 / LV_NORMAL
// The surface map's resolution: longitude x latitude.
const MAP_W = 256, MAP_H = 128

/** Is cell (x, y) on the planet's disc (its centre inside)? */
export function inPlanet(x, y) {
  const dx = x - ORBIT_CX, dy = (y - ORBIT_CY) * ORBIT_ASPECT
  return dx * dx + dy * dy < ORBIT_R * ORBIT_R
}

/** Is cell (x, y) drawn as pixels -- the disc and the halo's reach? */
export function inPixels(x, y) {
  const dx = x - ORBIT_CX, dy = (y - ORBIT_CY) * ORBIT_ASPECT
  const R = ORBIT_R + ORBIT_HALO + 1
  return dx * dx + dy * dy < R * R
}

/** Is cell (x, y) outside the disc but touching it (8-neighbour)? The
 *  halo's innermost ring. */
export function touchesPlanet(x, y) {
  if (inPlanet(x, y)) return false
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    if ((i || j) && inPlanet(x + i, y + j)) return true
  }
  return false
}

/** The station's position at orbit-clock `clock` seconds: fractional
 *  screen col/row, and whether it is on the near (front) half. Pure --
 *  the trail is just this function asked about the recent past. */
export function orbitAt(clock) {
  // Decreasing angle: the far pass runs right-to-left along the top, the
  // near pass left-to-right along the bottom -- counter-clockwise, as a
  // prograde orbit looks from above the pole. Starts at the right-hand
  // extreme (theta 0) on a zero clock.
  const th = -TAU * clock / ORBIT_LAP_S
  const ex = ORBIT_A * Math.cos(th), ey = ORBIT_B * Math.sin(th)
  const c = Math.cos(ORBIT_TILT), s = Math.sin(ORBIT_TILT)
  const X = ex * c - ey * s, Y = ex * s + ey * c
  // Positive ey is the lower half of the ellipse; the viewer sits slightly
  // above the orbital plane, so the lower half is the near one.
  return { x: ORBIT_CX + X, y: ORBIT_CY + Y / ORBIT_ASPECT, front: Math.sin(th) > 0 }
}

/** The glyph's leftmost cell and row for a position from orbitAt(). */
export function glyphCell(o) {
  return { x: Math.round(o.x) - (ORBIT_GLYPH.length >> 1), y: Math.round(o.y) }
}

/** The halo's e-folding width (square units) at a breath of 0..1. */
export const haloWidth = (breath) => HALO_W0 + HALO_WB * Math.max(0, Math.min(1, breath))

/** Per-width geometry, built on first draw (most sessions never open this
 *  effect -- FLAME's laziness) and rebuilt if the width changes. For every
 *  pixel in the planet's box: on the disc, its static lighting and its
 *  base map coordinates; off it, its distance past the limb and how
 *  sunward it is. Framebuffer coordinates count each cell's blank ninth
 *  column, so the geometry is placed where it is seen. */
function build(term) {
  const cols = term.cols
  const { cellW, cellH } = term.font
  const adv = cellW + 1
  const rows = VIZ_BOT - 1
  const reach = ORBIT_R + ORBIT_HALO + 1
  const c0 = Math.max(0, Math.floor(ORBIT_CX - reach)), c1 = Math.min(cols - 1, Math.ceil(ORBIT_CX + reach))
  const BX = c0 * adv, BW = (c1 - c0 + 1) * adv, BH = rows * cellH
  const n = BW * BH
  const kind = new Uint8Array(n) // 0 out of reach, 1 disc, 2 halo
  const day = new Float32Array(n), limb = new Float32Array(n)
  const lon0 = new Float32Array(n), latI = new Uint8Array(n)
  const dist = new Float32Array(n), sunw = new Float32Array(n)
  const R = ORBIT_R
  for (let Y = 0; Y < BH; Y++) {
    // Cell-coordinate position of the pixel centre (a cell's centre maps
    // to its integer coordinate, as inPlanet() asks).
    const cy = 1 + (Y + 0.5) / cellH - 0.5
    const dy = (cy - ORBIT_CY) * ORBIT_ASPECT
    for (let X = 0; X < BW; X++) {
      const cx = (BX + X + 0.5) / adv - 0.5
      const dx = cx - ORBIT_CX
      const r = Math.sqrt(dx * dx + dy * dy)
      const i = Y * BW + X
      if (r < R) {
        kind[i] = 1
        const nx = dx / R, ny = dy / R
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
        const lam = nx * LX + ny * LY + nz * LZ
        // Lambert with a soft wrap: the terminator is a gradient a few
        // pixels wide, smoothstepped so it reads as a curve, not a band.
        const d = Math.min(1, Math.max(0, (lam + 0.12) / 0.62))
        day[i] = d * d * (3 - 2 * d) * Math.min(1, 0.55 + 0.6 * Math.max(0, lam))
        limb[i] = 0.72 + 0.28 * nz
        lon0[i] = ((Math.atan2(nx, nz) / TAU) * MAP_W + MAP_W * 4) % MAP_W
        latI[i] = Math.min(MAP_H - 1, Math.max(0, Math.floor((Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI + 0.5) * MAP_H)))
      } else if (r < R + ORBIT_HALO) {
        kind[i] = 2
        dist[i] = r - R
        const s = (dx * LX + dy * LY) / r // -1 (night) .. 1 (sunward)
        sunw[i] = Math.max(0, Math.min(1, 0.5 + 0.6 * s))
      }
    }
  }
  // The surface: 0 sea, 1 land, 2 cloud (over either). The 2026-10-16
  // formulas, sampled once onto a lon/lat map.
  const map = new Uint8Array(MAP_W * MAP_H)
  for (let j = 0; j < MAP_H; j++) {
    const lat = ((j + 0.5) / MAP_H - 0.5) * Math.PI
    for (let k = 0; k < MAP_W; k++) {
      const lon = ((k + 0.5) / MAP_W) * TAU
      const land = Math.sin(lon * 2 + 1.1 * Math.sin(lat * 2.3 + 0.6)) +
        0.3 * Math.sin(lon * 3.3 - lat * 2.4 + 1.9) + 0.25 * Math.cos(lat * 4) > 0.7
      const cloud = Math.sin(lat * 6 + 1.2 * Math.sin(lon * 1.7 + lat)) > 0.9
      map[j * MAP_W + k] = cloud ? 2 : land ? 1 : 0
    }
  }
  return {
    cols, cellW, cellH, adv, rows, c0, c1, BX, BW, BH,
    kind, day, limb, lon0, latI, dist, sunw, map,
    lum: new Uint8Array(n),
    // Two bitmaps per cell, alternated per frame: putGlyph() skips a
    // same-reference re-put, so a bitmap rewritten in place never shows.
    bufs: [0, 1].map(() => Array.from({ length: cols * rows }, () => new Uint16Array(cellH))),
    front: 0,
  }
}

export default {
  key: 'orbit',
  label: 'ORBIT',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    // _orbitClock is ACCUMULATED orbit time, not an effect-clock reading:
    // it only ever grows by per-frame deltas, so leaving the visualizer
    // and coming back resumes the lap where it was -- a station does not
    // teleport back to its start because you looked away. Seeded to a
    // random point of the lap so every boot doesn't open on the same pose.
    p._orbitClock = Math.random() * ORBIT_LAP_S
    p._orbitLastT = null
    p._orbitBreath = 0
    p._orbitG = null
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // _orbitLastT IS an effect-clock value, and the clock restarts at 0 on
    // entry. It cannot cause the FLAME-class freeze, because draw()
    // overwrites it every frame: a stale one costs exactly one frame with a
    // zero step (verified by removing this line -- re-entry stays healthy).
    // The real hazard is a NEGATIVE delta: the first frame back would step
    // the orbit ~120s backwards. This clear and draw()'s Math.max(0, ...)
    // each prevent that alone; tests/visual-orbit.test.mjs was
    // mutation-checked with both removed (red) and is kept for both.
    p._orbitLastT = null
    p._orbitBreath = 0
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    if (!p._orbitG || p._orbitG.cols !== cols) p._orbitG = build(term)
    const G = p._orbitG

    // Delta clamped to 0.1s: a stalled or throttled tab resumes the orbit
    // with at most a tenth of a second's step rather than a jump.
    const last = p._orbitLastT
    const dt = last == null ? 0 : Math.min(0.1, Math.max(0, t - last))
    p._orbitLastT = t
    const clock = (p._orbitClock += dt)

    // The breath. A.pulse decays with a 0.12s time constant -- on its own
    // that is a flash. Eased up over ~0.15s and let down over ~0.9s it
    // becomes a swell that is still clearly ON the beat (syntheticAudio's
    // 0.9s pulse gives a steady breathing rhythm with no capture). An onset
    // counts as a full pulse. Muted, the target is 0 and it settles.
    const target = Math.max(A.pulse || 0, A.onset ? 0.9 : 0)
    const tau = target > p._orbitBreath ? 0.15 : 0.9
    p._orbitBreath += (target - p._orbitBreath) * (1 - Math.exp(-dt / tau))
    const breath = p._orbitBreath

    // Level warms the lit side (0.8..1.15) and lengthens the trail.
    // Silence floors at 0.8 so a muted planet is dimmer, never dark.
    const warm = 0.8 + 0.35 * A.level
    const trailS = 0.8 + 1.8 * A.level
    // Treble is twinkle AMPLITUDE only; the twinkle rate is fixed per star.
    const twinkle = 0.08 + 0.4 * A.treble

    // --- the planet and its halo, in pixels ---------------------------------
    const { kind, day, limb, lon0, latI, dist, sunw, map, lum, BW, BH, BX, adv, cellW, cellH, c0, c1 } = G
    const spinI = (clock / ORBIT_SPIN_S) * MAP_W
    const hk = 1 / haloWidth(breath)
    const glowUp = 0.92 + 0.12 * breath
    for (let i = 0, n = BW * BH; i < n; i++) {
      const k = kind[i]
      if (k === 0) { lum[i] = 0; continue }
      if (k === 1) {
        const m = map[latI[i] * MAP_W + (((lon0[i] + spinI) | 0) % MAP_W)]
        // Sea 0.82, land 0.5 (a darker patch), cloud 1.0 (a lighter one).
        const surf = m === 2 ? 1 : m === 1 ? 0.5 : 0.82
        const lit = DAY_PEAK * day[i] * warm * surf * limb[i]
        const night = m === 1 ? NIGHT_LAND : m === 2 ? NIGHT_CLOUD : NIGHT_SEA
        lum[i] = Math.min(PIX_MAX, Math.max(lit, night))
      } else {
        const v = (HALO_NIGHT + (HALO_SUN - HALO_NIGHT) * sunw[i]) * Math.exp(-dist[i] * hk) * glowUp
        lum[i] = v < 4 ? 0 : Math.min(PIX_MAX, v)
      }
    }

    // Track and trail points that fall in the pixel area go into the pixel
    // buffer as 2x2 dots: the near half crosses the planet's face, the far
    // half is occluded by the disc. Returns false if the point is outside
    // the pixel area (the caller draws a character there instead).
    const dot = (o, v) => {
      const cx = Math.round(o.x), cy = Math.round(o.y)
      if (!inPixels(cx, cy)) return false
      if (cy < 1 || cy >= VIZ_BOT || v <= 0) return true
      const X = Math.round((o.x + 0.5) * adv) - BX - 1
      const Y = Math.round((o.y - 0.5) * cellH) - 1
      for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
        const x = X + k, y = Y + j
        if (x < 0 || y < 0 || x >= BW || y >= BH) continue
        const i = y * BW + x
        if (!o.front && kind[i] === 1) continue
        if (v > lum[i]) lum[i] = v
      }
      return true
    }
    const charDots = []
    // The orbit track (2026-10-20): near half MUTED, far half DIM -- at
    // FAINT it could not be seen at all on green. Over the halo's reach the
    // far half is left out entirely; it is behind the planet's air.
    for (let k = 0; k < 96; k++) {
      const o = orbitAt((k / 96) * ORBIT_LAP_S)
      if (!dot(o, o.front ? TRACK_LUM : 0)) charDots.push([o, o.front ? MUTED : DIM])
    }
    // Trail: the same pure orbitAt() asked about the last trailS seconds,
    // oldest first so newer, brighter samples overwrite older ones. Newest
    // third NORMAL, then MUTED, then DIM -- the one thing beside the
    // station brighter than the planet behind it.
    const step = 0.06
    const nTrail = Math.floor(trailS / step)
    for (let k = nTrail; k >= 1; k--) {
      const o = orbitAt(clock - k * step)
      const age = k / nTrail
      if (!dot(o, age < 0.34 ? LV_NORMAL : age < 0.67 ? LV_MUTED : LV_DIM)) {
        charDots.push([o, age < 0.34 ? NORMAL : age < 0.67 ? MUTED : DIM])
      }
    }

    // --- pack pixels into cells; stars everywhere else ----------------------
    G.front ^= 1
    const bufs = G.bufs[G.front]
    for (let y = 1; y < VIZ_BOT; y++) {
      const r = y - 1
      for (let x = 0; x < cols; x++) {
        if (x >= c0 && x <= c1 && inPixels(x, y)) {
          const base = r * cellH * BW + (x - c0) * adv
          let m = 0
          for (let py = 0; py < cellH; py++) {
            const o = base + py * BW
            for (let px = 0; px < cellW; px++) if (lum[o + px] > m) m = lum[o + px]
          }
          if (m < CELL_MIN) { term.put(x, y, ' '); continue }
          const attr = PIX_TIER
          const inv = PIX_INV
          const bits = bufs[r * cols + x]
          let any = 0
          for (let py = 0; py < cellH; py++) {
            const o = base + py * BW
            const b4 = (py & 3) * 4
            let w = 0
            for (let px = 0; px < cellW; px++) {
              if (lum[o + px] * inv > BAYER[b4 + (px & 3)]) w |= 1 << (cellW - 1 - px)
            }
            bits[py] = w
            any |= w
          }
          if (any) term.putGlyph(x, y, bits, attr)
          else term.put(x, y, ' ')
          continue
        }
        // Stars: two stateless hash layers drifting at different rates, so
        // the one-column steps a text grid forces land at different
        // moments and read as parallax rather than the sky jumping.
        const fx = Math.floor(x + clock * 0.05)
        const nxs = Math.floor(x + clock * 0.13)
        const hf = hash2(fx, y * 7 + 3)
        const hn = hash2(nxs + 500, y * 13 + 11)
        if (hn < 0.011) {
          const h = hash2(nxs * 3.1, y + 91)
          const v = 0.3 + 0.25 * h + twinkle * Math.sin(t * (0.6 + h * 2.2) + h * 40)
          term.put(x, y, v > 0.62 ? '+' : '.', visualizerLevelAttr(Math.max(0, Math.min(1, v))))
        } else if (hf < 0.02) {
          const h = hash2(fx * 1.7, y + 37)
          const v = 0.12 + 0.12 * h + twinkle * 0.6 * Math.sin(t * (0.4 + h * 1.6) + h * 25)
          term.put(x, y, '.', visualizerLevelAttr(Math.max(0, Math.min(0.5, v))))
        } else {
          term.put(x, y, ' ')
        }
      }
    }
    // Track and trail in open space, as characters (trail last, so it
    // writes over the track).
    for (const [o, attr] of charDots) {
      const cx = Math.round(o.x), cy = Math.round(o.y)
      if (cy < 1 || cy >= VIZ_BOT || cx < 0 || cx >= cols) continue
      term.put(cx, cy, '·', attr)
    }

    // The station. Occluded per cell, so it slides behind the limb a
    // character at a time. BRIGHT on both halves (design pass): it used to
    // drop to NORMAL on the far pass, the same tier as the lit disc, and the
    // subject has to be the brightest thing on the screen.
    const o = orbitAt(clock)
    const g = glyphCell(o)
    if (g.y >= 1 && g.y < VIZ_BOT) {
      for (let i = 0; i < ORBIT_GLYPH.length; i++) {
        const gx = g.x + i
        if (gx < 0 || gx >= cols) continue
        if (!o.front && inPlanet(gx, g.y)) continue
        term.put(gx, g.y, ORBIT_GLYPH[i], BRIGHT)
      }
    }
  },
}
