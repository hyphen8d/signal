// SIGNAL -- visualizer effect "LAGOON" (TRADEWINDS, 2026-09-13).
//
// A tiki-postcard night: a big moon over a lagoon, a low volcanic island on
// the horizon, the moon's reflection broken into a column of bright dashes
// by the swell, a leaning palm framing the left edge and two tiki torches
// flickering on the near beach. Exotica sold a Polynesia that never existed
// -- the lounge-record-sleeve version, not the real Pacific -- and this is
// that sleeve, which is why it is a composed PICTURE rather than a field.
//
// It replaces TRADEWINDS' borrow of RIPPLE (CITY LIGHTS' rain rings). The
// roster note on that borrow said water on a lagoon station was the right
// idea and rings the wrong way to get it; so the water here is deliberately
// HORIZONTAL -- swell lines and a vertical glitter path, never a radial
// shape -- and nothing in the frame expands from a point.
//
// Audio, all on AMPLITUDE (never a `t *` frequency -- see the brief in
// shared.js's neighbours): bass swells the waves and breaks the reflection
// harder, treble flickers the torches and glitters the reflection's edges,
// and a real onset flares both flames for ~0.7s with a few rising sparks.
// Muted, SILENT_AUDIO settles every mapping at its floor: flat water, a
// clean moon column, torches burning low and steady. Still a night, not a
// frozen frame -- the stars, fronds and swell keep their slow t-driven drift.
//
// Everything except the flare is a pure function of (x, y, t, audio); the
// geometry (island profile, trunk curve, fronds, beaches) is precomputed once
// at import, so the per-frame cost is one pass over 80x21 cells plus a few
// dozen overlay puts.
//
// 2026-10-16 (design pass) -- judged off the real tube: the moon was a
// 15x7 block of '0@#' letters and read as text; the palm (two slashes a
// row, near-flat fronds with leaflets and 'o/o' coconuts) read as a hut;
// and the onset flare was one '*' swapped for the tongue, so LOUD and KICK
// could not be told apart. Changed: the moon is its rim in half-blocks
// (KEEP's crescent technique, plus '▌'/'▐' on the sides) at NORMAL, dark
// inside but for two DIM ░ maria; the trunk is one '(' / '/' a row; five
// long fronds arch up off the crown and fall past it; and a real onset
// stands a 2-3 row BRIGHT flame column on each torch for the whole flare.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, auMul, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// Terminal cells are ~2:1 tall; every "visual" distance multiplies dy by this.
const ASPECT = 2.1

// --- the composition (designed on the 80-column desktop grid) -------------
// 2026-09-13 -- the horizon sits on row 13 of the 1..21 canvas, a touch
// above two-thirds, because the water needs at least eight rows for the
// reflection to read as a path that WIDENS toward you; at row 14 it was a
// stub. The moon is right of centre so the palm can own the left third
// without crowding it, and the island sits between the two.
export const HORIZON_Y = 13
export const MOON_X = 51
export const MOON_Y = 6
// Radius in COLUMNS: 7 cols wide each side, 7/2.1 = ~3.3 rows each side, so
// the disc is 15 cols x 7 rows -- round on the tube, not an egg.
export const MOON_R = 7
export const TORCHES = [
  // Nearer torch is taller and on the higher sand at the right edge, which is
  // all the perspective two props need.
  { x: 75, cupY: 15 },
  { x: 66, cupY: 17 },
]
// The flare's decay, in seconds of effect clock.
const FLARE_S = 0.7
// Flare level above which the flame column stands three rows, not two.
export const FLARE_TALL = 0.35

// Is a half-row inside the moon? Half-rows are centred at y -/+ 0.25.
function inMoon(x, hy) {
  const dx = x - MOON_X, dy = (hy - MOON_Y) * ASPECT
  return dx * dx + dy * dy < (MOON_R + 0.5) * (MOON_R + 0.5)
}
/** The moon at cell (x, y): null (sky), 'in' (inside the rim), or the rim
 *  glyph. Pure, exported so the test can walk the disc. */
export function moonCell(x, y) {
  const top = inMoon(x, y - 0.25), bot = inMoon(x, y + 0.25)
  if (!top && !bot) return null
  if (top !== bot) return top ? '▀' : '▄'
  // Both halves in: rim if the half-row above or below is out (the top and
  // bottom arcs, '▀'/'▄' would leave a hole) or a side neighbour is out.
  if (!inMoon(x, y - 0.75)) return '▄'
  if (!inMoon(x, y + 0.75)) return '▀'
  const l = inMoon(x - 1, y - 0.25) && inMoon(x - 1, y + 0.25)
  const r = inMoon(x + 1, y - 0.25) && inMoon(x + 1, y + 0.25)
  if (!l) return '▐'
  if (!r) return '▌'
  return 'in'
}

