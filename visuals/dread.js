// SIGNAL -- visualizer effect "DREAD" (label DROP FORGE). Split out of
// program.js in the 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.
//
// 2026-10-18 (second design pass) -- DROP FORGE, in beam pixels.
//
// What Matt said, of the 2026-10-16 press line live on build 2026-10-18.1:
// "Dread same." -- same as its three siblings in that batch: still needs
// work, try a different style. What was wrong, from a capture of the real
// tube: five box-drawn presses read as a thin OUTLINE schematic -- clip art,
// not machinery -- and the KICK tile was indistinguishable from LOUD. The
// slam held the centre ram on the bed for 0.14s, which a viewer at 60fps
// sees as a flicker and a ~3fps capture almost never catches; once it was
// gone nothing on the screen remembered it had happened.
//
// What this is instead:
//
//   - STYLE: per-cell pixel bitmaps (putGlyph), as FLAME does -- the one
//     rebuild Matt approved live. Every part is MASS: a 4x4 ordered dither
//     at a density per material, so iron is a shaded body with a lit edge
//     rather than a box-drawing outline, and nothing is fully lit except
//     thin edges and the hot metal. Under the forced red phosphor a dithered
//     body is texture, where the old full '█' panels bloomed into a wall.
//   - SUBJECT: one steam drop hammer, in close-up -- the cylinder running
//     off the top of the picture, the polished piston rod, the tup (the
//     hammer head) riding between two riveted standards, the anvil, and on
//     it a billet of red-hot steel. One machine, not a line of five: the
//     press line's "hostile machinery" kept, at a scale that reads as a
//     thing rather than a diagram. The forge suits NIN's industrial palette
//     and the forced red tint at once -- red is what hot steel looks like.
//   - THE BEAT: the kick DROPS the hammer. It lands on the billet in one
//     frame, sits there SLAM_HOLD_S, then is hauled back up over RETRACT_S
//     -- and, the fix for the old flicker, the blow leaves CONSEQUENCES that
//     outlast it: the billet flashes white-hot and cools over ~a second,
//     sparks spray off both ends and fall under gravity, steam bursts from
//     the cylinder's exhaust ports, and the picture jolts down a few pixels
//     (the set shaking with the floor). Between blows the hammer hangs at a
//     ready height set by the level and trembles on the bass. So LOUD is a
//     raised hammer over a glowing billet; KICK is a hammer low, sparks in
//     the air, steam, the billet blazing -- different at a glance.
//   - THE WRONGNESS stays: the tear (since the 45th pass) now shears one
//     cell-row band of PIXELS sideways -- the horizontal hold letting go --
//     on some kicks and at a rare ambient rate, never metronomic.
//
// The rubric, point by point:
//   1. ONE SUBJECT: a drop hammer over hot steel. Nameable in two seconds.
//   2. ONE MUSICAL ELEMENT: the hammer blow (drop, glow, sparks, steam are
//      one event and its aftermath). Level sets the ready height and the
//      billet's resting heat, bass a tremor in the hanging head; the only
//      thing that moves on its own is the tear, which is the point of it.
//   3. BRIGHTNESS ORDER: hot billet and young sparks brightest (BRIGHT only
//      on the white-hot core and a few sparks, capped by the test); the
//      tup's lit edges and the rod NORMAL; standards, crosshead, cylinder,
//      anvil MUTED edges over DIM bodies; back-wall girders DIM and sparse;
//      background dark.
//   4. SHAPES, NOT SOUP: no shade-block characters at all -- every lit cell
//      is a dithered bitmap, and bodies stay at or under half density.
//   5. FOUR STATES: NO TAP drives the blows off syntheticAudio's pulse
//      (~one per 0.9s). MUTED is the forge shut down: the hammer parked
//      fully raised (as a real one is, for safety), the machine one tier
//      dimmer, no blows, sparks, steam or tears -- and the billet a dull
//      ember breathing slowly, so it is faint but not dead. Quiet: the
//      hammer hangs low over a dim billet. Loud: raised high, billet hot.
//   6. REAL-RADIO TEST: the picture in a set's window -- a newsreel of a
//      steelworks is exactly what a 1950s screen showed.
//
// State: p._dreadTear keeps its { active, row, until, shift } shape for
// tests/visuals.test.mjs's M5 test (`shift` is now in pixels). The slam
// clocks (_dreadKickAt, _dreadPrevKickAt) and _dreadLastT are effect-clock
// values and reset() clears them; heat and lift are levels, not times.
// Sparks and steam are a pure function of the kick time and a per-kick seed,
// so there is no particle list to leak across visits.
//
// Cost, measured: the first cut repainted and re-dithered the whole
// 640x336 picture every frame and drew in ~25-50ms on the dev box (FLAME,
// for comparison, ~23ms). Now the still machine is painted once per width
// and copied in, the glow and steam are cached per step, the picture
// re-renders at RENDER_HZ (and at once on a blow), unchanged cell rows are
// re-put rather than re-packed, and uniform 8-pixel runs take a word-compare
// fast path: ~5ms. The packer is split into small functions on purpose --
// as one four-deep loop V8 kept deoptimising it on OSR exit.
//
// Judging it from tools/viz-sheet.mjs captures: the KICK tile is taken a
// couple of rendered frames after the onset, which at swiftshader's ~0.3fps
// under load is seconds of app time -- past the drop and the sparks. What a
// capture can show is the aftermath (the bigger glow, the brighter billet);
// the blow itself shows in a capture taken on a slowed page clock, and
// needs a person at 60fps. The forced red phosphor is part of how this looks:
// judge it on NIN ([0]), not on preset 2's tint.
//
// 2026-10-20 (polish; the design critique of the real-tube sheet). Subject,
// beat and MUTED passed; four things did not:
//   - THE HEAD read as a mosaic: three flank densities and two rib stripes
//     under a NORMAL outline, so with a cell taking its brightest pixel's
//     tier the face broke into rectangular blocks. Now one tier (NORMAL) and
//     one density (TUP_DENS) for rod, head, ears, bolts and die, lit only on
//     the top and left faces; the die warms by density, not by a tier step.
//   - THE HAZARD FLOOR was nearly as bright as the billet: it shared the
//     floor line's cell row and so its MUTED. Now FAINT, from the next row.
//   - THE TEAR left glyph debris in the margins: the band could land on bare
//     air, and the gap it slid out of filled with noise. Now every tear runs
//     through the hammer head (the hammer itself slips) and the gap is dark.
//   - THE GHOST. KICK(+34) showed the raised head hanging above the landed
//     one; the critic suspected persistence at the capture's 2.7fps. It is
//     persistence, but NOT a low-fps artefact: viz-sheet slows the page
//     clock to ~60 app-frames per second, the beam's decay is rescaled per
//     frame (decayForFrame), and NIN has no decay of its own (the base 0.75),
//     so two frames after the blow the raised head is still 0.75^2 = 56% lit
//     and under 10% only after ~8 frames (~130ms) -- exactly what a viewer at
//     60fps sees. viz-preview, which has no persistence, shows no ghost. The
//     cause is the drop itself: the head teleports from ready to contact in
//     one frame. Rather than slow the blow (it must land ON the beat), the
//     air it fell through now holds a dithered smear for STREAK_S, densest at
//     the head, so the afterglow joins the landed head as one motion.
//     (Sparse vertical speed lines were tried first and read as bristles.)
//
// ---- older history, condensed ----
// DREAD (45th pass, the secret station) was a coarse panel grid flickering
// erratically with occasional full-row tears -- the one visual meant to read
// as a little wrong to look at, matching NIN's harshest CRT signature (the
// 12-30s idle events, the grind layer) and its forced red bleed on lock.
// 2026-08-23 (live audio tap): a hard bass onset forced a full-row tear in
// addition to the ambient roll; flashCrtGlitch on extreme hits was
// considered and left OUT (that glyph of meaning belongs to real playback
// errors alone -- still true, so the jolt here is drawn, not a tube glitch).
// 2026-09-12 (audit M5): a tear active at exit came back as a held strobe,
// since `until` is on the effect clock -- reset() clears it.
// 2026-10-16 (design pass): redrawn as a five-press line in box drawing with
// the centre press slamming on the kick and the tear turned into a sideways
// slip; no fallback before that (it read p._au raw). Rejected live 2026-10-18,
// above.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- the kick -----------------------------------------------------------------
// A rise in `pulse` of at least BEAT_RISE since the last frame (or a real
// onset), at least KICK_GAP_S after the last blow.
export const BEAT_RISE = 0.2
export const KICK_GAP_S = 0.22
// The hammer sits on the billet this long, then is hauled back up over
// RETRACT_S, eased IN (slow off the billet, quick at the top): heavy, and a
// frame half a second after the blow still finds it low. At a dance tempo
// the next blow lands before it is home, which is the right look for this
// station -- a hammer that never gets to rest.
export const SLAM_HOLD_S = 0.1
export const RETRACT_S = 0.7
// The aftermath: sparks fly this long, steam lingers this long, the jolt
// lasts this long, and the billet cools from white-hot with HEAT_TAU_S.
export const SPARK_S = 0.9
export const STEAM_S = 1.3
export const JOLT_S = 0.07
export const JOLT_PX = 3
export const HEAT_TAU_S = 0.9
export const SPARKS = 20
// Tears: share of blows that also tear, ambient tears per second (none
// muted), and the longest a tear holds.
export const KICK_TEAR_CHANCE = 0.35
export const AMBIENT_TEAR_RATE = 0.3
export const TEAR_MAX_S = 0.18
export const RENDER_HZ = 30
// The head's body density (of 16), and how long the drop's speed lines last.
export const TUP_DENS = 5
export const STREAK_S = 0.09

