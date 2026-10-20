// SIGNAL -- visualizer effect "FROST" (COLD WAVE), labelled NEON HEART.
//
// 2026-10-18 -- the pixel rebuild. A neon heart bent from one length of
// round glass tube, hung on two wires in a dark, rainy window, its
// reflection rippling in the wet pavement under the curb. It BEATS: every
// kick the tube flares and the whole heart thumps bigger, then settles.
//
// What Matt said: looking at build 2026-10-18.1 live, "neon heart same" --
// it still needed work, maybe a different style. Captured on the real tube
// the box-drawn heart read as a stair-stepped PIXEL-HEART OUTLINE (clip art,
// not neon), the brick wall as a grid, the puddle as a squashed staircase,
// and the KICK tile as the LOUD tile: a 45ms strike and a 0.3s hold cannot
// survive a still, and on the tube a NORMAL '─' and a BRIGHT '─' are the
// same thin line. Tuning could not fix it; box characters cannot curve.
//
// What was chosen, and why:
//   - STYLE: per-cell pixel bitmaps (term.putGlyph, FLAME's renderer). Real
//     neon is a round glowing tube with a soft halo and smooth curves --
//     exactly what 8x16 bitmaps can draw and box characters cannot. The
//     heart is the classic parametric curve, rendered from a distance field
//     of its centre line (built once per grid width), so the tube is a
//     solid core with an exponential halo falling off around it, dithered
//     with FLAME's 4x4 ordered screen. Each cell takes the lowest beam tier
//     its brightest pixel needs and the rest of the cell is dithered down
//     to its own intensity, so the halo fades across tiers rather than
//     stepping. Geometry is in DISPLAY units (a framebuffer pixel is ~0.74
//     as wide as it is tall on the 4:3 face), so the heart is round, not
//     stretched.
//   - SUBJECT: kept -- "synthetic hearts, borrowed neon" is the station's
//     own tagline, and a neon heart in a rainy window is the cold-wave
//     record sleeve. What failed was the rendering. Dropped with the box
//     art: the brick wall (it read as a grid), the transformer box, and the
//     lettering inside the heart (the callsign in terminal text inside a
//     pixel tube read as a caption, not as part of the sign; one subject).
//     Added: rain, which is what keeps the MUTED state alive.
//
// The rubric, point by point:
//   1. ONE SUBJECT: a neon heart. Nameable from across the room.
//   2. ONE MUSICAL ELEMENT: the heart beats. A rising edge on `pulse`
//      (DANCEFLOOR's BEAT_RISE / STEP_GAP idiom, so syntheticAudio's pulse
//      drives it with no tap) sets off a THUMP: the heart scales up
//      THUMP_SCALE, the core goes past NORMAL into BRIGHT and the halo
//      widens and brightens, held THUMP_HOLD_S, then an exponential fall
//      (THUMP_TAU_S) back to rest well inside a 120bpm beat. LEVEL sets the
//      resting glow (core MUTED when quiet, NORMAL when loud, halo with it)
//      over about a second, so it never moves on its own between kicks.
//      SLOW MACHINES: a thump is drawn at full strength on at least
//      THUMP_MIN_FRAMES frames whatever the clock says. At 60fps that is
//      50ms, inside the hold, so it changes nothing; on a set drawing a few
//      frames a second (the Haswell box; tools/viz-sheet.mjs's swiftshader
//      at ~1fps) a clock-timed thump fell entirely between two frames and
//      the beat was invisible -- which is how the KICK tile of the last
//      build came to equal its LOUD tile.
//   3. BRIGHTNESS ORDER: tube core (MUTED..NORMAL, BRIGHT only in a thump)
//      > halo > reflection (two-fifths of the tube, fading with depth) >
//      wires (FAINT, DIM where they meet the sign), curb and rain (FAINT;
//      rain brightens only where it falls through the heart's glow, capped
//      under the tube).
//   4. SHAPES: one smooth tube, thin lines of rain. No shade blocks; the
//      glow is dithered pixels, never '░'.
//   5. FOUR STATES: NO TAP beats to syntheticAudio's 0.9s pulse at its
//      level. LOUD glows NORMAL with a wider halo; quiet glows MUTED. MUTED
//      switches the sign off: the glass shows as a solid unlit tube at DIM
//      (2026-10-20; it was the tube's two walls), with no halo and no beat
//      -- and the rain still falls past it and the puddle still ripples, so
//      it is off, not dead.
//   6. REAL-RADIO TEST: a neon heart in a shop window at night, on a set's
//      screen, is a picture TV has shown for fifty years.
// Also a neon detail with no audio in it: a short stretch of tube by the
// electrodes (the notch, where the glass's two ends meet) drops out for a
// tenth of a second every few seconds -- a hash of the time slot, so it
// carries no state and needs no reset; never a strobe. Nothing here
// touches crt.params, so the rear panel's CALM setting has nothing to gate.
//
// ---- 2026-10-20 polish ----
// The critique (CRITIQUE-1020, POLISH, first pass in pixels): the heart and
// its beat read -- the thump is the best beat on the roster -- but three
// things did not. Each fixed in place; subject, style and beat untouched.
//   - THE REFLECTION read as a moustache or a bat: a stair-stepped,
//     flattened shape that looked wider than the heart. Two causes. Each
//     water row sampled ONE source row 1.75 rows apart, so a shallow stretch
//     of a 3px tube came back as single-pixel steps; and a 1-3.5px sideways
//     shove per row made those steps jagged. Now (TOKYO BAY's method, the
//     critic's ask) each water row takes the brightest of the source rows
//     it squashes (REFLECT_SQUASH 0.6), so a shallow stretch is one dash;
//     every third row is a dark swell gap, so the water is drawn in
//     horizontal dashes; and the swell is TOKYO BAY's gentle one, 0.6px
//     near the curb growing to 3px. Two-fifths of the tube, fading with
//     depth, the heart's own width (the test pins both).
//   - MUTED read as a cookie cutter: the two walls of the glass, FAINT,
//     with a dark core. An unlit tube is a dim SOLID tube -- the core is
//     filled now, at DIM.
//   - THE WIRES were two ticks into the top bar: the lobes were 22px under
//     the canvas top. The heart hangs at HEART_TOP 30 now and the curb sits
//     12px under its point instead of 16, so the reflection keeps room for
//     the whole heart at 0.6. Each wire is solid at its cell's own beam
//     level -- FAINT in the dark, DIM (or the sign's own glow, in the cell
//     it shares with the tube) where it meets the lobe -- because a 1px
//     line at a fraction of its cell's level dithers into a dotted one,
//     which the first cut of this fix did.
//
// ---- history (condensed) ----
// 57th pass "Neon Grid Decay": a full-screen wireframe grid whose nodes lit
// and decayed. Measured well (29% of the screen moved, kick at 3.7x) and
// read as a sparse grid of dots -- nobody could tell what it was.
// 2026-10-16 rebuild: the same neon-heart idea in box characters -- a
// hand-drawn 31x12 '╭─╯' heart with the callsign lettered inside, hung on a
// brick wall, a strike running up the tube in 45ms, a squashed box-drawn
// reflection. The design pass that night made the wall solid brickwork,
// the halo '·' instead of '░', and the word follow the locked station.
// Lessons kept from it: neon strikes all at once (a slow surge measured
// 0.51x on the beat probe -- the change landed BETWEEN kicks); the resting
// glow must never reach the struck tier or a kick has nothing to change;
// a whole outline at BRIGHT is a slab of bloom -- here the tube is a few
// pixels of each cell, not a whole glyph, which is why the thump may light
// it BRIGHT end to end (tests/visual-frost.test.mjs bounds the lit area).

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- the beat -----------------------------------------------------------------
export const BEAT_RISE = 0.2
export const STEP_GAP_S = 0.22
export const THUMP_HOLD_S = 0.08
export const THUMP_TAU_S = 0.16
export const THUMP_SCALE = 0.07
export const THUMP_MIN_FRAMES = 3

