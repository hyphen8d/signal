// SIGNAL -- visualizer effect "AURORA" (DRIFT MODE, 2026-09-13).
//
// Northern lights over a still, frozen landscape. Four curtains of light
// hang in the upper two-thirds of the canvas: each one a ribbon of light
// with a bright lower hem and rays climbing from it. Behind them a dark sky
// with sparse stars; in front, a range of snowy peaks with pines at their
// feet and a still lake that holds a dimmer mirror of both.
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
// - NOTHING THUMPS. A.pulse is never read: syntheticAudio() fabricates
//   one every 0.9s, and an effect that took even a sliver of it would
//   breathe in 0.9s steps on every visit without a tap. visualizer.js
//   excludes 'aurora' from the downbeat bloom for the same reason. (Until
//   2026-10-16 A.onset was not read either; it now starts a slow wave --
//   see the note at the end of this header for why that is not a thump.)
// - SLOWER THAN A BREATH. Every speed below is quoted in cells per second
//   next to its constant. The idle picture -- quiet audio, no wave in
//   flight -- changes well under 1% of its cells from one frame to the
//   next, and the test holds that as a number.
// - THE AUDIO IS EASED, NOT READ. The tap's own smoothing attacks at 0.5
//   per frame (audio/tap.js), which is right for a VU needle and wrong
//   here. The gains ease toward their target -- since 2026-10-16 on a
//   short attack and a long release (see GAIN_ATTACK), where they had a
//   flat two-second constant that also swallowed every swell the music
//   actually made.
// - MUTED IS FAINT, NOT DARK. SILENT_AUDIO settles the gains at their lo
//   bound, which is still enough light for the curtains to read; the frame
//   is never blank.
//
// 2026-09-13 -- the first cut summed four smooth curtains through smooth
// striation and rendered as exactly what this effect exists not to be: a
// dotted wash, DRIFT with vertical characters. Two changes made it read as
// curtains. Rays are now a per-column HASH with a threshold, so there are
// dark columns between them (a ray is only a ray if something beside it is
// not lit); and the ribbon's edge is drawn continuously across the gap
// columns, so the undulating fold reads as one thing the rays hang from
// rather than as unrelated streaks.
//
// 2026-10-16 -- REBUILT TO READ. Measured that day against the rest of the
// roster (a two-run seeded probe, quiet vs loud audio at the same instant,
// plus a headless Chrome capture of every effect): the picture changed by
// the music was 16% of the canvas and a kick showed at 2.9x the motion
// between kicks, and in the capture the scene was dim scribbles -- thin
// `|` rays and `:`/`'` dots at DIM and FAINT, the ridge a one-cell `/\`
// outline you could not see against the black, most of the frame at a
// brightness that does not read on a green phosphor at all. The subject
// was right; the drawing was too timid to show it. What changed:
//
// - CURTAINS ARE BANDS OF LIGHT, NOT LINES. Each curtain is a ribbon with
//   a bright lower HEM (the edge of a real aurora is its bottom, where the
//   light is strongest) and rays climbing from it, drawn through the
//   shaded blocks -- `█` BRIGHT at the strongest hems, `▓` `▒` `░` fading
//   up, and the last of each ray a thin `¦`. Per-column ray strength still
//   comes from a hash so there are dark gaps between rays; the blocks are
//   what give the light mass.
// - THE RIDGE IS A SOLID MASS. One flat `▓` slab at FAINT with half-block
//   slopes and a thin `▀` cap of snow on the tallest summits, so it reads
//   as mountains in front of the sky rather than as a fence line, with
//   pines (`▲`/`Λ`) on the shore -- and never brighter than the curtains'
//   hems, because the aurora is the subject.
//   The lake is taller (six rows) and mirrors the curtains through `░`/`▒`
//   with a slow shimmer, the ridge flipped dark above them.
// - THE MUSIC IS VISIBLE, STILL WITHOUT A THUMP. Level lifts the curtains
//   on a short attack (GAIN_ATTACK) and lets them down slowly, and it also
//   speeds the folds -- through an accumulated phase, never by scaling a
//   `t *` term, so a swell quickens the ripple rather than jumping it. And
//   an onset now starts a WAVE: a knot of light that blooms on one curtain
//   and travels out along it in both directions over a few seconds. That is
//   the one discrete event, and it is deliberately not a thump -- at most
//   one every WAVE_GAP seconds, rolling along the sky rather than flashing
//   it, so a kick at 120 BPM and syntheticAudio()'s random onsets both read
//   as light moving through the curtains, never as a pulse.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// Canvas geometry, in rows. The shore sits on HORIZON; the lake is every
// row below it to VIZ_BOT-1 -- six rows since 2026-10-16 (it was four, too
// shallow to hold a reflection that reads). RIDGE_MAX is the tallest peak.
export const AURORA_HORIZON = VIZ_BOT - 7
export const AURORA_RIDGE_MAX = 6
// The ridge: peaks as [centre as a fraction of the width, height in rows,
// columns per row of height on each flank]. Under 2.5 cols/row a peak is
// steeper than the cell aspect, which is what reads as alpine; the gaps
// between are the shore, where the pines stand.
const PEAKS = [
  [0.04, 3, 2.2], [0.14, 6, 1.8], [0.25, 4, 2.0], [0.36, 2, 2.6], [0.5, 5, 2.0],
  [0.6, 3, 2.4], [0.73, 6, 1.7], [0.84, 4, 2.1], [0.95, 3, 2.3],
]
// The lake mirrors the ridge 1:1 but the SKY squashed: six lake rows reach
// up into the hems, which is where a real reflection of a high aurora sits.
const LAKE_SQUASH = 1.7
const LAKE_GAIN = 0.55

