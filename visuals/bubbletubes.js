// SIGNAL -- visualizer effect "DJ BOOTH" (SYNAPSE), key 'bubbletubes'.
// Split out of program.js in the 2026-08-25 audit; `this` became `p` (the
// program object). Redrawn 2026-10-16 (design pass) -- the key is kept so a
// saved override and stations.js's `visual: 'bubbletubes'` still land here.
//
// 2026-10-16 (design pass) -- what it is now: a DJ booth, front-on, from the
// floor. A lighting truss across the top with six cans hanging off it, their
// beams raking down through the room; the DJ behind the decks in headphones,
// one hand on the mixer; the booth itself -- two turntables either side of
// a two-channel mixer, the station's callsign across the booth's front
// panel; and the crowd's heads along the bottom edge.
//
// Why it fits: SYNAPSE is tech house off the current club circuit, and the
// booth is the one picture that music has of itself. Nothing else on the
// roster is a club: DANCEFLOOR (MIRRORBALL) is a 70s disco floor seen from
// the floor, BOOM BAP a radio on a stoop.
//
// What the critique found in what it replaced (the 61st/62nd-pass BUBBLE
// TUBES, below): a generic nine-bar EQ -- no bubbles, no jukebox, and BOOM
// BAP already carries an EQ; the largest slab area on the roster (nine
// solid '█' BRIGHT / '▓' NORMAL columns, which raster as lit rectangles);
// a kick that was invisible (LOUD and KICK tiles identical in bar heights);
// and MUTED as nine equal stubs. The critique offered two directions, the
// jukebox tubes done properly or a club scene. The tubes were not chosen:
// round '0' bubbles were tried in the 62nd pass and "didn't read well", and
// a jukebox is a lounge picture, not tech house's -- it was the right object
// for MIDNIGHT NEON's blues, which this dial slot no longer plays.
//
// How audio maps -- the kick is the one discrete event, and it STEPS:
//   - THE KICK (a rising edge on `pulse`, DANCEFLOOR's rule -- the synthetic
//     random `onset` flag is not read, or the lights would change off the
//     beat) moves the lighting rig to its next position, the way a lighting
//     desk's chase is clocked off the kick. The new position HOLDS until the
//     next kick, so the beat is visible in a still: set LOUD beside KICK and
//     the beams point somewhere else. For KICK_HOLD_S the cans and beams
//     flash up a tier and the DJ's free arm is in the air.
//   - Level, latched at each kick, sets how many hands in the crowd are up
//     until the next one.
//   - The mixer's two channel meters follow bass and level continuously.
//   - The platters turn at 33 1/3 whatever the music does (ambient life: a
//     deck turns with the radio muted too).
// Without a tap it runs on syntheticAudio(t), whose ~0.9s pulse clocks the
// chase. Muted, SILENT_AUDIO: the rig holds its last position at its resting
// tier, meters dark, hands down, decks turning -- faint, never blank.
//
// Tube rules: no shade blocks anywhere (beams are light: thin '/', '|',
// '\' strokes, never '░'). Subject brightest -- the DJ and the decks at
// NORMAL, the booth panel and truss DIM, the crowd DIM; BRIGHT only on the
// kick (the six can lenses and the raised fist). tests/visual-bubbletubes
// .test.mjs holds the KICK/LOUD difference, MUTED-not-blank, no shade
// blocks, and the BRIGHT budget.
//
// History of the previous effect on this key, kept as the design record:
// 61st pass -- BUBBLE TUBES (MIDNIGHT NEON, replaced NEON SIGN). Nine tubes
// spanning the full width, one per real spectrum band off A.bands9, each
// filled from the base up like a VU bar, with an idle floor (JUKE_IDLE_FILL
// 0.16) so every tube stayed lit with no signal. Live QA fix in the same
// pass: a 3-tier fade put a tall column's upper rows in FAINT/DIM, which the
// tube renders as invisible, so it went two-tier ('█' BRIGHT near the base,
// '▓' NORMAL above) -- the slab the 2026-10-16 critique then flagged.
// 62nd pass -- the bubble pool (JUKE_BUBBLE_*) was dropped along with the
// bubbles themselves: the "0" bubble shapes didn't read well; kept as the
// thicker bars instead. 64th pass -- SILENT_AUDIO while muted (see tap.js).
// JUKE_TUBES / JUKE_IDLE_FILL were exported but imported nowhere else, and
// went with the tubes in the 2026-10-16 redraw.
// (65th/67th-pass removal notes for GEIGER, BLAST FIELD and NEON SIGN that
// used to sit in this object live above VISUAL_METHODS in visuals/index.js.)
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)