// --- the tube -----------------------------------------------------------------
// Beam levels, src/term.js: what each attribute tier draws at. Pixel
// intensities here are on the same 0..255 scale.
const LV_BRIGHT = 255, LV_NORMAL = 205, LV_MUTED = 180, LV_DIM = 150, LV_FAINT = 100
// Tube radius, in display units (one framebuffer pixel tall).
export const TUBE_R = 1.5
// Display units per curve unit. The curve spans y -17..12 (29 units), so
// the heart stands ~177 pixels -- eleven rows.
export const HEART_K = 6.1
// The lobes' tops, in pixels under the canvas top. 2026-10-20: 22 -> 30,
// so the hang wires are long enough to read as wires (see the header).
export const HEART_TOP = 30
// The reflection's vertical squash: a source row per 1/REFLECT_SQUASH
// reflection rows' worth of the heart (the critique's ~0.6).
export const REFLECT_SQUASH = 0.6
// Pixels from the heart's point to the curb.
const CURB_GAP = 12
// The electrodes: no glass within this angle of the notch.
const GAP_THETA = 0.1
// The distance field stores display units x FIELD_Q in a Uint8, out to
// FIELD_REACH -- past where any halo is visible.
const FIELD_Q = 4
const FIELD_REACH = 26
// Below this, a cell is dark and gets a plain space.
const CELL_MIN = 12

