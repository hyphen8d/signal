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
// 2026-10-16 (design pass). The viz-critic, judging the real tube, found
// everything at one DIM tier -- the brightest things on screen were the FM
// dial's digits and the EQ's LEDs, not the speakers the kick is about -- and
// the wall and sidewalk drawn at the same weight as the case outline, so at
// the top of the frame the brick joints read as part of the box. What
// changed:
//   - The cones' ridges sit at MUTED at rest, whatever the level (they
//     were FAINT on a quiet passage, DIM on most), and go NORMAL with a
//     BRIGHT dust cap on the kick. The surround still warms with loudness.
//   - The EQ's LEDs top out at MUTED, the peak LED no longer BRIGHT: the
//     dust cap is the one BRIGHT thing, so the beat is the brightest event
//     in the frame. The dial text drops to FAINT, its needle to MUTED.
//   - The wall's joints and the paving are FAINT DOTTED lines ('┈' / '┊',
//     the font's light quadruple-dash rules) and the curb a row of '.', so
//     the background reads as texture behind the case and never as a second
//     outline.
//
// 2026-10-20 (polish pass). The critic, on the 10-20 tube sheets: "the
// speakers are octagonal nuts with `••` eyes, so the boombox wears two
// faces", and on the kick the cap became "a `█` plus-sign slab, a cross".
// Both were the character renderer, not the design: concentric ellipses of
// `/ \ │ ─` step into octagons on a 2:1 cell; the '░' surround landed as
// blocks at the eight points where the curve crossed a cell (the "lugs");
// the cap's centre straddled two cells, so two '●' side by side -- eyes; and
// the '▒' dome round it lit as a cross on the kick. What changed:
//   - The two speakers are putGlyph() pixel bitmaps (FLAME's renderer, the
//     critic's first fix): a frame ring, a quarter-dithered rubber surround,
//     two thin ridges on a dark cone, and a filled dust cap. Round on the
//     FACE, not the grid -- the vertical radius is corrected for the 4:3
//     stretch, where the character cones were SPK_RY rows tall and showed
//     as upright eggs.
//   - The kick is the same event, held the same KICK_HOLD_S: the ridges and
//     the cap are thrown ~6px outward (SPK_PUSH 1.12, was 1.24 of a much
//     coarser ring), the ridges go MUTED -> NORMAL and the cap DIM -> BRIGHT,
//     its dither filling in. BRIGHT only on cells that are mostly cap.
//   - The bitmaps are a pure function of (width, pump, surround tier), so
//     they are built once per state and cached; the case clear skips the
//     speakers' cells, so an unchanged frame re-puts the same reference and
//     re-rasters nothing.
// Left alone: the case outline was already NORMAL and the wall FAINT
// (the critic's third point); the deck, dial and EQ are unchanged.
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

    // The handle's ends, which the wall keeps clear of.
    const hx0 = Math.round(L.mid - 15), hx1 = Math.round(L.mid + 15)

    // --- background: brick wall, sidewalk ------------------------------------
    // Every cell of the canvas is written here first, so nothing from the
    // previous frame (or the previous effect) survives under the box.
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        let ch = ' ', at = FAINT
        if (y >= BODY_TOP && y <= BODY_BOT && x >= L.x0 - 1 && x <= L.x1 + 1) {
          // A clear column round the case: a wall joint flush against its
          // edge read as a doubled border.
        } else if (y >= HANDLE_Y && y < BODY_TOP && x >= hx0 - 1 && x <= hx1 + 1) {
          // And clear under the handle's arch (2026-10-16 design pass): a
          // joint running through its posts read as part of the case.
        } else if (y >= VIZ_BOT - 2) {
          // Curb, then the paving: a dotted edge and a sparse flagstone seam.
          // Dotted since the 2026-10-16 design pass -- see the header.
          ch = y === VIZ_BOT - 2 ? (x % 2 === 0 ? '.' : ' ') : (x % 9 === 0 ? '┊' : ' ')
        } else if (y % 3 === 0) {
          ch = '┈'
        } else if ((x + (Math.floor(y / 3) % 2) * 5) % 10 === 0) {
          ch = '┊'
        }
        term.put(x, y, ch, at)
      }
    }

    // --- the case ---------------------------------------------------------------
    const { x0, x1, mid, deckHalf, rx } = L
    const spk = speakerMask(term, L)
    for (let y = BODY_TOP; y <= BODY_BOT; y++) {
      for (let x = x0; x <= x1; x++) if (!spk[y * cols + x]) term.put(x, y, ' ')
    }
    for (let x = x0 + 1; x < x1; x++) { term.put(x, BODY_TOP, '─', NORMAL); term.put(x, BODY_BOT, '─', NORMAL) }
    for (let y = BODY_TOP + 1; y < BODY_BOT; y++) { term.put(x0, y, '│', NORMAL); term.put(x1, y, '│', NORMAL) }
    term.put(x0, BODY_TOP, '╭', NORMAL); term.put(x1, BODY_TOP, '╮', NORMAL)
    term.put(x0, BODY_BOT, '╰', NORMAL); term.put(x1, BODY_BOT, '╯', NORMAL)
    // A seam under the dial band, the case's two halves.
    for (let x = x0 + 1; x < x1; x++) term.put(x, DIAL_Y + 1, '·', FAINT)

    // Handle: an arch over the middle third, on two posts.
    for (let x = hx0 + 1; x < hx1; x++) term.put(x, HANDLE_Y, '─', DIM)
    term.put(hx0, HANDLE_Y, '╭', DIM); term.put(hx1, HANDLE_Y, '╮', DIM)
    term.put(hx0, HANDLE_Y + 1, '│', DIM); term.put(hx1, HANDLE_Y + 1, '│', DIM)

    // Feet.
    // ('═', not '▀': a half block is a lit slab on the tube at any tier.)
    for (const fx of [x0 + 4, x1 - 7]) for (let x = fx; x < fx + 4; x++) term.put(x, FEET_Y, '═', DIM)

    // FM dial across the top band, with its needle parked on a station.
    const dialW = Math.min(DIAL.length, x1 - x0 - 4)
    const dialX = Math.round(mid - dialW / 2)
    term.text(dialX, DIAL_Y, DIAL.slice(0, dialW), FAINT)
    const needle = dialX + Math.round(dialW * 0.62)
    term.put(needle, DIAL_Y, '│', MUTED)
    term.put(x0 + 2, DIAL_Y, '●', kick > 0.35 ? NORMAL : DIM)       // power LED, beats with the kick
    term.text(x1 - 7, DIAL_Y, 'STEREO', FAINT)

    // --- the speakers -----------------------------------------------------------
    // Pixel cones (2026-10-20 polish -- see the header): the bitmaps are a
    // pure function of (width, pump, surround tier), built once each and
    // re-put every frame. The case clear above skips these cells, so an
    // unchanged frame's putGlyph() is the same reference and costs nothing.
    const pump = !muted && t - p._boomKickAt < KICK_HOLD_S ? 1 : 0
    const cells = speakerCells(term, L, pump, p._boomLoud > 0.5)
    for (const c of cells) {
      if (c.bits) term.putGlyph(c.x, c.y, c.bits, c.attr)
      else term.put(c.x, c.y, ' ')
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
    // bottom. (The peak cell of a hot bar was BRIGHT until the 2026-10-16
    // design pass; BRIGHT is the dust cap's alone now.)
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
        // Capped at MUTED (2026-10-16 design pass): the LEDs were BRIGHT and
        // NORMAL, out-shining the speakers between beats.
        term.put(eqX + i * 2, y, on ? '■' : '·', !on ? FAINT : top || r >= 2 ? MUTED : DIM)
      }
    }
    // Knobs.
    term.text(Math.round(mid - 7), KNOB_Y, 'VOL ○   BASS ○', DIM)
  },
}

