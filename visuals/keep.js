// SIGNAL -- visualizer effect "KEEP" (THE CRYPT). 2026-09-13.
//
// A ruined castle keep at night: a shaded block-character silhouette on a
// rocky crag -- a crenellated keep, one tall tower, one broken tower and a
// breached curtain wall -- under a crescent moon and sparse stars, with dim
// mountain ridges behind it, a few windows lit by torchlight, and mist
// rolling through the lower rows around the crag's base. Now and then a
// small flock of bats crosses the sky.
//
// Why it fits: THE CRYPT is dungeon synth -- lo-fi keyboard music scoring a
// ruin that never existed -- and its curation profile draws the boundary as
// FANTASY ("a ruin, a forest, a keep"), not industrial dread. The station
// used to borrow DREAD, the secret NIN station's deliberately hostile
// flickering panel grid, which was that boundary crossed in picture form.
// KEEP is the opposite temperament on purpose: slow, storybook-dark, mostly
// dark sky and silhouette, and nothing on it ever strobes. The genre has
// almost no drums, so the audio hooks are warmth and weather rather than
// hits: mid/level feed the torchlight, bass/level thicken the mist, and a
// real onset makes the bat flight more likely.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// The castle, as art rather than as procedure: a silhouette is only worth
// drawing if it reads as a castle at a glance, and hand-placed merlons read
// where generated ones read as a bar chart. Legend: '#' masonry ('▓'), '^'
// upper half, '_' lower half, 'w' a torch-lit window, 'o' a dark window,
// 'g' the gate (dark, and never shows stars or mist through it), ' ' sky.
// Every row is padded to the same width at build time. Row 0 of the art is
// canvas row KEEP_ART_TOP; the last row sits on the crag.
//
// 2026-09-13 -- composition: tall tower on the left, the keep in the middle
// with its gate, the broken tower and breached curtain wall to the right,
// and the moon clear of all of it in the upper right, so the brightest
// object in the frame never overlaps the silhouette.
export const KEEP_ART = [
  '        # # # #                                ',
  '        #######                                ',
  '         #####                                 ',
  '         ##o##                                 ',
  '         #####                      _          ',
  '         ##w##                     ##  _       ',
  '         #####                    _###_#       ',
  '         ##### # # # # # # # #    ######       ',
  '         #####################    ##w###       ',
  ' #  _    ####w######o#####w###    ######       ',
  ' ## #_ _ #####################    ######  #_   ',
  ' ####### #########w###########    ######  ##  _',
  '######## ###########^^^#######o################',
  '####################ggg########################',
  '####################ggg########################',
]
export const KEEP_ART_TOP = 2
export const KEEP_ART_X = 8
// The crenellated parapet the tests read back -- row 7 of the art, the
// keep's own battlement, where merlon and gap alternate for 19 cells.
export const KEEP_CRENEL_ROW = KEEP_ART_TOP + 7

// Moon: centre in cell coordinates, radius in COLUMN widths. The disc is
// sampled per half-row (a terminal cell is ~2:1 tall, so one half-row is
// one column wide) and drawn with the half-blocks, which is what makes a
// four-row crescent read as round rather than as a stack of bars. The
// crescent is the disc minus a second disc offset to the right.
// 2026-09-13 -- the first offset had a vertical component and rendered as
// a lopsided claw; a purely horizontal offset gives the symmetric waxing
// crescent a storybook night wants, five rows tall.
export const KEEP_MOON = { cx: 68, cy: 4.5, r: 4.2, bx: 2.0, by: 0, br: 3.8 }

// Mist occupies the rows from KEEP_MIST_TOP down; its density ramps up
// toward the bottom of the canvas so the crag's base is buried and the
// castle's upper half never is.
export const KEEP_MIST_TOP = 12