// Island profile: height in rows above the horizon, per column. A volcano cone
// (slope 0.6 row/col, a hair steeper than 45 degrees once ASPECT is applied, so
// it reads as a volcano rather than a hill) plus a long low shoulder and spit.
const ISLAND = new Float32Array(80)
for (let x = 0; x < 80; x++) {
  const cone = 4.3 - Math.abs(x - 31) * 0.6
  const shoulder = 1.7 - Math.abs(x - 39) * 0.2
  const spit = x >= 22 && x <= 47 ? 0.6 : 0
  ISLAND[x] = Math.max(0, cone, shoulder, spit)
}
// Two tiny palms on the island's shoulder -- the postcard's second palm.
const ISLAND_PALMS = [40, 43]

// Beaches: sand height in rows above the canvas floor. A bank under the palm
// at the left corner and a longer one under the torches at the right; the
// middle is open water to the bottom row so the reflection reaches the viewer.
const SAND = new Float32Array(80)
for (let x = 0; x < 80; x++) {
  const left = 2.4 - x * 0.17
  const right = Math.min(2.6, (x - 57) * 0.12)
  SAND[x] = Math.max(0, left, right)
}

// Palm trunk: a quadratic bezier from a base in the left sand to a crown high
// over the water, sampled once into one x per row.
const CROWN = { x: 17, y: 5 }
const TRUNK_X = new Float32Array(VIZ_BOT + 1).fill(NaN)
{
  // 2026-10-16 (design pass) -- control point lowered from (5, 9): the old
  // curve went near-vertical then turned 3 columns a row under the crown,
  // which is where the two-character '(/' rows came from.
  const p0 = { x: 3, y: 21 }, p1 = { x: 6, y: 13 }, p2 = CROWN
  for (let i = 0; i <= 400; i++) {
    const s = i / 400, u = 1 - s
    const x = u * u * p0.x + 2 * u * s * p1.x + s * s * p2.x
    const y = Math.round(u * u * p0.y + 2 * u * s * p1.y + s * s * p2.y)
    if (y > CROWN.y && y <= 21) TRUNK_X[y] = x
  }
}
// Fronds: [angle in degrees (0 = right, -90 = up), length in cols, droop].
// Mostly sideways and drooping, the silhouette that says "palm" rather than
// "star"; two short hanging ones fill the crown out from underneath.
// 2026-10-16 (design pass) -- five long arching strokes, from seven. The
// old set was near-flat (droop 5-7 over length 12-15 ends a row or two
// below the crown), so the two big ones made one horizontal line with
// leaflets hanging off it: a roof, with the 'o/o' coconuts as its eaves.
// Each frond now rises off the crown and falls past it -- droop is about
// the length -- which is the arc that says palm.
const FRONDS = [
  [-40, 16, 15], [-4, 13, 12], [220, 15, 15], [184, 12, 11], [-72, 9, 10],
]

// Direction -> rib character, from the frond's tangent in VISUAL space.
function ribChar(dx, dy) {
  let a = Math.atan2(dy, dx) * 180 / Math.PI
  if (a < 0) a += 180
  if (a < 22 || a >= 158) return '-'
  if (a < 68) return '\\'
  if (a < 112) return '|'
  return '/'
}

