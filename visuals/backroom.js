// SIGNAL -- visualizer effect "BACKROOM" (AFTER HOURS, 2026-09-13).
//
// A jazz club at two in the morning, the last set: a small stage in a dark
// room under ONE spotlight, a trio in its cone -- a stand-up bass with its
// player behind it, a tenor player with the horn up, a ride cymbal at the
// left edge of the light and the end of a grand piano at the right -- smoke
// climbing slowly through the beam, and in front of the stage the empty
// cafe tables, chairs already up on two of them, one candle still burning.
// A neon fragment hums in the window at the left edge.
//
// Why it fits: AFTER HOURS is late-night small-group jazz -- ballads, modal
// vamps, brushes, a horn taking its time -- and its own description is "the
// last set in a half-empty club". That is a PLACE, so this is a composed
// picture like LAGOON and KEEP rather than a field. The upright bass leads
// the composition because its scroll-and-bouts outline is the single most
// legible jazz silhouette there is; everything else is there to say where
// the bass is standing.
//
// The two rules that shaped the look:
// - Silhouettes are OUTLINES around dark interiors, never filled masses. The
//   2026-09-13 tube check found UPRISING's and KEEP's '█' fills blooming into
//   glowing slabs on the real CRT even at FAINT (a full block lights every
//   pixel of its cell); the text grid cannot show that. So a figure here is
//   its lit edge plus interior cells painted as ' ' -- which also blocks the
//   smoke behind it, and the smoke is what makes the dark shape readable.
//   The only '█' in the frame is the lamp housing, three cells.
// - The spotlight is the bright thing. The room outside the cone is nearly
//   black; nothing but the lamp lens, the candle flame and a glint ever
//   reaches BRIGHT.
//
// Audio, on AMPLITUDE only (never a `t *` frequency): level lifts the beam
// gently; bass shimmers the bass strings and nods the bassist's head; treble
// glints the ride cymbal's rim and the tenor's bell; a real onset is at most
// a soft half-second glint on the cymbal, rate-limited, so a busy passage
// cannot turn it into a strobe. This is a ballad room and nothing flashes.
// Muted, SILENT_AUDIO leaves a still, dim room: the beam at its floor, no
// nod, no glints, the candle and the neon steady; only the smoke keeps
// hanging and climbing, because a frozen frame reads as a hung tab.
//
// Everything but the onset glint is a pure function of (x, y, t, audio); the
// art is compiled to cell lists once at import.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, auMul, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- the spotlight ----------------------------------------------------------
// Apex under the lamp at the top centre; half-width in COLUMNS at row y.
// 2026-09-13 -- the slope is steep (1.9 cols a row) because a narrower cone
// left the tenor player's head in the dark at row 4: both standing players'
// heads have to be in the light, and the pool it throws on the boards spans
// the trio. On ~2:1 cells that is a ~45 degree spread, a real theatre spot.
export const LAMP_X = 40
export const BEAM_TOP = 2
export const BEAM_SLOPE = 1.9
export const coneHalfWidth = (y) => 1.5 + (y - BEAM_TOP) * BEAM_SLOPE
export const STAGE_Y = 16   // the stage floor row the light pools on
const LIP_Y = 17            // the stage's front edge
// The stage's width. 2026-09-13 -- boards running edge to edge put the
// upturned chair legs of the side tables on top of the floor line, and the
// foreground became a lattice; a stage narrower than the room leaves the
// chairs standing clear against the dark.
const STAGE_L = 11, STAGE_R = 69

// Seconds a cymbal glint lasts, and the least quiet time between two.
export const GLINT_S = 0.5
const GLINT_GAP_S = 2.2

/** 0..1 light at cell (x, y): 1 on the axis, soft at the cone's edge. */
function beamAt(x, y) {
  if (y < BEAM_TOP || y > STAGE_Y) return 0
  const u = Math.abs(x - LAMP_X) / coneHalfWidth(y)
  if (u >= 1.15) return 0
  const edge = Math.min(1, (1.15 - u) / 0.3)
  return edge * (0.72 + 0.28 * (1 - Math.min(1, u)))
}