// 4x4 ordered dither -- FLAME's.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16)

/** The heart curve at θ (-π..π), curve units, y up. θ = 0 is the notch,
 *  ±π the point. */
export function heartAt(th) {
  const s = Math.sin(th)
  return [16 * s * s * s, 13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th)]
}
// The curve's vertical middle, which it is placed and scaled about.
const HEART_YMID = (12 - 17) / 2

/** Geometry for one grid width, built on first draw (most sessions never
 *  open this effect, and tools/dead-feedback.mjs keeps every boot alive --
 *  FLAME's reason for the same laziness): the distance field of the tube's
 *  centre line, which stretch of tube each pixel is nearest, and the
 *  pixel/bitmap buffers. Rebuilt if the width changes (the 2026-09-13
 *  audit's L5 shape). Framebuffer coordinates throughout: x counts the
 *  blank ninth column of each cell, so the curve is placed where it is
 *  seen. */
function build(term) {
  const cols = term.cols
  const { cellW, cellH } = term.font
  const adv = cellW + 1
  const rows = VIZ_BOT - 1
  const FW = cols * adv, FH = rows * cellH
  // Width of a framebuffer pixel in display units, on the 4:3 face.
  const aspect = (4 / 3) / (FW / (term.rows * cellH))
  const cx = FW / 2
  const cy = HEART_TOP + (12 - HEART_YMID) * HEART_K // lobes HEART_TOP px under the canvas top
  const field = new Uint8Array(FW * FH).fill(255)
  const seg = new Uint8Array(FW * FH)
  const N = 1600 // ~0.4 display units apart along the curve
  const rx = Math.ceil(FIELD_REACH / aspect), ry = FIELD_REACH
  let lobeX = 0, lobeY = 1e9
  for (let n = 0; n < N; n++) {
    const th = -Math.PI + (2 * Math.PI * (n + 0.5)) / N
    if (Math.abs(th) < GAP_THETA) continue
    const [hx, hy] = heartAt(th)
    const X = cx + (hx * HEART_K) / aspect
    const Y = cy - (hy - HEART_YMID) * HEART_K
    if (th > 0 && Y < lobeY) { lobeY = Y; lobeX = X }
    const sid = 1 + Math.floor(((th + Math.PI) / (2 * Math.PI)) * 64)
    const x0 = Math.max(0, Math.floor(X - rx)), x1 = Math.min(FW - 1, Math.ceil(X + rx))
    const y0 = Math.max(0, Math.floor(Y - ry)), y1 = Math.min(FH - 1, Math.ceil(Y + ry))
    for (let y = y0; y <= y1; y++) {
      const dy2 = (y - Y) * (y - Y)
      for (let x = x0; x <= x1; x++) {
        const dx = (x - X) * aspect
        const q = Math.sqrt(dx * dx + dy2) * FIELD_Q
        const i = y * FW + x
        if (q < field[i]) { field[i] = q; seg[i] = sid }
      }
    }
  }
  return {
    cols, cellW, cellH, adv, rows, FW, FH, cx, cy,
    field, seg,
    lobeDX: lobeX - cx, lobeY,
    curbY: Math.round(cy + (HEART_YMID + 17) * HEART_K + CURB_GAP),
    // Everything the heart can light, from its centre at rest scale.
    reachX: (16 * HEART_K + FIELD_REACH) / aspect + 2,
    reachUp: (12 - HEART_YMID) * HEART_K + FIELD_REACH + 2,
    lum: new Uint16Array(FW * FH),
    lut: new Uint16Array(256),
    xmap: new Int32Array(FW),
    mark: new Uint8Array(cols * rows),
    // Two bitmaps per cell, alternated per frame: putGlyph() skips a
    // same-reference re-put, so a bitmap rewritten in place never shows.
    bufs: [0, 1].map(() => Array.from({ length: cols * rows }, () => new Uint16Array(cellH))),
    front: 0,
  }
}

