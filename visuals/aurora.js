// SIGNAL -- visualizer effect "AURORA" (DRIFT MODE, 2026-09-13).
//
// 2026-10-20 -- REDRAWN IN PIXELS. Curtains of light over a dark ridge and
// a snowfield, drawn as per-cell putGlyph() bitmaps -- the renderer FLAME
// proved and NEON HEART, TOKYO BAY, LAVA LAMP and DROP FORGE moved to on
// 2026-10-18.
//
// The critique (CRITIQUE-1020, ranked #1 REDRAW): "No aurora on screen."
// After two passes in characters the curtains were horizontal `─` runs at a
// few heights joined by `|` and `:` sticks -- a circuit diagram -- over a
// `░` mountain range that rastered as a stepped bar chart with `▲▲▲` on it,
// above a lake whose `~` streaks rastered as `NNNN` strings on this font.
// MUTED and LOUD differed by the length of a few sticks. The header itself
// had argued that an aurora is a density, and density is exactly what a
// glyph cannot draw: a cell holds one character or nothing. Matt approved
// the redraw (keep the subject, change the rendering).
//
// What it draws now, and why each piece is the shape it is:
//
// - THE CURTAINS (the subject). Four ribbons of light, each a 3px SOLID HEM
//   (the bottom edge of a real aurora is its sharpest and brightest part)
//   that undulates across the sky, with RAYS rising from it that fade by
//   DITHER DENSITY over 50-110px, and dark gaps between the rays. A ray's
//   pixels are one tier for their whole column, the hem's; only how many of
//   them are lit falls off with height. TOKYO BAY's aureole learned that the
//   hard way (two tiers drew the cell grid's box around the inner one), and
//   a ray fading through tiers drew a horizontal seam at every cell row. The
//   tier changes ACROSS the curtain instead -- NORMAL in its bright middle,
//   MUTED toward its ends -- where the seams are vertical, and line up with
//   the rays.
// - THE RIDGE. One solid dark silhouette with a 1px MUTED edge along the
//   crest and DIM snow in the gullies under the tall summits. It occludes
//   the curtains and the stars, which is the only thing that makes a dark
//   mass visible against a dark sky -- and it is never brighter than the
//   hems. No `▓`/`░` columns.
// - THE SNOWFIELD, not the lake. The critique's set notes count four
//   "something mirrored in water" compositions (TOKYO BAY, LAGOON, NEON
//   HEART, and AURORA's lake) and suggest dropping this one for snow. Snow
//   also does a thing a lake would not: it CATCHES the aurora's light. The
//   snowfield is DIM dither whose density follows the curtains above it,
//   column by column, eased -- so a swell brightens the ground under it and
//   a wave's knot of light runs across the snow below it.
// - THE PINES. Dark silhouettes cut out of the lit snow, each tier of
//   branches carrying a DIM line of snow along its underside: two stands
//   framing the foreground (asymmetric -- the critique wants the place-
//   pictures to stay scenes, not collapse to one centred object), and small
//   far pines along the foot of the ridge.
// - THE STARS. Single FAINT pixels, a few DIM, in the dark sky only.
//
// The rubric, point by point:
// 1. ONE SUBJECT: the aurora. The ridge, snow and pines are its setting.
// 2. ONE MUSICAL ELEMENT: the curtains' light. NOTHING THUMPS (an ambient
//    station; see the bloom exclusion in drawVisualizerFrame): A.pulse is
//    never read -- syntheticAudio() fabricates one every 0.9s, and an effect
//    that took even a sliver of it would breathe in 0.9s steps on every
//    visit without a tap. Level, eased on a short attack and a long release
//    (GAIN_ATTACK/GAIN_RELEASE), lifts every curtain's tier and the length
//    and density of its rays (the length reads the eased level too: read
//    raw, a jittery tap jumped every ray each render), and quickens the
//    folds through an accumulated phase (never a scaled `t *` term, which
//    would jump them). An onset
//    sends a slow WAVE along one curtain: a knot of light that blooms and
//    travels out both ways at WAVE_SPEED, the hem going BRIGHT and the rays
//    reaching higher where it passes, and the snow under it lightening. At
//    most one every WAVE_GAP seconds, rolling, never a flash.
// 3. BRIGHTNESS ORDER: hems (NORMAL, BRIGHT under a wave or at full level)
//    > rays (the hem's tier, capped at NORMAL, thinned by density) > the
//    ridge's crest edge (MUTED, 1px) > snow and pine-snow (DIM) > stars
//    (FAINT). The landscape never outranks the brightest curtain.
// 4. SHAPES, NOT SOUP: no characters on the canvas at all -- bitmaps or
//    blanks -- so no shade block, no `≈`/`~`, nothing that rasters as text.
// 5. FOUR STATES. NO TAP: syntheticAudio's level and onsets, eased and
//    rate-limited, so the sky swells and waves without breathing on the
//    fake pulse. MUTED: SILENT_AUDIO -- the curtains sit at their floor, at
//    MUTED, still folding slowly, no waves: faint, never blank. Quiet: short
//    sparse rays. Loud: long dense rays, NORMAL hems, BRIGHT at the cores.
// 6. REAL-RADIO TEST: northern lights over a frozen ridge -- the picture in
//    the window of a set left on all night in a cabin.
//
// COST. The picture is rebuilt at most RENDER_HZ (and on the frame a wave
// starts); frames between re-put the same bitmaps, alternating two per cell
// (a same-reference putGlyph() is a no-op -- flame.js's trap). The static
// layer (ridge, stars, airglow, pines, the snow's base density) is built
// once per grid size and cached. Per render: per-column curtain shape, the
// rays' pixel spans, the snow, and a pack of the picture into bitmaps that
// skips cell rows identical to the last render and empty 4px words. The
// render is split into small functions (one curtain, one snow row), for
// LAVA LAMP's OSR reason: as one body it cost ~20ms in the snow alone.
// Measured 2026-10-20 in the harness on a loaded box, back to back with
// the others: per frame ~1.5-2ms (FLAME 3-8ms in the same runs); the first
// frame of a page's first visit, scene build included, level with TOKYO
// BAY's (the first cut was ~2.5x it, mostly Math.sin hashing per pixel).
//
// THE PACK keeps every pixel within TWO tiers of its cell's brightest
// (TOKYO BAY keeps one). With one, a summit's DIM snow sharing a cell with
// a NORMAL hem was dropped, and the hem cut a dark rectangle out of the
// mountain; with two, those few pixels show at the hem's tier instead,
// which reads as the aurora lighting the peak.
//
// State on p: _aurora (buffers, built lazily on first draw), _auroraGain
// (eased per-curtain gain), _auroraLvl (eased level), _auroraFold (accumulated fold phases -- a
// position, cleared on reset only because a fresh visit may start
// anywhere), _auroraGlow (the snow's eased light per column), _auroraWaves,
// and the effect-clock values _auroraLastT / _auroraRenderT /
// _auroraWaveAt, all cleared by reset() (CLAUDE.md's rule for any `t + n`
// kept on p).
//
// --- history -----------------------------------------------------------------
// 2026-09-13 -- built for the re-homed ZM DRIFT MODE (which had lost DRIFT
// to NEON STASIS and borrowed FROST): a scene with a subject, beatless,
// slow enough that you notice it has changed rather than watch it. First
// cut summed smooth curtains into a dotted wash; rays became a per-column
// hash with a threshold so there were dark columns between them.
// 2026-10-16 -- rebuilt to read: block-shaded curtains (`█▓▒░`), a `▓` ridge
// with pines, a six-row lake; level eased on attack/release and quickening
// the folds; the onset WAVE added. Judged the same day off the real tube:
// the blocks rastered as hard rectangles and barcode.
// 2026-10-16 (design pass) -- redrawn as lines: `━`/`▁` hems on a half-row
// grid, `│ ¦ :` rays, a FAINT `░` ridge, lake streaks. Judged 2026-10-20 as
// above: a circuit diagram over a bar chart. Kept from all of it: the
// subject, no thump, the eased swell, the wave, and every speed (the hem's
// vertical drift tops out near 1.6px/s, the folds ~4px/s at rest).

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// Pixel tiers, -1 = unlit. NORMAL is attribute 0, so it can never mean
// "blank" (flame.js's trap) -- hence a tier index and a lookup.
export const T_FAINT = 0, T_DIM = 1, T_MUTED = 2, T_NORMAL = 3, T_BRIGHT = 4
export const TIERS = [FAINT, DIM, MUTED, NORMAL, BRIGHT]

