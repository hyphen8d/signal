// SIGNAL -- visualizer effect "DREAD". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.
//
// DREAD (45th pass, the secret station) -- was a coarse panel grid
// flickering erratically with occasional full-row tears, more hostile than
// anything else on the roster on purpose: the one visual meant to read as a
// little wrong to look at, matching NIN's own harshest CRT signature (the
// 12-30s idle events, the grind layer) and its forced red phosphor bleed on
// lock. It belongs to the station that is not supposed to be found -- no
// glyph on the dial, reached only by its own key -- and the hostility is
// the identity, so every pass here keeps it.
//
// 2026-08-23 (live audio tap) -- industrial: the picture rips on the kick.
// A hard bass onset forced a full-row tear IN ADDITION TO the ambient random
// roll (kept on purpose -- the wrongness must not become metronomic), the
// panel grid churned with the level, and treble hiss made the cells fizz.
// The single-tear state is its own throttle for back-to-back hits.
// (flashCrtGlitch on extreme hits was considered and left OUT -- a
// whole-screen chroma/roll spike is a taste call left for live QA, and that
// glyph of meaning belongs to real playback errors alone. Still true.)
//
// 2026-10-16 (design pass) -- REDRAW. The critique, from a capture of the
// real tube: no subject (a random grid of solid rectangles); the worst slab
// glare in the set (BRIGHT '█' in 4x3 panels, which the forced red tint
// blooms into a wall); no fallback (it read p._au raw, so NO TAP and MUTED
// were the same random churn as LOUD); and no visible beat. Now:
//
//   - THE SUBJECT is a press line: a bank of five hydraulic presses hung
//     from a riveted gantry over their anvils, hazard tape on the floor.
//     Every machine part is an OUTLINE with a dark interior -- the old
//     panels' "hostile machinery" survives as machinery, not as slabs. The
//     only shade blocks are the anvils ('▓', DIM): mass, as the rubric
//     allows, and dim enough not to bloom.
//   - THE KICK slams the centre press. A rising edge on `pulse` (or a real
//     onset) drops its ram onto the bed in one frame, holds it there for
//     SLAM_HOLD_S with the die teeth BRIGHT and sparks thrown off the
//     contact, then hauls it back up over RETRACT_S. Between kicks the four
//     side presses ride the spectrum (two bands each, smoothed), and never
//     reach the bed -- so LOUD is a machine working and KICK is the one
//     blow, which is the LOUD-vs-KICK contrast the rubric asks for.
//   - THE TEAR is kept, and changed shape: a torn row is now SHEARED
//     sideways a few cells (the picture slipping, the way a real set's
//     horizontal hold lets go) instead of a full row of BRIGHT '█' -- that
//     row was the single largest source of the glare. Same state object, same
//     two triggers: some kicks tear (not all of them -- the wrongness still
//     must not become metronomic) and an ambient random tear, now at a
//     per-SECOND rate rather than per frame, so it no longer depends on the
//     frame rate.
//   - FALLBACKS: syntheticAudio(t) with no tap, SILENT_AUDIO when muted, as
//     every rebuilt effect does. Muted, the line is powered down: rams
//     parked up, the whole machine a tier dimmer, the lamp steady, no
//     tears -- faint, never blank.
//   - A warning lamp over the gantry blinks slowly: the one piece of ambient
//     life that runs when the audio is steady and quiet.
//
// Brightness order: ram heads NORMAL (the subject), housings/rods/gantry
// MUTED/DIM (scenery), anvils DIM, background dark. BRIGHT is only ever the
// slammed die's teeth, a few sparks and the lamp on the kick;
// tests/visual-dread.test.mjs caps it, and '█' is gone entirely.
//
// State contract kept for tests/visuals.test.mjs's M5 test: p._dreadTear is
// still { active, row, until } on the effect clock, a tear lasts at most
// 0.18s, and reset() clears it. It gains a `shift` field. p._dreadGrid and
// the DREAD_CELLS_* exports are gone with the panel grid (nothing else read
// them).

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- the kick -----------------------------------------------------------------
// BOOM BAP's edge: a rise in `pulse` of at least BEAT_RISE since the last
// frame, at least KICK_GAP_S after the last slam.
export const BEAT_RISE = 0.2
export const KICK_GAP_S = 0.22
// The ram sits on the bed this long after a kick (the blow), then is hauled
// back up over RETRACT_S. The hold is long enough to survive a ~3fps capture
// some of the time and to read as a hit, not a flicker, at 60fps.
export const SLAM_HOLD_S = 0.14
export const RETRACT_S = 0.32
export const SPARK_S = 0.3
// Share of kicks that also tear a row (the rest just slam).
export const KICK_TEAR_CHANCE = 0.5
// Ambient tears per second while playing (none muted). The old per-frame
// 0.012 was ~0.7/s at 60fps; this is calmer, since the slam now carries the
// beat and a tear should feel like the set misbehaving, not a second rhythm.
export const AMBIENT_TEAR_RATE = 0.3
export const TEAR_MAX_S = 0.18