// --- the picture, in canvas pixels (y 0 = the top of canvas row 1) --------------
// Rows are fixed (the canvas is rows 1..VIZ_BOT-1); columns are centred on
// the grid, so every width gets the same machine.
export const FLOOR_Y = 312
export const ANVIL_TOP = 236
export const BILLET_TOP = 220
export const TUP_H = 84            // body + die
export const CONTACT_TOP = BILLET_TOP - TUP_H   // tup top when it strikes
export const RAISED_TOP = 66       // tup top fully raised
export const CYL_BOT = 56

// Tiers, dimmest first; a material packs (tier + 1) << 5 | density (0..16).
const TIERS = [FAINT, DIM, MUTED, NORMAL, BRIGHT]
const T_FAINT = 0, T_DIM = 1, T_MUTED = 2, T_NORMAL = 3, T_BRIGHT = 4
const mat = (tier, dens) => ((tier + 1) << 5) | Math.max(0, Math.min(16, dens | 0))
// 4x4 ordered dither: a regular screen reads as a treatment, scattered as noise.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const clamp01 = (v) => Math.max(0, Math.min(1, v))

/** Ready height (0 = on the billet, 1 = fully raised) for a level. */
export const readyLift = (level) => 0.45 + 0.5 * clamp01(level)
/** Tup top in canvas pixels for a lift. */
export const tupTop = (lift) => Math.round(CONTACT_TOP - (CONTACT_TOP - RAISED_TOP) * clamp01(lift))

