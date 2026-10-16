// SIGNAL -- visualizer effect "BOOM BAP" (HACKBACK). Rebuilt 2026-10-16.
//
// A boombox on a stoop: a big portable stereo, front-on, filling the frame --
// carry handle on top, an FM dial across the top of the case, two big round
// speakers left and right, a cassette deck between them with two reels
// turning behind its window, a nine-band graphic EQ under the deck and a
// pair of knobs, set against a brick wall with the sidewalk under its feet.
//
// Why it fits: HACKBACK is golden-age hip-hop, coast to coast, and the
// boombox is that era's own picture of itself -- the radio on the shoulder,
// the tape somebody dubbed off the radio. It is also the one effect on the
// roster that is a RADIO, which suits a radio.
//
// What it replaced, and why. The previous BOOM BAP (57th pass, 4th rewrite)
// had the right subject at the wrong size: a 24-column box at the bottom of
// an empty frame, a strip of LEDs, and sound-wave rings one character wide.
// Measured 2026-10-16 (the reactivity probe in that day's visualizer review):
// the music changed 5.5% of the canvas, the lowest on the roster, and a kick
// was invisible (frames just after one changed 1.3x as much as frames
// between). With no tap it read nothing at all -- `p._au` was used raw, so a
// visitor without LINE IN got a slow fixed heartbeat ring. For the station
// whose music is most about the beat, that was the weakest picture of one.
//
// How audio maps -- one discrete event and two continuous ones:
//   - THE KICK pumps the speakers. A rising edge on `pulse` (or a real
//     onset) snaps both cones OUT -- the ridges jump outward, the dust cap
//     swells and lights -- then half-way back, then to rest: three positions,
//     so the change lands on the beat and the cone is still between beats.
//     That is the beat, and it has to be the thing you see.
//     The edge and the rate limit are DANCEFLOOR's (BEAT_RISE / KICK_GAP_S)
//     for the same reasons it records there.
//   - The EQ follows bands9 continuously, one bar per band, springing so a
//     bar rises fast and falls slower, the way an LED ladder reads.
//   - The reels turn at a steady rate that quickens a little with level.
// Without a tap it runs on syntheticAudio(t), like every effect that asks,
// so the picture is the same picture with or without LINE IN. Muted, it is
// SILENT_AUDIO: the cones still, the EQ dark, the tape still turning -- a
// stereo with the volume down is still playing the tape.
//
// Tube rules (UPRISING / KEEP / BACKROOM): no slabs of '█' -- the case is
// outlines, the speakers rings, the only fills '░' and '▓' at low tiers, and
// BRIGHT is kept to the kick's accents. tests/visual-boombap.test.mjs caps
// both.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)

// --- the kick -----------------------------------------------------------------
// DANCEFLOOR's edge: a rise in `pulse` of at least BEAT_RISE since the last
// frame, at least KICK_GAP_S after the last kick (a real tap fires onsets on
// hats and double kicks; the cones pump on the beat, not every transient).
export const BEAT_RISE = 0.2
export const KICK_GAP_S = 0.22
// How long the cones stay OUT after a kick, seconds: about seven frames at
// 60fps, enough to read as a punch (the tube's afterglow carries it a little
// further), short against even 120bpm's half-second between kicks.
export const KICK_HOLD_S = 0.11
// The kick's envelope, for the power LED's glow only.
export const KICK_TAU = 0.16

// --- geometry -----------------------------------------------------------------
// Rows are fixed (the canvas is always rows 1..VIZ_BOT-1); columns are worked
// out per grid width so the box is centred and as wide as fits, up to 70.
export const HANDLE_Y = 2
export const BODY_TOP = 4
export const DIAL_Y = 5
export const SPK_CY = 12            // speaker centre row
export const SPK_RY = 5             // speaker radius in rows (rows 7..17)
export const BODY_BOT = 18
export const FEET_Y = 19
export const DECK_Y0 = 7, DECK_Y1 = 11
export const EQ_Y0 = 13, EQ_ROWS = 4
export const KNOB_Y = 17

const LAYOUTS = new Map()
/** Column layout for a grid width. Pure function of `cols`, cached. */
export function boomLayout(cols) {
  let L = LAYOUTS.get(cols)
  if (L) return L
  const bodyW = Math.min(70, cols - 4)
  const x0 = Math.floor((cols - bodyW) / 2)
  const x1 = x0 + bodyW - 1
  const mid = (x0 + x1) / 2
  const deckHalf = 9
  // Each speaker gets what is left either side of the deck, less a margin.
  const rx = Math.max(5, (bodyW - 2 * deckHalf - 10) / 4)
  L = { bodyW, x0, x1, mid, deckHalf, rx, lcx: x0 + 2 + rx, rcx: x1 - 2 - rx }
  LAYOUTS.set(cols, L)
  return L
}