// --- the kick -----------------------------------------------------------------
// DANCEFLOOR's / BOOM BAP's edge: a rise in `pulse` of at least BEAT_RISE
// since the last frame, at least KICK_GAP_S after the last kick.
export const BEAT_RISE = 0.2
export const KICK_GAP_S = 0.22
// How long the flash (cans BRIGHT, beams up a tier, fist up) lasts. The
// rig's new POSITION outlives it -- that is what a still can catch.
export const KICK_HOLD_S = 0.16

// --- the rig ------------------------------------------------------------------
export const TRUSS_Y = 1
export const CAN_Y = 2
export const CANS = 6
// Each step of the chase is a beam direction per can, in columns per row:
// -1 '/', 0 '|', +1 '\'. Converge, cross, fan out, all right, straight
// down, all left -- consecutive steps always differ for every can that
// matters to the eye, so each kick visibly re-aims the room.
export const CHASE = [
  [1, 1, 1, -1, -1, -1],
  [1, -1, 1, -1, 1, -1],
  [-1, -1, -1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 0],
  [-1, -1, -1, -1, -1, -1],
]
const BEAM_CH = { '-1': '/', 0: '|', 1: '\\' }

// --- the DJ and the booth -----------------------------------------------------
export const HEAD_Y = 4               // headphone band; head rows 4..6
export const SHOULDER_Y = 7           // torso rows 7..9
export const DECK_Y0 = 10, DECK_Y1 = 14   // booth top: platters + mixer
export const PANEL_Y0 = 15, PANEL_Y1 = 18 // booth front panel
export const CROWD_Y = 20             // heads; hands at 19, shoulders at 21

const LAYOUTS = new Map()
/** Column layout for a grid width. Pure function of `cols`, cached. */
export function boothLayout(cols) {
  let L = LAYOUTS.get(cols)
  if (L) return L
  const half = Math.floor(Math.min(66, cols - 4) / 2)
  const mid = Math.floor(cols / 2)
  const mixHalf = 8
  const rx = Math.max(5, Math.min(11, Math.floor((half - mixHalf - 3) / 2)))
  const off = mixHalf + 2 + rx
  const cans = []
  for (let k = 0; k < CANS; k++) cans.push(Math.round(cols * (k + 0.5) / CANS))
  L = { half, mid, bx0: mid - half, bx1: mid + half, mixHalf, rx, lcx: mid - off, rcx: mid + off, cans }
  LAYOUTS.set(cols, L)
  return L
}

// Ring glyph from the ellipse's slope at a cell, in cells (BOOM BAP's rule):
// shallow '─', steep '│', the diagonal stretch a slash.
function ringGlyph(nx, ny, rx, ry) {
  const tx = Math.abs(ny * rx), ty = Math.abs(nx * ry)
  if (ty < tx * 0.4) return '─'
  if (ty > tx * 2.5) return '│'
  return (nx > 0) === (ny < 0) ? '\\' : '/'
}

// Cheap integer hash -> 0..1, for which heads have their hands up on a step.
function hashStep(k, step) {
  const v = Math.sin(k * 12.9898 + step * 78.233) * 43758.5453
  return v - Math.floor(v)
}