// The curtains. `hem` is the resting row of the bright lower edge;
// `amp*`/`k*`/`w*` its two undulation terms (rows, radians per column,
// radians per second -- the hem's vertical speed tops out near 0.1 rows/s).
// `len` is the longest ray in rows above the hem. `cx`/`sway`/`sw` place
// the curtain's brightness envelope and drift it sideways (0.08-0.15
// cols/s); `wid` its width. `kf`/`wf` are the fold travelling along the
// curtain (|wf/kf| ~0.5 cols/s at rest, scaled FOLD_LO..FOLD_HI by level).
// `band` is the bands9 index that shapes this curtain, spread across the
// spectrum so the four do not swell together. `I` is base intensity;
// `rays` the fraction of columns that carry a full ray. The first is the
// high back sheet: wide, faint, sparse.
//
// Every speed is incommensurate with every other on purpose: curtains with
// rational speed ratios re-align on a period you can sit through, and this
// station's tracks run twenty minutes.
const CURTAINS = [
  { hem: 5.0, amp1: 1.0, k1: 0.061, w1: 0.041, amp2: 0.45, k2: 0.17, w2: -0.057, ph: 0.0,
    len: 4, cx: 46, sway: 14, sw: 0.0071, wid: 36, kf: 0.13, wf: 0.071, I: 0.8, band: 1, rays: 0.5 },
  { hem: 8.2, amp1: 1.7, k1: 0.083, w1: 0.053, amp2: 0.6, k2: 0.21, w2: -0.037, ph: 1.9,
    len: 7, cx: 20, sway: 13, sw: 0.0113, wid: 20, kf: 0.19, wf: 0.097, I: 1.3, band: 3, rays: 0.72 },
  { hem: 9.6, amp1: 1.4, k1: 0.071, w1: -0.047, amp2: 0.5, k2: 0.23, w2: 0.061, ph: 4.1,
    len: 7, cx: 60, sway: 12, sw: 0.0089, wid: 19, kf: 0.17, wf: -0.083, I: 1.25, band: 5, rays: 0.72 },
  { hem: 11.4, amp1: 0.9, k1: 0.097, w1: 0.033, amp2: 0.4, k2: 0.27, w2: -0.049, ph: 2.7,
    len: 5, cx: 40, sway: 22, sw: 0.0053, wid: 15, kf: 0.23, wf: 0.101, I: 1.05, band: 7, rays: 0.65 },
]
const NC = CURTAINS.length
// A column's ray pattern is re-dealt every RAY_EPOCH seconds, crossfaded
// with a smoothstep, each column on its own offset -- rays always growing
// and fading somewhere, never all at once.
const RAY_EPOCH = 40