// The shore -- where the ridge's foot meets the snowfield -- as a share of
// the canvas height.
export const SHORE_F = 0.72
// The ridge: peaks as [centre as a share of the width, height in px, px of
// rise per px across]. Over ~1 a flank is steeper than 45 degrees on the
// tube (pixels stand 1.2:1), which is what reads as alpine.
const PEAKS = [
  [0.05, 40, 0.9], [0.16, 80, 1.1], [0.235, 60, 0.95], [0.38, 26, 0.7], [0.54, 52, 0.95],
  [0.715, 74, 1.15], [0.8, 58, 1.0], [0.94, 38, 0.8],
]
// Snowbanks in the foreground: [centre as a share of the width, height as
// a share of the snowfield's depth, half-width as a share of the width].
const BANKS = [[0.08, 0.62, 0.17], [0.92, 0.55, 0.12]]
// The airglow: DIM density at the shore, and its e-folding height in px.
const AIRGLOW = 0.24, AIRGLOW_PX = 24
// Pines: [x as a share of the width, base as a share of the snowfield's
// depth, height px]. Two foreground stands framing the picture (the left
// one taller), and small far pines along the foot of the ridge.
const PINES = [
  [0.035, 0.98, 104], [0.085, 0.9, 78], [0.125, 1.0, 92], [0.165, 0.86, 54],
  [0.865, 0.92, 70], [0.905, 1.0, 96], [0.95, 0.88, 62],
  [0.27, 0.16, 15], [0.285, 0.18, 19], [0.3, 0.15, 13],
  [0.41, 0.12, 12], [0.425, 0.14, 16],
  [0.62, 0.2, 18], [0.637, 0.16, 14], [0.652, 0.22, 21], [0.67, 0.17, 13],
  [0.77, 0.13, 12],
]