export default {
  key: 'bubbletubes',
  label: 'DJ BOOTH',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._boothLastT = null
    p._boothKickAt = -Infinity
    p._boothPrevPulse = 0
    p._boothStep = 0
    p._boothHands = 0.3
    p._boothSpin = 0
    p._boothLoud = 0.4
    p._boothMeters = [0, 0]
  },
  /** Re-arms clocks on every visualizer entry. */
  reset(p) {
    // _boothKickAt and _boothLastT are absolute effect-clock values; carried
    // over a long visit they sit in the future of the restarted clock and the
    // gap rule would refuse every kick until it caught up. The step, the
    // platter angle and the meters are positions, not clocks, and carry over.
    p._boothKickAt = -Infinity
    p._boothLastT = null
    p._boothPrevPulse = 0
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const L = boothLayout(cols)
    const { mid, rx } = L
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    const clamp01 = (v) => Math.min(1, Math.max(0, v || 0))

    // --- clocks -----------------------------------------------------------
    const dt = p._boothLastT === null ? 0 : Math.min(0.25, Math.max(0, t - p._boothLastT))
    p._boothLastT = t
    p._boothSpin += dt * (2 * Math.PI * 33.333 / 60) * 0.25   // a visible fraction of 33 1/3
    p._boothLoud += (clamp01(A.level) - p._boothLoud) * (1 - Math.exp(-dt / 0.9))

    // --- the kick: step the chase ------------------------------------------
    const pulse = A.pulse || 0
    if (!muted && t - p._boothKickAt >= KICK_GAP_S && pulse - p._boothPrevPulse >= BEAT_RISE) {
      p._boothKickAt = t
      p._boothStep = (p._boothStep + 1) % 1e6
      p._boothHands = clamp01(A.level)
    }
    p._boothPrevPulse = pulse
    const flash = !muted && t - p._boothKickAt < KICK_HOLD_S
    const loud = p._boothLoud

    // Meters: fast up, slower down.
    for (let i = 0; i < 2; i++) {
      const target = clamp01(i === 0 ? A.bass : A.level)
      const c = p._boothMeters[i]
      p._boothMeters[i] = c + (target - c) * (target > c ? 0.5 : 0.12)
    }

    // --- clear the canvas ---------------------------------------------------
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) term.put(x, y, ' ')

    // --- the rig: truss, cans, beams ------------------------------------------
    for (let x = 0; x < cols; x++) term.put(x, TRUSS_Y, '═', DIM)
    const pattern = CHASE[p._boothStep % CHASE.length]
    const beamAt = flash ? NORMAL : loud > 0.5 ? MUTED : DIM
    for (let k = 0; k < CANS; k++) {
      const cx = L.cans[k]
      term.put(cx, TRUSS_Y, '╤', DIM)
      term.put(cx, CAN_Y, '▼', flash ? BRIGHT : NORMAL)
      const dx = pattern[k]
      const ch = BEAM_CH[dx]
      for (let y = CAN_Y + 1; y <= PANEL_Y1; y++) {
        const x = cx + dx * (y - CAN_Y)
        if (x < 0 || x >= cols) break
        term.put(x, y, ch, beamAt)
      }
    }

    // --- the DJ ---------------------------------------------------------------
    // Blank the figure's own area first so the beams pass behind it.
    for (let y = HEAD_Y; y < DECK_Y0; y++) {
      const w = y < SHOULDER_Y ? 4 : 6
      for (let x = mid - w; x <= mid + w; x++) term.put(x, y, ' ')
    }
    // Head in headphones: band over the top, cups either side.
    term.text(mid - 3, HEAD_Y, '╭─────╮', NORMAL)
    term.put(mid - 4, HEAD_Y + 1, '[', NORMAL); term.put(mid - 3, HEAD_Y + 1, '│', NORMAL)
    term.text(mid - 1, HEAD_Y + 1, '- -', DIM)
    term.put(mid + 3, HEAD_Y + 1, '│', NORMAL); term.put(mid + 4, HEAD_Y + 1, ']', NORMAL)
    term.text(mid - 3, HEAD_Y + 2, '╰──┬──╯', NORMAL)
    // Shoulders and torso, down behind the booth.
    term.text(mid - 5, SHOULDER_Y, '╭────┴────╮', NORMAL)
    for (let y = SHOULDER_Y + 1; y < DECK_Y0; y++) { term.put(mid - 5, y, '│', NORMAL); term.put(mid + 5, y, '│', NORMAL) }
    // Left arm: down to the mixer.
    term.put(mid - 6, SHOULDER_Y + 1, '/', NORMAL)
    term.put(mid - 7, SHOULDER_Y + 2, '/', NORMAL)
    // Right arm: down to the mixer, or up on the kick.
    if (flash) {
      term.put(mid + 6, SHOULDER_Y - 1, '/', NORMAL)
      term.put(mid + 7, SHOULDER_Y - 2, '/', NORMAL)
      term.put(mid + 8, SHOULDER_Y - 3, '●', BRIGHT)
    } else {
      term.put(mid + 6, SHOULDER_Y + 1, '\\', NORMAL)
      term.put(mid + 7, SHOULDER_Y + 2, '\\', NORMAL)
    }

    // --- the booth: clear it, then the decks and the mixer -------------------
    for (let y = DECK_Y0; y <= PANEL_Y1; y++) for (let x = L.bx0; x <= L.bx1; x++) term.put(x, y, ' ')
    // The platters, seen from a little above: a flat stadium five rows tall
    // (a fitted ellipse at this size rastered as broken dashes), a groove
    // ring, the label, a strobe dot turning on the record, the tonearm
    // lying in from the top-right corner.
    const cy = (DECK_Y0 + DECK_Y1) / 2
    for (let side = 0; side < 2; side++) {
      const pcx = side === 0 ? L.lcx : L.rcx
      const xl = pcx - rx, xr = pcx + rx
      for (let x = xl + 3; x <= xr - 3; x++) { term.put(x, DECK_Y0, '─', NORMAL); term.put(x, DECK_Y1, '─', NORMAL) }
      term.put(xl + 2, DECK_Y0, '╭', NORMAL); term.put(xr - 2, DECK_Y0, '╮', NORMAL)
      term.put(xl + 2, DECK_Y1, '╰', NORMAL); term.put(xr - 2, DECK_Y1, '╯', NORMAL)
      term.text(xl, DECK_Y0 + 1, '╭─╯', NORMAL); term.text(xr - 2, DECK_Y0 + 1, '╰─╮', NORMAL)
      term.put(xl, cy, '│', NORMAL); term.put(xr, cy, '│', NORMAL)
      term.text(xl, DECK_Y1 - 1, '╰─╮', NORMAL); term.text(xr - 2, DECK_Y1 - 1, '╭─╯', NORMAL)
      // Groove ring.
      const gr = Math.max(3, rx - 6)
      for (let x = pcx - gr + 2; x <= pcx + gr - 2; x++) { term.put(x, cy - 1, '─', DIM); term.put(x, cy + 1, '─', DIM) }
      term.put(pcx - gr, cy, '(', DIM); term.put(pcx + gr, cy, ')', DIM)
      // Label and spindle.
      term.text(pcx - 1, cy, '(●)', NORMAL)
      // The strobe dot, turning.
      const a = p._boothSpin + side * Math.PI
      term.put(Math.round(pcx + (rx - 3) * Math.cos(a)), Math.round(cy + 1.2 * Math.sin(a)), '◆', NORMAL)
      // Tonearm: pivot at the corner, the arm laid in across the rim.
      term.put(xr, DECK_Y0, '○', DIM)
      term.put(xr - 1, DECK_Y0 + 1, '/', DIM)
      term.put(xr - 2, cy, '·', NORMAL)
    }
    // Mixer.
    const mx0 = mid - L.mixHalf, mx1 = mid + L.mixHalf
    for (let x = mx0 + 1; x < mx1; x++) { term.put(x, DECK_Y0, '─', DIM); term.put(x, DECK_Y1, '─', DIM) }
    for (let y = DECK_Y0 + 1; y < DECK_Y1; y++) { term.put(mx0, y, '│', DIM); term.put(mx1, y, '│', DIM) }
    term.put(mx0, DECK_Y0, '╭', DIM); term.put(mx1, DECK_Y0, '╮', DIM)
    term.put(mx0, DECK_Y1, '╰', DIM); term.put(mx1, DECK_Y1, '╯', DIM)
    for (let kx = mid - 3; kx <= mid + 3; kx += 3) { term.put(kx, DECK_Y0 + 1, '○', DIM); term.put(kx, DECK_Y0 + 2, '○', DIM) }
    term.text(mid - 3, DECK_Y1 - 1, '───╪───', DIM)
    // The two channel meters, three LEDs each, lit from the bottom.
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? mx0 + 2 : mx1 - 2
      const lit = muted ? 0 : Math.round(Math.min(1, p._boothMeters[i] * 1.4) * 3)
      for (let r = 0; r < 3; r++) {
        const on = r < lit
        term.put(x, DECK_Y1 - 1 - r, on ? '■' : '·', on ? (r === 2 ? NORMAL : MUTED) : FAINT)
      }
    }
    // The DJ's hands land on the mixer's top edge.
    term.put(mx0 + 1, DECK_Y0, '●', NORMAL)
    if (!flash) term.put(mx1 - 1, DECK_Y0, '●', NORMAL)

    // Front panel, with the station's callsign across it.
    for (let x = L.bx0 + 1; x < L.bx1; x++) { term.put(x, PANEL_Y0, '─', DIM); term.put(x, PANEL_Y1, '─', DIM) }
    for (let y = PANEL_Y0 + 1; y < PANEL_Y1; y++) { term.put(L.bx0, y, '│', DIM); term.put(L.bx1, y, '│', DIM) }
    term.put(L.bx0, PANEL_Y0, '╞', DIM); term.put(L.bx1, PANEL_Y0, '╡', DIM)
    term.put(L.bx0, PANEL_Y1, '╰', DIM); term.put(L.bx1, PANEL_Y1, '╯', DIM)
    const name = String(p.lockedStation?.callsign || 'SYNAPSE').slice(0, Math.floor((2 * L.half - 6) / 2))
    const w = name.length * 2 - 1
    let nx = mid - Math.floor(w / 2)
    for (let i = 0; i < name.length; i++, nx += 2) term.put(nx, PANEL_Y0 + 2, name[i], NORMAL)

    // --- the crowd -----------------------------------------------------------
    // Heads along the bottom; hands up over a share of them set by the level
    // at the last kick, reshuffled on each step and held until the next.
    const handsShare = muted ? 0 : 0.15 + 0.6 * p._boothHands
    for (let k = 0, x = 2; x < cols - 2; k++) {
      term.put(x, CROWD_Y, '●', DIM)
      if (x - 1 >= 0) term.put(x - 1, CROWD_Y + 1, '/', DIM)
      term.put(x, CROWD_Y + 1, '‾', DIM)
      if (x + 1 < cols) term.put(x + 1, CROWD_Y + 1, '\\', DIM)
      if (hashStep(k, p._boothStep) < handsShare) {
        term.put(x - 1, CROWD_Y - 1, '\\', DIM)
        term.put(x + 1, CROWD_Y - 1, '/', DIM)
      }
      x += 5 + Math.floor(hashStep(k, 7) * 3)
    }
  },
}
