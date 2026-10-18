// SIGNAL -- visualizer effect "FROST" (COLD WAVE). Rebuilt 2026-10-16.
//
// A neon sign on a brick wall at night: a big heart bent from glass tubing,
// the station's callsign lettered across its middle (COLD WAVE's, as
// built), hung from two wires off the top of the frame, with a little
// transformer box on the wall and the whole thing mirrored, broken up by
// the wet, in the pavement under the curb.
//
// Why it fits: COLD WAVE is synthpop, new wave and cold wave -- "synthetic
// hearts, borrowed neon" is its own tagline -- so the subject is exactly
// that, a synthetic heart in borrowed neon. It keeps the old FROST's idea
// ("neon signage losing power", cold rather than warm) and finally makes it
// a picture: one letter of the sign is always a little unreliable.
//
// What it replaced: FROST had been a full-screen wireframe grid whose nodes
// lit and decayed (57th pass, "Neon Grid Decay"). Measured 2026-10-16 it
// changed 29% of the screen with the music and showed the kick at 3.7x, but
// in a screenshot it read as a sparse grid of dots -- an empty screen. The
// numbers were not the problem; nobody could tell what it was.
//
// Audio. Two hooks, both on things a neon sign actually does:
//   - THE KICK strikes the tube: light runs from the heart's point up both
//     sides to the lobes in 45ms, the running front BRIGHT, then the whole
//     outline (and the word) holds lit for 0.3s and drops back to its cold
//     resting glow in one step. A rising edge on `pulse` (DANCEFLOOR's
//     BEAT_RISE / STEP_GAP idiom), so it lands on syntheticAudio's pulse
//     with no tap and on real onsets with one. Only the running front is
//     BRIGHT -- a whole outline at BRIGHT is a slab of bloom on the tube
//     (the UPRISING/KEEP lesson) -- the held tube is NORMAL.
//   - LEVEL sets the resting glow of the tubes, eased over about a second:
//     quiet passages sit at DIM, loud ones at MUTED (never NORMAL, which is
//     the struck tier), and how much of the brick wall the sign lights.
//     Muted, the sign is a cold DIM outline that never strikes.
// The flicker (one letter, one short run of the heart) is NOT audio: it is
// a hash of the time slot, so it carries no state and needs no reset, and it
// is gentle -- a cell drops a tier or goes dark for a tenth of a second
// every few seconds, never a strobe. Nothing here touches crt.params, so the
// rear panel's CALM setting has nothing to gate.
//
// 2026-10-16 (design pass) -- the viz-critic read this off the real tube and
// found four things the grid had been hiding:
//   - THE WALL WAS GONE. FAINT dotted '┈'/'¦', clipped to an ellipse and
//     blanked round the sign, rasters as a few stray dashes: no wall. Now it
//     is solid brickwork -- '─' mortar every second row, '│' joints staggered
//     half a brick, '┬'/'┴'/'┼' where they meet so the courses join -- DIM
//     where the sign lights it, falling off to FAINT with distance (per
//     brick-length, hash-dithered, so the edge is ragged rather than an
//     ellipse). The lit patch grows with the eased level, as before. The
//     critic asked for MUTED near the sign; that is the tube's own resting
//     tier, so the wall stops at DIM and the tube's rest was raised to MUTED
//     at every unmuted level (it used to sit at DIM when quiet) -- subject
//     brightest, scenery a tier under it. MARGIN stays: the wall still stops
//     two columns short of the glass, and that is what keeps the wall's
//     solid line from reading as more tubing now it IS solid line.
//   - THE HALO WAS BLOCKY. A '░' ring round the whole heart rasters as a
//     checkered second outline, not glow. It is now '·' DIM on the cells
//     OUTSIDE the heart only, for the same 45ms strike.
//   - THE REFLECTION READ AS A PYRAMID. The curb at row 15 left six puddle
//     rows, enough for the heart's lower half only, and a per-row sine shift
//     plus 18% dropout broke the diagonals into loose steps. Now: the sign
//     hangs a row higher (HEART_Y0 2, curb 14, seven puddle rows), and the
//     puddle mirrors a hand-drawn SQUASHED heart (REFLECT, seven rows, both
//     lobes, four-column steps) rather than row-sampling the big one, which
//     would have broken every diagonal; one shift for the whole reflection,
//     so the steps stay joined; dropout 5%. The reflection sits a tier under
//     the tube (DIM at rest, MUTED struck, FAINT muted).
//   - THE WORD WAS HARDCODED. 'COLD WAVE' showed on every station [V] cycled
//     here. It is now the locked station's callsign, letter-spaced as before
//     when that fits inside the heart (13 letters or fewer), unspaced when
//     only that fits, and 'O P E N' -- what a neon sign in a window says --
//     with no station or nothing that fits. signWord() is the rule.
// Also: the per-frame string keys and array copies (MARGIN.has(`x,y`), the
// interior scan's reverse()) are gone -- the masks are built once.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- the beat -----------------------------------------------------------------
// Same thresholds DANCEFLOOR uses and for the same reasons: 0.2 survives a
// frame handed over 250ms late by the fallback ticker, and 0.22s between
// surges keeps a hi-hat onset from re-firing one mid-run.
export const BEAT_RISE = 0.2
export const STEP_GAP_S = 0.22
// The strike: how long the light takes to run from the point to the top of
// the lobes, and how long the whole tube then holds lit before it drops
// back to its resting glow in ONE step.
// 2026-10-16 -- the first cut ran the head up over 0.32s and let the trail
// fade through two tiers over 0.7s. It looked like a surge in a still and
// measured 0.51x on the beat probe: nearly every cell it changed, it changed
// BETWEEN kicks, so the kick itself was the quietest moment on the screen.
// Neon strikes all at once; a 45ms run (three frames) is still visibly a run
// from the point upward, and a single drop after the hold keeps the change
// on the beat. See tests/visual-frost.test.mjs for the ratio it holds to.
export const STRIKE_S = 0.045
export const HOLD_S = 0.3
// The resting glow never reaches the lit tier, or at a loud level the sign
// would already be lit and a kick would change nothing.
export const REST_MAX = 0.5