// The curtains, in px for a 16px cell (scaled by cellH/16 at build). `hem`
// is the resting row of the solid lower edge; `amp*`/`k*`/`w*` its two
// undulation terms (px, rad/px, rad/s). `len` is the longest ray. `cx`/
// `sway`/`sw` place the brightness envelope and drift it (~1px/s); `wid`
// its width. `kf`/`wf` the fold travelling along the curtain (|wf/kf| ~4
// px/s at rest, scaled FOLD_LO..FOLD_HI by level). `band` the bands9 index
// that shapes it, spread so the four do not swell together. `I` base
// intensity; `rays` the share of columns carrying a ray. The first is the
// high back sheet: wide, faint, sparse. Every speed is incommensurate with
// every other on purpose: this station's tracks run twenty minutes, and
// curtains with rational speed ratios re-align on a period you can sit
// through.
const CURTAINS = [
  { hem: 54, amp1: 12, k1: 0.0076, w1: 0.041, amp2: 5, k2: 0.021, w2: -0.057, ph: 0.0,
    len: 52, cx: 0.58, sway: 0.18, sw: 0.0071, wid: 290, kf: 0.016, wf: 0.071, I: 0.75, band: 1, rays: 0.7, hemPx: 0 },
  { hem: 100, amp1: 20, k1: 0.0104, w1: 0.053, amp2: 8, k2: 0.026, w2: -0.037, ph: 1.9,
    len: 104, cx: 0.27, sway: 0.16, sw: 0.0113, wid: 165, kf: 0.024, wf: 0.097, I: 1.3, band: 3, rays: 0.6, hemPx: 3 },
  { hem: 122, amp1: 16, k1: 0.0089, w1: -0.047, amp2: 7, k2: 0.029, w2: 0.061, ph: 4.1,
    len: 100, cx: 0.74, sway: 0.15, sw: 0.0089, wid: 155, kf: 0.021, wf: -0.083, I: 1.25, band: 5, rays: 0.6, hemPx: 3 },
  { hem: 146, amp1: 10, k1: 0.0121, w1: 0.033, amp2: 5, k2: 0.034, w2: -0.049, ph: 2.7,
    len: 70, cx: 0.5, sway: 0.27, sw: 0.0053, wid: 120, kf: 0.029, wf: 0.101, I: 1.05, band: 7, rays: 0.55, hemPx: 3 },
]
const NC = CURTAINS.length
// A column's ray pattern is re-dealt every RAY_EPOCH seconds, crossfaded,
// each column on its own offset -- rays always growing and fading
// somewhere, never all at once. Rays are RAY_PX wide.
const RAY_EPOCH = 40
const RAY_PX = 2

// Audio mapping. Overall level lifts every curtain between LVL_LO and
// LVL_HI; each curtain's band scales it between BAND_LO and BAND_HI.
const LVL_LO = 0.5, LVL_HI = 1.15
const BAND_LO = 0.82, BAND_HI = 1.12
const GAIN_ATTACK = 0.12 // seconds
const GAIN_RELEASE = 1.2 // seconds
const FOLD_LO = 0.7, FOLD_HI = 1.6
// Ray length as a share of `len`: LEN_LO in silence, up to LEN_LO+LEN_SPAN
// at full level.
const LEN_LO = 0.5, LEN_SPAN = 0.6

// Curtain light -> tier. B is the curtain's light in a column.
const LIT = 0.2
export const B_BRIGHT = 1.5, B_NORMAL = 0.62, B_MUTED = 0.3
const tierOf = (B) => B >= B_BRIGHT ? T_BRIGHT : B >= B_NORMAL ? T_NORMAL : B >= B_MUTED ? T_MUTED : B >= LIT ? T_DIM : -1

// The onset wave. At most one every WAVE_GAP seconds; it blooms over
// WAVE_RISE, its two fronts travel out at WAVE_SPEED px/s, and it fades
// with a WAVE_LIFE time constant. WAVE_AMP is how much brighter the knot
// makes the curtain it rides.
export const WAVE_GAP = 1.0
const WAVE_RISE = 0.12
const WAVE_SPEED = 140
const WAVE_SIGMA = 30
export const WAVE_LIFE = 1.2
const WAVE_AMP = 1.4
const WAVE_MAX = 4

