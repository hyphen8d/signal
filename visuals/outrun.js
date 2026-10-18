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

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, auMul } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2, visualizerLevelAttr } = await import(`./shared.js?v=${V}`)

// OUTRUN flair -- palm trees and city skyline -- palm
// rails sit just outside the outermost road rail (r=3 in the grid loop
// below, at 3*depth*1.7) so trees read as roadside planting, not
// obstacles standing in a lane.
export const OUTRUN_PALM_RAILS = [-4.4, -3.7, 3.7, 4.4]

// 2026-10-16 (design pass) -- the sun. Radius in ROWS; SUN_ASPECT turns a
// row of radius into cells of half-width (8x16 cells stretched onto a 4:3
// face come out ~2.3x taller than wide).
export const HORIZON_Y = 8
export const SUN_R = 6.2
export const SUN_ASPECT = 2.3
export const SUN_SWELL = 0.9
const SWELL_TAU = 0.22
// The roadside scatter, as a fraction of what it was.
export const GRASS_SCALE = 0.3

/** Is the sun lit at (sub-row centre `sy`, column `x`)? `sy` is in rows,
 *  measured down from the top of the screen; half-row resolution. */
export function sunLit(sy, x, cx, r, slicePhase) {
  const dy = HORIZON_Y - sy
  if (dy <= 0 || dy > r) return false
  const halfW = SUN_ASPECT * Math.sqrt(r * r - dy * dy)
  if (Math.abs(x + 0.5 - cx) > halfW) return false
  // Slices across the lower ~55%: in half-row units, a period of 3 with a
  // gap that grows from 1 to 2 half-rows toward the horizon.
  if (dy > r * 0.55) return true
  const u = Math.floor(dy * 2 + slicePhase)
  const gap = dy < r * 0.28 ? 2 : 1
  return ((u % 3) + 3) % 3 >= gap
}

