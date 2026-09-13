// SIGNAL -- visualizer effect "AURORA" (DRIFT MODE, 2026-09-13).
//
// Northern lights over a still, frozen landscape. Four curtains of light
// hang in the upper two-thirds of the canvas: each one a ribbon whose top
// edge undulates slowly across the screen, with vertical rays falling from
// that edge and fading toward their lower ends. Behind them a dark sky with
// sparse stars; in front, a range of snowy peaks with pines at their feet
// and a still lake that holds a dimmer mirror of both.
//
// Why this station. DRIFT MODE is named after the DRIFT effect, which it
// lost to NEON STASIS when it was retired, and came back borrowing COLD
// WAVE's FROST (see the long comment above its entry in stations.js). Both
// are wrong in their own way. FROST is a neon wireframe losing power, and
// a grid of nodes lighting up is a machine. DRIFT is a sine-density wash,
// a TEXTURE with no subject in it. AURORA is meant to be neither: a scene
// with a subject you can name at a glance, whose motion is the motion of
// the music this station plays -- long, beatless, slow enough that you
// notice it has changed rather than watch it change.
//
// The rules it keeps, and why each one is a rule rather than a taste:
//
// - NOTHING THUMPS. Only A.level and A.bands9 are read, and both only as
//   a slow AMPLITUDE. A.onset and A.pulse are never read at all -- not
//   read-and-scaled-small, not read. syntheticAudio() fabricates a pulse
//   every 0.9s, and an effect that took even a sliver of it would breathe
//   in 0.9s steps on every visit without a tap. visualizer.js already
//   excludes 'aurora' from the downbeat bloom for the same reason;
//   tests/visual-aurora.test.mjs draws one frame with onset/pulse maxed and
//   one with them zeroed and asserts the grids are identical.
// - SLOWER THAN A BREATH. Every speed below is quoted in cells per second
//   next to its constant. The fastest thing on screen is a curtain's fold
//   travelling along it at under a column a second; the ribbon edge rises
//   and falls a fraction of a row a second. The test holds this as a
//   number: consecutive frames differ in well under 1% of cells.
// - THE AUDIO IS EASED, NOT READ. The tap's own smoothing attacks at 0.5
//   per frame (audio/tap.js), which is right for a VU needle and wrong
//   here: a loud entrance would lift every curtain a brightness tier in two
//   frames, which is a flare however small the gain. So the gains ease
//   toward their target with a two-second time constant, and the effect
//   carries the only state it has -- those gains and the clock they were
//   last eased at.
// - MUTED IS FAINT, NOT DARK. SILENT_AUDIO settles the gains at their lo
//   bound, which is still enough light for the curtains to read; the frame
//   is never blank.
//
// 2026-09-13 -- the first cut summed four smooth curtains through smooth
// striation and rendered as exactly what this effect exists not to be: a
// dotted wash, DRIFT with vertical characters. Two changes made it read as
// curtains. Rays are now a per-column HASH with a threshold, so there are
// dark columns between them (a ray is only a ray if something beside it is
// not lit); and the ribbon's top edge is drawn as its own faint cap line
// in the gap columns, so the undulating fold reads as one continuous thing
// the rays hang from rather than as the tops of unrelated streaks.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// Canvas geometry, in rows. The shore sits on HORIZON; the lake is every
// row below it to VIZ_BOT-1, four rows. RIDGE_MAX is 4 so the tallest
// peak's reflection still fits in the lake, and so no peak reaches past
// row 13 -- tall enough to occlude the lower ends of the rays (the depth
// cue that puts the lights BEHIND the mountains), never the folds.
export const AURORA_HORIZON = VIZ_BOT - 5
export const AURORA_RIDGE_MAX = 4
// The ridge: slope-1 triangular peaks, as [centre as a fraction of the
// width, height in rows]. Rounded sines were tried first and gave long
// `___` plateaus with a stray `\` on the end, which reads as a broken
// fence. Slope 1 is what `/` and `\` actually draw, so a triangle is the
// one shape a text grid renders as a mountain. Gaps between peaks are
// deliberate: they are the shore, where the pines stand.
const PEAKS = [
  [0.035, 2], [0.12, 4], [0.2, 3], [0.29, 2], [0.45, 3], [0.53, 4],
  [0.6, 2], [0.76, 3], [0.85, 4], [0.94, 2],
]
// The lake mirrors the ridge 1:1 but the SKY squashed 3:1. A true mirror
// of four rows would reflect rows 13-16, which is the faint tail of every
// ray and mostly mountain; three sky rows per lake row reaches the folds by
// the bottom row, which is where a real reflection of a high aurora sits.
const LAKE_SQUASH = 3
const LAKE_GAIN = 0.45