// --- pixel speakers (2026-10-20) ----------------------------------------------
// Radii in units of the speaker's own radius, back to front. PUSH is how far
// the kick throws the ridges and the cap outward (~6px on the 80-column set).
const SPK_FRAME = 1.0, SPK_SURROUND = [0.85, 0.95], SPK_RIDGES = [0.66, 0.45], SPK_CAP = 0.17
const SPK_PUSH = 1.12
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Pixel geometry of both speakers for a term: centres and radii in beam
 *  pixels. The vertical radius is corrected for the face's aspect (the grid
 *  is stretched onto a 4:3 face, so a beam pixel shows taller than wide) --
 *  the character cones were ellipses SPK_RY rows tall and read as eggs. */
function speakerGeom(term, L) {
  const { cellW, cellH } = term.font
  const k = (term.cols * cellW * 0.75) / (term.rows * cellH) // displayed px per beam px, vertically
  const Rx = L.rx * cellW
  const Ry = Math.min(Rx / k, (SPK_RY + 0.45) * cellH)
  const cy = (SPK_CY + 0.5) * cellH
  return { cellW, cellH, Rx, Ry, cy, cxs: [L.lcx, L.rcx].map((c) => (c + 0.5) * cellW) }
}

const MASKS = new Map()
/** Which cells the speakers own (1) on this grid, cached per width. */
function speakerMask(term, L) {
  let m = MASKS.get(term.cols)
  if (m) return m
  m = new Uint8Array(term.cols * term.rows)
  const G = speakerGeom(term, L)
  for (const cxp of G.cxs) {
    const xa = Math.floor((cxp - G.Rx - 2) / G.cellW), xb = Math.floor((cxp + G.Rx + 2) / G.cellW)
    const ya = Math.floor((G.cy - G.Ry - 2) / G.cellH), yb = Math.floor((G.cy + G.Ry + 2) / G.cellH)
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) m[y * term.cols + x] = 1
  }
  MASKS.set(term.cols, m)
  return m
}

