// SIGNAL -- visualizer effect "DRIFT", drawn as ATRIUM (NEON STASIS).
// Rebuilt 2026-10-16.
//
// An empty shopping mall after closing, in one-point perspective: two floors
// of storefronts on the far wall with their signs still lit, the side walls'
// shop bays receding to the vanishing point, a pair of escalators crossing in
// the middle distance, a checkered floor running away from you, a potted palm
// at each side and a fountain in the foreground still running for nobody.
//
// Why it fits. NEON STASIS is mallsoft -- muzak slowed and drowned in reverb
// until it sounds like it is playing in a mall that closed years ago -- and
// its tagline is "closing time in a mall that never was". That is a PLACE,
// so this is a composed picture like KEEP and LAGOON rather than a field.
// Nobody is in it; the music is what is left.
//
// What it replaced. The old DRIFT was four layered sine terms rendered as a
// density ramp over the whole canvas -- weather, its comment said, not
// wallpaper. Measured 2026-10-16 it moved a lot with the audio (40% of the
// canvas between quiet and loud, the beat 5.1x as visible as the rest of the
// frame) and still read as wallpaper: a wall of characters with no subject,
// which is the problem the 2026-10-16 visualizer review was about. The key
// stays 'drift' -- it is also activeVisualKey's fallback for an unknown
// visual -- and the label says what it now is.
//
// How audio maps (amplitude and one discrete event; never a `t *` frequency,
// so nothing teleports):
//   - THE KICK (a rising edge on `pulse`, rate-limited as DANCEFLOOR's is)
//     makes the fountain SPURT: the jet fills, a crown and a wide spray
//     burst off it, and the basin water flashes. A burst, not height: the
//     whole fountain stays below JET_CEIL_Y (see there for why). It decays
//     in well under a beat, so the spurt is the one thing that says "now".
//   - LEVEL sets the jet's resting height (one row or two), how far the
//     overflow arcs reach from the upper bowl and how choppy the water is.
//   - bands9 drives the signs: each storefront sign takes one band and
//     breathes between FAINT and NORMAL with it.
//   - Closing time, independent of the audio: every so often a store's lights
//     go out -- window dark, sign down to an unlit tube -- and come back a
//     while later. A pure function of (store, t), so there is nothing to
//     reset and it cannot stick.
// Muted (SILENT_AUDIO), the jet sinks to a trickle, nothing spurts and the
// signs settle at their unlit floor; the mall keeps its slow escalators.
//
// No '█' anywhere and BRIGHT on one cell only (the spurt's crown): the tube
// blooms, which the text grid cannot see -- the UPRISING/KEEP lesson.
//
// 2026-10-16 (design pass). The viz-critic, judging the real tube, found the
// kick's element the least legible thing in the frame -- a small DIM oval of
// dashes, LOUD and KICK indistinguishable -- and nothing clearly brightest:
// the escalators' big slashed X sat mid-frame at the same tier as everything
// else, and the shop windows were shade-block slabs (`░`), which raster as
// solid rectangles, the opposite of a lit window. What changed:
//   - The fountain is the subject now, and drawn as one object: a basin of
//     solid box rules (`╭─╮` / `╰─╯`) at NORMAL, the bowl and stem at
//     NORMAL, the jet's column at NORMAL, the crown BRIGHT. The cap below
//     JET_CEIL_Y is untouched.
//   - The `~`/`-` noise in the basin is gone. The water is dark, with slow
//     rings running out from the jet -- one ring when quiet, up to three
//     loud -- so loudness still reads in the water, as a swell. The kick's
//     foam is a band that opens from the jet and closes as the spurt dies.
//   - The air around the jet is cleared of floor seams, so the spurt's spray
//     has a dark ground to read against.
//   - Escalators down to structure: rails DIM, treads FAINT.
//   - Signs top out at MUTED (they were reaching NORMAL loud, level with the
//     fountain), and a lit window is a sparse dot screen of light rather than
//     a shade-block slab.
// Still a swell, never a thump: the kick drives the fountain alone, and no
// tier anywhere else in the frame moves on the beat.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- geometry (rows are absolute grid rows; columns are derived per width) ---
// The vanishing point's row: eye level, between the two floors' windows.
export const VP_Y = 10
// The far wall, top to bottom.
export const CEIL_Y = 2        // where the far wall meets the ceiling
export const UP_SIGN_Y = 3     // upper floor's sign band
export const UP_WIN = [4, 6]   // upper floor's windows (inclusive)
export const SLAB_Y = 7        // the upper floor's slab / balcony edge
export const LO_SIGN_Y = 8     // lower floor's sign band
export const LO_WIN = [9, 12]  // lower floor's windows
export const FLOOR_Y = 13      // where the far wall meets the floor
// The fountain, foreground centre.
export const BOWL_Y = 16       // the upper bowl the jet rises from
// The highest row any of the fountain may draw on -- jet, crown or spray --
// whatever the level and however hard the kick. It is the far wall's floor
// line, where the escalators land. 2026-10-16 -- the first cut threw the jet
// up to row 6 on a kick: a thin line from the basin through the escalators
// to the BOOKS sign that split the picture down the middle and fought the
// escalators, which are the structure the eye should land on. So the kick
// reads as a BURST -- crown, a wide spray, foam -- and not as height.
export const JET_CEIL_Y = FLOOR_Y
export const RIM_Y = 18        // the basin's back rim
export const WATER_Y = 19      // the basin's water
export const FRONT_Y = 20      // the basin's front rim
const BASIN_HALF = 12          // half-width of the basin
const JET_AIR = 7              // half-width of the dark air kept round the jet