// The snow's light: its dither density is SNOW_BASE x the column's glow,
// the glow GLOW_LO + GLOW_K x the curtains' light above it, eased on
// GLOW_TAU and quantized to GLOW_STEPS so a slow swell steps the snow a
// few times a second, not every pixel every frame.
const GLOW_LO = 0.55, GLOW_K = 0.42, GLOW_MAX = 1.5, GLOW_TAU = 0.6, GLOW_STEPS = 32

export const RENDER_HZ = 20

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)]
const smooth = (u) => u * u * (3 - 2 * u)

// An integer hash for the scene build: hash2's Math.sin is the slow path
// at these argument sizes, and the build calls it ~10^5 times.
function ihash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function vnoise1(x, seed) {
  const i = Math.floor(x), f = x - i
  const a = ihash(i, seed), b = ihash(i + 1, seed)
  return a + (b - a) * smooth(f)
}
function vnoise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const u = smooth(x - xi), v = smooth(y - yi)
  const a = ihash(xi + seed, yi), b = ihash(xi + 1 + seed, yi)
  const c = ihash(xi + seed, yi + 1), d = ihash(xi + 1 + seed, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

// Pixel owners. Exported for the tests.
export const OWN = { SKY: 0, RIDGE: 1, SNOW: 2, PINE: 3 }

const sceneCache = new Map()
/** The still picture at one grid size: owners, the fixed lit pixels
 *  (crest, gully snow, stars, snow on the pines' branches), the crest's
 *  height per column and the snowfield's base density. Built once per size
 *  and cached; nothing in it depends on time or audio. */
export function sceneTables(cols, cw = 8, ch = 16) {
  const key = `${cols}x${cw}x${ch}`
  let S = sceneCache.get(key)
  if (S) return S
  const rows = VIZ_BOT - 1
  const W = cols * cw, H = rows * ch
  const SHORE = Math.round(H * SHORE_F)
  const sc = ch / 16
  const own = new Uint8Array(W * H)
  const fixed = new Int8Array(W * H).fill(-1)

  // The crest: the highest peak's flank in each column, roughened by two
  // octaves of noise so the line is rock, not a ruler.
  const crestY = new Int16Array(W)
  const height = new Float32Array(W)
  for (let x = 0; x < W; x++) {
    let h = 0
    for (const [f, P, slope] of PEAKS) {
      const v = P * sc - Math.abs(x - f * W) * slope
      if (v > h) h = v
    }
    if (h > 0) h += 6 * (vnoise1(x / 11, 5) - 0.5) + 3 * (vnoise1(x / 3.7, 6) - 0.5)
    height[x] = Math.max(0, h)
    crestY[x] = SHORE - Math.max(1, Math.round(height[x]))
  }
  for (let x = 0; x < W; x++) {
    for (let y = crestY[x]; y < SHORE; y++) own[y * W + x] = OWN.RIDGE
    // The crest line, 1px, continuous down a steep flank: each column lit
    // from its own crest down to just above its lower neighbour's.
    const nb = Math.max(crestY[Math.max(0, x - 1)], crestY[Math.min(W - 1, x + 1)])
    for (let y = crestY[x]; y <= Math.max(crestY[x], nb - 1); y++) fixed[y * W + x] = T_MUTED
    // Snow in the gullies under the tall summits: streaks running down the
    // fall line, thinning with depth.
    const hx = height[x]
    if (hx > 30 * sc) {
      const reach = (hx - 26 * sc) * 0.7
      const gully = vnoise1(x / 5.5, 11)
      for (let d = 2; d < reach; d++) {
        const y = crestY[x] + d
        if (y >= SHORE) break
        const dens = (gully - 0.35) * 1.6 * (1 - d / reach)
        if (dens > dither(x, y)) fixed[y * W + x] = T_DIM
      }
    }
  }
  // The snowfield: sparse DIM dither in long low drifts, a little denser
  // at the foot of the ridge -- and two BANKS in the foreground corners,
  // denser, with a rim along their crest, for the pines to stand on and be
  // cut out of. A dark tree only reads against something lit.
  // (Per-column and per-row terms are hoisted, and the drift noise is
  // sampled every 4px across and 2px down: the first cut evaluated all of
  // it per pixel and took ~250ms to build, a visible hitch on entry.)
  const snowD = new Float32Array(W * H)
  const depth = H - SHORE
  const bankTop = new Float32Array(W).fill(Infinity)
  for (let x = 0; x < W; x++) {
    const rough = 4 * (vnoise1(x / 13, 23) - 0.5)
    for (const [bx, bh, bw] of BANKS) {
      const u = (x - bx * W) / (bw * W)
      bankTop[x] = Math.min(bankTop[x], H - depth * bh * Math.exp(-u * u) + rough)
    }
  }
  for (let y = SHORE; y < H; y++) sceneSnowRow(own, snowD, bankTop, W, SHORE, y)
  // Pines: stacked tiers of dark branches, each tier wider than the one
  // above, with snow lying along the top of each tier's slopes -- the
  // chevron stack that reads as a fir at any size. Far pines (short) are
  // plain dark shapes against the bright snow at the foot of the ridge.
  for (const [fx, fb, ph] of PINES) {
    const px = Math.round(fx * W)
    const base = Math.round(SHORE + fb * (H - 1 - SHORE))
    const ht = ph * sc
    const far = ph < 30
    const trunk = Math.max(2, Math.round(ht * 0.09))
    const canopyBot = base - trunk
    const top = base - ht
    const tiersN = far ? 2 : Math.max(3, Math.round(ht / 16))
    const span = (canopyBot - top) / (tiersN * 0.8 + 0.2)
    const hwMax = ht * (far ? 0.26 : 0.3)
    const paint = (x, y, lit) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return
      const i = y * W + x
      own[i] = OWN.PINE
      fixed[i] = lit ? T_DIM : -1
    }
    for (let y = canopyBot; y <= base; y++) for (let x = px - 1; x <= px + 1; x++) paint(x, y, false)
    // Tiers, top first; each overlaps the one above it by a fifth.
    for (let k = 0; k < tiersN; k++) {
      const y0 = top + k * span * 0.8, y1 = Math.min(canopyBot, y0 + span)
      const wk = hwMax * (0.35 + 0.65 * (k + 1) / tiersN)
      for (let y = Math.max(0, Math.floor(y0)); y <= y1; y++) {
        const u = (y - y0) / (y1 - y0)
        const hw = Math.max(0.5, wk * u)
        const x0 = Math.round(px - hw), x1 = Math.round(px + hw)
        for (let x = x0; x <= x1; x++) {
          // Snow on the upper slopes: the outer 1-2px of the tier's top
          // two-thirds.
          const edge = Math.min(x - x0, x1 - x)
          paint(x, y, !far && u < 0.7 && edge < (u < 0.3 ? 2 : 1))
        }
      }
    }
  }
  // Stars: single pixels in the sky, a few DIM. And the airglow: a thin
  // DIM haze hugging the horizon, densest at the shore and gone ~60px up,
  // so the ridge stands against something -- a dark mass on a dark sky is
  // otherwise only its crest line, which is how a silhouette reads as a
  // wireframe.
  const skyLit = (x, y) => y < crestY[x] - 1 && own[y * W + x] === OWN.SKY
  const nStars = Math.round(W * SHORE * 0.0022)
  for (let k = 0; k < nStars; k++) {
    const x = Math.floor(ihash(k, 41) * W), y = Math.floor(ihash(k, 43) * SHORE)
    if (skyLit(x, y)) fixed[y * W + x] = k % 4 === 0 ? T_DIM : T_FAINT
  }
  for (let y = Math.max(0, SHORE - Math.round(AIRGLOW_PX * sc * 3)); y < SHORE; y++) {
    sceneAirRow(own, fixed, crestY, W, y, AIRGLOW * Math.exp(-(SHORE - y) / (AIRGLOW_PX * sc)))
  }
  S = { cols, cw, ch, rows, W, H, SHORE, sc, own, fixed, crestY, height, snowD }
  sceneCache.set(key, S)
  return S
}