/** Grid cells (x, y on the term) the tube's centre line passes through at
 *  rest scale, every `step` radians round the curve -- where a test looks
 *  for the subject. */
export function tubeCellsFor(term, step = 0.05) {
  const { cellW, cellH } = term.font
  const adv = cellW + 1
  const FW = term.cols * adv
  const aspect = (4 / 3) / (FW / (term.rows * cellH))
  const cx = FW / 2, cy = HEART_TOP + (12 - HEART_YMID) * HEART_K
  const out = []
  for (let th = -Math.PI + step / 2; th < Math.PI; th += step) {
    if (Math.abs(th) < GAP_THETA + 0.05) continue
    const [hx, hy] = heartAt(th)
    const X = cx + (hx * HEART_K) / aspect, Y = cy - (hy - HEART_YMID) * HEART_K
    out.push({ x: Math.floor(X / adv), y: 1 + Math.floor(Y / cellH), th })
  }
  return out
}

/** The thump, 1 at the kick falling to 0. `framesSince` counts drawn
 *  frames since the kick -- see SLOW MACHINES in the header. */
export function thump(age, framesSince) {
  if (age < 0 || age > 2) return 0
  if (framesSince < THUMP_MIN_FRAMES || age < THUMP_HOLD_S) return 1
  return Math.exp(-(age - THUMP_HOLD_S) / THUMP_TAU_S)
}

/** The tier a cell is drawn at: the lowest whose beam reaches its
 *  brightest pixel. */
export const tierOf = (m) => (m >= 232 ? BRIGHT : m >= 193 ? NORMAL : m >= 166 ? MUTED : m >= 126 ? DIM : FAINT)
const levelOf = (a) => (a === BRIGHT ? LV_BRIGHT : a === NORMAL ? LV_NORMAL : a === MUTED ? LV_MUTED : a === DIM ? LV_DIM : LV_FAINT)

/** Marks the cells under a framebuffer rectangle as having something in
 *  them, so the packing pass reads only those. */
function markRect(G, x0, y0, x1, y1) {
  const c0 = Math.max(0, Math.floor(x0 / G.adv)), c1 = Math.min(G.cols - 1, Math.floor(x1 / G.adv))
  const r0 = Math.max(0, Math.floor(y0 / G.cellH)), r1 = Math.min(G.rows - 1, Math.floor(y1 / G.cellH))
  for (let r = r0; r <= r1; r++) G.mark.fill(1, r * G.cols + c0, r * G.cols + c1 + 1)
}