export default {
  key: 'outrun',
  label: 'OUTRUN',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    // OUTRUN's sky-field stars (45th pass) -- fixed positions/phases so the
    // sky doesn't reshuffle every frame, same reasoning as _breachCols above.
    // 45th pass: bumped from 26 to 46 (live QA: "too much white space") --
    // the sky above the sun was still reading as dead space at the lower
    // count.
    p._outrunStars = Array.from({ length: 46 }, () => ({
      x: Math.random() * term.cols,
      y: 1 + Math.random() * 6,
      phase: Math.random() * 10,
      speed: 0.5 + Math.random() * 0.8,
    }))
    // OUTRUN's birds (48th pass) -- live QA: "add some clouds on either
    // side of the sun or something that looks like seagulls/birds." A
    // handful of simple caret-glyph birds gliding across the upper sky,
    // alternating ^/v as a wingbeat, drifting slowly right and wrapping.
    p._outrunBirds = Array.from({ length: 6 }, () => ({
      x: Math.random() * term.cols,
      y: 1 + Math.random() * 4,
      speed: 0.6 + Math.random() * 1.0,
      flapPhase: Math.random() * 10,
      bobPhase: Math.random() * 10,
    }))
    // 2026-08-23 (live audio tap) -- OUTRUN's road-speed phase accumulator.
    // The rungs/grass/palms used to scroll on raw `t * 0.6`; with the tap
    // live the RATE of that scroll follows the track's level, which can't be
    // done by scaling `t` per frame (the geometry would teleport on every
    // level change), so the phase integrates instead. Neutral rate is
    // exactly 0.6/s -- with no tap the road drives precisely as it always
    // did. Reset on every visualizer entry alongside the effect clock.
    p._outrunPhase = 0
    p._outrunPhaseT = 0
    // 2026-10-16 (design pass) -- the kick: the sun's swell envelope, its
    // slice phase (half-rows stepped), and the last onset/pulse state for
    // the rising edge.
    p._outrunSwell = 0
    p._outrunSlice = 0
    p._outrunPrevHit = false
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // 2026-08-23 (live audio tap) -- the road-speed accumulator restarts
    // with the effect clock.
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
  //
  // The 44th-pass concept was right but flat: the sun was one uniform
  // character everywhere it was lit, and the grid rungs/rails were a
  // strict on/off with no gradient -- read as a stencil, not a glow. This
  // pass keeps the exact same skeleton and only adds depth: the sun shades
  // radially through the beam tiers instead of one flat '▓', its slice-
  // gaps widen toward the bottom the way the genre's own sunset actually
  // renders, the horizon gets a dim glow row bleeding above the bright
  // line instead of a hard cut, the grid's rungs and rails brighten/
  // thicken with proximity to the viewer instead of one uniform gray, and
  // a scatter of near-static stars (p._outrunStars, seeded in init())
  // fills what was dead space above the horizon.
  draw(p, s, t) {
    const { term } = s
    const cx = term.cols / 2
    const horizonY = 8
    // 2026-08-23 (live audio tap) -- the car drives at the music's
    // intensity. The rungs/grass/palms all used to scroll on a shared
    // `t * 0.6`; that becomes p._outrunPhase, integrated per frame at a
    // level-scaled rate (neutral rate exactly 0.6/s, so with no tap the
    // drive is byte-identical). An accumulator rather than scaling `t`
    // directly, or every loudness change would teleport the whole road.
    // Deliberately NO onset hook anywhere here -- the 44th-pass note below
    // calls this the slowest, most hypnotic effect on purpose, and a
    // per-beat flash would strobe it; tempo shows as road speed instead,
    // plus the sun's glow leaning on the bass.
    // 65th pass -- CIRCUIT CRUSH needed to feel more reactive without
    // losing the hypnotic pacing: road-speed range widened 0.5-1.5 ->
    // 0.3-2.2 (quiet passages coast noticeably slower, loud ones surge
    // rather than just nudging the needle), and the sun's bass lean
    // widened below. Still no onset hook anywhere in this effect -- a
    // per-beat flash would strobe it, tempo stays expressed as road speed
    // and sun glow only.
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : p._au
    if (t < p._outrunPhaseT) p._outrunPhaseT = t
    const dt = Math.min(0.1, Math.max(0, t - p._outrunPhaseT))
    p._outrunPhase += dt * 0.6 * auMul(A, A ? A.level : 0, 0.3, 2.2)
    p._outrunPhaseT = t
    // 2026-10-16 (design pass) -- the kick: a rising edge of onset/pulse,
    // never a level, so steady loud audio swells nothing.
    const hit = !!A && !muted && (A.onset || A.pulse > 0.6)
    if (hit && !p._outrunPrevHit) { p._outrunSwell = 1; p._outrunSlice = (p._outrunSlice + 1) % 3 }
    p._outrunPrevHit = hit
    p._outrunSwell *= Math.exp(-dt / SWELL_TAU)
    // 46th pass: sun radius 6.5 -> 7.5 (live QA: "closer... but I think
    // need less unused space, make elements larger"). 2026-10-16: 6.2 rows,
    // but at the cell aspect -- ~28 columns wide where it was 15.
    const sunR = SUN_R + SUN_SWELL * p._outrunSwell + (A ? (A.bass - 0.5) * 0.5 : 0)
    const sunHalfW = SUN_ASPECT * sunR
    // Sky: sparse near-static stars above the sun.
    for (let y = 1; y < horizonY - 1; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    for (const star of p._outrunStars) {
      if (star.y >= horizonY - 1) continue
      const tw = 0.15 + 0.12 * Math.sin(t * star.speed + star.phase)
      term.put(Math.round(star.x), Math.round(star.y), '.', visualizerLevelAttr(Math.max(0.05, tw)))
    }
    // Birds (48th pass) -- gliding silhouettes crossing the sky on either
    // side of the sun, filling what was otherwise dead space up there.
    for (const bird of p._outrunBirds) {
      const bx = ((bird.x + t * bird.speed) % term.cols + term.cols) % term.cols
      const by = Math.round(bird.y + Math.sin(t * 0.6 + bird.bobPhase) * 0.6)
      if (by < 1 || by >= horizonY - 1) continue
      const flap = Math.sin(t * 6 + bird.flapPhase) > 0
      term.put(Math.round(bx), by, flap ? '^' : 'v', MUTED)
    }
    // Horizon: two dim glow rows bleeding above the line -- 46th pass,
    // thickened for the same "make elements larger" note. 2026-10-16: the
    // glow skips the sun's span (it used to run full width after the sun
    // and erase its sliced bottom), and the line itself is NORMAL now --
    // the sun is the one BRIGHT thing.
    for (let x = 0; x < term.cols; x++) {
      if (Math.abs(x + 0.5 - cx) > sunHalfW + 1) {
        term.put(x, horizonY - 2, '‾', FAINT)
        term.put(x, horizonY - 1, '‾', DIM)
      } else {
        term.put(x, horizonY - 2, ' ')
        term.put(x, horizonY - 1, ' ')
      }
      term.put(x, horizonY, '=', muted ? DIM : NORMAL)
    }
    // Sun (2026-10-16 redraw): a solid disc in half-blocks, sliced across
    // its lower half. Each cell asks the disc about its top and bottom
    // halves and picks █ ▀ ▄ or leaves what the sky/glow put there.
    const sunAttr = muted ? NORMAL : BRIGHT
    const sunTop = Math.max(1, Math.floor(horizonY - sunR))
    const sx0 = Math.max(0, Math.floor(cx - sunHalfW - 1)), sx1 = Math.min(term.cols - 1, Math.ceil(cx + sunHalfW + 1))
    for (let y = sunTop; y < horizonY; y++) {
      for (let x = sx0; x <= sx1; x++) {
        const top = sunLit(y + 0.25, x, cx, sunR, p._outrunSlice)
        const bot = sunLit(y + 0.75, x, cx, sunR, p._outrunSlice)
        if (top && bot) term.put(x, y, '█', sunAttr)
        else if (top) term.put(x, y, '▀', sunAttr)
        else if (bot) term.put(x, y, '▄', sunAttr)
        else if (y >= horizonY - 2) term.put(x, y, ' ')
      }
    }
    // 57th pass, 2nd rewrite -- Tachometer Sync moved off the sky (see the
    // end of this function) down onto the dash itself, and made always-on
    // -- always present, just at a different metered level.
    // City skyline -- adds a city skyline alongside the palm trees below,
    // a dim,
    // deterministic silhouette sitting right against the horizon glow rows
    // just drawn above, giving the birds/stars something to fly in front
    // of and the drive an actual destination.
    //
    // First cut rolled a height independently per COLUMN, which reads as
    // static, not buildings -- with no correlation between neighbours,
    // every column is its own coin flip, so adjacent columns disagree
    // constantly and the silhouette comes out as solid noise rather than
    // shapes. It also covered close to half the row, which under the CRT's
    // bloom pass reads as a single glowing band rather than individual
    // dim buildings. Walking in strides (2-4 cols of gap, then a 1-2-col
    // building) fixes both: neighbouring columns now agree because they
    // belong to the same building, and the strides guarantee real gaps of
    // bare horizon between them. Heights capped at 2 -- this is a distant
    // hint of a skyline, not competing with the sun or the birds crossing
    // in front of it. Skipped across the sun's own width throughout.
    for (let x = 0; x < term.cols; ) {
      const stride = 2 + Math.floor(hash2(x, 511) * 3)
      const build = hash2(x, 512) > 0.4
      if (!build) { x += stride + 1; continue }
      const w = 1 + Math.floor(hash2(x, 513) * 2)
      const h = 1 + Math.floor(hash2(x, 514) * 2)
      let litWx = -1, litWy = -1
      for (let dx = 0; dx < w; dx++) {
        const bx = x + dx
        if (bx >= term.cols || Math.abs(bx + 0.5 - cx) <= sunHalfW + 1) continue
        for (let k = 0; k < h; k++) {
          const by = horizonY - 2 - k
          if (by < 1) break
          term.put(bx, by, '▓', DIM)
        }
        if (litWx < 0 && hash2(bx, 515) > 0.5) { litWx = bx; litWy = horizonY - 2 - Math.floor(hash2(bx, 516) * h) }
      }
      // One slow-flickering lit window per lucky building.
      if (litWx >= 0 && litWy >= 1 && hash2(x, Math.floor(t * 0.4)) > 0.5) term.put(litWx, litWy, '.', NORMAL)
      x += w + stride
    }
    // Grid: rungs/rails brighten and thicken with proximity to the viewer.
    // Coefficient tuned twice now for "too much white space" -- 0.09
    // originally, 0.2 in the 45th pass, 0.28 here in the 46th so the grid
    // reaches full width well before the bottom row instead of just
    // grazing it, leaving more of the lower screen genuinely filled.
    for (let y = horizonY + 1; y < VIZ_BOT; y++) {
      const depth = y - horizonY
      const spread = Math.min(cx - 1, depth * depth * 0.28)
      const lo = Math.round(cx - spread), hi = Math.round(cx + spread)
      const proximity = Math.min(1, depth / 14)
      const rails = new Map()
      for (let r = -3; r <= 3; r++) {
        const railX = Math.round(cx + r * depth * 1.7)
        if (railX >= 0 && railX < term.cols) rails.set(railX, r === 0 ? '|' : (r < 0 ? '\\' : '/'))
      }
      const railAttr = visualizerLevelAttr(Math.max(0.2, 0.35 + proximity * 0.35))
      const rungPos = (depth + p._outrunPhase * 8) % 6
      const showRung = rungPos < 1
      // 2026-10-16: capped at NORMAL -- the sun is the brightest thing.
      const rungAttr = visualizerLevelAttr(Math.min(0.84, Math.max(0.15, 0.5 + proximity * 0.5)))
      const rungCh = proximity > 0.6 ? '=' : '-'
      // Roadside terrain -- 47th pass, live QA: "build out the land/grass
      // on either side of the road ... less empty space." Scrolls toward
      // the viewer at the same rate as the rungs so it reads as ground
      // rushing past rather than a static hatch fill; density and
      // brightness both grow with proximity so the nearest ground is the
      // most filled-in, matching the grid itself.
      const scrollRow = Math.floor(y + p._outrunPhase * 8 * 0.5)
      const grassDensity = (0.22 + proximity * 0.4) * GRASS_SCALE
      const grassAttr = visualizerLevelAttr(Math.max(0.15, 0.2 + proximity * 0.45))
      for (let x = 0; x < term.cols; x++) {
        if (showRung && x >= lo && x <= hi) { term.put(x, y, rungCh, rungAttr); continue }
        if (rails.has(x)) { term.put(x, y, rails.get(x), railAttr); continue }
        if (x >= lo && x <= hi) { term.put(x, y, ' '); continue }
        const n = hash2(x, scrollRow)
        if (n > 1 - grassDensity) {
          const ch = n > 1 - grassDensity * 0.15 ? '"' : n > 1 - grassDensity * 0.4 ? "'" : n > 1 - grassDensity * 0.7 ? ',' : '.'
          term.put(x, y, ch, grassAttr)
        } else {
          term.put(x, y, ' ')
        }
      }
    }
    // Palm trees -- adds palm trees alongside the city skyline above. Four fixed
    // roadside slots (OUTRUN_PALM_RAILS), each looping a tree from just past
    // the horizon to the bottom row and back, using the exact same
    // depth->screen-position math as the rails above (cx + rail*depth*1.7)
    // so a tree's position always tracks the road it's supposedly planted
    // beside instead of drifting independently of the perspective. No
    // persistent state needed -- position is a pure function of t, same
    // approach as the sun's pulse and the grid's scroll.
    for (let i = 0; i < OUTRUN_PALM_RAILS.length; i++) {
      const rail = OUTRUN_PALM_RAILS[i]
      const cycle = 3.4
      const phase = (p._outrunPhase + i * 0.85) % cycle
      const depth = 1 + (phase / cycle) * 13
      const x = Math.round(cx + rail * depth * 1.7)
      if (x < 0 || x >= term.cols) continue
      const baseY = Math.round(horizonY + depth)
      if (baseY <= horizonY || baseY >= VIZ_BOT) continue
      const scale = Math.max(1, Math.round(1 + depth / 3.5))
      const bright = Math.min(1, 0.25 + (depth / 13) * 0.75)
      const attr = visualizerLevelAttr(bright)
      for (let k = 0; k < scale; k++) {
        const py = baseY - k
        if (py > horizonY && py < VIZ_BOT) term.put(x, py, '|', attr)
      }
      const topY = Math.max(horizonY + 1, baseY - scale)
      if (x - 1 >= 0) term.put(x - 1, topY, '\\', attr)
      if (x + 1 < term.cols) term.put(x + 1, topY, '/', attr)
      term.put(x, topY, '*', attr)
    }
    // 57th pass, 4th rewrite -- Tachometer Sync removed entirely, dropping
    // the RPM gauge from CIRCUIT CRUSH. (Its p._outrunRedline state
    // lingered as a dead field until the 2026-08-25 audit.)
  },
}