// --- geometry -----------------------------------------------------------------
// Rows are fixed (the canvas is always rows 1..VIZ_BOT-1).
export const LAMP_Y = 1
export const GANTRY_Y0 = 2           // girder, truss, girder: rows 2..4
export const HOUSING_Y0 = 5          // cylinder housings: rows 5..7
export const RAM_UP = 8              // ram head top row, parked
export const BED_Y = 18              // the die plate the rams strike
export const RAM_DOWN = BED_Y - 4    // head top row when struck: teeth on row 17
export const SIDE_TRAVEL = 3         // side rams never come within 3 rows of the bed
export const ANVIL_Y0 = 19, ANVIL_Y1 = 20
export const TAPE_Y = 21

const LAYOUTS = new Map()
/** Column layout for a grid width: five presses, the centre one widest.
 *  Pure function of `cols`, cached. */
export function dreadLayout(cols) {
  let L = LAYOUTS.get(cols)
  if (L) return L
  const W = Math.min(76, cols - 4)
  const cw = 16
  const gap = Math.max(2, Math.floor((W - cw - 40) / 4))
  const sw = Math.max(6, Math.floor((W - cw - 4 * gap) / 4))
  const span = 4 * sw + cw + 4 * gap
  const mx0 = Math.floor((cols - span) / 2)
  const presses = []
  let x = mx0
  // Bands per side press: low end outermost-left, top end outermost-right.
  const bands = [[0, 1], [2, 3], null, [5, 6], [7, 8]]
  for (let i = 0; i < 5; i++) {
    const w = i === 2 ? cw : sw
    presses.push({ x0: x, w, center: i === 2, bands: bands[i], rodL: x + 2, rodR: x + w - 3 })
    x += w + gap
  }
  L = { cols, mx0, mx1: mx0 + span - 1, presses, center: presses[2] }
  LAYOUTS.set(cols, L)
  return L
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const C_SPACE = 32
const LABEL = '▲ 200 TON ▲'

/** One press: housing, twin rods, ram head and its die teeth. */
function drawPress(term, P, ramTop, aHead, aBody, aTeeth) {
  const { x0, w, rodL, rodR } = P
  const x1 = x0 + w - 1
  // Housing.
  for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1
    term.put(x, HOUSING_Y0, x === x0 ? '┌' : x === x1 ? '┐' : '─', aBody)
    term.put(x, HOUSING_Y0 + 1, edge ? '│' : ' ', aBody)
    term.put(x, HOUSING_Y0 + 2, x === x0 ? '└' : x === x1 ? '┘' : (x === rodL || x === rodR) ? '┬' : '─', aBody)
  }
  if (P.center) {
    const lx = x0 + Math.floor((w - LABEL.length) / 2)
    for (let i = 0; i < LABEL.length; i++) term.put(lx + i, HOUSING_Y0 + 1, LABEL[i], aBody)
  } else {
    term.put(x0 + Math.floor(w / 2), HOUSING_Y0 + 1, '◘', aBody)
  }
  // Rods, down to the head.
  for (let y = RAM_UP; y < ramTop; y++) {
    term.put(rodL, y, '║', aBody)
    term.put(rodR, y, '║', aBody)
  }
  // Head: outline, dark interior, a bolt at each end.
  for (let x = x0; x <= x1; x++) {
    const top = x === x0 ? '╔' : x === x1 ? '╗' : (x === rodL || x === rodR) ? '╧' : '═'
    term.put(x, ramTop, top, aHead)
    const mid = (x === x0 || x === x1) ? '║' : (x === x0 + 1 || x === x1 - 1) ? '°' : ' '
    term.put(x, ramTop + 1, mid, aHead)
    term.put(x, ramTop + 2, x === x0 ? '╚' : x === x1 ? '╝' : '═', aHead)
    term.put(x, ramTop + 3, (x > x0 && x < x1 && ((x - x0) & 1)) ? '▼' : ' ', aTeeth)
  }
}