// The curtains. `base` is the ribbon's resting top row; `amp`/`k`/`w` are
// its two undulation terms (amp in rows, k in radians per column, w in
// radians per second -- the edge's vertical speed tops out at
// amp1*|w1| + amp2*|w2|, 0.11 rows/s for the liveliest one). `len` is the
// longest ray in rows. `cx`/`sway`/`sw` place the curtain's brightness
// envelope and drift it sideways (sway*sw: 0.10-0.15 cols/s); `wid` is the
// envelope's width. `kf`/`wf` are the fold travelling along the curtain
// (|wf/kf|: 0.44-0.55 cols/s). `band` is the bands9 index that shapes this
// curtain, spread across the spectrum so the four do not swell together.
// `I` is its base intensity; `rays` the fraction of its columns that carry
// a ray at all. The first is the high back sheet: wide, faint, sparse.
//
// Every sway and fold speed is incommensurate with every other on purpose:
// curtains with rational speed ratios re-align on a period you can sit
// through, and this station's tracks run twenty minutes.
const CURTAINS = [
  { base: 1.6, amp1: 0.9, k1: 0.061, w1: 0.041, amp2: 0.4, k2: 0.17, w2: -0.057, ph: 0.0,
    len: 8, cx: 44, sway: 14, sw: 0.0071, wid: 38, kf: 0.13, wf: 0.071, I: 0.9, band: 1, rays: 0.45 },
  { base: 3.0, amp1: 1.6, k1: 0.083, w1: 0.053, amp2: 0.6, k2: 0.21, w2: -0.037, ph: 1.9,
    len: 11, cx: 19, sway: 13, sw: 0.0113, wid: 21, kf: 0.19, wf: 0.097, I: 1.7, band: 3, rays: 0.7 },
  { base: 4.8, amp1: 1.3, k1: 0.071, w1: -0.047, amp2: 0.5, k2: 0.23, w2: 0.061, ph: 4.1,
    len: 10, cx: 59, sway: 12, sw: 0.0089, wid: 20, kf: 0.17, wf: -0.083, I: 1.6, band: 5, rays: 0.7 },
  { base: 6.6, amp1: 1.0, k1: 0.097, w1: 0.033, amp2: 0.4, k2: 0.27, w2: -0.049, ph: 2.7,
    len: 7, cx: 40, sway: 22, sw: 0.0053, wid: 16, kf: 0.23, wf: 0.101, I: 1.4, band: 7, rays: 0.65 },
]
const NC = CURTAINS.length
// A column's ray pattern is re-dealt every RAY_EPOCH seconds, crossfaded
// with a smoothstep over the whole epoch, and each column starts its epoch
// at its own offset -- so rays are always growing and fading somewhere, and
// never all at once. 40s: a ray takes a slow minute to come and go.
const RAY_EPOCH = 40

// Audio mapping, eased. Overall level lifts every curtain between LVL_LO
// and LVL_HI; each curtain's own band scales it between BAND_LO and
// BAND_HI. Muted (all zeros) lands on LVL_LO*BAND_LO = 0.35 -- enough for
// the folds to hold DIM/MUTED light and nothing brighter. Synthetic audio
// sits around 0.6-0.75, where NORMAL rays start to appear at the folds; a
// loud live track reaches ~1.1 and the brightest folds go BRIGHT.
const LVL_LO = 0.44, LVL_HI = 1.0
const BAND_LO = 0.8, BAND_HI = 1.12
const GAIN_TAU = 2.0 // seconds; a two-second swell is a breath, not a flare

// Below this a cell is sky. High on purpose: the first cut drew everything
// down to 0.1 and the faint periphery of four overlapping envelopes filled
// the sky with `.` and `'` -- no darkness left for the bright parts to read
// against.
const LIT = 0.14

const smooth = (u) => u * u * (3 - 2 * u)