// --- the art ------------------------------------------------------------------
// Each piece is drawn as literal edge glyphs plus a legend:
//   ' ' transparent -- whatever is behind shows (smoke, dark room)
//   '%' dark interior -- painted as ' ', hides the smoke behind it
//   'S' a bass string/neck cell -- shimmers with the bass
//   'G' the tenor's bell -- glints with treble
// Pieces are listed back to front. `sway: n` marks the top n rows of a piece
// as the part that sways (the bassist's head).
const PIECES = [
  // The bassist, behind and to the right of the bass, left hand up on the
  // neck, right hand over the body. Drawn first so the instrument occludes
  // him -- most of him is behind it, which is how a bassist looks from the
  // room.
  {
    name: 'bassist', x: 32, y: 4, sway: 2, art: [
      '  ╭─╮   ',
      '  ╰┬╯   ',
      '__/%%\\  ',
      '  │%%%\\ ',
      '  │%%%%│',
      '  │%%%%│',
      '   │%%%│',
      '  ═%%%%│',
      '   \\%%%/',
      '    │%│ ',
      '    │%│ ',
      '   ─┘ └─',
    ],
  },
  // The bass. 2026-09-13 -- sloped shoulders narrower than the lower bout
  // and a pinched waist are what separate it from a cello or a guitar at
  // this size; the bridge '╪' and endpin '┴' are the two details that
  // survive the scale.
  {
    name: 'bass', x: 26, y: 3, art: [
      '     @     ',
      '     S╕    ',
      '     S     ',
      '     S     ',
      '     S     ',
      '    .S.    ',
      '   /%S%\\   ',
      '   )%S%(   ',
      '  /%%S%%\\  ',
      ' (%%═╪═%%) ',
      ' (%%%S%%%) ',
      '  \\%%%%%/  ',
      '   `─┴─´   ',
    ],
  },
  // The tenor player, facing the bass: mouthpiece at his lips, the horn down
  // his front, the bell turning up at the bottom in the J that says
  // saxophone.
  {
    name: 'tenor', x: 40, y: 4, art: [
      '    ╭─╮  ',
      '   ,╰┬╯  ',
      '   │/%%\\ ',
      '   ‖%%%%\\',
      '   ‖═%%%│',
      '   ‖%%%%│',
      ' G ‖═%%%│',
      ' ╰─╯│%%%│',
      '     \\%%/',
      '     │%%│',
      '     │/\\│',
      '    ─┘  └─',
    ],
  },
  // The end of the grand, lid up, with the pianist hunched at the keys --
  // outside the cone, so it reads by its outline alone.
  {
    name: 'piano', x: 56, y: 6, art: [
      '                   _.-',
      '              _.-´¯  |',
      '    ╭─╮  _.-´¯      /|',
      '    ╰┬╯-´          / |',
      '   /%%\\▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
      '  (%%%%)═%%%%%%%%%%%%%',
      '   │%%%│‾‾‾‾‾‾‾‾‾‾‾‾‾‾',
      '  _│%%%│_  │       │  ',
      '  │ │%%│ │ │       │  ',
      '  │ ┘  └ │ │       │  ',
    ],
  },
  // The ride cymbal on its stand at the left edge of the light -- the edge
  // of a kit, enough to say drummer without drawing one.
  {
    name: 'ride', x: 16, y: 10, art: [
      '._-¯¯¯-_.',
      '    │    ',
      '    │    ',
      '    │    ',
      '    │    ',
      '   /│\\   ',
    ],
  },
]

// The cymbal rim cells a glint may sit on (row 0 of 'ride').
const RIDE = PIECES.find((pc) => pc.name === 'ride')
export const RIM = []
for (let i = 0; i < RIDE.art[0].length; i++) if (RIDE.art[0][i] !== ' ') RIM.push({ x: RIDE.x + i, y: RIDE.y })

// Foreground: cafe tables in front of the stage, tops on row 19 and the
// pedestals cropped by the bottom of the canvas the way a foreground is.
// Two carry chairs upside down, legs in the air; the candle table still has
// its chair on the floor beside it. Tables stay out of the middle third so
// the pool of light on the boards is never hidden.
const TABLE_TOP = 16
const TABLES = [
  { x: 1, art: [
    ' │   │  │   │ ',
    ' │   │  │   │ ',
    ' ╘═══╛  ╘═══╛ ',
    '▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
    '      ││      ',
    '    ──┴┴──    ',
  ] },
  { x: 20, art: [
    '',
    '',
    '',
    '  ▁▁▁▁▁▁▁▁  ',
    '     ││     ',
    '   ──┴┴──   ',
  ] },
  { x: 50, art: [
    '',
    '',
    '│',
    '│__ ▁▁▁▁▁▁▁▁',
    '│  │    ││  ',
    '│  │  ──┴┴──',
  ] },
  { x: 67, art: [
    ' │   │      ',
    ' │   │      ',
    ' ╘═══╛      ',
    '▁▁▁▁▁▁▁▁▁▁▁ ',
    '    ││      ',
    '  ──┴┴──    ',
  ] },
]
// The candle sits on the third table, its body on the row above the top.
export const CANDLE = { x: 58, y: 18 }