export default {
  key: 'dread',
  label: 'DREAD',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._dreadTear = { active: false, row: 0, until: 0, shift: 0 }
    p._dreadSide = [0, 0, 0, 0, 0]
    p._dreadKickAt = -Infinity
    p._dreadPrevPulse = 0
    p._dreadLastT = null
    p._dreadRowC = null
    p._dreadRowA = null
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // 2026-09-12 (audit, M5) -- `until` is an absolute effect-clock value.
    // A tear active at the moment of exit (~9% of frames) came back on
    // re-entry as a full-row BRIGHT strobe held until the restarted clock
    // passed the old `until` -- a two-minute visit meant a two-minute
    // tear -- and `!tear.active` gates both trigger paths, so no new tear
    // could fire meanwhile.
    // 2026-10-16 (design pass) -- the slam clock and the smoothing clock are
    // effect-clock values too: a _dreadKickAt left at t=120 would hold the
    // centre ram on the bed (and refuse every kick) for two minutes.
    p._dreadTear.active = false
    p._dreadKickAt = -Infinity
    p._dreadPrevPulse = 0
    p._dreadLastT = null
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const L = dreadLayout(cols)
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    const dt = p._dreadLastT == null ? 0 : Math.max(0, Math.min(0.1, t - p._dreadLastT))
    p._dreadLastT = t

    // --- the kick: a rising edge slams the centre press ---------------------
    const pulse = A.pulse || 0
    let kicked = false
    if (!muted && t - p._dreadKickAt >= KICK_GAP_S &&
        (pulse - p._dreadPrevPulse >= BEAT_RISE || A.onset)) {
      p._dreadKickAt = t
      kicked = true
    }
    p._dreadPrevPulse = pulse
    const since = t - p._dreadKickAt
    const slammed = since < SLAM_HOLD_S

    // --- tears: some kicks, plus a rare ambient one -------------------------
    const tear = p._dreadTear
    if (!muted && !tear.active) {
      const kickTear = kicked && Math.random() < KICK_TEAR_CHANCE
      if (kickTear || Math.random() < AMBIENT_TEAR_RATE * dt) {
        tear.active = true
        // A kick tears through the struck press; an ambient one anywhere.
        tear.row = kickTear ? RAM_DOWN + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * (VIZ_BOT - 1))
        const mag = 3 + Math.floor(Math.random() * 6)
        tear.shift = Math.random() < 0.5 ? -mag : mag
        tear.until = t + 0.08 + Math.random() * (TEAR_MAX_S - 0.08)
      }
    }
    if (tear.active && t > tear.until) tear.active = false

    // --- tiers: muted is the line powered down, one tier dimmer -------------
    const aHead = muted ? MUTED : NORMAL
    const aBody = muted ? DIM : MUTED
    const aScen = muted ? FAINT : DIM
    const aGirder = muted ? DIM : MUTED

    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) term.put(x, y, C_SPACE)

    // --- the lamp: a slow blink, lit hard on the kick -----------------------
    const lx = Math.round((L.mx0 + L.mx1) / 2)
    const blink = muted ? false : (t % 1.6) < 0.8
    term.put(lx - 1, LAMP_Y, '(', aBody)
    term.put(lx, LAMP_Y, '●', slammed ? BRIGHT : blink ? NORMAL : aScen)
    term.put(lx + 1, LAMP_Y, ')', aBody)

    // --- the gantry ---------------------------------------------------------
    for (let x = L.mx0; x <= L.mx1; x++) {
      const end = x === L.mx0 || x === L.mx1
      term.put(x, GANTRY_Y0, x === L.mx0 ? '╔' : x === L.mx1 ? '╗' : '═', aGirder)
      term.put(x, GANTRY_Y0 + 1, end ? '║' : ((x - L.mx0) & 1) ? '/' : '\\', aScen)
      term.put(x, GANTRY_Y0 + 2, x === L.mx0 ? '╚' : x === L.mx1 ? '╝' : '═', aGirder)
    }
    for (const P of L.presses) {
      term.put(P.rodL, GANTRY_Y0 + 2, '╤', aGirder)
      term.put(P.rodR, GANTRY_Y0 + 2, '╤', aGirder)
    }

    // --- bed, anvils, hazard tape -------------------------------------------
    for (let x = L.mx0; x <= L.mx1; x++) term.put(x, BED_Y, '━', aBody)
    for (const P of L.presses) {
      for (let x = P.x0 + 1; x < P.x0 + P.w - 1; x++) {
        term.put(x, ANVIL_Y0, '▓', aScen)
        term.put(x, ANVIL_Y1, '▓', aScen)
      }
    }
    for (let x = L.mx0; x <= L.mx1; x++) term.put(x, TAPE_Y, ((x - L.mx0) % 6) < 3 ? '/' : ' ', aBody)

    // --- the presses --------------------------------------------------------
    const side = p._dreadSide
    const k = Math.min(1, dt * 8)
    for (let i = 0; i < L.presses.length; i++) {
      const P = L.presses[i]
      let ramTop
      if (P.center) {
        // Parked up, bobbing at most a row on the bass; on the kick, down.
        const idle = RAM_UP + Math.round(clamp01(A.bass) * 1)
        if (slammed) ramTop = RAM_DOWN
        else {
          const back = clamp01((since - SLAM_HOLD_S) / RETRACT_S)
          ramTop = Math.round(RAM_DOWN + (idle - RAM_DOWN) * back * back * (3 - 2 * back))
        }
        drawPress(term, P, ramTop, aHead, aBody, slammed ? BRIGHT : aHead)
      } else {
        const b = A.bands9 || SILENT_AUDIO.bands9
        const target = clamp01(((b[P.bands[0]] || 0) + (b[P.bands[1]] || 0)) / 2)
        side[i] += (target - side[i]) * (dt === 0 ? 1 : k)
        ramTop = RAM_UP + Math.round(side[i] * SIDE_TRAVEL)
        drawPress(term, P, ramTop, aHead, aBody, aHead)
      }
    }

    // --- the strike: contact flash on the die plate, sparks -----------------
    const C = L.center
    if (slammed) for (let x = C.x0 - 1; x <= C.x0 + C.w; x++) term.put(x, BED_Y, '━', NORMAL)
    if (!muted && since < SPARK_S) {
      const f = since / SPARK_S
      for (let n = 0; n < 8; n++) {
        const left = n & 1
        const r = hash2(n, Math.floor(p._dreadKickAt * 60))
        const dx = 1 + Math.floor((2 + r * 6) * (0.3 + f))
        const dy = 1 + Math.floor(r * 3 * f + (n >> 2))
        const x = left ? C.x0 - dx : C.x0 + C.w - 1 + dx
        const y = BED_Y - dy
        if (y < HOUSING_Y0 + 3 || x < 0 || x >= cols) continue
        const ch = f < 0.35 ? '*' : f < 0.7 ? '\'' : '.'
        term.put(x, y, ch, f < 0.35 && n < 3 ? BRIGHT : f < 0.7 ? NORMAL : aBody)
      }
    }

    // --- the tear: one row slips sideways -----------------------------------
    if (tear.active && tear.row >= 1 && tear.row < VIZ_BOT) {
      if (!p._dreadRowC || p._dreadRowC.length !== cols) {
        p._dreadRowC = new Uint16Array(cols)
        p._dreadRowA = new Uint8Array(cols)
      }
      const rc = p._dreadRowC, ra = p._dreadRowA, base = tear.row * cols
      for (let x = 0; x < cols; x++) { rc[x] = term.chars[base + x]; ra[x] = term.attrs[base + x] }
      for (let x = 0; x < cols; x++) {
        const src = x - tear.shift
        if (src < 0 || src >= cols) term.put(x, tear.row, Math.random() < 0.5 ? '≡' : '─', MUTED)
        else term.put(x, tear.row, rc[src], ra[src])
      }
    }
  },
}