// The scene's per-pixel rows, as their own functions for the reason
// render() gives.
function sceneSnowRow(own, snowD, bankTop, W, SHORE, y) {
  const near = 0.8 + 1.0 * Math.exp(-(y - SHORE) / 9)
  const yn = ((y - SHORE) >> 1) / 4
  let drift = 0
  for (let x = 0; x < W; x++) {
    const i = y * W + x
    own[i] = OWN.SNOW
    if ((x & 3) === 0) drift = vnoise2(x / 90, yn, 17)
    let d = (0.05 + 0.14 * drift * drift) * near
    const top = bankTop[x]
    if (y >= top) d = Math.max(d, y < top + 2 ? 0.7 : 0.3 + 0.12 * drift)
    snowD[i] = d
  }
}
function sceneAirRow(own, fixed, crestY, W, y, air) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x
    if (y < crestY[x] - 1 && own[i] === OWN.SKY && air > dither(x, y) * (0.75 + 0.5 * ihash(x, y))) fixed[i] = T_DIM
  }
}

function alloc(p, term) {
  const { cellW, cellH } = term.font
  const S = sceneTables(term.cols, cellW, cellH)
  const cells = term.cols * S.rows
  p._aurora = {
    S,
    lv: new Int8Array(S.W * S.H),
    bufs: [0, 1].map(() => Array.from({ length: cells }, () => new Uint16Array(cellH))),
    which: new Uint8Array(cells),
    lit: new Uint8Array(cells),
    attr: new Uint8Array(cells),
    // The last picture packed, to skip cell rows that did not change (the
    // top of the sky, the ridge and the snow, most renders). Compared four
    // pixels at a time through the Int32 views.
    prev: new Int8Array(S.W * S.H),
    fresh: true,
    hem: new Float32Array(NC * S.W),
    body: new Float32Array(NC * S.W),
    glowT: new Float32Array(S.W),
  }
  p._auroraGlow = new Float32Array(S.W).fill(-1)
}