// The neon fragment: a narrow window at the left edge with a vertical sign
// in it. 2026-09-13 -- a vertical sign whole inside its window reads as a
// sign; a horizontal word cut off by the canvas edge reads as a bug.
export const NEON_WORD = 'JAZZ'
const NEON_X = 4
const NEON_Y0 = 3

/** Compiles art into flat cell lists once. `rim` = lit from above (nothing
 *  of the same piece in the cell over it). */
function compile(x0, y0, art) {
  const cells = []
  for (let ay = 0; ay < art.length; ay++) {
    const chars = [...art[ay]]
    const above = ay > 0 ? [...art[ay - 1]] : []
    for (let ax = 0; ax < chars.length; ax++) {
      const c = chars[ax]
      if (c === ' ') continue
      const up = above[ax]
      cells.push({ x: x0 + ax, y: y0 + ay, ch: c, row: ay, rim: up === undefined || up === ' ' })
    }
  }
  return cells
}
const COMPILED = PIECES.map((pc) => ({ ...pc, cells: compile(pc.x, pc.y, pc.art) }))
// Cells the cone's edge line must not draw through: each art row's span,
// one column of margin either side, indexed y * cols + x.
// 2026-09-13 -- the edge crossing the tenor's shoulder read as a second
// shoulder line; the edge only has to show where there is nothing else.
// 2026-09-13 (audit L5) -- this was one table indexed `y * 80`, so a term
// of any other width read the wrong row's mask. Built per width and cached;
// the grid is fixed for a page's life, so in practice it is built once.
const ART_MASKS = new Map()
export function artMaskFor(cols) {
  let mask = ART_MASKS.get(cols)
  if (mask) return mask
  mask = new Uint8Array(cols * VIZ_BOT)
  for (const pc of COMPILED) {
    const rows = new Map()
    for (const c of pc.cells) {
      const r = rows.get(c.y) || [c.x, c.x]
      rows.set(c.y, [Math.min(r[0], c.x), Math.max(r[1], c.x)])
    }
    for (const [y, [l, r]] of rows) {
      if (y < 1 || y >= VIZ_BOT) continue
      for (let x = Math.max(0, l - 1 - (pc.sway ? 1 : 0)); x <= Math.min(cols - 1, r + 1 + (pc.sway ? 1 : 0)); x++) mask[y * cols + x] = 1
    }
  }
  ART_MASKS.set(cols, mask)
  return mask
}
const TABLE_CELLS = TABLES.flatMap((tb) => compile(tb.x, TABLE_TOP, tb.art))

const tierFor = (v) => v > 0.8 ? NORMAL : v > 0.52 ? MUTED : v > 0.26 ? DIM : FAINT