// --- the beat -----------------------------------------------------------------
// Same edge and gap as DANCEFLOOR (see there for why 0.2 and 0.22s).
export const BEAT_RISE = 0.2
export const SPURT_GAP_S = 0.22
// How fast a spurt dies away. 2026-10-16 (design pass): 6 -> 3.5, so the
// burst swells and settles over ~0.4s rather than snapping off in a frame or
// two -- mallsoft swells, it does not thump. e^-1.75 is ~0.17 at half a
// second, under every threshold below, so at 120bpm the fountain is still
// back at rest before the next kick.
const SPURT_DECAY = 3.5
// Droplets in a spurt's spray.
const SPRAY = 12
// Seconds for a water ring to run from the jet to the basin's wall.
const RING_S = 3.2

const UP_NAMES = ['CINEMA', 'ARCADE', 'BOOKS', 'FOODS', 'VIDEO']
const LO_NAMES = ['RECORDS', 'PHOTO', 'GIFTS', 'SHOES', 'CANDY', 'TOYS']

// Light tiers by a 0..1 value, never past MUTED: the far wall is scenery,
// and NORMAL belongs to the fountain (2026-10-16 design pass).
const tier = (v) => v > 0.55 ? MUTED : v > 0.25 ? DIM : FAINT
const clamp01 = (v) => Math.max(0, Math.min(1, v))

/** Lights out? A pure function of a store's id and the effect clock: each
 *  store keeps its own ~25s cycle, offset so they do not go together, and is
 *  dark for roughly a fifth of its cycles. */
export function storeDark(id, t) {
  const period = 23 + (id % 5) * 2.7
  const k = Math.floor((t + id * 7.3) / period)
  return hash2(id * 3.1, k) < 0.22
}

// Everything that depends only on the width, compiled once per width.
const layouts = new Map()
// The compose buffers, reused frame to frame and rebuilt only when the
// width changes (2026-10-16 design pass: they were allocated every frame).
let bufW = 0, bufCh = null, bufAt = null
function layoutFor(cols) {
  let L = layouts.get(cols)
  if (L) return L
  const mid = Math.floor(cols / 2)
  const bwL = Math.round(cols * 0.24), bwR = cols - 1 - bwL
  const inner = bwR - bwL - 1
  // An ODD number of shops, about 12 columns each, so one is centred over
  // the fountain: with an even count a shop divider fell on the centre
  // column, lined up with the jet, and split the picture down the middle.
  const n = Math.max(1, 2 * Math.round((inner / 12 - 1) / 2) + 1)
  const bounds = []
  for (let k = 0; k <= n; k++) bounds.push(bwL + Math.round((k * (inner + 1)) / n))
  // Side-wall pillars at even steps of DEPTH, so they bunch toward the back.
  const zBack = mid / (mid - bwL)
  const pillars = []
  for (let z = 1.3; z < zBack - 0.05; z += 0.3) pillars.push(Math.round(mid - mid / z))
  L = { mid, bwL, bwR, n, bounds, pillars, zBack }
  layouts.set(cols, L)
  return L
}