export default {
  key: 'aurora',
  label: 'AURORA',
  /** Seeds this effect's state on the program object (once, at boot). The
   *  picture buffers are built lazily on first draw. */
  init(p) {
    p._aurora = null
    p._auroraGain = new Float32Array(NC)
    p._auroraFold = new Float64Array(NC)
    p._auroraGlow = null
    p._auroraWaves = []
    p._auroraLastT = null
    p._auroraRenderT = -Infinity
    p._auroraWaveAt = -Infinity
    p._auroraWaveN = 0
  },
  /** Re-arms clocks on every visualizer entry. `_auroraLastT` null makes
   *  the first frame SNAP the gains and the snow's glow to the audio playing
   *  now instead of easing from the last visit; the waves carry effect-clock
   *  times, which restart at 0 (the M5 class). */
  reset(p) {
    p._auroraLastT = null
    p._auroraRenderT = -Infinity
    p._auroraWaves = []
    p._auroraWaveAt = -Infinity
    p._auroraWaveN = 0
    if (p._auroraFold) p._auroraFold.fill(0)
  },
  draw(p, s, t) {
    const { term } = s
    if (!p._aurora || p._aurora.S.cols !== term.cols || p._aurora.S.ch !== term.font.cellH) alloc(p, term)
    const R = p._aurora
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    const gain = p._auroraGain, fold = p._auroraFold

    // --- audio: level and bands9, eased; onset starts a wave --------------
    const level = Math.min(1, Math.max(0, A.level || 0))
    const first = p._auroraLastT === null || t < p._auroraLastT
    const dt = first ? 0 : Math.min(0.1, t - p._auroraLastT)
    p._auroraLastT = t
    if (first) p._auroraRenderT = -Infinity
    // The ray length reads level EASED, on the gains' own attack and
    // release: read raw, a tap whose level jumped frame to frame jumped
    // every ray in the sky with it (the strobing-tap test caught it).
    const lvl = first || p._auroraLvl === undefined ? level
      : p._auroraLvl + (level - p._auroraLvl) * (1 - Math.exp(-dt / (level > p._auroraLvl ? GAIN_ATTACK : GAIN_RELEASE)))
    p._auroraLvl = lvl
    for (let c = 0; c < NC; c++) {
      const b = Math.min(1, Math.max(0, (A.bands9 && A.bands9[CURTAINS[c].band]) || 0))
      const target = (LVL_LO + (LVL_HI - LVL_LO) * level) * (BAND_LO + (BAND_HI - BAND_LO) * b)
      if (first) gain[c] = target
      else gain[c] += (target - gain[c]) * (1 - Math.exp(-dt / (target > gain[c] ? GAIN_ATTACK : GAIN_RELEASE)))
      fold[c] += dt * CURTAINS[c].wf * (FOLD_LO + (FOLD_HI - FOLD_LO) * level)
    }
    const waves = p._auroraWaves
    if (A.onset && !muted && t - p._auroraWaveAt >= WAVE_GAP) {
      // Curtain and origin dealt by hash of the wave count, not Math.random:
      // the draw stays a pure function of its inputs and its own state.
      const n = p._auroraWaveN++
      const c = 1 + (n % 3) // the three front curtains; the back sheet is too faint to carry one
      const C = CURTAINS[c]
      const cx = (C.cx + C.sway * Math.sin(t * C.sw + C.ph)) * R.S.W
      waves.push({ c, x0: cx + (hash2(n, 71) - 0.5) * C.wid * 1.2, t0: t, s: 0.75 + 0.5 * Math.min(1, A.bass || 0) })
      if (waves.length > WAVE_MAX) waves.shift()
      p._auroraWaveAt = t
      p._auroraRenderT = -Infinity // the wave starts on this frame
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      if (t - waves[i].t0 > WAVE_LIFE * 4 || t < waves[i].t0) waves.splice(i, 1)
    }

    if (t - p._auroraRenderT >= 1 / RENDER_HZ) {
      const ddt = p._auroraRenderT === -Infinity ? 0 : t - p._auroraRenderT
      p._auroraRenderT = t
      render(p, R, t, p._auroraLvl, muted, ddt)
    }
    const cols = term.cols
    for (let cy = 0; cy < R.S.rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      // Re-put every frame: the same reference is a no-op in cellgrid.js,
      // and a cell something else wrote over in between gets the picture back.
      if (R.lit[i]) term.putGlyph(cx, cy + 1, R.bufs[R.which[i]][i], R.attr[i])
      else term.put(cx, cy + 1, ' ')
    }
  },
}