// --- the sign -----------------------------------------------------------------
// Hand-drawn: a computed heart curve on 2:1 cells comes out as a lumpy
// shield. 31 columns by 12 rows. The point is the bottom row; the two lobe
// tops are row 0.
export const HEART = [
  '   ╭────────╮     ╭────────╮   ',
  ' ╭─╯        ╰─╮ ╭─╯        ╰─╮ ',
  '╭╯            ╰─╯            ╰╮',
  '│                             │',
  '╰╮                           ╭╯',
  ' ╰─╮                       ╭─╯ ',
  '   ╰─╮                   ╭─╯   ',
  '     ╰─╮               ╭─╯     ',
  '       ╰─╮           ╭─╯       ',
  '         ╰─╮       ╭─╯         ',
  '           ╰─╮   ╭─╯           ',
  '             ╰───╯             ',
]
export const HEART_W = HEART[0].length
export const HEART_H = HEART.length
// The same heart squashed to seven rows for the puddle (design pass): the
// lobes kept whole, the '│' and '╰╮' rows dropped, and the taper stepping
// four columns a row instead of two, so every diagonal is still a joined
// staircase. Drawn right way up; the draw flips it.
export const REFLECT = [
  '   ╭────────╮     ╭────────╮   ',
  ' ╭─╯        ╰─╮ ╭─╯        ╰─╮ ',
  '╭╯            ╰─╯            ╰╮',
  '╰───╮                     ╭───╯',
  '    ╰───╮             ╭───╯    ',
  '        ╰───╮     ╭───╯        ',
  '            ╰─────╯            ',
]
export const REFLECT_H = REFLECT.length
// Rows on the canvas: the heart's top row, the curb, and where the word sits
// inside the heart (row 3/4 of the art is its widest point). The heart hangs
// at row 2 so the puddle under the curb has room for all of REFLECT.
export const HEART_Y0 = 2
export const CURB_Y = HEART_Y0 + HEART_H          // 14
export const WORD_ROW = 4                          // art row
// The widest a word may be on WORD_ROW: the interior there runs art columns
// 2..28 (27 cells), less a column of dark glass each side.
export const WORD_MAX = 25
export const FALLBACK_WORD = 'O P E N'

/** The sign's lettering for a station: its callsign letter-spaced when that
 *  fits inside the heart, unspaced when only that fits, else OPEN. */
export function signWord(station) {
  const name = String((station && station.callsign) || '').trim().toUpperCase()
  if (!name) return FALLBACK_WORD
  const spaced = name.split('').join(' ')
  if (spaced.length <= WORD_MAX) return spaced
  if (name.length <= WORD_MAX) return name
  return FALLBACK_WORD
}
/** Which letter of the word is losing power: an A if it has one (COLD WAVE's
 *  A of WAVE, as built), else the last letter. */