// Bats. One flock at a time; its timing lives on the effect clock, so
// reset() clears it (see there). Speed in columns per second -- 2026-09-13:
// slow enough that the flap frames read as flapping rather than as noise,
// fast enough that the flight is an event rather than scenery (~11s across).
export const KEEP_BAT_SPEED = 9
// Minimum quiet sky between flights, and before the first one on a visit:
// a flock every few seconds would turn the rare thing into weather.
export const KEEP_BAT_COOLDOWN = 15
export const KEEP_BAT_FIRST = 5
// Per-frame chance a flight starts: ambient (~1 per 50s at 60fps once the
// cooldown is past), and on a real onset -- an onset is a single frame, so
// this is the "more likely on a beat" hook without making it metronomic.
export const KEEP_BAT_AMBIENT_CHANCE = 1 / 3000
export const KEEP_BAT_ONSET_CHANCE = 0.06
// Flock shape, trailing the lead bat: dx behind it, dy below it, big bats
// ('^v^') up front and smaller, further ones ('v') behind.
const FLOCK = [
  { dx: 0, dy: 0, big: true, ph: 0 },
  { dx: 5, dy: 1, big: true, ph: 1.3 },
  { dx: 9, dy: -1, big: false, ph: 2.1 },
  { dx: 12, dy: 2, big: false, ph: 0.7 },
  { dx: 16, dy: 0, big: false, ph: 2.9 },
]
const BAT_TRAIL = 20

// Scene-cell kinds, precomputed once per width.
const SKY = 0, MOON = 1, RIDGE = 2, ROCK = 3, WINDOW = 4, GATE = 5

/** Builds the static half of the picture -- everything that never moves --
 *  so the per-frame pass is a lookup plus the few live layers on top. */