export default {
  key: 'dread',
  label: 'DROP FORGE',
  /** Seeds this effect's state on the program object (once, at boot). The
   *  pixel buffers are built on first draw (FLAME's reason: most sessions
   *  never open this, and the dead-feedback sweep keeps every boot alive). */
  init(p) {
    p._dreadTear = { active: false, row: 0, until: 0, shift: 0 }
    p._dreadFx = null
    p._dreadKickAt = -Infinity
    p._dreadPrevKickAt = -Infinity
    p._dreadKicks = 0
    p._dreadPrevPulse = 0
    p._dreadLastT = null
    p._dreadHeat = 0.4
    p._dreadLift = 0.7
    p._dreadDropFrom = RAISED_TOP   // where the head fell from (a position)
    p._dreadTopPrev = null
  },
  /** Re-arms clocks on every visualizer entry. */
  reset(p) {
    // 2026-09-12 (audit, M5) -- `until` is an absolute effect-clock value: a
    // tear active at exit came back on re-entry held until the restarted
    // clock passed the old `until`, and `!tear.active` gates both triggers.
    // 2026-10-16 -- the slam clocks too: a _dreadKickAt left at t=120 would
    // hold the hammer on the billet (and refuse every kick) for two minutes.
    p._dreadTear.active = false
    p._dreadKickAt = -Infinity
    p._dreadPrevKickAt = -Infinity
    p._dreadPrevPulse = 0
    p._dreadLastT = null
  },
  alloc(p, term) {
    const { cellW, cellH } = term.font
    const rows = VIZ_BOT - 1
    const n = term.cols * rows
    const big0 = new Uint16Array(n * cellH), big1 = new Uint16Array(n * cellH)
    const views = (big) => Array.from({ length: n }, (_, i) => big.subarray(i * cellH, (i + 1) * cellH))
    const size = term.cols * cellW * rows * cellH
    const M = new Uint8Array(size), prev = new Uint8Array(size)
    p._dreadFx = {
      cols: term.cols, rows, cellW, cellH,
      W: term.cols * cellW, H: rows * cellH,
      mat: M, prev,
      // Word views for the unchanged-row test (cellW * cols is a multiple of 4).
      mat32: new Uint32Array(M.buffer), prev32: new Uint32Array(prev.buffer),
      base: null,
      lastKey: '',
      lit: new Uint8Array(n),
      glowCache: new Map(), steamCache: new Map(),
      lastRender: -Infinity, lastMuted: false, lastTear: 0, lastJolt: 0,
      // Two bitmaps per cell: a same-reference putGlyph() is a no-op, so a
      // changed cell gets the other buffer; an unchanged one is re-put with
      // the same reference (free, and restores a cell something overwrote).
      // Two bitmaps per cell, as views into two flat arrays: packLine writes
      // the flat ones (one monomorphic typed array), putGlyph gets the views.
      big0, big1, bufs: [views(big0), views(big1)],
      front: new Uint8Array(n),
      attr: new Uint8Array(n),
      tops: new Int8Array(term.cols),
      anys: new Uint16Array(term.cols),
    }
  },
  draw(p, s, t) {
    const { term } = s
    if (!p._dreadFx || p._dreadFx.cols !== term.cols) this.alloc(p, term)
    const F = p._dreadFx
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    if (p._dreadLastT != null && t < p._dreadLastT) p._dreadLastT = null
    const dt = p._dreadLastT == null ? 0 : Math.min(0.1, t - p._dreadLastT)
    p._dreadLastT = t

    // --- the blow -------------------------------------------------------------
    const pulse = A.pulse || 0
    let kicked = false
    if (!muted && t - p._dreadKickAt >= KICK_GAP_S &&
        (pulse - p._dreadPrevPulse >= BEAT_RISE || A.onset)) {
      p._dreadPrevKickAt = p._dreadKickAt
      p._dreadKickAt = t
      p._dreadDropFrom = p._dreadTopPrev ?? RAISED_TOP
      p._dreadKicks++
      kicked = true
    }
    p._dreadPrevPulse = pulse
    const since = t - p._dreadKickAt

    // Heat: white-hot on a blow, cooling toward a level-set glow; muted, a
    // dull ember breathing.
    const glowTo = muted ? 0.16 + 0.1 * Math.sin(t * 0.9) : 0.3 + 0.35 * clamp01(A.level) + 0.15 * clamp01(A.bass)
    if (kicked) p._dreadHeat = 1.4
    else if (dt === 0) p._dreadHeat = Math.max(p._dreadHeat, glowTo)
    else p._dreadHeat += (glowTo - p._dreadHeat) * (1 - Math.exp(-dt / HEAT_TAU_S))
    if (muted) p._dreadHeat = Math.min(p._dreadHeat, 0.3)
    const heat = p._dreadHeat

    // Lift: on the billet, then hauled back up to the ready height.
    const ready = muted ? 1 : readyLift(A.level)
    p._dreadLift += (ready - p._dreadLift) * (dt === 0 ? 1 : Math.min(1, dt * 4))
    let lift
    if (since < SLAM_HOLD_S) lift = 0
    else if (since < SLAM_HOLD_S + RETRACT_S) lift = p._dreadLift * ((since - SLAM_HOLD_S) / RETRACT_S) ** 2
    else lift = p._dreadLift
    const tremor = muted || lift === 0 ? 0 : Math.round(Math.sin(t * 37) * 1.6 * clamp01(A.bass))
    const top = Math.min(CONTACT_TOP, tupTop(lift) + tremor)
    p._dreadTopPrev = top

    // --- tears ----------------------------------------------------------------
    const tear = p._dreadTear
    if (!muted && !tear.active) {
      const kickTear = kicked && Math.random() < KICK_TEAR_CHANCE
      if (kickTear || Math.random() < AMBIENT_TEAR_RATE * dt) {
        tear.active = true
        // 2026-10-20: through the hammer head, never bare margin -- a band
        // torn across empty air left a few sheared girder fragments
        // floating at the frame's edge, which read as a rendering bug.
        // Across the head, the hammer itself visibly slips.
        tear.row = 1 + Math.floor((top + 8 + Math.random() * (TUP_H - 24)) / F.cellH)
        const mag = 12 + Math.floor(Math.random() * 36)
        tear.shift = Math.random() < 0.5 ? -mag : mag
        tear.until = t + 0.08 + Math.random() * (TEAR_MAX_S - 0.08)
      }
    }
    if (tear.active && t > tear.until) tear.active = false

    // Heat is painted in 1/16 steps, so a slowly cooling billet changes the
    // picture a few times a second rather than every frame (compose skips
    // cell rows whose pixels did not change).
    const jolt = !muted && since < JOLT_S ? JOLT_PX : 0
    // The picture is re-rendered at RENDER_HZ, and at once on a blow; the
    // frames between re-put what is there (every cell, so the canvas
    // contract holds). Measured on the dev box, a render is several ms --
    // at 60Hz that was the whole frame budget, for motion nobody can see
    // at that rate. A clock that went backwards (re-entry) renders.
    const tearKey = tear.active ? tear.row * 1000 + tear.shift : 0
    if (kicked || muted !== F.lastMuted || tearKey !== F.lastTear || jolt !== F.lastJolt ||
        t < F.lastRender || t - F.lastRender >= 1 / RENDER_HZ) {
      F.lastRender = t
      F.lastMuted = muted
      F.lastTear = tearKey
      F.lastJolt = jolt
      paintForge(F, p, t, top, Math.round(heat * 16) / 16, since, muted)
      compose(F, term, muted, jolt, tear.active ? tear : null)
    } else {
      for (let cy = 0; cy < F.rows; cy++) reputRow(F, term, cy)
    }
  },
}