export default {
  key: 'backroom',
  label: 'BACKROOM',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    // The only stored state: when the last onset glint began, on the effect
    // clock. -Infinity means "no glint yet".
    p._backroomGlintAt = -Infinity
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // 2026-09-13 -- _backroomGlintAt is an absolute effect-clock value, and
    // the draw uses it for the rate limit too: left over from a long visit
    // it would sit two minutes in the future of the restarted clock, draw no
    // glint (negative age) AND refuse every new one until the clock caught
    // up. The draw deliberately does not self-heal it; this is the one thing
    // keeping it honest, and tests/visual-backroom.test.mjs can see it.
    p._backroomGlintAt = -Infinity
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const mask = artMaskFor(cols)
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    if (A.onset && t - p._backroomGlintAt > GLINT_GAP_S) p._backroomGlintAt = t
    const gAge = t - p._backroomGlintAt
    const glint = gAge >= 0 && gAge < GLINT_S ? Math.sin(Math.PI * gAge / GLINT_S) : 0

    // Beam: a gentle lift with level, floor 0.7 -- a quiet ballad (or mute)
    // still has the light on; the loudest chorus is only ~40% brighter.
    const lvl = auMul(A, A.level, 0.7, 1)
    const bass = auMul(A, A.bass, 0, 1)
    const treble = auMul(A, A.treble, 0, 1)

    // --- base pass: dark room, curtain spill, smoke in the beam, floor ------
    for (let y = 1; y < VIZ_BOT; y++) {
      const hw = coneHalfWidth(y)
      for (let x = 0; x < cols; x++) {
        if (y > LIP_Y) {
          // The front of the stage and the room floor: black.
          term.put(x, y, ' ')
          continue
        }
        if (y === LIP_Y) { term.put(x, y, x > STAGE_L && x < STAGE_R ? '─' : ' ', FAINT); continue }
        if (y === STAGE_Y) {
          // The pool of light on the boards: line glyphs only, so the
          // brightest patch on the floor is a stroke, never a slab.
          const u = Math.abs(x - LAMP_X) / hw
          const v = (1 - u) * lvl
          const ch = v > 0.5 ? '═' : v > 0.3 ? '─' : v > 0.08 ? '-' : x > STAGE_L && x < STAGE_R ? '_' : ' '
          term.put(x, y, ch, v > 0.5 ? NORMAL : v > 0.3 ? MUTED : v > 0.08 ? DIM : FAINT)
          continue
        }
        const b = beamAt(x, y)
        if (b <= 0) {
          // Outside the light the room is black. 2026-09-13 -- curtain folds
          // catching the spill were tried here and read as scattered noise
          // either side of the cone, blurring the one edge that matters.
          term.put(x, y, ' ')
          continue
        }
        // Smoke: two slow sheets climbing at different rates plus a wander,
        // so it curls instead of scrolling. Only lit where the beam is.
        // 2026-09-13 -- the first cut had a 0.25 floor under the density and
        // the whole cone filled with an even carpet of '.'; smoke is patches
        // with clear air between them, so the floor is 0.03.
        const rise = y * 2 + t * 0.9
        const s1 = Math.sin(x * 0.17 + rise * 0.23 + 1.4 * Math.sin(y * 0.29 + t * 0.11))
        const s2 = Math.sin(x * 0.07 - rise * 0.15 + t * 0.04 + 2)
        const s3 = Math.sin(x * 0.41 + (y + t * 0.5) * 0.8)
        const d = Math.max(0, 0.55 * s1 + 0.3 * s2 + 0.15 * s3)
        const v = (0.03 + d * 1.1) * b * lvl
        let ch = ' '
        if (v > 0.85) ch = '▒'
        else if (v > 0.62) ch = '░'
        else if (v > 0.44) ch = ':'
        else if (v > 0.28) ch = '·'
        else if (v > 0.14) ch = '.'
        // Dust motes: a fixed sparse scatter that only shows in the light,
        // so clear air in the cone still reads as the beam and not as the
        // room. Each holds its cell and fades on its own slow period.
        else if (hash2(x * 7 + 1, y * 13) > 0.9 && Math.sin(t * 0.6 + hash2(y, x) * 40) > -0.3) ch = '.'
        term.put(x, y, ch, tierFor(v))
      }
    }
    // The cone's own edge: a thin dotted boundary either side, wherever no
    // figure is standing in it.
    for (let y = BEAM_TOP + 1; y < STAGE_Y; y++) {
      const hw = coneHalfWidth(y)
      const l = Math.round(LAMP_X - hw), r = Math.round(LAMP_X + hw)
      if (l >= 0 && l < cols && !mask[y * cols + l]) term.put(l, y, '/', DIM)
      if (r >= 0 && r < cols && !mask[y * cols + r]) term.put(r, y, '\\', DIM)
    }

    // --- the lamp ------------------------------------------------------------
    for (let x = 28; x <= 52; x++) term.put(x, 1, '─', FAINT)
    term.put(LAMP_X - 2, 1, '▐', FAINT)
    for (let x = LAMP_X - 1; x <= LAMP_X + 1; x++) term.put(x, 1, '█', DIM)
    term.put(LAMP_X + 2, 1, '▌', FAINT)
    for (let x = LAMP_X - 1; x <= LAMP_X + 1; x++) term.put(x, BEAM_TOP, '▀', BRIGHT)

    // --- the players ------------------------------------------------------
    // The bassist's nod: a slow sine whose AMPLITUDE follows the bass --
    // under half a cell it rounds to nothing, so quiet passages stand still
    // and a walking line nods his head a column either way.
    const nod = muted ? 0 : Math.round(Math.sin(t * 1.9) * (0.3 + bass * 0.75))
    for (const piece of COMPILED) {
      for (const c of piece.cells) {
        const x = c.x + (piece.sway && c.row < piece.sway ? nod : 0), y = c.y
        if (x < 0 || x >= cols || y < 1 || y >= VIZ_BOT) continue
        if (c.ch === '%') { term.put(x, y, ' '); continue }
        let lit = beamAt(x, y) * lvl * 0.9 + (c.rim ? 0.25 : 0) + 0.08
        let ch = c.ch
        if (ch === 'S') {
          // Strings: bass makes them shimmer -- the glyph re-rolls ~8x a
          // second per cell, and how often it leaves the plain '‖' is the
          // bass amount. Muted, a still '‖'.
          const n = hash2(y * 7 + 3, Math.floor(t * 8))
          ch = n < bass * 0.55 ? (n < bass * 0.25 ? '¦' : '|') : '‖'
          lit += bass * 0.25 * n
        } else if (ch === 'G') {
          ch = 'o'
          lit += treble > 0.55 ? (treble - 0.55) * 1.6 : 0
        }
        term.put(x, y, ch, tierFor(lit))
      }
    }

    // --- cymbal glints ----------------------------------------------------
    // Treble walks a soft highlight slowly along the rim; an onset glint
    // puts a small star over the bow for half a second. Only the glint's
    // peak reaches BRIGHT.
    if (!muted && treble > 0.4) {
      const k = Math.round((Math.sin(t * 0.35) * 0.5 + 0.5) * (RIM.length - 1))
      term.put(RIM[k].x, RIM[k].y, RIDE.art[0][k], treble > 0.62 ? NORMAL : MUTED)
    }
    if (glint > 0) {
      term.put(RIM[3].x, RIM[3].y - 1, glint > 0.7 ? '+' : '·', glint > 0.7 ? BRIGHT : NORMAL)
    }

    // --- foreground: tables, chairs, the candle ---------------------------
    for (const c of TABLE_CELLS) if (c.y < VIZ_BOT) term.put(c.x, c.y, c.ch, FAINT)
    // Candle: flame flickers on a stepped hash (~6 steps a second); muted,
    // it burns steady. It warms the tabletop either side of it.
    const f = muted ? 0.5 : hash2(CANDLE.x, Math.floor(t * 6))
    term.put(CANDLE.x, CANDLE.y - 1, f > 0.72 ? '(' : f < 0.18 ? ')' : '°', f > 0.3 ? BRIGHT : NORMAL)
    term.put(CANDLE.x, CANDLE.y, '▄', MUTED)
    for (let dx = -3; dx <= 3; dx++) {
      if (dx !== 0) term.put(CANDLE.x + dx, CANDLE.y + 1, '▁', Math.abs(dx) <= 1 ? MUTED : DIM)
    }

    // --- neon in the window -------------------------------------------------
    const wTop = NEON_Y0 - 1, wBot = NEON_Y0 + NEON_WORD.length * 2 - 1
    for (let y = wTop; y <= wBot; y++) {
      const edge = y === wTop ? ['┌', '┐'] : y === wBot ? ['└', '┘'] : ['│', '│']
      term.put(NEON_X - 3, y, edge[0], FAINT)
      term.put(NEON_X + 3, y, edge[1], FAINT)
      if (y === wTop || y === wBot) for (let x = NEON_X - 2; x <= NEON_X + 2; x++) term.put(x, y, '─', FAINT)
    }
    for (let i = 0; i < NEON_WORD.length; i++) {
      // A slow hum between two dim tiers; one letter now and then drops a
      // tier for a moment, the tired tube. Muted, it holds steady.
      const hum = muted ? 0 : Math.sin(t * 0.7 + i * 1.9)
      const tired = !muted && i === 2 && hash2(11, Math.floor(t * 2.5)) > 0.9
      term.put(NEON_X, NEON_Y0 + i * 2, NEON_WORD[i], tired ? FAINT : hum > 0.4 ? MUTED : DIM)
    }
  },
}