// Ring glyph from the slope of the ellipse where a cell sits, measured in
// CELLS (an ellipse rx columns wide and ry rows tall): shallow is '─', steep
// is '│', and only the genuinely diagonal stretch gets a slash. Choosing by
// angle instead drew runs of '////' on the shallow shoulders, where a 2:1
// cell makes the curve far flatter than its angle says. (Screen y runs down,
// so the upper-right quadrant slopes like '\'.)
function ringGlyph(nx, ny, rx, ry) {
  const tx = Math.abs(ny * rx), ty = Math.abs(nx * ry)   // tangent, in cells
  if (ty < tx * 0.4) return '─'
  if (ty > tx * 2.5) return '│'
  return (nx > 0) === (ny < 0) ? '\\' : '/'
}

const REEL_SPOKES = ['│', '/', '─', '\\']
const DIAL = 'FM  88 · 92 · 96 · 100 · 104 · 108  MHz'

export default {
  key: 'boombap',
  label: 'BOOM BAP',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._boomEq = new Array(9).fill(0)
    p._boomLoud = 0.4
    p._boomReel = 0
    p._boomLastT = null
    p._boomKickAt = -Infinity
    p._boomKickAmt = 0
    p._boomPrevPulse = 0
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // _boomKickAt and _boomLastT are absolute effect-clock values. Carried
    // over a long visit they sit minutes in the future of the restarted
    // clock: the rate limit would refuse every kick until it caught up, and
    // the reel's dt would come out negative. The pulse is cleared too, so the
    // first kick after entry is a rising edge. The EQ levels and the reel
    // angle are positions, not clocks, and carry over.
    p._boomKickAt = -Infinity
    p._boomKickAmt = 0
    p._boomLastT = null
    p._boomPrevPulse = 0
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const L = boomLayout(cols)
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    const clamp01 = (v) => Math.min(1, Math.max(0, v || 0))

    // --- clocks -----------------------------------------------------------
    const dt = p._boomLastT === null ? 0 : Math.min(0.25, Math.max(0, t - p._boomLastT))
    p._boomLastT = t
    p._boomReel += dt * (2.2 + 2.5 * clamp01(A.level))

    // --- the kick ---------------------------------------------------------
    const pulse = A.pulse || 0
    if (!muted && t - p._boomKickAt >= KICK_GAP_S &&
        (pulse - p._boomPrevPulse >= BEAT_RISE || A.onset)) {
      p._boomKickAt = t
      p._boomKickAmt = 0.65 + 0.35 * clamp01(A.bass)
    }
    p._boomPrevPulse = pulse
    const kick = muted ? 0 : p._boomKickAmt * Math.exp(-Math.max(0, t - p._boomKickAt) / KICK_TAU)

    // The passage's loudness, ~1s time constant, frame-rate independent.
    p._boomLoud += (clamp01(A.level) - p._boomLoud) * (1 - Math.exp(-dt / 0.9))

    // --- the EQ springs -----------------------------------------------------
    const bands = A.bands9 || []
    for (let i = 0; i < 9; i++) {
      const target = clamp01(bands[i])
      const cur = p._boomEq[i]
      p._boomEq[i] = cur + (target - cur) * (target > cur ? 0.5 : 0.12)
    }

    // --- background: brick wall, sidewalk ------------------------------------
    // Every cell of the canvas is written here first, so nothing from the
    // previous frame (or the previous effect) survives under the box.
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        let ch = ' ', at = FAINT
        if (y >= BODY_TOP && y <= BODY_BOT && x >= L.x0 - 1 && x <= L.x1 + 1) {
          // A clear column round the case: a wall joint flush against its
          // edge read as a doubled border.
        } else if (y >= VIZ_BOT - 2) {
          // Curb, then the paving: a flat edge and a sparse flagstone seam.
          ch = y === VIZ_BOT - 2 ? '▁' : (x % 9 === 0 ? '│' : ' ')
        } else if (y % 3 === 0) {
          ch = '─'
        } else if ((x + (Math.floor(y / 3) % 2) * 5) % 10 === 0) {
          ch = '│'
        }
        term.put(x, y, ch, at)
      }
    }

    // --- the case ---------------------------------------------------------------
    const { x0, x1, mid, deckHalf, rx } = L
    for (let y = BODY_TOP; y <= BODY_BOT; y++) {
      for (let x = x0; x <= x1; x++) term.put(x, y, ' ')
    }
    for (let x = x0 + 1; x < x1; x++) { term.put(x, BODY_TOP, '─', NORMAL); term.put(x, BODY_BOT, '─', NORMAL) }
    for (let y = BODY_TOP + 1; y < BODY_BOT; y++) { term.put(x0, y, '│', NORMAL); term.put(x1, y, '│', NORMAL) }
    term.put(x0, BODY_TOP, '╭', NORMAL); term.put(x1, BODY_TOP, '╮', NORMAL)
    term.put(x0, BODY_BOT, '╰', NORMAL); term.put(x1, BODY_BOT, '╯', NORMAL)
    // A seam under the dial band, the case's two halves.
    for (let x = x0 + 1; x < x1; x++) term.put(x, DIAL_Y + 1, '·', FAINT)

    // Handle: an arch over the middle third, on two posts.
    const hx0 = Math.round(mid - 15), hx1 = Math.round(mid + 15)
    for (let x = hx0 + 1; x < hx1; x++) term.put(x, HANDLE_Y, '─', DIM)
    term.put(hx0, HANDLE_Y, '╭', DIM); term.put(hx1, HANDLE_Y, '╮', DIM)
    term.put(hx0, HANDLE_Y + 1, '│', DIM); term.put(hx1, HANDLE_Y + 1, '│', DIM)

    // Feet.
    // ('═', not '▀': a half block is a lit slab on the tube at any tier.)
    for (const fx of [x0 + 4, x1 - 7]) for (let x = fx; x < fx + 4; x++) term.put(x, FEET_Y, '═', DIM)

    // FM dial across the top band, with its needle parked on a station.
    const dialW = Math.min(DIAL.length, x1 - x0 - 4)
    const dialX = Math.round(mid - dialW / 2)
    term.text(dialX, DIAL_Y, DIAL.slice(0, dialW), DIM)
    const needle = dialX + Math.round(dialW * 0.62)
    term.put(needle, DIAL_Y, '│', NORMAL)
    term.put(x0 + 2, DIAL_Y, '●', kick > 0.35 ? NORMAL : DIM)       // power LED, beats with the kick
    term.text(x1 - 7, DIAL_Y, 'STEREO', FAINT)

    // --- the speakers -----------------------------------------------------------
    // Concentric rings on an ellipse rx wide and SPK_RY tall. Ring radii are
    // in units of the speaker's own radius; a cell sits on a ring when it is
    // within RING_W cells of it, measured along the ellipse's gradient so the
    // outline is one cell thick all the way round. Back to front: the frame,
    // the rubber surround (a '░' band), two ridges on the cone, the dust cap.
    // The kick pushes the ridges and the cap OUTWARD and lifts them a tier or
    // two -- the cone moving is the beat. The pump is two positions held, not
    // a continuum: OUT for KICK_HOLD_S after the kick, then at rest. A real
    // cone snaps out and back. The first cut eased smoothly and sent a
    // pressure ring out after each kick, which kept the speakers moving for a
    // quarter-second after every beat: the reactivity probe scored it 2.95x,
    // the motion between kicks diluting the kick itself. A three-step
    // (out / half / rest) still scored 4.4x for the same reason.
    const pump = !muted && t - p._boomKickAt < KICK_HOLD_S ? 1 : 0
    // Between kicks the cones sit at a tier set by how loud the passage is --
    // `_boomLoud`, the level smoothed over about a second, so a loud chorus
    // reads hotter than a quiet verse without the cones flickering between
    // beats. (Without it the music changed 4.6% of the frame, less than the
    // version this replaced: at rest the speakers looked the same at any
    // volume.)
    const loud = p._boomLoud
    const restAt = loud > 0.5 ? MUTED : loud > 0.25 ? DIM : FAINT
    const ry = SPK_RY
    const push = 1 + 0.24 * pump
    const coneAt = pump === 1 ? NORMAL : restAt
    const ridges = [
      { r: 1.0, at: NORMAL },                                   // the frame
      { r: 0.62 * push, at: coneAt },
      { r: 0.4 * push, at: coneAt },
    ]
    const RING_W = 0.42
    for (const cx of [L.lcx, L.rcx]) {
      const xa = Math.max(0, Math.floor(cx - rx - 1)), xb = Math.min(cols - 1, Math.ceil(cx + rx + 1))
      for (let y = SPK_CY - ry; y <= SPK_CY + ry; y++) {
        for (let x = xa; x <= xb; x++) {
          const nx = (x - cx) / rx, ny = (y - SPK_CY) / ry
          const d = Math.hypot(nx, ny)
          if (d > 1.08) continue
          const g = Math.hypot(nx / rx, ny / ry) / Math.max(d, 1e-6)  // |grad d| per cell
          const near = (r) => Math.abs(d - r) / Math.max(g, 1e-6) < RING_W
          let ch = ' ', at = FAINT
          if (d < 0.2 * push) {
            // Dust cap: a dome that lights on the kick.
            // Only the centre '●' goes BRIGHT; a BRIGHT '▓' cap bloomed into a
            // lit cross on the tube (Chrome check, 2026-10-16).
            if (d < 0.1) { ch = '●'; at = pump === 1 ? BRIGHT : pump > 0 ? NORMAL : DIM }
            else { ch = pump > 0 ? '▒' : '░'; at = pump === 1 ? NORMAL : pump > 0 ? MUTED : DIM }
          } else {
            let hit = null
            for (const rg of ridges) if (near(rg.r)) { hit = rg; break }
            if (hit) { ch = ringGlyph(nx, ny, rx, ry); at = hit.at }
            else if (d > 0.84 && d < 1.0) { ch = '░'; at = loud > 0.5 ? DIM : FAINT }    // the rubber surround
            else if (d >= 1.0) continue
          }
          term.put(x, y, ch, at)
        }
      }
    }

    // --- the cassette deck ------------------------------------------------------
    const dx0 = Math.round(mid - deckHalf), dx1 = Math.round(mid + deckHalf)
    for (let x = dx0 + 1; x < dx1; x++) { term.put(x, DECK_Y0, '─', DIM); term.put(x, DECK_Y1, '─', DIM) }
    for (let y = DECK_Y0 + 1; y < DECK_Y1; y++) { term.put(dx0, y, '│', DIM); term.put(dx1, y, '│', DIM) }
    term.put(dx0, DECK_Y0, '╭', DIM); term.put(dx1, DECK_Y0, '╮', DIM)
    term.put(dx0, DECK_Y1, '╰', DIM); term.put(dx1, DECK_Y1, '╯', DIM)
    // The cassette's label strip, then the two reels with tape between them.
    const label = 'C-90  SIDE A'
    term.text(Math.round(mid - label.length / 2), DECK_Y0 + 1, label, FAINT)
    const spoke = REEL_SPOKES[Math.floor(p._boomReel * 4) % 4]
    for (const rcx of [Math.round(mid - 4), Math.round(mid + 4)]) {
      term.put(rcx - 1, DECK_Y0 + 2, '(', NORMAL)
      term.put(rcx, DECK_Y0 + 2, spoke, NORMAL)
      term.put(rcx + 1, DECK_Y0 + 2, ')', NORMAL)
    }
    for (let x = Math.round(mid - 4) + 2; x <= Math.round(mid + 4) - 2; x++) term.put(x, DECK_Y0 + 2, '─', DIM)
    for (let x = Math.round(mid - 6); x <= Math.round(mid + 6); x++) term.put(x, DECK_Y0 + 3, '═', FAINT)
    // Transport keys under the window.
    const keys = '▶  ◀◀  ▶▶  ■'
    term.text(Math.round(mid - keys.length / 2), DECK_Y1 + 1, keys, DIM)

    // --- the graphic EQ ----------------------------------------------------------
    // Nine bars two columns apart, one per band, EQ_ROWS tall, lit from the
    // bottom. The peak cell of a hot bar is the one place BRIGHT appears
    // without a kick behind it.
    // EQ_GAIN: a band sits around 0.3-0.6 most of the time (the tap's AGC
    // and syntheticAudio both centre there), which lit one or two LEDs of
    // four and read as an idle meter. 1.5 puts typical music at two or three
    // with the top LED for the peaks.
    const EQ_GAIN = 1.5
    const eqX = Math.round(mid - 8)
    for (let i = 0; i < 9; i++) {
      const lit = Math.round(Math.min(1, p._boomEq[i] * EQ_GAIN) * EQ_ROWS)
      for (let r = 0; r < EQ_ROWS; r++) {
        const y = EQ_Y0 + EQ_ROWS - 1 - r
        const on = r < lit
        const top = on && r === lit - 1
        term.put(eqX + i * 2, y, on ? '■' : '·', !on ? FAINT : top && lit === EQ_ROWS ? BRIGHT : r >= 2 ? NORMAL : DIM)
      }
    }
    // Knobs.
    term.text(Math.round(mid - 7), KNOB_Y, 'VOL ○   BASS ○', DIM)
  },
}