// --- painting the material buffer --------------------------------------------------

function rect(F, x0, y0, x1, y1, v) {
  const { W, H, mat: M } = F
  x0 = Math.max(0, Math.round(x0)); x1 = Math.min(W, Math.round(x1))
  y0 = Math.max(0, Math.round(y0)); y1 = Math.min(H, Math.round(y1))
  if (x1 <= x0) return
  for (let y = y0; y < y1; y++) M.fill(v, y * W + x0, y * W + x1)
}
/** A body with a lit border `e` pixels thick. */
function block(F, x0, y0, x1, y1, body, edge, e = 2) {
  rect(F, x0, y0, x1, y1, edge)
  rect(F, x0 + e, y0 + e, x1 - e, y1 - e, body)
}
function dot(F, x, y, v, r = 1) { rect(F, x - r, y - r, x + r, y + r, v) }

/** Everything that never moves, painted once per grid width: back wall,
 *  floor, standards, crosshead, cylinder, anvil. */
function paintBase(F) {
  const H = F.H
  const { W, mat: M } = F
  M.fill(0)
  const cx = W >> 1

  // Back wall: two far girders, sparse and dim -- scenery behind scenery.
  for (const gx of [cx - 252, cx + 228]) {
    rect(F, gx, 0, gx + 24, FLOOR_Y, mat(T_DIM, 2))
    rect(F, gx, 0, gx + 2, FLOOR_Y, mat(T_DIM, 6))
    rect(F, gx + 22, 0, gx + 24, FLOOR_Y, mat(T_DIM, 6))
    for (let y = 30; y < FLOOR_Y; y += 64) rect(F, gx - 4, y, gx + 28, y + 3, mat(T_DIM, 5))
  }

  // Floor, and hazard striping under it. 2026-10-20: the striping down a
  // tier to FAINT, and started on a cell-row boundary below the floor
  // line's row -- sharing that row, it was lifted to the line's MUTED and
  // read nearly as bright as the billet.
  rect(F, cx - 300, FLOOR_Y, cx + 300, FLOOR_Y + 2, mat(T_MUTED, 16))
  const hz0 = Math.ceil((FLOOR_Y + 3) / F.cellH) * F.cellH
  for (let y = hz0; y < Math.min(H, hz0 + 14); y++) {
    for (let x = Math.max(0, cx - 300); x < Math.min(W, cx + 300); x++) {
      if (((x + y) & 15) < 7) M[y * W + x] = mat(T_FAINT, 9)
    }
  }

  // The standards: two riveted columns the tup rides between.
  for (const [x0, x1] of [[cx - 150, cx - 112], [cx + 112, cx + 150]]) {
    block(F, x0, 58, x1, FLOOR_Y, mat(T_DIM, 3), mat(T_MUTED, 16))
    for (let y = 80; y < FLOOR_Y - 30; y += 28) { dot(F, x0 + 8, y, mat(T_MUTED, 16)); dot(F, x1 - 8, y, mat(T_MUTED, 16)) }
    // Hazard bands at the foot.
    for (let y = FLOOR_Y - 26; y < FLOOR_Y - 2; y++) {
      for (let x = x0 + 2; x < x1 - 2; x++) if (((x - y) & 15) < 7) M[y * W + x] = mat(T_DIM, 6)
    }
  }

  // Crosshead and the steam cylinder, running off the top of the picture.
  block(F, cx - 162, 38, cx + 162, 60, mat(T_DIM, 3), mat(T_MUTED, 16))
  for (let x = cx - 150; x <= cx + 150; x += 30) dot(F, x, 49, mat(T_MUTED, 16))
  block(F, cx - 46, -4, cx + 46, CYL_BOT, mat(T_DIM, 4), mat(T_MUTED, 16))
  for (const y of [8, 22, 36]) rect(F, cx - 46, y, cx + 46, y + 3, mat(T_MUTED, 8))
  // Exhaust ports either side of the cylinder.
  rect(F, cx - 62, 14, cx - 46, 22, mat(T_MUTED, 16))
  rect(F, cx + 46, 14, cx + 62, 22, mat(T_MUTED, 16))

  // The anvil: a flared block, its face lit.
  for (let y = ANVIL_TOP; y < FLOOR_Y; y++) {
    const k = (y - ANVIL_TOP) / (FLOOR_Y - ANVIL_TOP)
    const hw = 78 + 30 * k * k
    rect(F, cx - hw, y, cx + hw, y + 1, mat(T_MUTED, 16))
    rect(F, cx - hw + 2, y, cx + hw - 2, y + 1, mat(T_DIM, 3))
  }
  rect(F, cx - 78, ANVIL_TOP, cx + 78, ANVIL_TOP + 5, mat(T_MUTED, 10))

  return M.slice()
}

