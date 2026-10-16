// SIGNAL -- visualizer effect "FROST" (COLD WAVE). Rebuilt 2026-10-16.
//
// A neon sign on a brick wall at night: a big heart bent from glass tubing,
// COLD WAVE lettered across its middle, hung from two wires off the top of
// the frame, with a little transformer box on the wall and the whole thing
// mirrored, broken up by the wet, in the pavement under the curb.
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
// Rows on the canvas: the heart's top row, the curb, and where the word sits
// inside the heart (row 3/4 of the art is its widest point).
export const HEART_Y0 = 3
export const CURB_Y = HEART_Y0 + HEART_H          // 15
export const WORD = 'C O L D   W A V E'
export const WORD_ROW = 4                          // art row
// The letter that is losing power: the A of WAVE.
const FLAKY = WORD.indexOf('A')

// Mirror pairs for the reflection: a tube seen upside down in a puddle.
const FLIP = { '╭': '╰', '╰': '╭', '╮': '╯', '╯': '╮' }

// Tube cells of the heart, each with `d`, its distance along the tube from
// the point (0) to the lobe tops (1) -- the surge's coordinate. Row-based
// with a lean toward the centre line, so the head climbs both sides together
// and the dip between the lobes (row 2's '╰─╯') lights last but one.
const TUBE = []
for (let r = 0; r < HEART_H; r++) {
  for (let c = 0; c < HEART_W; c++) {
    const ch = HEART[r][c]
    if (ch === ' ') continue
    TUBE.push({ c, r, ch, d: (HEART_H - 1 - r) / (HEART_H - 1) })
  }
}
// A dark margin round the tube, in art coordinates: the wall stops two
// columns and one row short of the glass, so no mortar line can run into
// the outline and read as more tubing (the first cut used '─' for both).
const MARGIN = new Set()
for (const cell of TUBE) {
  for (let dr = -1; dr <= 1; dr++) for (let dc = -2; dc <= 2; dc++) MARGIN.add(`${cell.c + dc},${cell.r + dr}`)
}
// The cells hugging the tube, where the strike's glow lands: every
// neighbour of a tube cell (left, right, above, below) that is not itself
// tube and not the word's row. Sides only read as a doubled line in a still;
// all four make a soft outline round the glass, which is what a neon tube
// catching actually looks like.
const HALO = []
{
  const tubeAt = new Set(TUBE.map((cell) => `${cell.c},${cell.r}`))
  const seen = new Set()
  for (const cell of TUBE) {
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const c = cell.c + dc, r = cell.r + dr
      const k = `${c},${r}`
      if (tubeAt.has(k) || seen.has(k) || r === WORD_ROW) continue
      seen.add(k)
      HALO.push({ c, r })
    }
  }
}
// The run of tube that buzzes: six cells of the right lobe's outer edge.
const BUZZ = new Set(TUBE.filter((cell) => cell.c >= HEART_W - 5 && cell.r <= 2).map((cell) => `${cell.c},${cell.r}`))

const tier = (v) => (v > 0.82 ? BRIGHT : v > 0.55 ? NORMAL : v > 0.33 ? MUTED : DIM)