export default {
  key: 'frost',
  label: 'NEON HEART',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._frost = null
    p._frostPrevPulse = 0
    p._frostKickAt = -99
    p._frostKickFrames = 99
    p._frostGlow = 0.5
    p._frostLastT = -1
  },
  /** Re-arms clocks on every visualizer entry. The effect clock restarts at
   *  0, so a kick time or a last-frame time from the last visit would read
   *  as a thump scheduled in the future (the 2026-09-12 audit's shape). */
  reset(p) {
    p._frostPrevPulse = 0
    p._frostKickAt = -99
    p._frostKickFrames = 99
    p._frostGlow = 0.5
    p._frostLastT = -1
  },
  draw(p, s, t) {
    const { term } = s
    if (!p._frost || p._frost.cols !== term.cols) p._frost = build(term)
    const G = p._frost
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    // --- the beat ---------------------------------------------------------------
    const pulse = A.pulse || 0
    if (!p.muted && pulse - p._frostPrevPulse >= BEAT_RISE && t - p._frostKickAt >= STEP_GAP_S) {
      p._frostKickAt = t
      p._frostKickFrames = 0
    } else if (p._frostKickFrames < 99) p._frostKickFrames++
    p._frostPrevPulse = pulse
    const env = p.muted ? 0 : thump(t - p._frostKickAt, p._frostKickFrames)
    // Resting glow: follows the LEVEL over about a second, by the clock.
    let dt = t - p._frostLastT
    if (dt < 0 || dt > 0.5) dt = 0.5
    p._frostLastT = t
    const target = p.muted ? 0 : 0.35 + 0.65 * Math.min(1, A.level || 0)
    p._frostGlow += (target - p._frostGlow) * (1 - Math.exp(-dt / 0.8))
    const glow = p._frostGlow

    // --- the tube's profile, as a table over distance ---------------------------
    // Lit: a solid core, then a halo falling off exponentially and faded to
    // nothing before the field's reach (else it stops at the edge of the
    // stamped window as a box). Off (muted): only the glass's two walls.
    const on = !p.muted
    const core = LV_MUTED - 8 + (LV_NORMAL - LV_MUTED + 8) * glow + (290 - LV_NORMAL) * env
    const haloPeak = 38 + 34 * glow + 110 * env
    const haloLen = 2.6 + 2.4 * glow + 6 * env
    const lut = G.lut
    for (let q = 0; q < 256; q++) {
      const d = q / FIELD_Q
      let v = 0
      if (on) {
        if (d <= TUBE_R) v = core
        else {
          const fade = Math.max(0, 1 - (d - TUBE_R) / (FIELD_REACH - TUBE_R - 2))
          v = haloPeak * Math.exp(-(d - TUBE_R) / haloLen) * fade * fade
        }
      } else if (d <= TUBE_R + 0.2) v = 140 // unlit glass: a solid tube at DIM
      lut[q] = v < 6 ? 0 : Math.min(400, v)
    }

    const { FW, FH, field, seg, lum, cx, cy, curbY, xmap } = G
    lum.fill(0)
    G.mark.fill(0)

    // --- the heart ----------------------------------------------------------------
    // Scaled about its centre by the thump: each pixel samples the rest
    // field where it would sit on the unscaled heart. Only the heart's own
    // box is walked.
    const sc = 1 + THUMP_SCALE * env
    const buzz = on && hash2(Math.floor(t * 9), 7) < 0.04
    const xLo = Math.max(0, Math.floor(cx - G.reachX * sc)), xHi = Math.min(FW - 1, Math.ceil(cx + G.reachX * sc))
    const top = Math.max(0, Math.floor(cy - G.reachUp * sc))
    for (let x = xLo; x <= xHi; x++) xmap[x] = Math.round(cx + (x - cx) / sc)
    for (let y = top; y < curbY; y++) {
      const sy = Math.round(cy + (y - cy) / sc)
      if (sy < 0 || sy >= FH) continue
      const row = y * FW, srow = sy * FW
      for (let x = xLo; x <= xHi; x++) {
        const si = srow + xmap[x]
        const f = field[si]
        if (f === 255) continue
        const q = (f * sc) | 0
        if (q >= 255) continue
        // The buzzing stretch: just right of the notch.
        lum[row + x] = buzz && seg[si] >= 33 && seg[si] <= 36 ? lut[q] * 0.3 : lut[q]
      }
    }
    markRect(G, xLo, top, xHi, curbY - 1)
    // Hang wires, one pixel wide, from the top of the canvas to the lobe
    // tops: FAINT up in the dark, DIM in the cell row they meet the sign.
    // A wire's value is its cell's whole beam level, never a fraction of
    // it -- a 1px line under the dither breaks into a dotted one (the first
    // cut of this did exactly that) -- so in the cell it shares with the
    // tube it takes that cell's brightest pixel: the wire lit by the sign.
    for (const side of [-1, 1]) {
      let wx = Math.round(cx + side * G.lobeDX * sc)
      if (wx % G.adv === G.adv - 1) wx-- // not in a cell's blank ninth column
      const wy = Math.round(cy + (G.lobeY - cy) * sc - TUBE_R - 1)
      const lastRow = Math.floor((wy - 1) / G.cellH)
      for (let r = 0; r <= lastRow; r++) {
        let v = LV_FAINT
        if (r === lastRow) {
          v = LV_DIM
          const c0 = Math.floor(wx / G.adv) * G.adv
          for (let y = r * G.cellH; y < (r + 1) * G.cellH; y++) {
            for (let x = c0; x < c0 + G.cellW; x++) if (lum[y * FW + x] > v) v = lum[y * FW + x]
          }
        }
        for (let y = r * G.cellH; y < Math.min(wy, (r + 1) * G.cellH); y++) if (lum[y * FW + wx] < v) lum[y * FW + wx] = v
      }
      markRect(G, wx, 0, wx, wy)
    }

    // --- the wet pavement ---------------------------------------------------------
    // The curb, then the heart upside down in the puddle (2026-10-20, TOKYO
    // BAY's method): squashed to REFLECT_SQUASH, two-fifths as bright and
    // fading with depth, drawn as horizontal dashes -- every third row left
    // dark, each lit row the brightest of the source rows it squashes (so a
    // shallow stretch of tube is one dash, not a staircase of single
    // pixels), slid sideways by a gentle swell that grows with depth. Now
    // and then a pair of rows is lost where the rain breaks the surface.
    lum.fill(70, curbY * FW, curbY * FW + FW)
    markRect(G, 0, curbY, FW - 1, curbY)
    const deep = FH - curbY - 1
    const drop = Math.floor(t * 3)
    const step = 1 / REFLECT_SQUASH
    for (let y = curbY + 2; y < FH; y++) {
      const depth = y - curbY
      if (depth % 3 === 0) continue // the dark between the swells
      const k = depth / deep
      if (hash2(y >> 1, drop) < 0.08) continue
      const s0 = Math.round(curbY - (depth - 1) * step), s1 = Math.round(curbY - depth * step)
      if (s1 < 0) continue
      const amp = 0.6 + 2.4 * k
      const shift = Math.round(amp * Math.sin(depth * 0.5 - t * 2.2 + 2 * Math.sin(depth * 0.11 + t * 0.5)))
      const gain = 0.4 * (1 - 0.45 * k)
      const row = y * FW
      const a = Math.max(0, xLo - shift - 4), b = Math.min(FW - 1, xHi - shift + 4)
      for (let x = a; x <= b; x++) {
        const sx = x + shift
        if (sx < 0 || sx >= FW) continue
        let v = 0
        for (let sy = Math.max(0, s1); sy < s0; sy++) { const u = lum[sy * FW + sx]; if (u > v) v = u }
        if (v) lum[row + x] = v * gain
      }
      markRect(G, a, y, b, y)
    }

    // --- rain on the glass ----------------------------------------------------------
    // Thin streaks falling past the sign, lit by it where they cross its
    // glow and capped under the tube. Pure functions of t: no state.
    for (let i = 0; i < 34; i++) {
      const v = 150 + 110 * hash2(i, 1)
      const len = 8 + Math.floor(9 * hash2(i, 2))
      const span = curbY + len
      const pos = t * v + hash2(i, 3) * span
      const cyc = Math.floor(pos / span)
      const head = Math.floor(pos - cyc * span)
      let x = Math.floor(hash2(i, cyc * 7 + 4) * FW)
      if (x % G.adv === G.adv - 1) x--
      for (let j = 0; j < len; j++) {
        const y = head - j
        if (y < 0 || y >= curbY) continue
        const i2 = y * FW + x
        const here = lum[i2]
        const r = 40 + 50 * (1 - j / len) + 0.7 * Math.min(here, 140)
        if (r > here) lum[i2] = Math.min(130, r)
      }
      markRect(G, x, Math.max(0, head - len), x, Math.min(curbY - 1, head))
    }

    // --- pixels to cells --------------------------------------------------------------
    G.front ^= 1
    const bufs = G.bufs[G.front]
    const { cols, cellW, cellH, adv, rows, mark } = G
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ci = r * cols + c
        if (!mark[ci]) { term.put(c, r + 1, ' '); continue }
        const base = r * cellH * FW + c * adv
        let m = 0
        for (let py = 0; py < cellH; py++) {
          const o = base + py * FW
          for (let px = 0; px < cellW; px++) if (lum[o + px] > m) m = lum[o + px]
        }
        if (m < CELL_MIN) { term.put(c, r + 1, ' '); continue }
        const attr = tierOf(m)
        const inv = 1 / levelOf(attr)
        const bits = bufs[ci]
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
        if (any) term.putGlyph(c, r + 1, bits, attr)
        else term.put(c, r + 1, ' ')
      }
    }
  },
}