/** The curtains' hem row and light per pixel column at time t. */
function shapeCurtains(p, R, t) {
  const { W, sc } = R.S
  const gain = p._auroraGain, fold = p._auroraFold, waves = p._auroraWaves
  for (let c = 0; c < NC; c++) {
    const C = CURTAINS[c]
    const o = c * W
    const cx = (C.cx + C.sway * Math.sin(t * C.sw + C.ph)) * W
    const g = gain[c] * C.I
    const fp = fold[c]
    const iw = 1 / C.wid
    for (let x = 0; x < W; x++) {
      R.hem[o + x] = sc * (C.hem + C.amp1 * Math.sin(x * C.k1 + t * C.w1 + C.ph) +
        C.amp2 * Math.sin(x * C.k2 + t * C.w2 + C.ph * 1.7))
      const dx = (x - cx) * iw
      // The fold: brightness travelling along the curtain, two terms in
      // opposite directions so a knot swells and splits rather than
      // scrolling past like a marquee.
      let f = 0.62 + 0.28 * Math.sin(x * C.kf - fp + C.ph) +
        0.1 * Math.sin(x * C.kf * 2.3 + fp * 0.61 + C.ph * 2.9)
      for (const w of waves) {
        if (w.c !== c) continue
        const age = t - w.t0
        const front = Math.abs(x - w.x0) - age * WAVE_SPEED
        f += WAVE_AMP * w.s * Math.min(1, age / WAVE_RISE) * Math.exp(-age / WAVE_LIFE) *
          Math.exp(-(front * front) / (2 * WAVE_SIGMA * WAVE_SIGMA))
      }
      R.body[o + x] = g * Math.exp(-dx * dx * 1.4) * f
    }
  }
}

// The render is split into small functions on purpose -- one curtain, one
// snow row -- rather than loops nested in one body: LAVA LAMP's shadeRow
// note (V8 optimising a big function on-stack mid-loop and throwing it away
// on the way out). As one function this render cost ~20ms in the snow
// alone; split, the whole render is a few ms.
function render(p, R, t, level, muted, ddt) {
  const { S, lv } = R
  shapeCurtains(p, R, t)
  lv.set(S.fixed)
  const lenMul = LEN_LO + LEN_SPAN * level
  for (let c = 0; c < NC; c++) drawCurtain(R, c, t, lenMul) // back to front
  snowGlow(p, R, ddt)
  for (let y = S.SHORE; y < S.H; y++) snowRow(R, y)
  pack(R, 0, S.rows)
}

/** One curtain into the picture: its hem, then its rays. */
function drawCurtain(R, c, t, lenMul) {
  const { S, lv } = R
  const { W, own, crestY, sc } = S
  const C = CURTAINS[c]
  const o = c * W
  const glow = 10 * sc
  for (let x = 0; x < W; x++) {
    const B = R.body[o + x]
    const tier = tierOf(B)
    if (tier < 0) continue
    const rayTier = tier < T_NORMAL ? tier : T_NORMAL
    const hy = Math.round(R.hem[o + x])
    const top = crestY[x] // the ridge occludes everything at or below its crest
    // The hem: up to 3px solid, thinning and thinning out (by dither)
    // toward the curtain's ends, so a curtain fades away rather than
    // stopping at a cut. The back sheet has none: it is a diffuse glow.
    if (C.hemPx) {
      const thick = B >= 0.5 ? C.hemPx : B >= 0.32 ? Math.min(2, C.hemPx) : 1
      const hd = Math.min(1, (B - LIT) / 0.22)
      for (let y = hy - thick + 1; y <= hy; y++) {
        if (y < 0 || y >= top) continue
        const i = y * W + x
        if (hd > dither(x, y) && own[i] === OWN.SKY && lv[i] < tier) lv[i] = tier
      }
    }
    // The rays: this column's deal, crossfaded across epochs.
    const rx = (x / RAY_PX) | 0
    const e = (t + ihash(rx, c * 17 + 3) * RAY_EPOCH) / RAY_EPOCH
    const n = Math.floor(e), u = smooth(e - n)
    const h0 = ihash(rx + c * 101, n), h1 = ihash(rx + c * 101, n + 1)
    const r = Math.min(1, Math.max(0, ((h0 + (h1 - h0) * u) - (1 - C.rays)) / C.rays * 1.3))
    const l0 = ihash(rx + c * 57, n + 500), l1 = ihash(rx + c * 57, n + 501)
    // A brighter column reaches higher: the wave lengthens the rays it
    // passes, and level lengthens them all.
    const len = sc * C.len * lenMul * (0.45 + 0.55 * (l0 + (l1 - l0) * u)) * Math.min(2, 0.55 + 0.45 * B)
    // A short glow just above the hem in every lit column, so the gaps
    // between rays are dark but the curtain's edge has body.
    const reach = r > 0 ? Math.max(len, glow) : glow
    const dens0 = Math.min(1, 0.45 + 0.4 * B)
    rayColumn(R, x, hy - 2, top, reach, len, glow, r, dens0, rayTier)
  }
}