// Audio mapping. Overall level lifts every curtain between LVL_LO and
// LVL_HI; each curtain's band scales it between BAND_LO and BAND_HI. Muted
// (all zeros) lands on LVL_LO*BAND_LO -- the hems still glow, nothing is
// BRIGHT. A loud live track takes the strongest hems to `█` BRIGHT.
const LVL_LO = 0.5, LVL_HI = 1.15
const BAND_LO = 0.82, BAND_HI = 1.12
// Eased: a swell lifts the curtains within a fraction of a second (an
// attack you can see), and they come down over a couple of seconds, so a
// gap between notes never reads as the sky switching off.
const GAIN_ATTACK = 0.12 // seconds
const GAIN_RELEASE = 1.2 // seconds
// Fold speed: the ripple runs at FOLD_LO of its rest speed in silence and
// FOLD_HI at full level, through an accumulated phase.
const FOLD_LO = 0.7, FOLD_HI = 1.6

// The onset wave. At most one every WAVE_GAP seconds; it blooms over
// WAVE_RISE, its two fronts travel out at WAVE_SPEED cols/s, and it fades
// with a WAVE_LIFE time constant. WAVE_AMP is how much brighter the knot
// makes the curtain it rides.
const WAVE_GAP = 1.0
const WAVE_RISE = 0.12
const WAVE_SPEED = 9
const WAVE_SIGMA = 4.5
const WAVE_LIFE = 1.2
const WAVE_AMP = 1.1
const WAVE_MAX = 4

// Below this a sky cell is dark. High on purpose, twice over: the first
// cut drew everything down to 0.1 and filled the sky with `.` and `'`, and
// the 2026-10-16 rebuild's first pass drew ray tails down to 0.12 as a
// faint `╷` that scattered dashes over the whole sky -- in both cases no
// darkness left for the bright parts to read against.
const LIT = 0.2

const smooth = (u) => u * u * (3 - 2 * u)

/** Sizes every per-column table for a grid `cols` wide. Called from init,
 *  and from draw whenever the term's width is not the one the tables were
 *  built for (2026-09-13 audit L5 -- the grid is fixed for a page's life,
 *  so in practice this runs once; KEEP's buildScene is the same shape). */
function shapeFor(p, cols) {
  // The ridge: `_auroraEdge[x]` is the crest's height in rows above the
  // shore (0 = bare shore). Still -- only the sky lives -- so it is built
  // once here and needs nothing in reset().
  // `_auroraHalf[x]` marks a column whose true crest sits at least half a
  // cell above `edge`: it gets a `▄` on top, which is what turns a staircase
  // of whole blocks into a slope.
  const edge = new Int8Array(cols)
  const crest = new Float32Array(cols)
  for (const [f, P, half] of PEAKS) {
    const px = f * cols
    for (let x = 0; x < cols; x++) {
      const hf = P - Math.abs(x + 0.5 - px) / half
      if (hf > crest[x]) crest[x] = hf
    }
  }
  const halfTop = new Uint8Array(cols)
  for (let x = 0; x < cols; x++) {
    edge[x] = Math.max(0, Math.floor(crest[x]))
    halfTop[x] = crest[x] - edge[x] >= 0.5 && edge[x] < AURORA_RIDGE_MAX ? 1 : 0
  }
  p._auroraEdge = edge
  p._auroraHalf = halfTop
  // Per-frame scratch, one row of floats per curtain: hem row, ray length,
  // body light, ray strength. Plus the light field. Preallocated, so the
  // draw allocates nothing.
  p._auroraHem = new Float32Array(NC * cols)
  p._auroraLen = new Float32Array(NC * cols)
  p._auroraBody = new Float32Array(NC * cols)
  p._auroraRay = new Float32Array(NC * cols)
  p._auroraField = new Float32Array(cols * VIZ_BOT)
  p._auroraGain = new Float32Array(NC)
  p._auroraFold = new Float64Array(NC)
  p._auroraWaves = []
  p._auroraLastT = null
  p._auroraWaveAt = -Infinity
  p._auroraWaveN = 0
}