function paintForge(F, p, t, top, heat, since, muted) {
  const { W, H, mat: M } = F
  if (!F.base) F.base = paintBase(F)
  M.set(F.base)
  const cx = W >> 1

  // The glow of the billet lights the air around it (behind the iron, so
  // it only lands on empty pixels). Cached per painted heat step.
  if (heat > 0.25) {
    let g = F.glowCache.get(heat)
    if (!g) F.glowCache.set(heat, g = glowFor(W, H, heat))
    const { idx, val } = g
    for (let k = 0; k < idx.length; k++) if (M[idx[k]] === 0) M[idx[k]] = val[k]
  }

  // The piston rod: polished, a lit stripe down one side. NORMAL, the
  // head's own tier (rod and tup are one moving part; 2026-10-20).
  rect(F, cx - 7, CYL_BOT, cx + 7, top, mat(T_NORMAL, 5))
  rect(F, cx - 4, CYL_BOT, cx - 1, top, mat(T_NORMAL, 16))

  // The drop, as a smear (2026-10-20): for STREAK_S after a blow, the air
  // the head fell through holds a dithered blur of it, densest at the head
  // and thinning upward, so the tube's afterglow of the raised head (see
  // the polish note in the header) joins the landed one as one motion
  // instead of reading as a second hammer hanging above it. (Sparse
  // vertical speed lines were tried first: they read as a comb of bristles
  // standing on the head.)
  if (!muted && since < STREAK_S && p._dreadDropFrom < top) {
    const fade = 1 - since / STREAK_S, y0 = p._dreadDropFrom
    for (let y = Math.max(0, y0 | 0); y < top; y++) {
      const k = (y - y0) / Math.max(1, top - y0)
      const d = Math.round(7 * fade * k)
      if (d > 0) rect(F, cx - 86, y, cx + 86, y + 1, mat(T_MUTED, d))
    }
  }

  // The billet: hot steel. Squashed flatter and wider just after a blow.
  const fresh = !muted && since < 0.35
  const sq = fresh ? 4 : 0
  const by0 = BILLET_TOP + sq, bw = 40 + sq * 2
  const hotBody = heat > 0.85 ? mat(T_NORMAL, 16) : heat > 0.5 ? mat(T_NORMAL, 10 + Math.round((heat - 0.5) * 16))
    : heat > 0.3 ? mat(T_MUTED, 9 + Math.round((heat - 0.3) * 20)) : mat(T_DIM, 3 + Math.round(heat * 20))
  block(F, cx - bw, by0, cx + bw, ANVIL_TOP, hotBody, heat > 0.3 ? mat(T_NORMAL, 16) : mat(T_MUTED, 16), 1)
  if (heat > 1.1) rect(F, cx - 20, by0 + 4, cx + 20, ANVIL_TOP - 3, mat(T_BRIGHT, 16))

  // The tup: the hammer head. Shaded for mass -- a lit flank, a body, a
  // shadowed flank -- with a lit outline, ears riding in the standards, and
  // the die underneath, warmed by the billet as it comes down.
  // (A first cut put a square cast boss in the middle of the face; on the
  // tube it read as a window, the whole head as a cabinet. Ribs and a
  // tapered foot read as a hammer.)
  // 2026-10-20: ONE tier (NORMAL) for the whole head -- body, edges, bolts,
  // ears and die -- and one body density. The first cut shaded it in three
  // vertical flanks at three densities, crossed by two rib stripes, under a
  // NORMAL outline: with a cell taking its brightest pixel's tier, that
  // rendered as rectangular blocks at different brightnesses, a mosaic
  // rather than cast iron. Now the mass is one sparse dither lit only on
  // its top and left faces (light from above-left), so the right side and
  // the underside fall away into the dark without a drawn edge.
  const tb = top + TUP_H - 10      // the die's top
  const body = top + 56            // where the head starts to taper
  const HEAD = mat(T_NORMAL, TUP_DENS), LIT = mat(T_NORMAL, 16)
  rect(F, cx - 88, top, cx + 88, body, HEAD)
  rect(F, cx - 88, top, cx + 88, top + 2, LIT)
  rect(F, cx - 88, top, cx - 86, body, LIT)
  for (let y = body; y < tb; y++) {
    const hw = 88 - Math.round((y - body) * 18 / (tb - body))
    rect(F, cx - hw, y, cx + hw, y + 1, HEAD)
    rect(F, cx - hw, y, cx - hw + 2, y + 1, LIT)
  }
  for (const ex of [cx - 112, cx + 88]) {
    rect(F, ex, top + 10, ex + 24, top + 30, HEAD)
    rect(F, ex, top + 10, ex + 24, top + 12, LIT)
  }
  for (const bx of [cx - 74, cx - 26, cx + 26, cx + 74]) dot(F, bx, top + 9, LIT, 2)
  // The die, warmed by the billet as it comes down -- by density, in the
  // head's tier, so it never steps a tier against the taper above it.
  const near = clamp01(1 - (CONTACT_TOP - top) / 50) * Math.min(1, heat)
  rect(F, cx - 60, tb, cx + 60, tb + 10, mat(T_NORMAL, 9 + Math.round(near * 7)))
  rect(F, cx - 60, tb, cx + 60, tb + 1, LIT)

  if (muted) return

  // Sparks: the last two blows' sprays, each a pure function of its time and
  // seed -- thrown off both ends of the billet, falling under gravity.
  for (const [kt, seed] of [[p._dreadPrevKickAt, p._dreadKicks - 1], [p._dreadKickAt, p._dreadKicks]]) {
    const a = t - kt
    if (!(a >= 0 && a < SPARK_S)) continue
    for (let n = 0; n < SPARKS; n++) {
      const r1 = hash2(n, seed), r2 = hash2(seed, n + 31), r3 = hash2(n + 7, seed * 3)
      const life = 0.45 + r3 * (SPARK_S - 0.45)
      if (a > life) continue
      const side = n & 1 ? 1 : -1
      const vx = side * (70 + r1 * 260), vy = -(90 + r2 * 230)
      const x0 = cx + side * (bw - 2), y0 = BILLET_TOP + 4
      const pos = (u) => [x0 + vx * u, y0 + vy * u + 520 * u * u]
      const [xa, ya] = pos(Math.max(0, a - 0.03)), [xb, yb] = pos(a)
      const age = a / life
      const v = age < 0.15 && n < 4 ? mat(T_BRIGHT, 16) : age < 0.55 ? mat(T_NORMAL, 16) : mat(T_MUTED, 16)
      for (let k = 0; k <= 4; k++) dot(F, xa + (xb - xa) * k / 4, ya + (yb - ya) * k / 4, v, 1)
    }
  }

  // Steam: a burst from each exhaust port, billowing out and up, thinning.
  const sa = t - p._dreadKickAt
  if (sa >= 0 && sa < STEAM_S) {
    // Cached per 1/32 of its life, like the glow.
    const step = Math.min(31, Math.floor(sa / STEAM_S * 32))
    let g = F.steamCache.get(step)
    if (!g) F.steamCache.set(step, g = steamFor(W, H, (step + 0.5) / 32))
    const { idx, val } = g
    for (let k = 0; k < idx.length; k++) if (M[idx[k]] === 0) M[idx[k]] = val[k]
  }
}