export default {
  key: 'aurora',
  label: 'AURORA',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    const cols = term.cols
    // The ridge is a pure function of the column and never moves -- the
    // landscape is still, only the sky lives -- so it is computed once
    // here, and needs nothing in reset(). `_auroraEdge[x]` is the crest's
    // height in rows above the shore (0 = bare shore), `_auroraSlope[x]`
    // which way it faces: 1 `/`, 2 `\`.
    const edge = new Int8Array(cols)
    const slope = new Uint8Array(cols)
    for (const [f, P] of PEAKS) {
      const px = Math.round(f * cols) - 1 // the `/` of the peak's `/\` pair
      for (let x = 0; x < cols; x++) {
        const e = x <= px ? P - (px - x) : P - (x - px - 1)
        if (e > edge[x]) { edge[x] = e; slope[x] = x <= px ? 1 : 2 }
      }
    }
    p._auroraEdge = edge
    p._auroraSlope = slope
    // Per-frame scratch, one row of floats per curtain: the ribbon's top
    // row, its ray length, its body light and its ray strength at each
    // column. Plus the light field itself and a cap marker. Preallocated,
    // so the draw allocates nothing.
    p._auroraTop = new Float32Array(NC * cols)
    p._auroraLen = new Float32Array(NC * cols)
    p._auroraBody = new Float32Array(NC * cols)
    p._auroraRay = new Float32Array(NC * cols)
    p._auroraField = new Float32Array(cols * VIZ_BOT)
    p._auroraCap = new Uint8Array(cols * VIZ_BOT)
    p._auroraGain = new Float32Array(NC)
    p._auroraLastT = null
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // 2026-09-13 -- `_auroraLastT` is on the effect clock, which restarts at
    // 0 on entry. Clearing it makes the first frame of a visit SNAP the
    // gains to the audio actually playing, instead of easing for seconds
    // from wherever the previous visit left them (a loud visit, then mute,
    // then re-entry, would otherwise open on bright curtains fading down to
    // the muted level). The draw clamps a negative dt to 0, so a missing
    // reset would not blow the gains up -- it would quietly carry the last
    // visit's brightness in. Tested by exactly that sequence.
    p._auroraLastT = null
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    const H = AURORA_HORIZON
    const edge = p._auroraEdge, slope = p._auroraSlope
    const TOP = p._auroraTop, LEN = p._auroraLen, BODY = p._auroraBody, RAY = p._auroraRay
    const F = p._auroraField, CAP = p._auroraCap
    const gain = p._auroraGain

    // --- audio: level and bands9 only, eased toward the target ----------
    const level = Math.min(1, Math.max(0, A.level || 0))
    let ease = 1
    if (p._auroraLastT !== null) {
      const dt = Math.min(0.1, Math.max(0, t - p._auroraLastT))
      ease = 1 - Math.exp(-dt / GAIN_TAU)
    }
    p._auroraLastT = t
    for (let c = 0; c < NC; c++) {
      const b = Math.min(1, Math.max(0, (A.bands9 && A.bands9[CURTAINS[c].band]) || 0))
      const target = (LVL_LO + (LVL_HI - LVL_LO) * level) * (BAND_LO + (BAND_HI - BAND_LO) * b)
      gain[c] += (target - gain[c]) * ease
    }

    // --- per-curtain, per-column shape -----------------------------------
    for (let c = 0; c < NC; c++) {
      const C = CURTAINS[c]
      const o = c * cols
      const cx = C.cx + C.sway * Math.sin(t * C.sw + C.ph)
      const g = gain[c] * C.I
      for (let x = 0; x < cols; x++) {
        TOP[o + x] = C.base + C.amp1 * Math.sin(x * C.k1 + t * C.w1 + C.ph) +
          C.amp2 * Math.sin(x * C.k2 + t * C.w2 + C.ph * 1.7)
        const dx = (x - cx) / C.wid
        const env = Math.exp(-dx * dx * 1.6)
        // The fold: brightness travelling along the curtain, two terms in
        // opposite directions so a bright knot swells and splits rather
        // than scrolling past like a marquee.
        const fold = 0.6 + 0.28 * Math.sin(x * C.kf - t * C.wf + C.ph) +
          0.12 * Math.sin(x * C.kf * 2.3 + t * C.wf * 0.61 + C.ph * 2.9)
        BODY[o + x] = g * env * fold
        // The ray deal for this column: a hash per epoch, crossfaded into
        // the next epoch's, each column on its own offset.
        const off = hash2(x, c * 17 + 3) * RAY_EPOCH
        const e = (t + off) / RAY_EPOCH
        const n = Math.floor(e)
        const u = smooth(e - n)
        const h0 = hash2(x + c * 101, n), h1 = hash2(x + c * 101, n + 1)
        const hv = h0 + (h1 - h0) * u
        // `rays` of the columns clear the threshold; the smoothstep above
        // it is what gives a ray a brightness rather than an on/off.
        const r = (hv - (1 - C.rays)) / C.rays
        RAY[o + x] = r <= 0 ? 0 : Math.min(1, r * 1.6)
        const l0 = hash2(x + c * 57, n + 500), l1 = hash2(x + c * 57, n + 501)
        LEN[o + x] = C.len * (0.4 + 0.6 * (l0 + (l1 - l0) * u))
      }
    }

    // --- the light field, rows 1..H-1 -------------------------------------
    F.fill(0)
    CAP.fill(0)
    for (let c = 0; c < NC; c++) {
      const o = c * cols
      for (let x = 0; x < cols; x++) {
        const B = BODY[o + x]
        if (B < 0.05) continue
        const top = TOP[o + x]
        const capY = Math.round(top)
        const r = RAY[o + x]
        // The cap: the ribbon's own edge, lit even over a gap column, which
        // is what draws the fold as one continuous line.
        if (capY >= 1 && capY < H) {
          const cv = B * (0.42 + 0.58 * r)
          const i = capY * cols + x
          if (r < 0.25) CAP[i] = 1
          F[i] += cv
        }
        if (r <= 0) continue
        const len = LEN[o + x]
        const y1 = Math.min(H - 1, Math.floor(top + len))
        for (let y = Math.max(1, capY + 1); y <= y1; y++) {
          // Brightest just under the fold, falling off along the ray with a
          // power > 1 so the lower third is a thin dotted tail.
          const u = 1 - (y - top) / len
          if (u <= 0) continue
          F[y * cols + x] += B * r * u * Math.sqrt(u)
        }
      }
    }

    // --- sky ---------------------------------------------------------------
    for (let y = 1; y < H; y++) {
      for (let x = 0; x < cols; x++) {
        if (y >= H - edge[x]) continue // behind the ridge; drawn below
        const i = y * cols + x
        const v = F[i]
        if (v >= LIT) {
          let ch, a
          if (CAP[i] && v < 0.44) {
            // A cap over a gap column: the ribbon's fringe. `'` hangs from
            // the top of the cell, so the edge reads as an edge.
            ch = v >= 0.26 ? '~' : '\''
            a = v >= 0.26 ? DIM : FAINT
          } else if (v >= 0.86) { ch = '|'; a = BRIGHT }
          else if (v >= 0.62) { ch = '|'; a = NORMAL }
          else if (v >= 0.44) { ch = '|'; a = MUTED }
          else if (v >= 0.3) { ch = '¦'; a = MUTED }
          else if (v >= 0.2) { ch = ':'; a = DIM }
          else { ch = '.'; a = FAINT }
          term.put(x, y, ch, a)
          continue
        }
        // Stars: ~2.5% of the sky, fixed in place and hidden wherever any
        // light is. A few twinkle between FAINT and DIM on 10-30s periods --
        // the only change a star ever makes, too slow to read as a blink.
        const hs = hash2(x, y)
        if (hs > 0.975 && v < 0.05) {
          const tw = Math.sin(t * (0.2 + (hs - 0.975) * 16) + hs * 97) > 0.6
          term.put(x, y, hs > 0.994 ? '+' : '.', hs > 0.994 || tw ? DIM : FAINT)
        } else {
          term.put(x, y, ' ')
        }
      }
    }

    // --- ridge, pines, shore ----------------------------------------------
    for (let x = 0; x < cols; x++) {
      const e = edge[x]
      // Pines stand in clusters on the shore row, in front of everything:
      // a slow sine of the column decides the stands (a hash alone gave a
      // uniform fringe), a hash thins them.
      const stand = Math.sin(x * 0.29 + 1.2) + 0.6 * Math.sin(x * 0.83)
      const pine = stand > 0.5 && hash2(x, 91) > 0.3
      for (let y = H - e; y <= H; y++) {
        let ch = ' ', a = FAINT
        if (y === H) {
          if (pine) { ch = hash2(x, 57) > 0.45 ? 'Λ' : '^'; a = DIM }
          else if (e === 0) ch = '_'
        } else if (y === H - e) {
          // The crest catches the aurora's light: MUTED, the one lit edge in
          // the landscape; everything under it is silhouette.
          ch = slope[x] === 1 ? '/' : '\\'
          a = MUTED
        } else if (y === H - e + 1 && e >= 3 && hash2(x, 13) > 0.35) {
          // Snow on the upper slopes of the taller peaks, just under the crest.
          ch = '.'
        }
        term.put(x, y, ch, a)
      }
    }

    // --- lake --------------------------------------------------------------
    for (let y = H + 1; y < VIZ_BOT; y++) {
      const k = y - H - 1
      for (let x = 0; x < cols; x++) {
        const e = edge[x]
        if (k < e) {
          // The ridge's mirror: dark water with the crest flipped, once,
          // faintly. Lake row H+1+k reflects row H-1-k.
          term.put(x, y, k === e - 1 ? (slope[x] === 1 ? '\\' : '/') : ' ', FAINT)
          continue
        }
        const ys = Math.max(1, H - 1 - (k + 1) * LAKE_SQUASH)
        // A still lake, not a mirror: a near-stationary shimmer (0.13 cols/s)
        // breaks the reflection into streaks so it reads as water.
        const sh = 0.7 + 0.3 * Math.sin(x * 0.67 + k * 1.9 + t * 0.09)
        const v = F[ys * cols + x] * LAKE_GAIN * sh
        let ch = ' ', a = FAINT
        if (v >= 0.26) { ch = '¦'; a = DIM }
        else if (v >= 0.15) { ch = ':'; a = DIM }
        else if (v >= 0.08) ch = '.'
        term.put(x, y, ch, a)
      }
    }
  },
}
