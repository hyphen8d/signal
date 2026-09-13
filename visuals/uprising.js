// SIGNAL -- visualizer effect "UPRISING" (RISE UP). 2026-09-13.
//
// A crowd at a show, or a march: a two-rank silhouette of heads and
// shoulders across the bottom of the canvas, placards on sticks held up
// over it, and two slow stage/street beams sweeping down from above.
// RISE UP is protest rock, punk and hardcore picked so the chorus is
// something a room can shout back -- its profile's rule is that the
// COLLECTIVE voice is the point, and its thesis track is Black Flag's
// "Rise Above". So the subject here is not the band and not a fire (the
// station used to borrow FLAME from DISTORTION FIELD, which said "riot"
// rather than "room"): it is the people, and the one audio hook that
// matters is the crowd moving AS ONE -- a surge of arms going up that
// ripples across the whole room from one side when the song hits.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- layout (rows) ---------------------------------------------------------
// The top ~7 rows are left to the beams alone and are mostly dark on
// purpose: the placards and the lit dust only pop against a black sky.
// Beams fade out by BEAM_BOT, just above the back rank's heads.
export const BEAM_BOT = 14
export const BACK_HEAD = 16          // back rank head row (+0/1 jitter)
export const FRONT_HEAD = 18         // front rank head row (+0/1 jitter)
export const STICK_BOT = 15          // placard sticks end just above the back heads

// --- placards --------------------------------------------------------------
// Twelve words, four slots. Each slot walks the list in step, offset by 3,
// on a shared period with staggered phases -- which is what guarantees two
// signs never carry the same word at once: at any moment the slots' cycle
// counts differ by at most one, and 3 +/- 1 is never 0 mod 12. A random
// pick per cycle repeated RESIST side by side often enough to look lazy.
export const UPRISING_WORDS = [
  'RISE ABOVE', 'UNITE', 'NO WAR', 'WE ARE MANY', 'RESIST', 'SPEAK UP',
  'ENOUGH', 'RISE UP', 'HEAR US', 'NO FEAR', 'STAND UP', 'TOGETHER',
]
export const SIGN_SLOTS = 4
export const SIGN_PERIOD = 11        // s per raise-hold-lower cycle
const SIGN_PHASE = [0, 0.37, 0.71, 0.18]
// Text row per slot when fully raised. Varied so the four read as held by
// different people, not as a row of identical boxes; the lowest (11) still
// clears the back rank's heads with a 1-row stick when lowered 3 rows.
const SIGN_ROW = [10, 8, 11, 9]
// Slot centres as a fraction of the width. 20 columns apart at 80 cols, and
// the widest box ("WE ARE MANY", 15 cells) plus a column of sway either side
// still leaves a gap between neighbours -- a sign may never overdraw a sign.
const SIGN_XF = [0.125, 0.375, 0.625, 0.875]
const SIGN_LOWER = 3                 // rows a sign sinks before it drops out

// --- the surge -------------------------------------------------------------
// A real onset starts a wave of raised arms and jumping heads that travels
// across the room at SURGE_SPEED columns/s (~1.5s edge to edge at 80 cols):
// slow enough to read as a wave passing through people rather than the
// whole frame flashing, fast enough to still be on the beat it came from.
export const SURGE_SPEED = 55
// One wave at a time, near enough. Real onsets can fire every 220ms; waves
// that close overlap into a crowd with its arms permanently up, which reads
// as nothing happening. 0.9s is about a bar of a punk tempo's half-time.
export const SURGE_REFRACTORY = 0.9
const SURGE_ATTACK = 0.07            // s, arms go up fast...
const SURGE_DECAY = 0.4              // s, ...and come down slower
const SURGE_MAX = 4