function buildScene(cols) {
  const rows = VIZ_BOT
  const n = cols * rows
  const kind = new Uint8Array(n)
  const ch = new Array(n).fill(' ')
  const attr = new Uint8Array(n).fill(FAINT)
  const star = new Float32Array(n).fill(-1)
  const windows = []

  // Mountains: two ridges as half-block profiles, both FAINT. 2026-09-13
  // -- the first build filled each ridge solid to the bottom of the canvas
  // and the right third of the frame became one slab of '▓' as heavy as
  // the castle. Distant mountains are an edge and a haze, not a mass: a
  // lit rim line, one row of '▒' under it, then '░' thinning out by hash
  // into the dark, so the mist line below has something to swallow and
  // the silhouette stays the only solid thing in the frame.
  const ridge = (x, far) => far
    ? 20.5 + 2.2 * Math.sin(x * 0.085 + 1.0) + 1.2 * Math.sin(x * 0.21 + 0.4) + 0.5 * Math.sin(x * 0.53)
    : 25.5 + 1.6 * Math.sin(x * 0.12 + 3.1) + 1.0 * Math.sin(x * 0.31 + 1.7)
  for (const far of [true, false]) {
    for (let x = 0; x < cols; x++) {
      const top = ridge(x, far)  // in half-rows
      for (let y = 1; y < rows; y++) {
        const i = y * cols + x
        const depth = y * 2 + 1 - top  // half-rows below the rim
        if (depth < 0) continue
        let c
        if (depth < 1) c = '▄'
        else if (depth < 3) c = far ? '░' : '▒'
        else if (hash2(x * 5 + (far ? 1 : 2), y) < Math.max(0.05, 0.45 - depth * 0.08)) c = '░'
        else c = ' '
        kind[i] = RIDGE
        ch[i] = c
        attr[i] = FAINT
      }
    }
  }

  // Castle art.
  const artW = Math.max(...KEEP_ART.map((l) => l.length))
  let artL = cols, artR = 0
  KEEP_ART.forEach((line, ay) => {
    const y = KEEP_ART_TOP + ay
    for (let ax = 0; ax < artW; ax++) {
      const c = line[ax] || ' '
      if (c === ' ') continue
      const x = KEEP_ART_X + ax
      if (x < 0 || x >= cols || y < 1 || y >= rows) continue
      const i = y * cols + x
      if (ay === KEEP_ART.length - 1) { artL = Math.min(artL, x); artR = Math.max(artR, x) }
      if (c === 'w' || c === 'o') {
        kind[i] = WINDOW; ch[i] = ' '
        if (c === 'w') windows.push({ x, y, i: windows.length })
      } else if (c === 'g') {
        kind[i] = GATE; ch[i] = ' '
      } else {
        kind[i] = ROCK
        ch[i] = c === '#' ? '▓' : c === '^' ? '▀' : '▄'
        // 2026-09-13 (tube check) -- was DIM. On the real CRT the keep was the
        // brightest thing in the frame by a distance: ~400 full blocks each
        // light their whole cell, and at beam 150 under THE CRYPT's bloom the
        // silhouette became a lit slab, the opposite of "mostly dark sky and
        // silhouette". FAINT (100) is the fill tier the engine keeps for
        // exactly this, and it gives the torchlit windows real contrast.
        // 2026-09-13 (audit M1) -- and the tier was not enough on its own.
        // FAINT kept the glyph as '█', and the audit measured up to 356 of
        // them a frame in runs of 24: exactly the full-block slab UPRISING's
        // tube check and backroom.js's header both record as blooming on the
        // real shader at ANY tier, because '█' lights every pixel of its
        // cell. Masonry is '▓' now -- about three quarters of the cell, the
        // density UPRISING's bodies settled on -- so the keep is still the
        // one solid mass in the frame without being a lit one. The merlon-gap
        // rhythm the tests read back is unchanged; only the glyph moved.
        // Full blocks are left to the accents: the torchlit windows and the
        // crescent's thickest cells. tests/visual-keep.test.mjs caps '█' at 1%
        // of the canvas, BACKROOM's cap, on both layouts.
        attr[i] = FAINT
      }
    }
  })

  // The crag: flares out below the castle's footing and runs off the
  // bottom of the canvas, jagged at the edges by a hash so it reads as
  // rock rather than a plinth. Speckle is the only thing telling stone from
  // masonry in a single-tier silhouette.
  const baseY = KEEP_ART_TOP + KEEP_ART.length
  for (let y = baseY; y < rows; y++) {
    const k = y - baseY + 1
    // 2026-09-13 -- flare was ~2 columns a row and the crag became a
    // full-width floor by row 18; at ~1.3 it still reads as a promontory
    // with sky and mist either side of it.
    const l = Math.round(artL + 1 - k * 1.2 - hash2(y, 3) * 2)
    const r = Math.round(artR - 1 + k * 1.4 + hash2(y, 9) * 2)
    for (let x = Math.max(0, l); x <= Math.min(cols - 1, r); x++) {
      const i = y * cols + x
      kind[i] = ROCK
      const edge = x === l || x === r
      // 2026-09-13 (tube check) -- the crag was '█' with '▓' speckle at DIM,
      // and it glared for the same reason as the keep above. Inverted: '▓'
      // with '█' speckle, at FAINT, so the rock sits a step darker than the
      // masonry and the castle still reads as standing ON it.
      // 2026-09-13 (audit M1) -- stepped down once more with the masonry:
      // '▒' with '▓' speckle, so the rock is still the darker of the two
      // and no '█' is left in it at all.
      ch[i] = edge ? '▄' : hash2(x, y * 5) > 0.82 ? '▓' : '▒'
      attr[i] = FAINT
    }
  }

  // Moon.
  const M = KEEP_MOON
  for (let y = 1; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (kind[i] !== SKY) continue
      let top = false, bot = false
      for (const h of [0, 1]) {
        const dx = x + 0.5 - M.cx, dy = y * 2 + h + 0.5 - M.cy * 2
        const inA = dx * dx + dy * dy <= M.r * M.r
        const ex = dx - M.bx, ey = dy - M.by * 2
        const inB = ex * ex + ey * ey <= M.br * M.br
        if (inA && !inB) { if (h === 0) top = true; else bot = true }
      }
      if (!top && !bot) continue
      kind[i] = MOON
      ch[i] = top && bot ? '█' : top ? '▀' : '▄'
      attr[i] = NORMAL
    }
  }

  // Stars: sparse, fixed, only in open sky well above the ridges. Stored
  // as a per-cell 0..1 brightness seed (-1 = no star).
  for (let y = 1; y < 11; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (kind[i] !== SKY) continue
      // Keep a dark margin around the moon -- stars touching the crescent
      // read as glare.
      const mdx = x + 0.5 - M.cx, mdy = (y + 0.5 - M.cy) * 2
      if (mdx * mdx + mdy * mdy < (M.r + 3) * (M.r + 3)) continue
      if (hash2(x * 3 + 11, y * 7 + 5) > 0.962) star[i] = hash2(x, y + 99)
    }
  }
  return { cols, kind, ch, attr, star, windows }
}