/** Both steam bursts at a point `f` (0..1) in their life. */
function steamFor(W, H, f) {
  const cx = W >> 1
  const idx = [], val = [], seen = new Set()
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const r = 8 + 26 * f + k * 6
      const px = cx + side * (66 + 90 * f + k * 22), py = 18 - 10 * f + k * 10 - 20 * f * k
      const dens = Math.round(7 * (1 - f) - k)
      if (dens <= 0) continue
      for (let y = Math.max(0, py - r | 0); y < Math.min(H, py + r); y++) {
        for (let x = Math.max(0, px - r | 0); x < Math.min(W, px + r); x++) {
          const ex = x - px, ey = (y - py) * 1.2, d = Math.sqrt(ex * ex + ey * ey) / r
          const i = y * W + x
          if (d < 1 && !seen.has(i)) { seen.add(i); idx.push(i); val.push(mat(T_DIM, Math.round(dens * (1 - d * d) + 1))) }
        }
      }
    }
  }
  return { idx: Int32Array.from(idx), val: Uint8Array.from(val) }
}

/** The billet's glow at one heat: pixel indices and materials. */
function glowFor(W, H, heat) {
  const cx = W >> 1
  const bx0 = cx - 40, bx1 = cx + 40
  const gr = 24 + 64 * Math.min(1.2, heat)
  const gy = BILLET_TOP + 8
  const idx = [], val = []
  for (let y = Math.max(0, gy - gr | 0); y < Math.min(H, gy + gr * 0.7); y++) {
    for (let x = Math.max(0, bx0 - gr | 0); x < Math.min(W, bx1 + gr); x++) {
      const dx = x < bx0 ? bx0 - x : x > bx1 ? x - bx1 : 0
      const ey = (y - gy) * 1.3, d = Math.sqrt(dx * dx + ey * ey) / gr
      if (d >= 1) continue
      const f = (1 - d) * (1 - d) * Math.min(1, heat)
      const dens = Math.round(f * 9)
      if (dens > 0) { idx.push(y * W + x); val.push(mat(f > 0.45 ? T_MUTED : T_DIM, dens)) }
    }
  }
  return { idx: Int32Array.from(idx), val: Uint8Array.from(val) }
}