const SPEAKERS = new Map()
/** The speakers' cells for one state: [{x, y, bits, attr}], bits null for a
 *  cell with nothing lit. Built once per (width, pump, surround tier). */
function speakerCells(term, L, pump, warm) {
  const key = `${term.cols}|${pump}|${warm ? 1 : 0}`
  let out = SPEAKERS.get(key)
  if (out) return out
  out = []
  const G = speakerGeom(term, L)
  const mask = speakerMask(term, L)
  const push = pump ? SPK_PUSH : 1
  const ridges = SPK_RIDGES.map((r) => r * push)
  const cap = SPK_CAP * push
  for (let y = 0; y < term.rows; y++) {
    for (let x = 0; x < term.cols; x++) {
      if (!mask[y * term.cols + x]) continue
      const bits = new Uint16Array(G.cellH)
      let any = 0, capPx = 0, framePx = 0, ridgePx = 0
      for (let py = 0; py < G.cellH; py++) {
        let row = 0
        for (let px = 0; px < G.cellW; px++) {
          const sx = x * G.cellW + px + 0.5, sy = y * G.cellH + py + 0.5
          // The nearer speaker; they never overlap.
          const cxp = Math.abs(sx - G.cxs[0]) < Math.abs(sx - G.cxs[1]) ? G.cxs[0] : G.cxs[1]
          const nx = (sx - cxp) / G.Rx, ny = (sy - G.cy) / G.Ry
          const d = Math.hypot(nx, ny)
          // Distance to a ring in screen px along the gradient, so a line is
          // the same thickness all the way round.
          const g = Math.hypot(nx / G.Rx, ny / G.Ry) / Math.max(d, 1e-6)
          const off = (r) => Math.abs(d - r) / Math.max(g, 1e-6)
          const th = BAYER[(py & 3) * 4 + (px & 3)]
          let on = false
          if (d < cap) {
            // The dust cap: a filled dome, its rim solid, the face dithered
            // (half at rest, nearly full on the kick).
            on = off(cap) < 1.2 || th < (pump ? 13 : 8)
            if (on) capPx++
          } else if (off(SPK_FRAME) < 1.4 || off(SPK_FRAME - 0.035) < 0.6) {
            on = true; framePx++
          } else if (ridges.some((r) => off(r) < 0.75)) {
            on = true; ridgePx++
          } else if (d > SPK_SURROUND[0] && d < SPK_SURROUND[1]) {
            on = th < 4 // the rubber surround: a quarter-lit band
          }
          if (on) row |= 1 << (G.cellW - 1 - px)
        }
        bits[py] = row
        any |= row
      }
      // One attribute per cell, by what the cell holds: the cap sits DIM and
      // lights on the kick (BRIGHT only where the cell is mostly cap, so the
      // rim's edge cells do not bloom into a ring), the frame is NORMAL, the ridges MUTED
      // at rest and NORMAL on the kick, a cell of surround alone DIM or FAINT
      // by the passage's loudness.
      const attr = capPx > G.cellW * G.cellH * 0.3 ? (pump ? BRIGHT : DIM)
        : capPx ? (pump ? NORMAL : DIM)
          : framePx ? NORMAL
            : ridgePx ? (pump ? NORMAL : MUTED)
              : warm ? DIM : FAINT
      out.push({ x, y, bits: any ? bits : null, attr })
    }
  }
  SPEAKERS.set(key, out)
  return out
}
