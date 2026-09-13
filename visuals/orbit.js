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
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, FAINT, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2, visualizerLevelAttr } = await import(`./shared.js?v=${V}`)

// Geometry is in "square units": one unit = one column, and a row is two
// units tall (the ~2:1 cell). Radius 17 is 17 columns wide and 8.5 rows
// tall, which on the 21-row canvas leaves a row or two of space above and
// below the halo. Centred left of the middle so the orbit's right-hand
// swing and a strip of open stars share the other side.
export const ORBIT_CX = 33
export const ORBIT_CY = 11
export const ORBIT_R = 17
export const ORBIT_ASPECT = 2
// Halo band width outside the limb, square units. 2.4 rather than ~1.5:
// at the top and bottom of the disc a row is 2 units, so a thinner band
// skips whole rows there and the ring reads as two brackets, not a circle.
export const ORBIT_HALO = 2.4

// The orbit: an ellipse in the orbital plane (semi-axes A x B square units)
// tilted in screen space by TILT radians -- rising to the right -- so it
// reads as inclined rather than edge-on. A = 30 keeps the glyph on screen at
// both ends (cols ~3..63). B = 7 puts the near pass ~3.5 rows below centre
// and the far pass ~3.5 above, both well inside the disc, so each crossing
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
export const ORBIT_GLYPH = '=[]='

// Light from upper-left and a little in front. z = 0.6 (not larger) is
// what puts the terminator inside the disc's right third: a light straight
// from the viewer would light a full disc and there would be no night side.
const LX = -0.73, LY = -0.33, LZ = 0.6
const TAU = Math.PI * 2
const LIT_RAMP = ' .:-=+*#%@'

/** Is cell (x, y) on the planet's disc? */
export function inPlanet(x, y) {
  const dx = x - ORBIT_CX, dy = (y - ORBIT_CY) * ORBIT_ASPECT
  return dx * dx + dy * dy < ORBIT_R * ORBIT_R
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
    const spin = TAU * clock / ORBIT_SPIN_S
    const R = ORBIT_R, R2 = R * R, HR = R + ORBIT_HALO, HR2 = HR * HR

    for (let y = 1; y < VIZ_BOT; y++) {
      const dy = (y - ORBIT_CY) * ORBIT_ASPECT
      for (let x = 0; x < cols; x++) {
        const dx = x - ORBIT_CX
        const rr2 = dx * dx + dy * dy
        if (rr2 < R2) {
          // The planet. Unit normal on the sphere, Lambert against L with a
          // small wrap (+0.1) so the terminator is a soft band of a column
          // or two rather than a hard edge.
          const nx = dx / R, ny = dy / R
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
          const lam = nx * LX + ny * LY + nz * LZ
          const day = Math.min(1, Math.max(0, (lam + 0.1) / 1.1))
          // Surface in longitude/latitude, so features ride the curvature:
          // they crawl fast across the middle and foreshorten at the limb,
          // which is what makes the drift read as rotation, not a scroll.
          const lon = Math.atan2(nx, nz) + spin
          const lat = Math.asin(Math.max(-1, Math.min(1, ny)))
          const land = Math.sin(lon * 2 + 1.1 * Math.sin(lat * 2.3 + 0.6)) +
            0.3 * Math.sin(lon * 3.3 - lat * 2.4 + 1.9) + 0.25 * Math.cos(lat * 4) > 0.7
          const cloud = Math.sin(lat * 6 + 1.2 * Math.sin(lon * 1.7 + lat)) > 0.9
          const albedo = cloud ? 0.95 : land ? 0.8 : 0.4
          const v = Math.pow(day, 0.8) * albedo * warm
          if (v < 0.09) {
            // Night side: never blank, so the disc stays a solid silhouette
            // against the stars -- land a shade denser than sea, both FAINT.
            term.put(x, y, land ? ':' : '.', FAINT)
          } else {
            const idx = Math.max(1, Math.min(LIT_RAMP.length - 1, Math.floor(v * LIT_RAMP.length)))
            term.put(x, y, LIT_RAMP[idx], visualizerLevelAttr(Math.min(1, v)))
          }
        } else if (rr2 < HR2) {
          // Atmosphere: brightest at the limb, fading outward; brighter on
          // the lit limb (scattering) but present all the way round, so the
          // night side's edge still closes the circle. The breath lifts the
          // whole ring one or two tiers at most -- a swell, not a strobe.
          const rr = Math.sqrt(rr2)
          const edge = 1 - (rr - R) / ORBIT_HALO
          const facing = Math.max(0, -(dx * LX + dy * LY) / rr)
          const v = edge * (0.2 + 0.35 * facing) + breath * 0.4 * edge
          if (v < 0.07) { term.put(x, y, ' '); continue }
          term.put(x, y, v > 0.45 ? ':' : '·', visualizerLevelAttr(Math.min(1, v)))
        } else {
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
    }

    // The orbit track: a sparse FAINT dotting of the ellipse, only in open
    // space. Over the disc and halo it would scratch a line through the
    // planet's shading; outside them it is what makes the path read as an
    // inclined orbit before the station has shown the whole of it.
    for (let k = 0; k < 64; k++) {
      const o = orbitAt((k / 64) * ORBIT_LAP_S)
      const cx = Math.round(o.x), cy = Math.round(o.y)
      if (cy < 1 || cy >= VIZ_BOT || cx < 0 || cx >= cols) continue
      const dx = cx - ORBIT_CX, dy = (cy - ORBIT_CY) * ORBIT_ASPECT
      if (dx * dx + dy * dy < HR2) continue
      term.put(cx, cy, '·', FAINT)
    }

    // Trail: the same pure orbitAt() asked about the last trailS seconds,
    // oldest first so newer, brighter samples overwrite older ones. Points
    // on the far half that fall on the disc are occluded like the glyph.
    const step = 0.06
    const n = Math.floor(trailS / step)
    for (let k = n; k >= 1; k--) {
      const o = orbitAt(clock - k * step)
      const cx = Math.round(o.x), cy = Math.round(o.y)
      if (cy < 1 || cy >= VIZ_BOT || cx < 0 || cx >= cols) continue
      if (!o.front && inPlanet(cx, cy)) continue
      const v = 0.12 + 0.5 * (1 - k / n)
      term.put(cx, cy, '·', visualizerLevelAttr(v))
    }

    // The station. Occluded per cell, so it slides behind the limb a
    // character at a time. BRIGHT on the near half, NORMAL on the far half:
    // a small depth cue that also keeps it from glaring on the lit disc.
    const o = orbitAt(clock)
    const g = glyphCell(o)
    if (g.y >= 1 && g.y < VIZ_BOT) {
      for (let i = 0; i < ORBIT_GLYPH.length; i++) {
        const gx = g.x + i
        if (gx < 0 || gx >= cols) continue
        if (!o.front && inPlanet(gx, g.y)) continue
        term.put(gx, g.y, ORBIT_GLYPH[i], o.front ? BRIGHT : NORMAL)
      }
    }
  },
}