// --- the material buffer onto the grid -----------------------------------------------

// Dither rows for a uniform run of 8 pixels: MASK8[dens * 4 + (gy & 3)],
// leftmost pixel in the high bit. Most cell rows are one material, so most
// rows take this path instead of eight lookups.
const MASK8 = new Uint8Array(17 * 4)
for (let d = 0; d <= 16; d++) {
  for (let r = 0; r < 4; r++) {
    let m = 0
    for (let px = 0; px < 8; px++) if (BAYER[r * 4 + (px & 3)] < d) m |= 1 << (7 - px)
    MASK8[d * 4 + r] = m
  }
}

// Split into three small functions on purpose: written as one function with
// four nested loops, V8 kept deoptimising it on every exit from the
// on-stack-replaced inner loop and the draw ran at ~25ms (measured), where
// the split runs in a few.
function compose(F, term, muted, jolt, tear) {
  const { rows, cellH } = F
  const tearY0 = tear ? (tear.row - 1) * cellH : -1
  const tearY1 = tear ? tearY0 + cellH : -1
  const shiftBy = tear ? tear.shift | 0 : 0
  // A cell row whose pixels are the same as last frame's is re-put as it
  // stands -- the static machine is most of the picture. A jolt or a tear,
  // this frame or last, or a change of mute: no skipping.
  const key = jolt + ':' + (tear ? tear.row + '/' + shiftBy : '') + ':' + muted
  const force = key !== F.lastKey || jolt !== 0 || tear !== null
  F.lastKey = key
  const rowWords = (cellH * F.W) >> 2
  for (let cy = 0; cy < rows; cy++) {
    if (!force && sameWords(F.mat32, F.prev32, cy * rowWords, rowWords)) { reputRow(F, term, cy); continue }
    F.tops.fill(-1)
    F.anys.fill(0)
    for (let py = 0; py < cellH; py++) {
      const gy = cy * cellH + py
      const torn = gy >= tearY0 && gy < tearY1
      packLine(F, cy, py, gy, gy - jolt, torn ? shiftBy : 0)
    }
    putRow(F, term, cy, muted)
  }
  F.prev.set(F.mat)
}