export default {
  key: 'aurora',
  label: 'AURORA',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p, term) {
    shapeFor(p, term.cols)
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // `_auroraLastT` is on the effect clock, which restarts at 0 on entry.
    // Clearing it makes the first frame of a visit SNAP the gains to the
    // audio actually playing, instead of easing from wherever the previous
    // visit left them. The waves carry absolute effect-clock times too, so
    // a wave in flight at exit would otherwise sit in the future after
    // re-entry (the M5 class); they and the fold phases go with it.
    p._auroraLastT = null
    p._auroraWaves = []
    p._auroraWaveAt = -Infinity
    p._auroraWaveN = 0
    if (p._auroraFold) p._auroraFold.fill(0)
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    if (!p._auroraEdge || p._auroraEdge.length !== cols) shapeFor(p, cols)
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    const H = AURORA_HORIZON
    const edge = p._auroraEdge
    const HEM = p._auroraHem, LEN = p._auroraLen, BODY = p._auroraBody, RAY = p._auroraRay
    const F = p._auroraField
    const gain = p._auroraGain, fold = p._auroraFold

    // --- audio: level and bands9, eased; onset starts a wave --------------
    const level = Math.min(1, Math.max(0, A.level || 0))
    const first = p._auroraLastT === null
    const dt = first ? 0 : Math.min(0.1, Math.max(0, t - p._auroraLastT))
    p._auroraLastT = t
    for (let c = 0; c < NC; c++) {
      const b = Math.min(1, Math.max(0, (A.bands9 && A.bands9[CURTAINS[c].band]) || 0))
      const target = (LVL_LO + (LVL_HI - LVL_LO) * level) * (BAND_LO + (BAND_HI - BAND_LO) * b)
      if (first) gain[c] = target
      else {
        const tau = target > gain[c] ? GAIN_ATTACK : GAIN_RELEASE
        gain[c] += (target - gain[c]) * (1 - Math.exp(-dt / tau))
      }
      fold[c] += dt * CURTAINS[c].wf * (FOLD_LO + (FOLD_HI - FOLD_LO) * level)
    }
    const waves = p._auroraWaves
    if (A.onset && !p.muted && t - p._auroraWaveAt >= WAVE_GAP) {
      // Origin and curtain dealt by hash of the wave count, not Math.random:
      // the draw stays a pure function of its inputs and its own state.
      const n = p._auroraWaveN++
      const c = 1 + (n % 3) // the three front curtains; the back sheet is too faint to carry one
      const C = CURTAINS[c]
      const cx = C.cx + C.sway * Math.sin(t * C.sw + C.ph)
      const x0 = cx + (hash2(n, 71) - 0.5) * C.wid * 1.2
      waves.push({ c, x0, t0: t, s: 0.75 + 0.5 * Math.min(1, A.bass || 0) })
      if (waves.length > WAVE_MAX) waves.shift()
      p._auroraWaveAt = t
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      if (t - waves[i].t0 > WAVE_LIFE * 4 || t < waves[i].t0) waves.splice(i, 1)
    }

    // --- per-curtain, per-column shape -----------------------------------
    for (let c = 0; c < NC; c++) {
      const C = CURTAINS[c]
      const o = c * cols
      const cx = C.cx + C.sway * Math.sin(t * C.sw + C.ph)
      const g = gain[c] * C.I
      const fp = fold[c]
      for (let x = 0; x < cols; x++) {
        HEM[o + x] = C.hem + C.amp1 * Math.sin(x * C.k1 + t * C.w1 + C.ph) +
          C.amp2 * Math.sin(x * C.k2 + t * C.w2 + C.ph * 1.7)
        const dx = (x - cx) / C.wid
        const env = Math.exp(-dx * dx * 1.4)
        // The fold: brightness travelling along the curtain, two terms in
        // opposite directions so a bright knot swells and splits rather
        // than scrolling past like a marquee.
        let f = 0.62 + 0.28 * Math.sin(x * C.kf - fp + C.ph) +
          0.1 * Math.sin(x * C.kf * 2.3 + fp * 0.61 + C.ph * 2.9)
        for (const w of waves) {
          if (w.c !== c) continue
          const age = t - w.t0
          const rise = Math.min(1, age / WAVE_RISE)
          const front = Math.abs(x - w.x0) - age * WAVE_SPEED
          f += WAVE_AMP * w.s * rise * Math.exp(-age / WAVE_LIFE) *
            Math.exp(-(front * front) / (2 * WAVE_SIGMA * WAVE_SIGMA))
        }
        BODY[o + x] = g * env * f
        // The ray deal for this column: a hash per epoch, crossfaded into
        // the next epoch's. A column below the threshold still carries a
        // short stub (0.25), so the hem stays continuous under the gaps.
        const off = hash2(x, c * 17 + 3) * RAY_EPOCH
        const e = (t + off) / RAY_EPOCH
        const n = Math.floor(e)
        const u = smooth(e - n)
        const h0 = hash2(x + c * 101, n), h1 = hash2(x + c * 101, n + 1)
        const hv = h0 + (h1 - h0) * u
        const r = (hv - (1 - C.rays)) / C.rays
        RAY[o + x] = r <= 0 ? 0.25 : Math.min(1, 0.25 + r * 1.4)
        const l0 = hash2(x + c * 57, n + 500), l1 = hash2(x + c * 57, n + 501)
        LEN[o + x] = C.len * (0.45 + 0.55 * (l0 + (l1 - l0) * u)) * RAY[o + x]
      }
    }

    // --- the light field ---------------------------------------------------
    F.fill(0)
    for (let c = 0; c < NC; c++) {
      const o = c * cols
      for (let x = 0; x < cols; x++) {
        const B = BODY[o + x]
        if (B < 0.04) continue
        const hem = HEM[o + x]
        const len = LEN[o + x] + 1
        const r = RAY[o + x]
        const yTop = Math.max(1, Math.floor(hem - len))
        const yBot = Math.min(H - 1, Math.ceil(hem + 1))
        for (let y = yTop; y <= yBot; y++) {
          const d = hem - y // rows above the hem
          let v
          if (d < -0.5) v = B * 0.35 * Math.max(0, 1 + (d + 0.5)) // soft underside
          else if (d < 1) v = B * (0.85 + 0.15 * r) // the hem itself: continuous
          else {
            // Up the ray: brightest just above the hem, falling off with a
            // power > 1 so the top of each ray is a thin tail.
            const uu = 1 - (d - 1) / len
            if (uu <= 0) continue
            v = B * r * uu * Math.sqrt(uu)
          }
          F[y * cols + x] += v
        }
      }
    }

    // --- sky ---------------------------------------------------------------
    for (let y = 1; y < H; y++) {
      for (let x = 0; x < cols; x++) {
        if (y > H - edge[x]) continue // the ridge; drawn below
        const i = y * cols + x
        const v = F[i]
        if (v >= LIT) {
          let ch, a
          if (v >= 0.9) { ch = '█'; a = BRIGHT }
          else if (v >= 0.66) { ch = '▓'; a = NORMAL }
          else if (v >= 0.46) { ch = '▒'; a = MUTED }
          else if (v >= 0.3) { ch = '░'; a = MUTED }
          else { ch = '¦'; a = DIM }
          term.put(x, y, ch, a)
          continue
        }
        // Stars: ~2.5% of the dark sky, fixed in place. A few twinkle
        // between FAINT and DIM on 10-30s periods -- the only change a star
        // ever makes, too slow to read as a blink.
        const hs = hash2(x, y)
        if (hs > 0.975) {
          const tw = Math.sin(t * (0.2 + (hs - 0.975) * 16) + hs * 97) > 0.6
          term.put(x, y, hs > 0.993 ? '+' : '·', hs > 0.993 || tw ? DIM : FAINT)
        } else {
          term.put(x, y, ' ')
        }
      }
    }

    // --- ridge, pines, shore ----------------------------------------------
    // A solid mass (2026-10-16): one flat dark slab (`█` at FAINT), with a
    // `▄` half-cell on the slopes so they read as slopes rather than steps,
    // snow on the tall summits, and the shore row carrying the pines. The
    // first cut lit every crest cell a shade brighter than the body, and
    // in a capture that outlined each step: ziggurats, not mountains.
    const half = p._auroraHalf
    for (let x = 0; x < cols; x++) {
      const e = edge[x]
      // Pines stand in clusters: a slow sine of the column decides the
      // stands (a hash alone gave a uniform fringe), a hash thins them.
      const stand = Math.sin(x * 0.29 + 1.2) + 0.6 * Math.sin(x * 0.83)
      const pine = stand > 0.4 && hash2(x, 91) > 0.25
      // The half cap sits in the sky row just above the crest. Always FAINT:
      // it is rock, and the sky is the bright half.
      if (half[x] && H - e >= 1) term.put(x, H - e, '▄', FAINT)
      // From the crest down, and always the shore row itself: a bare-shore
      // column (e = 0) has no crest row, and starting at H - e + 1 skipped
      // its shore cell entirely (30 unpainted cell-frames at 100 cols).
      for (let y = Math.min(H, H - e + 1); y <= H; y++) {
        // `▓` not `█`: at FAINT a full block still carried as much light as
        // the curtains' middle tones, and the sky has to be the bright half.
        let ch = '▓', a = FAINT
        const depth = y - (H - e + 1) // 0 on the crest row
        if (y === H) {
          if (pine) { ch = hash2(x, 57) > 0.5 ? '▲' : 'Λ'; a = DIM }
          else if (e === 0) { ch = '▁' }
        } else if (e >= 5 && depth === 0) {
          // Snow on the tall summits: a THIN cap -- `▀`, half a cell, on the
          // crest row only, at MUTED. The first cut put a `█` MUTED block on
          // two rows plus a MUTED half cap, and under this station's bloom
          // each big peak wore a solid glowing blob that drew the eye ahead
          // of the curtains. Nothing in the landscape may outshine a hem;
          // tests/visual-aurora.test.mjs holds that.
          ch = '▀'; a = MUTED
        }
        term.put(x, y, ch, a)
      }
    }

    // --- lake --------------------------------------------------------------
    for (let y = H + 1; y < VIZ_BOT; y++) {
      const k = y - H - 1
      for (let x = 0; x < cols; x++) {
        const e = edge[x]
        if (k < e - 1) {
          // The ridge's mirror: dark water with only the crest flipped, as a
          // faint line. The first cut mirrored the whole filled mass at the
          // ridge's own shade, and in a real capture every peak and its
          // reflection read as one diamond.
          term.put(x, y, k === e - 2 ? '░' : ' ', FAINT)
          continue
        }
        const ys = Math.max(1, Math.round(H - 1 - (k + 1) * LAKE_SQUASH))
        // A still lake, not a mirror: a near-stationary shimmer (0.13
        // cols/s) breaks the reflection into streaks so it reads as water.
        const sh = 0.65 + 0.35 * Math.sin(x * 0.67 + k * 1.9 + t * 0.09)
        const v = F[ys * cols + x] * LAKE_GAIN * sh
        let ch = ' ', a = FAINT
        if (v >= 0.42) { ch = '▒'; a = DIM }
        else if (v >= 0.26) { ch = '░'; a = DIM }
        else if (v >= 0.14) { ch = '░'; a = FAINT }
        else if (v >= 0.07) ch = '~'
        term.put(x, y, ch, a)
      }
    }
  },
}