/** Arm-raise envelope of one surge at column x (0..s). Pure. */
export function surgeEnvelope(sg, x, cols, t) {
  const delay = (sg.dir > 0 ? x : cols - 1 - x) / SURGE_SPEED
  const dt = t - sg.t0 - delay
  if (dt < 0) return 0
  if (dt < SURGE_ATTACK) return sg.s * (dt / SURGE_ATTACK)
  return sg.s * Math.exp(-(dt - SURGE_ATTACK) / SURGE_DECAY)
}

// The crowd itself is fixed geometry -- where each person stands, how tall,
// which gesture they favour -- derived from a hash of their index, so it is
// module-level data keyed on the width rather than per-program state. Back
// rank every 3 columns, front rank every 4 offset by 2: dense enough that the
// bodies below the shoulders merge into one mass, which is the silhouette.
let crowdCols = 0
let crowd = []
function crowdFor(cols) {
  if (cols === crowdCols) return crowd
  crowdCols = cols
  crowd = []
  let i = 0
  const mk = (x, head, rank) => {
    const n = i++
    crowd.push({
      x, head, rank,
      seed: hash2(n, 3.1),                       // enthusiasm rank (ambient arms)
      gesture: Math.floor(hash2(n, 5.7) * 4),    // 0 \o/  1 right fist  2 left fist  3 Y
      vary: 0.85 + 0.3 * hash2(n, 9.3),          // how hard this person answers a surge
      bob: hash2(n, 13.9) * 97,
    })
  }
  // Both ranks run a column past each edge (clipped at draw time): the room
  // carries on beyond the frame, and a sway must not open a strip at the side.
  for (let x = 0; x <= cols; x += 3) mk(x + (hash2(x, 7.1) < 0.3 ? 1 : 0), BACK_HEAD + (hash2(x, 11.3) < 0.4 ? 1 : 0), 0)
  for (let x = 2; x <= cols + 1; x += 4) mk(x - (hash2(x, 19.7) < 0.35 ? 1 : 0), FRONT_HEAD + (hash2(x, 23.9) < 0.35 ? 1 : 0), 1)
  return crowd
}