function sameWords(a, b, o, n) {
  for (let k = o, e = o + n; k < e; k++) if (a[k] !== b[k]) return false
  return true
}

function reputRow(F, term, cy) {
  const { cols, bufs, front, attr, lit } = F
  const ci = cy * cols
  for (let cx = 0; cx < cols; cx++) {
    const i = ci + cx
    if (lit[i] === 0) term.put(cx, cy + 1, ' ')
    else term.putGlyph(cx, cy + 1, bufs[front[i]][i], attr[i])
  }
}

/** One pixel row across the grid, into each cell's back buffer. */
function packLine(F, cy, py, gy, sy, shift) {
  const { cols, cellW, cellH, W, H, big0, big1, front, tops, anys } = F
  const M = F.mat, M32 = F.mat32
  const rowOk = sy >= 0 && sy < H
  const base = sy * W
  const ph = gy & 3
  const fast = cellW === 8 && rowOk
  const ci = cy * cols
  for (let cx = 0; cx < cols; cx++) {
    const i = ci + cx
    const back = front[i] === 0 ? big1 : big0
    const at = i * cellH + py
    const x0 = cx * cellW - shift
    let row = 0, top = tops[cx]
    if (fast && x0 >= 0 && x0 + 8 <= W) {
      const o = base + x0
      const v = M[o]
      // Eight equal bytes: two equal words when aligned (the usual case).
      if ((o & 3) === 0 ? (M32[o >> 2] === v * 0x01010101 && M32[(o >> 2) + 1] === M32[o >> 2])
        : (v === M[o + 1] && v === M[o + 2] && v === M[o + 3] && v === M[o + 4] && v === M[o + 5] && v === M[o + 6] && v === M[o + 7])) {
        if (v !== 0) {
          row = MASK8[(v & 31) * 4 + ph]
          if (row !== 0 && (v >> 5) - 1 > top) top = (v >> 5) - 1
        }
        back[at] = row; anys[cx] |= row; tops[cx] = top
        continue
      }
    }
    for (let px = 0; px < cellW; px++) {
      const sx = x0 + px
      let v = 0
      if (rowOk && sx >= 0 && sx < W) v = M[base + sx]
      if (v !== 0 && BAYER[ph * 4 + (px & 3)] < (v & 31)) {
        row |= 1 << (cellW - 1 - px)
        if ((v >> 5) - 1 > top) top = (v >> 5) - 1
      }
    }
    back[at] = row; anys[cx] |= row; tops[cx] = top
  }
}

/** A finished cell row onto the grid: the changed cells get their back
 *  buffer, unchanged ones are re-put with the same reference. */
function putRow(F, term, cy, muted) {
  const { cols, cellH, bufs, front, attr, tops, anys, lit } = F
  const ci = cy * cols
  for (let cx = 0; cx < cols; cx++) {
    const i = ci + cx
    lit[i] = anys[cx] === 0 ? 0 : 1
    if (anys[cx] === 0) { term.put(cx, cy + 1, ' '); continue }
    const a = TIERS[muted ? Math.max(0, tops[cx] - 1) : tops[cx]]
    const cur = bufs[front[i]][i], back = bufs[front[i] ^ 1][i]
    let same = attr[i] === a
    for (let py = 0; same && py < cellH; py++) if (cur[py] !== back[py]) same = false
    if (same) term.putGlyph(cx, cy + 1, cur, a)
    else { front[i] ^= 1; attr[i] = a; term.putGlyph(cx, cy + 1, back, a) }
  }
}