function flakyIndex(word) {
  const a = word.lastIndexOf('A')
  return a >= 0 ? a : word.length - 1
}

// Mirror pairs for the reflection: a tube seen upside down in a puddle.
const FLIP = { '╭': '╰', '╰': '╭', '╮': '╯', '╯': '╮' }

// Tube cells of the heart, each with `d`, its distance along the tube from
// the point (0) to the lobe tops (1) -- the surge's coordinate. Row-based
// with a lean toward the centre line, so the head climbs both sides together
// and the dip between the lobes (row 2's '╰─╯') lights last but one.
// `buzz` marks the run of tube that buzzes: six cells of the right lobe's
// outer edge.
const TUBE = []
for (let r = 0; r < HEART_H; r++) {
  for (let c = 0; c < HEART_W; c++) {
    const ch = HEART[r][c]
    if (ch === ' ') continue
    TUBE.push({ c, r, ch, d: (HEART_H - 1 - r) / (HEART_H - 1), buzz: c >= HEART_W - 5 && r <= 2 })
  }
}
// The reflection's tube cells, flipped once here: `k` is the puddle row
// (1 = just under the curb, showing the point).
const PUDDLE = []
for (let rr = 0; rr < REFLECT_H; rr++) {
  for (let c = 0; c < HEART_W; c++) {
    const ch = REFLECT[rr][c]
    if (ch === ' ') continue
    PUDDLE.push({ c, k: REFLECT_H - rr, ch: FLIP[ch] || ch, d: (REFLECT_H - 1 - rr) / (REFLECT_H - 1) })
  }
}
// Masks in art coordinates, padded by PAD all round so the margin's reach
// past the art needs no bounds checks. Built once; the draw indexes them.
const PAD = 2
const MW = HEART_W + 2 * PAD, MH = HEART_H + 2 * PAD
const mi = (c, r) => (r + PAD) * MW + (c + PAD)
const isTube = new Uint8Array(MW * MH)
for (const cell of TUBE) isTube[mi(cell.c, cell.r)] = 1
// A dark margin round the tube: the wall stops two columns and one row short
// of the glass, so no mortar line can run into the outline and read as more
// tubing (the first cut used '─' for both).
const MARGIN = new Uint8Array(MW * MH)
for (const cell of TUBE) {
  for (let dr = -1; dr <= 1; dr++) for (let dc = -2; dc <= 2; dc++) MARGIN[mi(cell.c + dc, cell.r + dr)] = 1
}
// Outside the heart: a flood fill from the padded border through non-tube
// cells. What it never reaches is the glass box's interior -- which includes
// nothing of the notch between the lobes, unlike the old per-row scan that
// needed it carved out by hand.
const OUTSIDE = new Uint8Array(MW * MH)
{
  const stack = [0]
  OUTSIDE[0] = 1
  while (stack.length) {
    const i = stack.pop()
    const x = i % MW, y = (i - x) / MW
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue
      const j = ny * MW + nx
      if (OUTSIDE[j] || isTube[j]) continue
      OUTSIDE[j] = 1
      stack.push(j)
    }
  }
}
const INTERIOR = []
for (let r = 0; r < HEART_H; r++) {
  for (let c = 0; c < HEART_W; c++) if (!isTube[mi(c, r)] && !OUTSIDE[mi(c, r)]) INTERIOR.push({ c, r })
}
// The strike's glow: the outside cells touching the tube (left, right,
// above, below). Outside only -- inside, it crowded the word.
const HALO = []
{
  const seen = new Uint8Array(MW * MH)
  for (const cell of TUBE) {
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const c = cell.c + dc, r = cell.r + dr
      const i = mi(c, r)
      if (!OUTSIDE[i] || seen[i]) continue
      seen[i] = 1
      HALO.push({ c, r })
    }
  }
}

// --- the wall -------------------------------------------------------------------
// Bricks BRICK_W columns long, one row deep, with a mortar row between
// courses; alternate courses are offset half a brick. Rows of the canvas
// whose (y - 1) is odd are mortar.
export const BRICK_W = 8
const isMortar = (y) => (y - 1) % 2 === 1
const jointAt = (x, y) => y >= 1 && y < CURB_Y && !isMortar(y) && (x + (Math.floor((y - 1) / 2) % 2 ? BRICK_W / 2 : 0)) % BRICK_W === 0