export default {
  key: 'uprising',
  label: 'UPRISING',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._upriseSurges = []
    p._upriseLastSurge = -Infinity
    p._upriseDir = 1
    // What the last frame actually drew, one entry per slot -- read by the
    // tests to check every visible word off the grid. Layout, not a clock.
    p._upriseSigns = Array.from({ length: SIGN_SLOTS }, () => ({ visible: false, word: '', x: 0, y: 0 }))
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // Both surge fields are absolute effect-clock values. Without this, a
    // two-minute visit leaves t0 ~120 and lastSurge ~120 behind; the clock
    // restarts at 0, every old wave's envelope reads dt < 0 (invisible, and
    // never pruned), and the refractory gate `t - lastSurge > 0.9` stays
    // false for two minutes -- a crowd that never answers a single hit.
    p._upriseSurges.length = 0
    p._upriseLastSurge = -Infinity
    p._upriseDir = 1
    for (const sg of p._upriseSigns) sg.visible = false
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    const level = Math.min(1, Math.max(0, A.level))
    // `life` gates every ambient motion (sway, bob, idle arms). All three are
    // AMPLITUDES scaled by it, never a speed, so muted (level 0) is a crowd
    // standing perfectly still rather than one frozen mid-sway.
    const life = Math.min(1, level * 1.6)

    // --- surges ------------------------------------------------------------
    const surges = p._upriseSurges
    if (A.onset && t - p._upriseLastSurge > SURGE_REFRACTORY) {
      // Sized by bass: a kick-and-bass hit sends the whole room's arms up
      // and heads off the floor; a thin onset only gets arms out (\o/).
      surges.push({ t0: t, s: 0.45 + 0.6 * Math.min(1, A.bass), dir: p._upriseDir })
      p._upriseDir = -p._upriseDir   // alternate sides, so it reads as a wave, not a wipe
      p._upriseLastSurge = t
      if (surges.length > SURGE_MAX) surges.shift()
    }
    const surgeLife = cols / SURGE_SPEED + SURGE_ATTACK + SURGE_DECAY * 6
    while (surges.length && t - surges[0].t0 > surgeLife) surges.shift()
    const surgeAt = (x) => {
      let v = 0
      for (let k = 0; k < surges.length; k++) {
        const e = surgeEnvelope(surges[k], x, cols, t)
        if (e > v) v = e
      }
      return v
    }

    // --- sky + beams (rows 1..VIZ_BOT-1 cleared here, beams to BEAM_BOT) ----
    // Two cones hung above the canvas, sweeping on slow independent sines.
    // Brightness follows level (plus a little of the beat's pulse), width and
    // sweep do not -- a beam whose speed followed the music would jerk.
    const glow = 0.3 + 0.55 * level + 0.25 * Math.min(1, A.pulse || 0)
    const dustTick = Math.floor(t * 4)   // dust in the light shimmers 4x/s
    const bx0 = cols * 0.28, bx1 = cols * 0.72
    const th0 = Math.sin(t * 0.21) * 0.5 + 0.12
    const th1 = Math.sin(t * 0.17 + 2.4) * 0.5 - 0.12
    const tan0 = Math.tan(th0) * 2, tan1 = Math.tan(th1) * 2   // x2: cells are ~2:1 tall
    for (let y = 1; y < VIZ_BOT; y++) {
      if (y > BEAM_BOT) { for (let x = 0; x < cols; x++) term.put(x, y, ' '); continue }
      const d = y + 1
      const half = 0.5 + d * 0.42
      const a0 = bx0 + tan0 * d, a1 = bx1 + tan1 * d
      const fall = 1 - (y - 1) / (BEAM_BOT + 3)
      for (let x = 0; x < cols; x++) {
        const o0 = Math.abs(x - a0) / half, o1 = Math.abs(x - a1) / half
        const o = o0 < o1 ? o0 : o1
        if (o > 0.9) { term.put(x, y, ' '); continue }
        // Inside: sparse dust, denser toward the axis. Kept sparse (peak
        // ~40%) so the cone is a haze the placards sit in front of, not a
        // wall of dots competing with their words.
        const v = (1 - o * o) * fall * glow
        const hsh = hash2(x * 1.7 + dustTick * 13, y * 3.3)
        if (hsh < v * 0.42) term.put(x, y, v > 0.55 && hsh < 0.08 ? ':' : '·', v > 0.6 ? MUTED : v > 0.35 ? DIM : FAINT)
        else term.put(x, y, ' ')
      }
      // Edges: the cone's outline, one cell per side per row -- the part
      // that makes it read as a light rather than a smudge. The character
      // follows the edge's own slope (half-width grows 0.42/row, the axis
      // moves tan*2/row); a fixed '/' on the left read as scratches the
      // moment a beam tilted past its own spread.
      const edgeAttr = glow > 0.6 ? MUTED : glow > 0.4 ? DIM : FAINT
      for (const [ax, tn] of [[a0, tan0], [a1, tan1]]) {
        for (const side of [-1, 1]) {
          const ex = Math.round(ax + side * half)
          if (ex < 0 || ex >= cols) continue
          const slope = tn + side * 0.42
          term.put(ex, y, slope > 0.35 ? '\\' : slope < -0.35 ? '/' : '|', edgeAttr)
        }
      }
    }
    // The fixtures themselves, where the cones leave the top edge.
    const lampAttr = glow > 0.75 ? BRIGHT : glow > 0.5 ? NORMAL : MUTED
    for (const bx of [bx0 + tan0, bx1 + tan1]) {
      const lx = Math.round(bx)
      if (lx >= 0 && lx < cols) term.put(lx, 1, '●', lampAttr)
    }

    // --- flyers ------------------------------------------------------------
    // A big hit (bass-heavy surge) throws a handful of flyers up out of the
    // crowd on a ballistic arc. Stateless: position is a function of the
    // surge's own t0, so nothing to keep and nothing to reset beyond the
    // surge list. Drawn before the placards, so they pass BEHIND a sign.
    for (let k = 0; k < surges.length; k++) {
      const sg = surges[k]
      if (sg.s < 0.85) continue
      const age = t - sg.t0
      if (age < 0 || age > 1.6) continue
      for (let f = 0; f < 6; f++) {
        const fx = Math.floor(hash2(sg.t0 * 7.3, f) * cols)
        const vy = 11 + hash2(f, sg.t0 * 3.1) * 7
        const y = Math.round(STICK_BOT - vy * age + 9 * age * age)
        if (y < 2 || y > STICK_BOT) continue
        const fxx = fx + Math.round(Math.sin(age * 6 + f) * 1.5)
        if (fxx < 0 || fxx >= cols) continue
        term.put(fxx, y, Math.floor(age * 8 + f) % 2 ? '▀' : '▄', age > 1.1 ? FAINT : DIM)
      }
    }

    // --- placard layout (computed now, boxes drawn LAST) ---------------------
    // Sway is shared by signs and people: one slow travelling sine across the
    // room, amplitude from `life`, so the placards move with the hands under
    // them. Rounded to whole columns; a sway of 0 is the muted state.
    const swayAt = (x) => Math.round(Math.sin(t * 0.55 + x * 0.045) * 1.15 * life)
    const signs = p._upriseSigns
    for (let i = 0; i < SIGN_SLOTS; i++) {
      const sg = signs[i]
      const ph = (t + SIGN_PHASE[i] * SIGN_PERIOD) / SIGN_PERIOD
      const k = Math.floor(ph)
      const u = ph - k
      // 0..6%: down (a new sign coming); 6..16%: rising; held; 86..94%:
      // lowering; 94..100%: gone. The gap is what makes the swap read as
      // "lowered, a different one raised" rather than the word flickering.
      if (u < 0.06 || u >= 0.94) { sg.visible = false; continue }
      let drop = 0
      if (u < 0.16) drop = Math.round(SIGN_LOWER * (1 - (u - 0.06) / 0.1))
      else if (u >= 0.86) drop = Math.round(SIGN_LOWER * ((u - 0.86) / 0.08))
      const word = UPRISING_WORDS[(i * 3 + ((k % 12) + 12)) % UPRISING_WORDS.length]
      const cx = Math.round(cols * SIGN_XF[i])
      // Bob: held signs pump up a row on the beat, more of them the louder
      // it is; a surge passing under a sign thrusts it up a row too.
      const bob = (Math.sin(t * 2.3 + i * 1.9) * life > 0.45 ? 1 : 0) + (surgeAt(cx) > 0.55 ? 1 : 0)
      const y = Math.max(3, SIGN_ROW[i] + drop - (drop ? 0 : bob))
      sg.visible = true
      sg.word = word
      sg.cx = cx + swayAt(cx)
      sg.x = sg.cx - Math.floor(word.length / 2)
      sg.y = y
    }
    // Sticks go in before the crowd, so the people in front hold them.
    for (const sg of signs) {
      if (!sg.visible) continue
      for (let y = sg.y + 2; y <= STICK_BOT; y++) term.put(sg.cx, y, '│', MUTED)
    }

    // --- the crowd ---------------------------------------------------------
    const pulse = Math.min(1, A.pulse || 0)
    const hopTick = Math.floor(t * 1.3)
    const people = crowdFor(cols)
    // The floor of the mass first, from just under the back rank's lowest
    // shoulders. Individual 3-wide bodies at a jittered 3-column step left a
    // hole straight down to the floor wherever two neighbours jittered apart;
    // a room has no gaps at waist height, only at head height.
    for (let y = BACK_HEAD + 3; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) term.put(x, y, '█', FAINT)
    const put = (x, y, ch, attr) => { if (x >= 0 && x < cols) term.put(x, y, ch, attr) }
    for (let n = 0; n < people.length; n++) {
      const pp = people[n]
      const front = pp.rank === 1
      const cx = pp.x + swayAt(pp.x)
      // Ambient arms: the most enthusiastic slice of the room (how big a
      // slice follows level) keeps a hand going on a slow per-person sine.
      // Capped at 0.6 -- a half raise -- so a FULL raise and a jump stay the
      // surge's alone; ambient that could do both would blur the hook.
      let raise = pp.seed < level * 0.5 ? 0.32 + 0.28 * (0.5 + 0.5 * Math.sin(t * 0.9 + pp.bob)) : 0
      const sv = surgeAt(pp.x) * pp.vary
      if (sv > raise) raise = sv
      // Hop: on the beat's pulse, a level-sized random slice of the room
      // comes off the floor for a moment -- the pogo between the big hits.
      const hop = raise >= 0.65 || (pulse > 0.55 && hash2(pp.bob, hopTick) < life * 0.35) ? 1 : 0
      const hy = pp.head - hop
      const surged = sv > 0.5
      const headAttr = front ? (surged ? BRIGHT : NORMAL) : (surged ? NORMAL : DIM)
      const bodyAttr = front ? DIM : FAINT
      const armAttr = front ? (surged ? BRIGHT : NORMAL) : (surged ? NORMAL : MUTED)
      // Body: shoulders as lower half-blocks under the head, then solid down
      // to the floor. Neighbours overlap, so below the shoulders it is one
      // mass -- the silhouette that makes the heads read as a crowd.
      for (let y = hy + 1; y < VIZ_BOT; y++) {
        const sh = y === hy + 1
        put(cx - 1, y, sh ? '▄' : '█', bodyAttr)
        put(cx, y, '█', bodyAttr)
        put(cx + 1, y, sh ? '▄' : '█', bodyAttr)
      }
      // Front rank heads stand in the back rank's bodies; clearing the cells
      // either side is the halo that keeps an `O` from vanishing into `███`.
      if (front) { put(cx - 1, hy, ' '); put(cx + 1, hy, ' ') }
      put(cx, hy, front ? 'O' : 'o', headAttr)
      if (raise < 0.3) continue
      const full = raise >= 0.65
      const g = pp.gesture
      if (g === 0) {                         // both arms: \o/, and up again when full
        put(cx - 1, hy, '\\', armAttr); put(cx + 1, hy, '/', armAttr)
        if (full && hy - 1 >= 1) { put(cx - 1, hy - 1, '\\', armAttr); put(cx + 1, hy - 1, '/', armAttr) }
      } else if (g === 1 || g === 2) {       // a fist: out at half, straight up at full
        const ax = g === 1 ? cx + 1 : cx - 1
        if (!full) put(ax, hy, g === 1 ? '/' : '\\', armAttr)
        else if (hy - 2 >= 1) { put(ax, hy - 1, '|', armAttr); put(ax, hy - 2, '•', armAttr) }
      } else {                               // Y: the far-off both-hands-up shape
        if (hy - 1 >= 1) put(cx, hy - 1, full ? 'Y' : 'v', armAttr)
      }
    }

    // --- placard boxes, last, so nothing overdraws a word ---------------------
    for (const sg of signs) {
      if (!sg.visible) continue
      const w = sg.word.length
      const left = sg.x - 2
      const edge = sg.y + 1 >= VIZ_BOT ? VIZ_BOT - 1 : sg.y + 1
      for (let x = left; x < left + w + 4; x++) {
        if (x < 0 || x >= cols) continue
        const corner = x === left || x === left + w + 3
        const lx = x === left
        term.put(x, sg.y - 1, corner ? (lx ? '┌' : '┐') : '─', NORMAL)
        term.put(x, edge, corner ? (lx ? '└' : '┘') : '─', NORMAL)
        const ix = x - sg.x
        term.put(x, sg.y, corner ? '│' : ix >= 0 && ix < w ? sg.word[ix] : ' ', corner ? NORMAL : BRIGHT)
      }
    }
  },
}