// Hand-drawn props, top row first. ' ' is transparent.
const PALM = [
  '  ,-~ ~-,  ',
  ' /  \\|/  \\ ',
  '/  / | \\  \\',
  '    (|     ',
  '     |)    ',
  '    (|     ',
  '  [=====]  ',
  '   \\___/   ',
]

export default {
  key: 'drift',
  label: 'ATRIUM',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._driftSpurtAt = -Infinity
    p._driftPrevPulse = 0
    p._driftGlow = new Float32Array(32)
    p._driftLastT = null
  },
  /** Re-arms clocks on every visualizer entry. _driftSpurtAt is an absolute
   *  effect-clock value: carried across a re-entry it sits minutes in the
   *  future of the restarted clock, and the rate limit refuses every spurt
   *  until the clock catches up -- a fountain that stops answering the kick
   *  for as long as the last visit lasted. */
  reset(p) {
    p._driftSpurtAt = -Infinity
    p._driftPrevPulse = 0
    // The glow smoother's last-frame stamp is an effect-clock value too: a
    // stale one makes the first frame's dt negative (or minutes long).
    p._driftLastT = null
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const { mid, bwL, bwR, n, bounds, pillars } = layoutFor(cols)
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    // --- the kick ---------------------------------------------------------
    const pulse = A.pulse || 0
    if (!muted && pulse - (p._driftPrevPulse || 0) >= BEAT_RISE && t - p._driftSpurtAt >= SPURT_GAP_S) {
      p._driftSpurtAt = t
    }
    p._driftPrevPulse = pulse
    const age = t - p._driftSpurtAt
    const spurt = age >= 0 ? Math.exp(-age * SPURT_DECAY) : 0
    const level = clamp01(A.level || 0)
    const bands = A.bands9 || SILENT_AUDIO.bands9
    // Each shop's window glow follows its sign's band through a ~0.8s
    // smoother: the stores breathe with the music rather than pumping on
    // every beat, which is the difference between mallsoft and DANCEFLOOR.
    if (!p._driftGlow) p._driftGlow = new Float32Array(32)
    const dt = p._driftLastT == null ? 0 : Math.max(0, Math.min(0.25, t - p._driftLastT))
    p._driftLastT = t
    const ease = 1 - Math.exp(-dt / 0.8)
    const bandOf = (i, floor) => clamp01(bands[(i * 2 + floor * 5) % 9] || 0)

    // --- compose into a buffer, then write every canvas cell once ----------
    const W = cols, H = VIZ_BOT
    if (bufW !== W) { bufW = W; bufCh = new Array(W * H); bufAt = new Uint8Array(W * H) }
    const ch = bufCh.fill(' ')
    const at = bufAt.fill(NORMAL)
    const put = (x, y, c, a = NORMAL) => {
      x = Math.round(x); y = Math.round(y)
      if (x < 0 || x >= W || y < 1 || y >= H) return
      ch[y * W + x] = c; at[y * W + x] = a
    }
    const text = (x, y, str, a) => { for (let i = 0; i < str.length; i++) if (str[i] !== ' ') put(x + i, y, str[i], a) }

    // --- the skylight: a few stars through the glass, never moving ---------
    for (let x = bwL + 1; x < bwR; x++) if (hash2(x, 1) < 0.06) put(x, 1, '.', FAINT)

    // --- the floor: polished stone, seams running to the vanishing point ---
    // Cross seams at depths that space out toward you (rows 15, 17, 20), and
    // radial seams every 4 columns where the floor meets the far wall,
    // fanning out as they come forward. Lines rather than a filled checker:
    // a checker of dots read as texture again, which is the thing this
    // rebuild is getting away from.
    for (const y of [15, 17, 20]) for (let x = 0; x < W; x++) put(x, y, '─', FAINT)
    for (let y = FLOOR_Y + 1; y < H; y++) {
      const f = (y - VP_Y) / (FLOOR_Y - VP_Y)
      for (let i = -12; i <= 12; i++) {
        if (i === 0) continue
        const x = Math.round(mid + i * 4 * f)
        // The fountain's air stays dark, so the spray reads against nothing.
        if (y < RIM_Y && Math.abs(x - mid) <= JET_AIR) continue
        put(x, y, i < 0 ? '/' : '\\', FAINT)
      }
    }
    for (let y = JET_CEIL_Y; y < RIM_Y; y++) for (let x = mid - JET_AIR; x <= mid + JET_AIR; x++) put(x, y, ' ')

    // --- the side walls -----------------------------------------------------
    // Each wall column x is a slice of the wall at scale k -- 1 where it
    // meets the far wall, growing toward you -- so a far-wall row yb lands
    // at VP_Y + (yb - VP_Y) * k on it. Drawn for the left wall and mirrored
    // for the right. Structure only -- slab, floor line, pillars, and each
    // bay's sign band lit or not -- so the far wall stays the subject.
    const sideBay = (x) => {
      let b = 0
      for (const px of pillars) if (x >= px) b++
      return b
    }
    for (let x = 0; x < bwL; x++) {
      const k = (mid - x) / (mid - bwL)
      const yAt = (yb) => VP_Y + (yb - VP_Y) * k
      const yCeil = yAt(CEIL_Y), ySlab = yAt(SLAB_Y), yLo = yAt(LO_SIGN_Y), yFl = yAt(FLOOR_Y)
      for (const side of [0, 1]) {
        const sx = side ? W - 1 - x : x
        const bay = sideBay(x) + side * 10
        // The wall hides the floor behind it.
        for (let y = Math.max(1, Math.ceil(yCeil)); y < Math.min(H, Math.round(yFl)); y++) put(sx, y, ' ')
        put(sx, yLo, '─', storeDark(100 + bay, t) ? FAINT : MUTED)
        put(sx, ySlab, '═', DIM)
        put(sx, yFl, '─', DIM)
        if (yCeil >= 1) put(sx, yCeil, '─', FAINT)
      }
    }
    // Pillars between the side bays, floor to ceiling.
    for (const px of pillars) {
      const k = (mid - px) / (mid - bwL)
      const top = Math.max(1, Math.round(VP_Y + (CEIL_Y - VP_Y) * k))
      const bot = Math.round(VP_Y + (FLOOR_Y - VP_Y) * k)
      for (let y = top; y < Math.min(H, bot); y++) { put(px, y, '│', DIM); put(W - 1 - px, y, '│', DIM) }
    }

    // --- the far wall: two floors of storefronts ----------------------------
    for (let x = bwL; x <= bwR; x++) {
      for (let y = CEIL_Y; y <= FLOOR_Y; y++) put(x, y, ' ')
      put(x, CEIL_Y, '─', DIM)
      put(x, SLAB_Y, '═', DIM)
      put(x, FLOOR_Y, '─', DIM)
    }
    for (let y = CEIL_Y; y <= FLOOR_Y; y++) { put(bwL, y, '│', DIM); put(bwR, y, '│', DIM) }
    put(bwL, CEIL_Y, '┌', DIM); put(bwR, CEIL_Y, '┐', DIM)
    put(bwL, FLOOR_Y, '└', DIM); put(bwR, FLOOR_Y, '┘', DIM)
    const storefront = (i, floor) => {
      const x0 = bounds[i], x1 = bounds[i + 1]
      const [w0, w1] = floor ? UP_WIN : LO_WIN
      const signY = floor ? UP_SIGN_Y : LO_SIGN_Y
      const id = floor * 10 + i
      const dark = storeDark(id, t)
      const names = floor ? UP_NAMES : LO_NAMES
      const name = names[(i + floor) % names.length].slice(0, Math.max(1, x1 - x0 - 2))
      // The sign: its band's level, or an unlit tube.
      const v = bandOf(i, floor)
      const g = (p._driftGlow[id] += (v - p._driftGlow[id]) * ease)
      text(x0 + 1 + Math.floor((x1 - x0 - 1 - name.length) / 2), signY, name, dark ? FAINT : tier(0.2 + v * 0.8))
      // Shopfront pillars, and the window between them.
      for (let y = signY; y <= w1; y++) { put(x0, y, '│', DIM); put(x1, y, '│', DIM) }
      // One shop a floor never got its shutter all the way up. A lit window
      // is a dot screen of light -- every other cell, staggered by row -- a
      // closed one is dark glass. (It was a `░` slab until the 2026-10-16
      // design pass: on the tube that is a solid rectangle, not light.)
      const shutterRows = i === (floor ? 0 : n - 1) && n > 1 ? 2 : 0
      for (let y = w0; y <= w1; y++) {
        for (let x = x0 + 1; x < x1; x++) {
          if (y - w0 < shutterRows) put(x, y, '≡', DIM)
          else if (!dark && ((x + y) & 1) === 0) put(x, y, g > 0.62 ? ':' : '.', g > 0.62 ? DIM : FAINT)
        }
      }
    }
    // The lower floor's centre bay is the escalator well -- no shop behind
    // the escalators, so they are not drawn over a sign nobody can read.
    const well = (n - 1) / 2
    for (let i = 0; i < n; i++) { storefront(i, 1); if (i !== well) storefront(i, 0) }

    // --- the escalators, crossing between the floors -------------------------
    // One climbs left to right, the other right to left; the treads creep
    // along them, slowly, which is most of the idle motion in the frame.
    const run = Math.min(14, Math.max(8, Math.round((bwR - bwL) * 0.33)))
    const rise = FLOOR_Y - SLAB_Y
    const tread = Math.floor(t / 0.7)
    const escalator = (dir) => {
      for (let y = SLAB_Y; y <= FLOOR_Y; y++) {
        const u = (FLOOR_Y - y) / rise
        const xl = mid - dir * Math.round(run * 0.8) + dir * Math.round(u * run) - 2
        for (let x = xl + 1; x < xl + 4; x++) put(x, y, ((y + tread * (dir > 0 ? 1 : -1)) & 1) === 0 ? '_' : ' ', FAINT)
        const rail = dir > 0 ? '/' : '\\'
        // Structure, not subject (2026-10-16 design pass): DIM, below the
        // fountain, where MUTED had them level with everything else.
        put(xl, y, rail, DIM); put(xl + 4, y, rail, DIM)
      }
    }
    escalator(-1)
    escalator(1)

    // --- the palms, framing the foreground -----------------------------------
    const palmX = [Math.round(cols * 0.11) - 5, cols - Math.round(cols * 0.11) - 6]
    // Opaque inside their outline, so the wall and the seams do not show
    // through the fronds.
    for (const px of palmX) {
      PALM.forEach((row, r) => {
        const y = H - PALM.length + r
        const first = row.search(/\S/), last = row.length - 1 - [...row].reverse().join('').search(/\S/)
        for (let c = first; c <= last; c++) put(px + c, y, row[c], r < 3 ? MUTED : r < 6 ? DIM : MUTED)
      })
    }

    // --- the fountain ---------------------------------------------------------
    const bl = mid - BASIN_HALF, br = mid + BASIN_HALF
    for (let x = bl; x <= br; x++) for (let y = RIM_Y; y <= FRONT_Y; y++) put(x, y, ' ')
    // The basin, one solid object (2026-10-16 design pass): box rules at
    // NORMAL, the old '.-‾‾‾-.' oval having read as a few dim dashes.
    put(bl, RIM_Y, '╭', NORMAL); put(br, RIM_Y, '╮', NORMAL)
    for (let x = bl + 1; x < br; x++) put(x, RIM_Y, '─', NORMAL)
    put(bl, FRONT_Y, '╰', NORMAL); put(br, FRONT_Y, '╯', NORMAL)
    for (let x = bl + 1; x < br; x++) put(x, FRONT_Y, '─', NORMAL)
    put(bl, WATER_Y, '│', NORMAL); put(br, WATER_Y, '│', NORMAL)
    // Water: dark, with rings running slowly out from where the jet falls --
    // one when quiet, up to three loud, so loudness swells in the water
    // rather than speckling it. Each ring takes RING_S to cross the basin;
    // the rings are evenly spaced in phase, so adding one never jumps the
    // others. On the kick, foam opens from the jet and closes as the spurt
    // dies -- the basin's half of the burst.
    const rings = muted ? 1 : 1 + Math.round(level * 2)
    for (let r = 0; r < rings; r++) {
      const ph = ((t / RING_S) + r / 3) % 1
      const dx = 2 + Math.round(ph * (BASIN_HALF - 4))
      const a = ph < 0.6 ? DIM : FAINT
      for (const d of [-1, 1]) { put(mid + d * dx, WATER_Y, '~', a); put(mid + d * (dx + 1), WATER_Y, '~', a) }
    }
    if (spurt > 0.45) {
      const fw = Math.round(BASIN_HALF * Math.min(1, (spurt - 0.3) * 1.6))
      for (let x = mid - fw; x <= mid + fw; x++) if (x > bl && x < br) put(x, WATER_Y, '≈', NORMAL)
    }
    // The stem and the upper bowl.
    for (let y = BOWL_Y + 1; y < RIM_Y; y++) put(mid, y, '║', NORMAL)
    // Everything from here up is clipped at JET_CEIL_Y, so no level and no
    // kick can lift the fountain into the escalators.
    const fput = (x, y, c, a) => { if (Math.round(y) >= JET_CEIL_Y) put(x, y, c, a) }
    text(mid - 3, BOWL_Y, '\\_____/', NORMAL)
    // Overflow arcs: from the bowl's lips down into the basin, reaching
    // further the louder it is.
    const reach = muted ? 2 : 2 + Math.round(level * 6)
    for (const d of [-1, 1]) {
      for (let k = 1; k <= reach; k++) {
        const x = mid + d * (3 + k)
        const y = BOWL_Y + Math.round(((k * k) / (reach * reach)) * (WATER_Y - 1 - BOWL_Y))
        // The arc runs on into the basin behind its rim: never written over
        // the rim, which is one solid line (2026-10-16 design pass).
        if (y >= RIM_Y) continue
        put(x, y, k === reach ? ',' : '.', k < reach / 2 ? MUTED : DIM)
      }
    }
    // The centre jet: a trickle when muted, a column one or two rows tall by
    // level, sheathed in falling water either side once it stands two rows,
    // so it reads as water and not as a guide line. The kick fills it to the
    // ceiling, puts a crown on it and throws a wide spray that falls back
    // into the basin while the spurt lasts.
    const rest = muted ? 0 : level > 0.45 ? 2 : 1
    const jet = Math.min(BOWL_Y - JET_CEIL_Y - 1, rest + (spurt > 0.3 ? 2 : 0))
    const top = BOWL_Y - jet
    if (spurt > 0.3) {
      // Drawn before the jet, so a droplet never breaks the column of water.
      const s1 = 1 - spurt
      for (let k = 0; k < SPRAY; k++) {
        const vx = (hash2(k, Math.floor(p._driftSpurtAt * 10)) - 0.5) * 2
        const x = mid + vx * (3 + s1 * 9)
        const y = JET_CEIL_Y + s1 * s1 * 5 + (k & 1)
        fput(x, y, k & 1 ? "'" : '.', k < 4 ? NORMAL : MUTED)
      }
    }
    for (let y = BOWL_Y - 1; y >= top; y--) {
      fput(mid, y, y === top ? '¦' : '│', NORMAL)
      if (jet >= 2 && y > top) { fput(mid - 1, y, ':', MUTED); fput(mid + 1, y, ':', MUTED) }
    }
    if (spurt > 0.3) fput(mid, top - 1, '*', spurt > 0.6 ? BRIGHT : NORMAL)

    // --- out to the grid: every canvas cell, every frame ----------------------
    for (let y = 1; y < H; y++) {
      for (let x = 0; x < W; x++) term.put(x, y, ch[y * W + x], at[y * W + x])
    }
  },
}