/** 0..1 torchlight for window `w` at time t. Stateless: independent sines
 *  per window plus a stepped hash for the gutter, so no two windows flicker
 *  together and nothing needs re-arming. */
function torch(w, t, A, muted) {
  // Muted: a still, silent ruin -- the torches keep burning, low and
  // steady. 2026-09-13: fully dark windows under mute read as the effect
  // having stopped, and the building is the subject.
  if (muted) return 0.46
  const i = w.i
  const flick = 0.72 + 0.17 * Math.sin(t * 1.7 + i * 2.1) + 0.11 * Math.sin(t * 4.3 + i * 5.3)
    + 0.16 * (hash2(i * 7 + 1, Math.floor(t * 5 + i * 0.37)) - 0.5)
  // Warmth from mid and level -- the keyboard pad, which is where this
  // genre's energy actually is. The pulse term is small on purpose: a
  // dungeon synth track has almost no beat, and a window flashing on one
  // would be exactly the strobe this effect must never be.
  const warm = 0.7 + 0.5 * (0.55 * A.mid + 0.45 * A.level) + 0.18 * A.pulse * A.level
  return Math.max(0, Math.min(1, flick * warm))
}

export default {
  key: 'keep',
  label: 'KEEP',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    p._keepScene = buildScene(term.cols)
    p._keepBats = null          // { startT, dir, y0 } while a flock is up
    p._keepBatsNotBefore = KEEP_BAT_FIRST
    p._keepLastT = null         // previous frame's t, for the mist's dt
    p._keepMistPhase = 0        // accumulated drift, not a clock
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // 2026-09-13 -- three values here are on the effect clock, which
    // restarts at 0 on every entry: the flock's startT, the not-before
    // gate, and the mist's last-frame t. Left alone, a flock in flight at
    // exit after a two-minute visit comes back with startT ~120 on a clock
    // at 0 -- a negative age, so it draws nothing, never ends, and blocks
    // every new flight for two minutes. The last-frame t would hand the
    // mist a negative dt on the first frame. The drift phase is relative
    // and could stay, but a fresh bank of mist on entry costs nothing.
    p._keepBats = null
    p._keepBatsNotBefore = KEEP_BAT_FIRST
    p._keepLastT = null
    p._keepMistPhase = 0
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    if (!p._keepScene || p._keepScene.cols !== cols) p._keepScene = buildScene(cols)
    const S = p._keepScene
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    // Mist drift is an ACCUMULATED phase, not `t * rate`: the rate follows
    // the audio, and multiplying the clock by audio would teleport the
    // whole bank on every level change. dt is clamped so a stalled tab
    // doesn't jump it either.
    const dt = p._keepLastT == null ? 0 : Math.max(0, Math.min(0.1, t - p._keepLastT))
    p._keepLastT = t
    // 2026-09-13 -- muted keeps a very slow creep (0.25) rather than 0: a
    // perfectly frozen frame is indistinguishable from a hung tab, and
    // mist that barely moves still reads as a still night.
    const drift = muted ? 0.25 : 0.7 + 0.5 * A.level
    p._keepMistPhase += dt * drift
    const ph = p._keepMistPhase
    // Thickness: bass and level, floor 0.78 so a quiet passage (or mute)
    // still has mist around the crag.
    const thick = 0.78 + 0.55 * (0.6 * A.bass + 0.4 * A.level)

    for (let y = 1; y < VIZ_BOT; y++) {
      const mistBase = y < KEEP_MIST_TOP ? 0 : Math.pow((y - KEEP_MIST_TOP + 1) / (VIZ_BOT - KEEP_MIST_TOP), 1.25)
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const k = S.kind[i]
        let c = S.ch[i], a = S.attr[i]

        if (k === SKY) {
          const sv = S.star[i]
          if (sv >= 0) {
            // Twinkle rate comes from the star's own seed, never from the
            // audio; muted, the stars hold still.
            const v = sv * 0.7 + (muted ? 0 : 0.22 * Math.sin(t * (0.5 + sv * 0.9) + sv * 40))
            c = v > 0.55 ? '+' : v > 0.3 ? '·' : '.'
            a = v > 0.55 ? DIM : FAINT
          }
        }

        // Mist: three layers drifting the same way at different speeds --
        // that difference is what reads as rolling rather than sliding.
        if (mistBase > 0 && k !== MOON) {
          const n = 0.58
            + 0.26 * Math.sin(x * 0.11 - ph * 1.0 + y * 0.63)
            + 0.2 * Math.sin(x * 0.24 - ph * 1.7 - y * 1.1 + 2.0)
            + 0.14 * Math.sin(x * 0.05 - ph * 0.45 + y * 0.3 + 4.0)
          const d = mistBase * n * thick
          // Over stone the mist only shows where it's thick: it veils the
          // crag in drifting patches rather than erasing it.
          const solid = k === ROCK || k === WINDOW || k === GATE
          if (d > (solid ? 0.56 : 0.3)) {
            // Over stone the thin tiers (':' '.') would read as holes
            // punched in the rock rather than as mist in front of it, so
            // a veil there is never thinner than '░'.
            c = d > 0.8 ? '▒' : d > 0.62 || solid ? '░' : d > 0.45 ? ':' : '.'
            a = d > 0.8 ? MUTED : d > 0.45 ? DIM : FAINT
            term.put(x, y, c, a)
            continue
          }
        }
        term.put(x, y, c, a)
      }
    }

    // Torchlit windows, drawn after the field (the mist pass above paints
    // them as empty cells; a window under thick mist is overdrawn here only
    // if it's above the mist line, which all the lit ones are).
    for (const w of S.windows) {
      const v = torch(w, t, A, muted)
      const c = v > 0.55 ? '█' : v > 0.4 ? '▓' : v > 0.26 ? '▒' : '░'
      const a = v > 0.74 ? BRIGHT : v > 0.55 ? NORMAL : v > 0.4 ? MUTED : v > 0.26 ? DIM : FAINT
      term.put(w.x, w.y, c, a)
    }

    // Bats.
    let bats = p._keepBats
    const flightDur = (cols + BAT_TRAIL + 4) / KEEP_BAT_SPEED
    if (bats && t - bats.startT > flightDur) {
      p._keepBats = bats = null
      p._keepBatsNotBefore = t + KEEP_BAT_COOLDOWN
    }
    if (!bats && !muted && t >= p._keepBatsNotBefore) {
      const chance = A.onset ? KEEP_BAT_ONSET_CHANCE : KEEP_BAT_AMBIENT_CHANCE
      if (Math.random() < chance) {
        p._keepBats = bats = { startT: t, dir: Math.random() < 0.5 ? 1 : -1, y0: 2 + Math.floor(Math.random() * 4) }
      }
    }
    if (bats) {
      const age = t - bats.startT
      if (age >= 0) {
        const lead = bats.dir > 0 ? -2 + age * KEEP_BAT_SPEED : cols + 1 - age * KEEP_BAT_SPEED
        // A shallow arc over the whole flight, plus each bat's own bob.
        const arc = -Math.sin(Math.PI * Math.min(1, age / flightDur)) * 1.5
        for (const b of FLOCK) {
          const bx = Math.round(lead - bats.dir * b.dx)
          const by = Math.round(bats.y0 + b.dy + arc + 0.8 * Math.sin(age * 2.2 + b.ph))
          if (by < 1 || by >= KEEP_MIST_TOP) continue
          const up = Math.floor(age * 6 + b.ph * 3) % 2 === 0
          const glyph = b.big ? (up ? '^v^' : '-v-') : (up ? 'v' : '^')
          const x0 = bx - (glyph.length >> 1)
          for (let j = 0; j < glyph.length; j++) {
            const gx = x0 + j
            if (gx >= 0 && gx < cols) term.put(gx, by, glyph[j], b.big ? NORMAL : MUTED)
          }
        }
      }
    }
  },
}