/** How lit a stretch of tube is, `d` along it from the point (0) to the
 *  lobes (1), `age` seconds after the last kick. Module-level rather than a
 *  closure in draw() so the frame allocates nothing (design pass). */
function tubeLevel(glow, age, d) {
  if (age < 0 || age >= STRIKE_S + HOLD_S) return glow
  const front = age / STRIKE_S                     // 0 at the point, 1 at the lobes
  if (front < 1) {
    if (d > front) return glow                     // not reached yet
    // The running front is BRIGHT: about two rows of tube on each side,
    // so the frame stays inside the 16-cell BRIGHT budget DANCEFLOOR
    // set (0.3 measured 24 in the worst frame, 0.2 measured 18).
    return front - d < 0.15 ? 1 : 0.7
  }
  return 0.7
}

const tier = (v) => (v > 0.82 ? BRIGHT : v > 0.55 ? NORMAL : v > 0.33 ? MUTED : DIM)

export default {
  key: 'frost',
  label: 'NEON HEART',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._frostPrevPulse = 0
    p._frostKickAt = -99
    p._frostGlow = 0.4
    p._frostWordOf = undefined
    p._frostWord = FALLBACK_WORD
    p._frostFlaky = flakyIndex(FALLBACK_WORD)
  },
  /** Re-arms clocks on every visualizer entry. The effect clock restarts at
   *  0, so a kick time from the last visit would read as a surge scheduled
   *  in the future -- the FLAME/BREACH/RIPPLE shape the 2026-09-12 audit
   *  found. Both clocks go back to "long ago". */
  reset(p) {
    p._frostPrevPulse = 0
    p._frostKickAt = -99
    p._frostGlow = 0.4
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    const x0 = Math.round(cols / 2 - HEART_W / 2)
    // The word follows the locked station; worked out only when the callsign
    // changes, so the frame allocates nothing.
    const callsign = p.lockedStation ? p.lockedStation.callsign : null
    if (callsign !== p._frostWordOf) {
      p._frostWordOf = callsign
      p._frostWord = signWord(p.lockedStation)
      p._frostFlaky = flakyIndex(p._frostWord)
    }
    // --- the beat ------------------------------------------------------------
    const pulse = A.pulse || 0
    if (!p.muted && pulse - p._frostPrevPulse >= BEAT_RISE && t - p._frostKickAt >= STEP_GAP_S) {
      p._frostKickAt = t
    }
    p._frostPrevPulse = pulse
    // Resting glow follows the LEVEL over about a second (2% a frame), not
    // the frame: level carries the kick's own envelope, and tracking it
    // closely would step things twice a beat -- off the beat, which is the
    // motion the strike exists to avoid. Design pass: unmuted it always sits
    // in the MUTED tier (0.34..0.5), a tier over the wall; the level now
    // shows as how much wall the sign lights. Muted it is DIM.
    const target = p.muted ? 0.22 : Math.min(REST_MAX, 0.34 + 0.16 * Math.min(1, A.level || 0))
    p._frostGlow += (target - p._frostGlow) * 0.02

    const age = t - p._frostKickAt
    const glow = p._frostGlow
    const slot = Math.floor(t * 9)               // ~110ms flicker slots
    const flakeTube = hash2(slot, 7) < 0.035, flakeWord = hash2(slot, 3) < 0.035

    // --- the wall ---------------------------------------------------------------
    // Solid brickwork (design pass): DIM where the sign lights it, FAINT
    // beyond, never brighter than DIM -- the tube rests at MUTED. The lit
    // patch is an ellipse round the sign whose size follows the slow glow,
    // its edge dithered per half-brick so it frays rather than draws a line.
    // Muted, the sign throws no light and the whole wall is FAINT.
    const reach = 0.8 + 2.5 * (p._frostGlow - 0.34)
    const cy = HEART_Y0 + 5.5
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        let ch = ' ', attr = FAINT
        if (y < CURB_Y) {
          if (isMortar(y)) {
            const up = jointAt(x, y - 1), down = jointAt(x, y + 1)
            ch = up && down ? '┼' : up ? '┴' : down ? '┬' : '─'
          } else if (jointAt(x, y)) ch = '│'
          const ac = x - x0, ar = y - HEART_Y0
          if (ac >= -PAD && ac < HEART_W + PAD && ar >= -PAD && ar < HEART_H + PAD && MARGIN[mi(ac, ar)]) ch = ' '
          if (!p.muted && ch !== ' ') {
            const dx = (x - cols / 2) / (23 * reach), dy = (y - cy) / (7.5 * reach)
            const fray = (hash2(Math.floor(x / 4), y) - 0.5) * 0.35
            if (dx * dx + dy * dy < 1 + fray) attr = DIM
          }
        }
        term.put(x, y, ch, attr)
      }
    }

    // --- wires and fittings ------------------------------------------------------
    for (const wx of [x0 + 7, x0 + HEART_W - 8]) {
      for (let y = 1; y < HEART_Y0; y++) term.put(wx, y, '┊', DIM)
    }
    // Transformer on the wall at the right, its cable running to the sign.
    const bx = x0 + HEART_W + 4
    const by = HEART_Y0 + 7
    if (bx + 4 < cols) {
      term.put(bx, by, '╔', DIM); term.put(bx + 1, by, '═', DIM); term.put(bx + 2, by, '═', DIM); term.put(bx + 3, by, '╗', DIM)
      term.put(bx, by + 1, '║', DIM); term.put(bx + 1, by + 1, '•', p.muted ? FAINT : MUTED); term.put(bx + 2, by + 1, ' ', DIM); term.put(bx + 3, by + 1, '║', DIM)
      term.put(bx, by + 2, '╚', DIM); term.put(bx + 1, by + 2, '═', DIM); term.put(bx + 2, by + 2, '═', DIM); term.put(bx + 3, by + 2, '╝', DIM)
      for (let x = x0 + HEART_W - 1; x < bx; x++) term.put(x, by + 1, x === x0 + HEART_W - 1 ? ' ' : '─', DIM)
    }

    // --- the heart ---------------------------------------------------------------
    // Interior first: the glass box is dark, the wall does not show through.
    for (const cell of INTERIOR) term.put(x0 + cell.c, HEART_Y0 + cell.r, ' ', FAINT)
    // The strike's glow: '·' DIM on the cells just outside the tube for the
    // length of the strike (45ms) and no longer -- the bloom neon throws as
    // it catches. It starts and ends inside the beat, so it adds to what the
    // kick changes and nothing to what happens between kicks.
    if (age >= 0 && age < STRIKE_S) {
      for (const cell of HALO) {
        const x = x0 + cell.c, y = HEART_Y0 + cell.r
        if (x >= 0 && x < cols && y >= 1 && y < CURB_Y) term.put(x, y, '·', DIM)
      }
    }
    for (const cell of TUBE) {
      let v = tubeLevel(glow, age, cell.d)
      if (cell.buzz && flakeTube) v *= 0.35
      term.put(x0 + cell.c, HEART_Y0 + cell.r, cell.ch, tier(v))
    }
    // The word. It lights when the surge is half way up, as if on the same
    // circuit further along; at rest it glows with the tube.
    const word = p._frostWord
    const wx = x0 + Math.round((HEART_W - word.length) / 2)
    const wv = Math.max(p._frostGlow, tubeLevel(glow, age, 0.6) * 0.85)
    for (let i = 0; i < word.length; i++) {
      const ch = word[i]
      if (ch === ' ') continue
      let attr = tier(Math.min(0.8, wv))
      if (i === p._frostFlaky && flakeWord) attr = FAINT
      term.put(wx + i, HEART_Y0 + WORD_ROW, ch, attr)
    }

    // --- curb and reflection ---------------------------------------------------
    for (let x = 0; x < cols; x++) term.put(x, CURB_Y, '▁', FAINT)
    // The puddle mirrors REFLECT about the curb, a tier under the tube. ONE
    // slow shift for every row -- a column either way a few times a minute --
    // so the staircase diagonals stay joined (a per-row phase broke them into
    // loose steps), and a 5% dropout where the ripples break the surface.
    const shift = Math.round(Math.sin(t * 0.5) * 1.2)
    const drop = Math.floor(t * 0.8)
    for (const cell of PUDDLE) {
      const y = CURB_Y + cell.k
      if (y >= VIZ_BOT) continue
      const x = x0 + cell.c + shift
      if (x < 0 || x >= cols) continue
      if (hash2(cell.c + drop, y) < 0.05) continue
      const v = tubeLevel(glow, age, cell.d)
      term.put(x, y, cell.ch, v > 0.55 ? MUTED : v > 0.3 ? DIM : FAINT)
    }
  },
}