export default {
  key: 'frost',
  label: 'NEON HEART',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._frostPrevPulse = 0
    p._frostKickAt = -99
    p._frostGlow = 0.3
  },
  /** Re-arms clocks on every visualizer entry. The effect clock restarts at
   *  0, so a kick time from the last visit would read as a surge scheduled
   *  in the future -- the FLAME/BREACH/RIPPLE shape the 2026-09-12 audit
   *  found. Both clocks go back to "long ago". */
  reset(p) {
    p._frostPrevPulse = 0
    p._frostKickAt = -99
    p._frostGlow = 0.3
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    const x0 = Math.round(cols / 2 - HEART_W / 2)
    // --- the beat ------------------------------------------------------------
    const pulse = A.pulse || 0
    if (!p.muted && pulse - p._frostPrevPulse >= BEAT_RISE && t - p._frostKickAt >= STEP_GAP_S) {
      p._frostKickAt = t
    }
    p._frostPrevPulse = pulse
    // Resting glow follows the LEVEL over about a second (2% a frame), not
    // the frame: level carries the kick's own envelope, and tracking it
    // closely would step the tubes between DIM and MUTED twice a beat -- off
    // the beat, which is the motion the strike exists to avoid.
    const target = p.muted ? 0.22 : Math.min(REST_MAX, 0.24 + 0.32 * Math.min(1, A.level || 0))
    p._frostGlow += (target - p._frostGlow) * 0.02

    const age = t - p._frostKickAt
    const tubeLevel = (d) => {
      if (age < 0 || age >= STRIKE_S + HOLD_S) return p._frostGlow
      const front = age / STRIKE_S                     // 0 at the point, 1 at the lobes
      if (front < 1) {
        if (d > front) return p._frostGlow             // not reached yet
        // The running front is BRIGHT: about two rows of tube on each side,
        // so the frame stays inside the 16-cell BRIGHT budget DANCEFLOOR
        // set (0.3 measured 24 in the worst frame, 0.2 measured 18).
        return front - d < 0.15 ? 1 : 0.7
      }
      return 0.7
    }
    const slot = Math.floor(t * 9)               // ~110ms flicker slots
    const flake = (salt) => hash2(slot, salt) < 0.035

    // --- the wall ---------------------------------------------------------------
    // Brick courses two rows deep, joints staggered by half a brick. FAINT,
    // and DOTTED ('┈' / '¦'): the tube is solid line, so the wall must never
    // be, or the two merge into one drawing.
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        let ch = ' ', attr = FAINT
        if (y < CURB_Y) {
          const course = Math.floor((y - 1) / 2)
          const off = course % 2 ? 5 : 0
          if ((y - 1) % 2 === 1) ch = '┈'
          else if ((x + off) % 10 === 0) ch = '¦'
          // The light falls off away from the sign: bricks far from it are
          // just dark.
          // The patch of wall the sign lights grows with its resting glow --
          // a brighter sign throws more light -- on the slow glow, so the
          // edge moves over seconds, never per beat.
          const reach = 0.75 + 0.6 * (p._frostGlow - 0.22)
          const dx = (x - cols / 2) / (26 * reach), dy = (y - (HEART_Y0 + 5)) / (9 * reach)
          if (dx * dx + dy * dy > 1) ch = ' '
          if (MARGIN.has(`${x - x0},${y - HEART_Y0}`)) ch = ' '
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
    if (bx + 4 < cols) {
      term.put(bx, 10, '╔', DIM); term.put(bx + 1, 10, '═', DIM); term.put(bx + 2, 10, '═', DIM); term.put(bx + 3, 10, '╗', DIM)
      term.put(bx, 11, '║', DIM); term.put(bx + 1, 11, '•', p.muted ? FAINT : MUTED); term.put(bx + 2, 11, ' ', DIM); term.put(bx + 3, 11, '║', DIM)
      term.put(bx, 12, '╚', DIM); term.put(bx + 1, 12, '═', DIM); term.put(bx + 2, 12, '═', DIM); term.put(bx + 3, 12, '╝', DIM)
      for (let x = x0 + HEART_W - 1; x < bx; x++) term.put(x, 11, x === x0 + HEART_W - 1 ? ' ' : '─', DIM)
    }

    // --- the heart ---------------------------------------------------------------
    // Interior first: the glass box is dark, the wall does not show through.
    for (let r = 0; r < HEART_H; r++) {
      const row = HEART[r]
      const first = row.search(/\S/)
      const last = row.length - 1 - [...row].reverse().join('').search(/\S/)
      for (let c = first + 1; c < last; c++) {
        if (row[c] === ' ' && !(r === 0 && c > 11 && c < 19) && !(r === 1 && c > 14 && c < 16)) term.put(x0 + c, HEART_Y0 + r, ' ', FAINT)
      }
    }
    // Clear the notch between the lobes back to wall-dark.
    for (let c = 12; c <= 18; c++) term.put(x0 + c, HEART_Y0, ' ', FAINT)
    term.put(x0 + 15, HEART_Y0 + 1, ' ', FAINT)
    // The strike's glow: a FAINT '░' hugging the tube for the length of the
    // strike (45ms) and no longer -- the bloom neon throws as it catches. It
    // starts and ends inside the beat, so it adds to what the kick changes
    // and nothing to what happens between kicks.
    if (age >= 0 && age < STRIKE_S) {
      for (const cell of HALO) {
        const x = x0 + cell.c
        if (x >= 0 && x < cols) term.put(x, HEART_Y0 + cell.r, '░', FAINT)
      }
    }
    for (const cell of TUBE) {
      let v = tubeLevel(cell.d)
      if (BUZZ.has(`${cell.c},${cell.r}`) && flake(7)) v *= 0.35
      term.put(x0 + cell.c, HEART_Y0 + cell.r, cell.ch, tier(v))
    }
    // The word. It lights when the surge is half way up, as if on the same
    // circuit further along; its resting glow is a step under the heart's.
    const wx = x0 + Math.round((HEART_W - WORD.length) / 2)
    const wv = Math.max(p._frostGlow * 0.95, tubeLevel(0.6) * 0.85)
    for (let i = 0; i < WORD.length; i++) {
      const ch = WORD[i]
      if (ch === ' ') continue
      let attr = tier(Math.min(0.8, wv))
      if (i === FLAKY && flake(3)) attr = FAINT
      term.put(wx + i, HEART_Y0 + WORD_ROW, ch, attr)
    }

    // --- curb and reflection ---------------------------------------------------
    for (let x = 0; x < cols; x++) term.put(x, CURB_Y, '▁', FAINT)
    // The puddle mirrors the heart about the curb: row CURB_Y + k shows art
    // row HEART_H - k. Shifted a column either way by a slow swell so it
    // reads as water rather than as a second sign, and a tier down.
    for (let y = CURB_Y + 1; y < VIZ_BOT; y++) {
      const r = HEART_H - (y - CURB_Y)
      if (r < 0) continue
      // A slow swell: the shift steps a row a column at a time a few times
      // a minute, not a few times a second -- a puddle, not a river, and
      // every step it takes is motion between the beats.
      const shift = Math.round(Math.sin(t * 0.5 + y * 0.9) * 1.2)
      for (let c = 0; c < HEART_W; c++) {
        const ch = HEART[r][c]
        if (ch === ' ') continue
        const x = x0 + c + shift
        if (x < 0 || x >= cols) continue
        // Broken up: a cell drops out where the ripples break the surface.
        if (hash2(c + Math.floor(t * 0.8), y) < 0.18) continue
        const v = tubeLevel((HEART_H - 1 - r) / (HEART_H - 1)) * 0.75
        const attr = v > 0.55 ? MUTED : v > 0.3 ? DIM : FAINT
        term.put(x, y, FLIP[ch] || (ch === '│' ? '│' : '─'), attr)
      }
    }
  },
}