function rayColumn(R, x, y0, top, reach, len, glow, r, dens0, rayTier) {
  const { lv } = R
  const { W, own } = R.S
  for (let d = 1; d < reach; d++) {
    const y = y0 - d
    if (y < 0) break
    if (y >= top) continue
    const ur = d < len ? 1 - d / len : 0
    const ug = d < glow ? 1 - d / glow : 0
    const a = r * ur * Math.sqrt(ur), b = 0.5 * ug * ug
    const v = dens0 * (a > b ? a : b)
    const i = y * W + x
    if (v > BAYER[(y & 3) * 4 + (x & 3)] && own[i] === OWN.SKY && lv[i] < rayTier) lv[i] = rayTier
  }
}

/** The snow's light per column: the curtains' light above it, spread
 *  sideways (a box blur over GLOW_R px), eased on GLOW_TAU and quantized
 *  to GLOW_STEPS. Left in R.glowT. */
function snowGlow(p, R, ddt) {
  const { W } = R.S
  const tgt = R.glowT, body = R.body
  const GLOW_R = 48
  let acc = 0
  for (let x = 0; x < W + GLOW_R; x++) {
    if (x < W) for (let c = 0; c < NC; c++) acc += body[c * W + x]
    const xo = x - 2 * GLOW_R - 1
    if (xo >= 0) for (let c = 0; c < NC; c++) acc -= body[c * W + xo]
    const xc = x - GLOW_R
    if (xc < 0) continue
    const n = Math.min(W, xc + GLOW_R + 1) - Math.max(0, xc - GLOW_R)
    tgt[xc] = Math.min(GLOW_MAX, GLOW_LO + GLOW_K * acc / n)
  }
  const G = p._auroraGlow
  const k = ddt > 0 ? 1 - Math.exp(-ddt / GLOW_TAU) : 1
  for (let x = 0; x < W; x++) {
    G[x] = G[x] < 0 || k === 1 ? tgt[x] : G[x] + (tgt[x] - G[x]) * k
    tgt[x] = Math.round(G[x] * GLOW_STEPS) / GLOW_STEPS
  }
}

function snowRow(R, y) {
  const { lv, glowT } = R
  const { W, own, snowD } = R.S
  const row = y * W, b = (y & 3) * 4
  for (let x = 0; x < W; x++) {
    const i = row + x
    if (own[i] === OWN.SNOW && snowD[i] * glowT[x] > BAYER[b + (x & 3)]) lv[i] = T_DIM
  }
}


/** Picture -> one bitmap and one attribute per cell, for cell rows
 *  [r0, r1): the brightest tier in the cell, and only pixels within one
 *  tier of it. TOKYO BAY's pack(), the same shape. */
function pack(R, r0, r1) {
  const { S, lv, prev } = R
  const { W, cw, ch, cols } = S
  if (!R.lv32) { R.lv32 = new Int32Array(lv.buffer); R.prev32 = new Int32Array(prev.buffer) }
  const lv32 = R.lv32, prev32 = R.prev32
  const rowWords = (ch * W) >> 2
  for (let cy = r0; cy < r1; cy++) {
    // Skip a cell row whose pixels are exactly the last render's.
    const w0 = cy * rowWords
    if (!R.fresh) {
      let same = true
      for (let k = w0, end = w0 + rowWords; k < end; k++) if (lv32[k] !== prev32[k]) { same = false; break }
      if (same) continue
    }
    prev.set(lv.subarray(w0 << 2, (w0 + rowWords) << 2), w0 << 2)
    const base = cy * ch * W
    for (let cx = 0; cx < cols; cx++) {
      const ci = cy * cols + cx
      const x0 = cx * cw
      // The cell's brightest tier...
      // (Most of the sky is empty: a 4-pixel word of -1 bytes is skipped
      // whole, which is most of what makes the first render affordable.)
      let m = -1
      for (let py = 0, o = base + x0; py < ch; py++, o += W) {
        for (let k = 0; k < cw; k += 4) {
          if (lv32[(o + k) >> 2] === -1) continue
          for (let j = k; j < k + 4; j++) if (lv[o + j] > m) m = lv[o + j]
        }
      }
      if (m < 0) { R.lit[ci] = 0; continue }
      R.lit[ci] = 1
      R.attr[ci] = TIERS[m]
      R.which[ci] ^= 1
      // ...and every pixel within two tiers of it. (TOKYO BAY keeps one:
      // here that dropped the DIM snow on a summit wherever a NORMAL hem
      // shared its cell, and cut a dark rectangle out of the mountain.)
      const buf = R.bufs[R.which[ci]][ci]
      const lo = m - 2
      for (let py = 0, o = base + x0; py < ch; py++, o += W) {
        let bits = 0
        for (let k = 0; k < cw; k++) if (lv[o + k] >= lo && lv[o + k] >= 0) bits |= 1 << (cw - 1 - k)
        buf[py] = bits
      }
    }
  }
  R.fresh = false
}