export default {
  key: 'lagoon',
  label: 'LAGOON',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    // The only stored state: when the last onset flare began, on the effect
    // clock. -Infinity means "no flare".
    p._lagoonFlareAt = -Infinity
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // 2026-09-13 -- _lagoonFlareAt is an absolute effect-clock value, the
    // exact shape the 2026-09-12 audit found in four effects: left over from
    // a long visit it would sit in the future of the restarted clock. The
    // draw deliberately does NOT self-heal it, so this reset is the one
    // thing keeping it honest and tests/visual-lagoon.test.mjs can see it.
    p._lagoonFlareAt = -Infinity
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    if (A.onset) p._lagoonFlareAt = t
    const fAge = t - p._lagoonFlareAt
    const flare = fAge >= 0 && fAge < FLARE_S ? (1 - fAge / FLARE_S) ** 1.5 : 0

    // 2026-09-13 -- swell floors at 0.2, not 0: muted water still carries a
    // few slow crests, because a lagoon with no line on it at all reads as
    // sky continuing below the horizon.
    const swell = auMul(A, A.bass, 0.2, 1)
    const treble = auMul(A, A.treble, 0, 1)
    // Crest threshold on a -1..1 wave: 0.8 muted (a handful of lines), down
    // to 0.4 on a heavy bass passage (the lagoon properly rolling).
    const crest = 0.9 - swell * 0.5
    // The reflection's horizontal wander per row, in cells -- amplitude only.
    const wander = 0.3 + swell * 1.3
    // Per-cell chance a reflection dash survives: a calm lagoon holds a
    // nearly solid column, a rolling one breaks it into scattered dashes.
    const hold = 1.05 - swell * 0.45

    // --- base pass: sky, moon, island, horizon, water, beaches ------------
    for (let y = 1; y < VIZ_BOT; y++) {
      const d = y - HORIZON_Y
      for (let x = 0; x < cols; x++) {
        const sand = SAND[x] || 0
        // Beach.
        if (y > 21 - sand) {
          const hv = hash2(x * 3 + 7, y * 5)
          const ch = hv > 0.8 ? '.' : hv > 0.62 ? ',' : hv > 0.52 ? '`' : ' '
          term.put(x, y, ch, hv > 0.9 ? DIM : FAINT)
          continue
        }
        if (d < 0) {
          // Island (above the horizon line itself).
          const ih = ISLAND[x] || 0
          if (-d <= ih) {
            const top = -d > ih - 1
            if (top) {
              const slope = (ISLAND[x + 1] || 0) - (ISLAND[x - 1] || 0)
              const ch = slope > 0.5 ? '/' : slope < -0.5 ? '\\' : ih - Math.floor(ih) >= 0.5 ? '▄' : '_'
              term.put(x, y, ch, DIM)
            } else term.put(x, y, '▓', FAINT)
            continue
          }
          // Moon.
          // 2026-09-13 (audit L6, tube check) -- the fill is up to ~44 BRIGHT
          // '@' a frame in runs of 8, which on paper is the slab shape KEEP
          // and UPRISING glared with. Checked on the real shader (headless
          // swiftshader still of TRADEWINDS): it does not slab. '@' is a
          // stroked glyph that lights a fraction of its cell, so the disc
          // reads as a bright textured face with the '#' maria and 'O' rim
          // still legible, not as a lit block. Left as it is; the lesson is
          // coverage, not tier -- a BRIGHT '█' fill here would be the bug.
          // 2026-10-16 (design pass) -- the face is gone: it was a 15x7
          // block of 'O', '@' and '#' that read as TEXT on the tube, not
          // as a disc. Now the moon is its rim only, drawn the way KEEP's
          // crescent is: sampled per half-row and set in half-blocks, so
          // the top and bottom of the circle are sub-cell curves. The sides
          // take '▐'/'▌' (the half of the cell toward the inside) so the
          // rim is half a cell thick all the way round. NORMAL, the
          // brightest steady thing in the sky. Two dim maria inside give it
          // a face without filling it into a slab.
          const mdx = x - MOON_X, mdy = (y - MOON_Y) * ASPECT
          const md = Math.sqrt(mdx * mdx + mdy * mdy)
          const mc = moonCell(x, y)
          if (mc) {
            if (mc === 'in') {
              const m1x = mdx + 2.5, m1y = mdy + 2.2, m2x = mdx - 2.8, m2y = mdy - 2.6
              const mare = m1x * m1x + m1y * m1y < 7 || m2x * m2x + m2y * m2y < 5
              term.put(x, y, mare ? '░' : ' ', DIM)
            } else term.put(x, y, mc, NORMAL)
            continue
          }
          // Halo: a thin, sparse ring of moonlit haze.
          if (md < MOON_R + 3.2) {
            const hv = hash2(x + 101, y * 7)
            const tw = Math.sin(t * 0.6 + hv * 40)
            term.put(x, y, hv > 0.72 && tw > -0.4 ? '·' : ' ', FAINT)
            continue
          }
          // Stars: a fixed field, thinning toward the horizon haze, each on
          // its own slow twinkle period -- 5 to 14s -- so the sky breathes
          // instead of blinking in unison. Nothing near the moon.
          const hv = hash2(x + 13, y + 57)
          const density = 0.955 + (y / HORIZON_Y) * 0.03
          if (hv > density && md > MOON_R + 5) {
            const tw = 0.5 + 0.5 * Math.sin(t * (0.45 + hv * 0.8) + hv * 977)
            if (tw < 0.12) { term.put(x, y, ' '); continue }
            const big = hash2(y + 3, x + 91) > 0.82
            const ch = big && tw > 0.7 ? '+' : tw > 0.45 ? '·' : '.'
            term.put(x, y, ch, tw > 0.8 ? (big ? NORMAL : MUTED) : tw > 0.4 ? DIM : FAINT)
            continue
          }
          term.put(x, y, ' ')
          continue
        }
        if (d === 0) {
          // The horizon line, under the island's foot.
          term.put(x, y, (ISLAND[x] || 0) > 0 ? '▓' : '─', (ISLAND[x] || 0) > 0 ? FAINT : DIM)
          continue
        }
        // Water. Waves grow toward the viewer (lower spatial frequency with
        // distance below the horizon) and roll slowly sideways; two terms at
        // different rates so crests form and dissolve instead of sliding.
        const kx = 0.95 / (0.55 + d * 0.3)
        const wave = Math.sin(x * kx + t * 0.45 + d * 2.3) * 0.65 +
          Math.sin(x * kx * 1.9 - t * 0.28 + d * 4.1) * 0.35
        // Moon path: centred under the moon, widening with nearness.
        const rx = MOON_X + Math.sin(t * 0.8 + d * 1.7) * wander
        const halfW = 1 + d * 0.75
        const dxr = Math.abs(x - rx)
        if (dxr <= halfW) {
          const presence = 1 - dxr / (halfW + 1)
          // The dash pattern re-rolls ~5 times a second, each row on its own
          // phase so the column shimmers rather than strobing as one.
          const n = hash2(x * 3 + d * 17, Math.floor(t * 5 + d * 0.61))
          const broken = wave < -0.2 - (1 - swell) * 0.8
          if (!broken && n < presence * hold) {
            const core = dxr <= halfW * 0.5
            const glint = hash2(x + d * 31, Math.floor(t * 9)) < treble * 0.35
            term.put(x, y, core ? '=' : '─', core || glint ? BRIGHT : NORMAL)
            continue
          }
        }
        // Lapping foam where water meets a beach.
        if (sand > 0 && y + 1 > 21 - sand) {
          // Only the crest of each lap draws, so the edge comes and goes
          // rather than sitting as a solid band along the beach.
          const lap = Math.sin(t * 0.7 - x * 0.35 + y)
          if (lap > 0.75 - swell * 0.35) { term.put(x, y, lap > 0.9 ? '≈' : '~', lap > 0.9 ? MUTED : DIM); continue }
        }
        // The row under the horizon is too fine for its sine to read as
        // anything but evenly spaced dots, so half its crests are culled by
        // a fixed hash -- distant chop, not a dotted rule.
        if (wave > crest && (d > 1 || hash2(x + 211, 3) > 0.5)) {
          const top = wave > crest + (1 - crest) * 0.5
          const ch = d <= 1 ? '·' : top && d > 3 ? '~' : '-'
          term.put(x, y, ch, d <= 2 ? FAINT : d <= 4 ? (top ? MUTED : DIM) : (top ? NORMAL : MUTED))
        } else if (d > 4 && wave < -0.94) {
          term.put(x, y, '_', FAINT)
        } else term.put(x, y, ' ')
      }
    }

    // --- island palms ------------------------------------------------------
    for (const ix of ISLAND_PALMS) {
      const top = HORIZON_Y - Math.floor(ISLAND[ix]) - 1
      term.put(ix - 1, top, '-', DIM)
      term.put(ix, top, 'Y', DIM)
      term.put(ix + 1, top, '-', DIM)
    }

    // --- tiki torches --------------------------------------------------------
    for (let i = 0; i < TORCHES.length; i++) {
      const { x: tx, cupY } = TORCHES[i]
      const base = 21
      for (let y = cupY + 1; y <= base; y++) term.put(tx, y, y % 3 === 0 ? '+' : '|', MUTED)
      term.put(tx - 1, cupY, '\\', MUTED)
      term.put(tx, cupY, '#', NORMAL)
      term.put(tx + 1, cupY, '/', MUTED)
      // Flicker: re-rolled ~9x a second per torch; treble widens how far the
      // flame height and lean swing, a flare adds up to two rows.
      const f1 = hash2(tx, Math.floor(t * 9))
      const f2 = hash2(tx + 5, Math.floor(t * 7))
      const height = 1.3 + (0.3 + treble * 1.1) * f1 + flare * 2.2
      const lean = Math.round((f2 - 0.5) * (0.5 + treble * 1.5))
      // The body is a teardrop, (W) -- a letter-O body was tried and read as
      // a face on a stick. The tongue above leans with the flicker.
      term.put(tx - 1, cupY - 1, '(', f1 > 0.5 ? NORMAL : MUTED)
      term.put(tx, cupY - 1, 'W', BRIGHT)
      term.put(tx + 1, cupY - 1, ')', f1 > 0.5 ? MUTED : NORMAL)
      if (flare > 0) {
        // 2026-10-16 (design pass) -- the flare was a '*' swapped in for
        // the tongue: one cell, and LOUD and KICK could not be told apart.
        // Now a real onset stands a flame COLUMN on the cup -- three rows
        // of BRIGHT while it is fresh, two as it dies -- for the whole
        // flare, so the beat is a torch roaring up, not a changed glyph.
        const rows = flare > FLARE_TALL ? 3 : 2
        for (let k = 0; k < rows; k++) {
          const fy = cupY - 2 - k
          if (fy < 1) break
          const ch = k === rows - 1 ? '^' : (k + (f1 > 0.5 ? 1 : 0)) % 2 ? ')' : '('
          term.put(tx + (k === rows - 1 ? lean : 0), fy, ch, BRIGHT)
        }
      } else {
        const tongue = lean < 0 ? '(' : lean > 0 ? ')' : '^'
        if (height > 1.5) term.put(tx + lean, cupY - 2, tongue, height > 2 ? BRIGHT : NORMAL)
        if (height > 2.4) term.put(tx + lean, cupY - 3, "'", NORMAL)
        if (height > 3.1) term.put(tx + lean * 2, cupY - 4, '.', MUTED)
      }
      // Sparks lifting off a flare.
      if (fAge >= 0 && fAge < FLARE_S * 1.4) {
        const sy = cupY - 5 - Math.floor(fAge * 9)
        if (sy >= 1) term.put(tx + Math.round(Math.sin(fAge * 7 + i * 2) * 1.5), sy, '.', DIM)
      }
    }

    // --- the palm (frontmost) ------------------------------------------------
    // Sway: the fronds swing on independent slow periods; the upper trunk
    // follows by up to a cell. The breeze never stops (these are the trade
    // winds), but louder passages move it further.
    const sway = auMul(A, A.level, 0.6, 1.25)
    const lean = Math.sin(t * 0.45) * 0.8 * sway
    // 2026-10-16 (design pass) -- ONE character a row: '(' where the trunk
    // rises near-vertical (the bow of the curve), '/' where it leans over.
    // The old pair per row ('(/', '//') read as a thick ladder, and with
    // the flat fronds above it, as a hut.
    for (let y = CROWN.y + 1; y <= 21; y++) {
      const frac = (21 - y) / (21 - CROWN.y)
      const x = Math.round(TRUNK_X[y] + lean * frac * frac)
      const above = y - 1 > CROWN.y ? TRUNK_X[y - 1] : CROWN.x
      term.put(x, y, above - TRUNK_X[y] < 0.6 ? '(' : '/', MUTED)
    }
    const cx = CROWN.x + lean
    for (let i = 0; i < FRONDS.length; i++) {
      const [deg, len, droop0] = FRONDS[i]
      const a = (deg * Math.PI) / 180 + Math.sin(t * 0.55 + i * 0.9) * 0.07 * sway
      const droop = droop0 + Math.sin(t * 0.7 + i * 1.3) * 0.9 * sway
      const ca = Math.cos(a), sa = Math.sin(a)
      const steps = Math.ceil(len * 1.6)
      for (let k = 1; k <= steps; k++) {
        const u = k / steps
        const x = Math.round(cx + ca * len * u)
        const y = Math.round(CROWN.y + (sa * len * u + droop * u * u) / ASPECT)
        if (y < 1 || y >= VIZ_BOT || x < 0 || x >= cols) continue
        // Design pass: no hanging leaflets and no coconuts -- each frond is
        // one clean stroke, MUTED to its midpoint and DIM to the tip.
        term.put(x, y, ribChar(ca * len, sa * len + 2 * droop * u), u < 0.55 ? MUTED : DIM)
      }
    }
  },
}
