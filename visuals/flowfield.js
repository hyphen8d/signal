// SIGNAL -- visualizer effect "VANITY" (key 'flowfield', GREEN ROOM).
// Split out of program.js in the 2026-08-25 audit; `this` became `p` (the
// program object). Until 2026-10-16 this was FLOW FIELD, a wind map of streak
// glyphs; its history is kept below the design-pass note.
//
// 2026-10-16 (design pass) -- REDRAWN as a picture: a dressing-room vanity
// mirror ringed with bulbs, a counter under it with a bottle and an ashtray,
// a setlist taped to the glass, and one thin line of smoke rising off the
// ashtray, wavering wider as it climbs the glass and thinning out among the
// top bulbs.
//
// What the critique found (scratchpad CRITIQUE.md, FLOW FIELD): no subject
// -- a field of `/ \ - |` streaks, which is texture, on the one station
// whose tagline is "one subject only"; the four states inverted (NO TAP was
// mostly empty in the middle, MUTED fuller than LOUD, because the threshold
// was on a wave and not on the music); no visible beat; and level scaled
// `t *` frequency terms, so a change of level JUMPED the whole field rather
// than quickening it.
//
// Why this subject. GREEN ROOM's tagline is "backstage haze, one subject
// only", its desc is songs about exactly one thing, its frequency is 420.0
// and its tint is the forced-only 'haze'. The critic's "backstage green
// room" is the right room, and its mirror is the right SUBJECT: a vanity
// ringed with bulbs is the one object that says "backstage" in two seconds,
// and it has a natural musical element built in -- the bulbs. The station's
// actual subject is carried by the ashtray and its smoke, which is the
// haze in the tagline made literal and is never drawn as anything more
// explicit than that (the station's own joke is the frequency, not a
// cartoon). The critic's couch was tried in the plan and left out: at 80
// columns the only room for it is the foreground under the counter, where it
// competes with the mirror for the eye, and rubric 1 is ONE subject.
//
// The rubric, point by point:
// - ONE MUSICAL ELEMENT: the bulbs. Their glow follows a smoothed loudness
//   (a ~0.6s time constant, so it breathes rather than flickers), and a kick
//   pops every bulb to BRIGHT with a halo either side, and lights the row of
//   bulbs reflected in the top of the glass and the sheen on it. That is the
//   KICK-vs-LOUD difference, and tests/visual-flowfield.test.mjs counts it.
//   Only a rising edge of the pulse (or a real onset) is a kick, at most one
//   per KICK_GAP_S, held KICK_HOLD_S then decaying -- held, because a pop
//   that is gone inside one frame of a 60Hz tube is a pop nobody sees.
// - The smoke is AMBIENT, not musical: it rises and curls at a fixed slow
//   rate whatever the audio does (amplitude of nothing, frequency of
//   nothing), so a level change can never jump it the way it jumped the old
//   field. It is the "slow ambient life" a still picture needs to not read
//   as a hung tab, and it keeps going under mute.
// - BRIGHTNESS ORDER: bulbs (NORMAL, BRIGHT on the kick) > the ember and the
//   smoke near it (NORMAL) > the frame, counter and props (MUTED) > the
//   smoke's tail and the sheen (MUTED/DIM). Nothing but bulbs and the ember
//   ever reaches BRIGHT, and only on a kick.
// - NO SHADE BLOCKS anywhere. The smoke is one thin `( ) / \ ~` line, never
//   `░▒`, per the rubric's rule on smoke and mist.
// - FOUR STATES: NO TAP runs on syntheticAudio (it breathes and kicks on the
//   fake pulse); MUTED is SILENT_AUDIO -- the bulbs drop to small MUTED 'o's,
//   no kicks, the frame and props still there, the smoke still rising, so
//   the room is dim, not gone; LOUD is a full ring of lit 'O'; KICK is that
//   ring flaring to BRIGHT '☼' with halos and the reflection lit. The lit
//   bulb was '●' in the first draft, and the first tube sheet showed why
//   not: in ter-u16n '●' is a SMALL dot, so LOUD read dimmer than NO TAP's
//   'o' -- the states inverted again, the critique's exact complaint. Glyph
//   SIZE is part of the brightness order, not just the attribute.
// - One bulb is dead ('○'), steady -- every real vanity has one. It never
//   lights, not even on the kick.
//
// `decay: 0.88` is KEPT: the smoke line moves a cell at a time, and the
// tube's afterglow is what turns those steps into a soft trailing wisp --
// the haze is drawn by persistence as much as by glyphs. (tests/crt-base and
// tests/visual-flame also lean on this effect carrying a decay above most
// stations' own; that is a reason not to drop it casually, not the reason
// to keep it.)
//
// State on p: _flowLoud (the smoothed loudness), _flowLastT, _flowKickAt,
// _flowKickAmt, _flowPrevPulse. The two clocks are absolute effect-clock
// values and reset() clears them (CLAUDE.md: any `t + n` kept on p needs a
// reset). Layout is cached per column count; nothing is allocated per frame.
//
// --- history (FLOW FIELD) ----------------------------------------------------
// 2026-09-21 -- the first effect to set its own afterglow (see
// drawVisualizerFrame). A current map is lines in motion, and the tube's
// persistence turns each streak glyph into a short trail behind it for
// free -- the trick Cyberspace TERMINAL's matrix saver uses at the same
// 0.88. Not yet watched in motion on a real GPU: headless capture runs
// at ~3fps, where persistence cannot show what it does at 60.
// 65th pass -- CLOUDS (ATOMIC's old Geiger-counter-replacement effect,
// drifting metaball clouds via makeCloudShape()) permanently removed.
// See the 65th-pass note above VISUAL_METHODS for why.
// 57th pass, 3rd rewrite -- Flow Field, MOMENTUM's visual rebuilt from
// scratch, chasing a scene that reacts to the music -- just a fun
// visual, doesn't
// have to be on theme"). Drops the crane-skyline concept and its Focus
// Pulse HUD entirely -- this is a wind/current map instead: every cell
// carries a direction (a slowly drifting angle field) and a magnitude (a
// traveling wave riding that direction), rendered as a short streak
// glyph so the whole screen reads as flowing current lines rather than a
// static texture. Fully stateless, same reasoning as ISOTOPE/OUTRUN's
// roadside texture -- a pure function of (x, y, t, this frame's bus
// reading), nothing to reset on re-entry. No tap: the field still flows
// (this one keeps its baseline motion, deliberately -- a wind map
// standing dead still doesn't read as "idle," it reads as broken), just
// slow and calm; a live tap speeds it up, roughens it, and clumps it
// into streaks that thin out to nothing between hits.
// 59th pass -- unassigned (was MOMENTUM). See VISUAL_METHODS' note on
// 'skyline'/'flowfield' -- towers are back on MOMENTUM, kept here as the
// steady flowing-field alternative in case a future pass wants it again.
// 2026-08-26 -- re-homed on GREEN ROOM (see stations.js), on the argument
// that a slow drifting angle field already read as smoke. The 2026-10-16
// critique disagreed: it read as streaks. The smoke is now drawn as smoke.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- geometry (rows are absolute; columns are offsets from the centre) ------
export const BULB_Y = 2          // the top row of bulbs
export const FRAME_TOP = 3
export const FRAME_BOT = 13
export const MIRROR_HW = 19      // frame columns at cx +/- this
export const SIDE_DX = 21        // side bulbs at cx +/- this
export const COUNTER_Y = 16      // the counter's top edge
const PROP_Y = 15                // the row things stand on the counter at
const COUNTER_HW = 28
// The drawer fronts under the counter: the uprights, and each drawer's left edge.
const DRAWER_POSTS = [-COUNTER_HW, -COUNTER_HW + 16, COUNTER_HW - 16, COUNTER_HW]
const DRAWERS = [-COUNTER_HW, COUNTER_HW - 16]
export const ASH_DX = 4         // the ashtray's centre, right of cx
export const EMBER_DY = 14       // the ember's row
const SMOKE_TOP = 2              // the smoke thins out among the top bulbs
const DEAD_BULB = 13             // index into the bulb list: the one that's out

// --- the kick -----------------------------------------------------------------
export const KICK_GAP_S = 0.22   // least time between two kicks
export const KICK_HOLD_S = 0.12  // the pop holds this long at full...
const KICK_TAU = 0.22            // ...then fades on this time constant
const BEAT_RISE = 0.3            // a pulse jump this big is a kick
const LOUD_TAU = 0.6             // the bulbs' breath, seconds
const clamp01 = (v) => Math.min(1, Math.max(0, v || 0))

const layouts = new Map()
/** Bulb positions and the fixed props for a canvas `cols` wide, built once. */
export function vanityLayout(cols) {
  let L = layouts.get(cols)
  if (L) return L
  const cx = Math.floor(cols / 2)
  const bulbs = []
  // Top row: eleven bulbs across the frame, one every four columns. Sides:
  // five a side, every other row down the glass.
  for (let i = 0; i <= 10; i++) bulbs.push({ x: cx - 20 + i * 4, y: BULB_Y, top: true })
  for (let y = FRAME_TOP + 1; y < FRAME_BOT; y += 2) {
    bulbs.push({ x: cx - SIDE_DX, y, top: false })
    bulbs.push({ x: cx + SIDE_DX, y, top: false })
  }
  L = { cx, bulbs, ex: cx + ASH_DX + 4 }
  layouts.set(cols, L)
  return L
}

// The setlist taped to the glass, upper left, clear of the smoke's path. Text is drawn as text: a
// setlist is the one prop that is words.
const SETLIST = [
  '┌──────┐',
  '│ SET  │',
  '│ ──── │',
  '│ ───  │',
  '└──────┘',
]
const SETLIST_DX = -17, SETLIST_Y = 4

// A bottle on the left of the counter, its base on PROP_Y.
const BOTTLE = [' ┬ ', ' │ ', '╭┴╮', '│ │', '╰─╯']
const BOTTLE_DX = -13

/** Puts `ch` if the cell is on the canvas (the art is fixed-width and is
 *  allowed to crop at narrow widths rather than wrap). */
function put(term, x, y, ch, at) {
  if (x >= 0 && x < term.cols && y >= 1 && y < VIZ_BOT) term.put(x, y, ch, at)
}

/** The smoke line's column at height h above the ember, at effect time t.
 *  A pure function of (h, t): fixed rates, nothing from the audio. */
export function smokeX(ex, h, t) {
  const amp = 0.3 + h * 0.2
  const lean = 0.05 * h * h * Math.sin(t * 0.11 + 0.7)
  return ex + amp * Math.sin(h * 0.62 - t * 1.05) + lean
}

export default {
  key: 'flowfield',
  label: 'VANITY',
  decay: 0.88,
  init(p) {
    p._flowLoud = 0.4
    p._flowLastT = null
    p._flowKickAt = -Infinity
    p._flowKickAmt = 0
    p._flowPrevPulse = 0
  },
  /** Re-arms the clocks on every visualizer entry. The loudness is a level,
   *  not a clock, and carries over. */
  reset(p) {
    p._flowLastT = null
    p._flowKickAt = -Infinity
    p._flowKickAmt = 0
    p._flowPrevPulse = 0
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const L = vanityLayout(cols)
    const { cx, ex } = L
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    // --- clocks: the breath and the kick ----------------------------------
    const dt = p._flowLastT === null ? 0 : Math.min(0.25, Math.max(0, t - p._flowLastT))
    p._flowLastT = t
    if (p._flowLoud === undefined) p._flowLoud = 0.4
    p._flowLoud += (clamp01(A.level) - p._flowLoud) * (1 - Math.exp(-dt / LOUD_TAU))
    const pulse = A.pulse || 0
    if (!muted && t - p._flowKickAt >= KICK_GAP_S &&
        (pulse - (p._flowPrevPulse || 0) >= BEAT_RISE || A.onset)) {
      p._flowKickAt = t
      p._flowKickAmt = 0.7 + 0.3 * clamp01(A.bass)
    }
    p._flowPrevPulse = pulse
    const since = t - p._flowKickAt
    const kick = muted || !(since >= 0) ? 0
      : p._flowKickAmt * (since < KICK_HOLD_S ? 1 : Math.exp(-(since - KICK_HOLD_S) / KICK_TAU))
    const loud = muted ? 0 : p._flowLoud

    // --- the wall: dark, every canvas cell cleared ---------------------------
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) term.put(x, y, ' ')

    // --- the mirror -------------------------------------------------------------
    const fx0 = cx - MIRROR_HW, fx1 = cx + MIRROR_HW
    const frameAt = MUTED
    for (let x = fx0 + 1; x < fx1; x++) { put(term, x, FRAME_TOP, '═', frameAt); put(term, x, FRAME_BOT, '═', frameAt) }
    for (let y = FRAME_TOP + 1; y < FRAME_BOT; y++) { put(term, fx0, y, '║', frameAt); put(term, fx1, y, '║', frameAt) }
    put(term, fx0, FRAME_TOP, '╔', frameAt); put(term, fx1, FRAME_TOP, '╗', frameAt)
    put(term, fx0, FRAME_BOT, '╚', frameAt); put(term, fx1, FRAME_BOT, '╝', frameAt)

    // The sheen: two short diagonal glints across the glass, lower left --
    // what makes a rectangle read as glass. They catch the kick.
    const sheenAt = kick > 0.3 ? NORMAL : (muted ? DIM : MUTED)
    for (let k = 0; k < 5; k++) {
      put(term, cx - 9 + k * 2, FRAME_BOT - 1 - k, '/', sheenAt)
      if (k < 3) put(term, cx - 5 + k * 2, FRAME_BOT - 1 - k, '/', sheenAt)
    }

    // The top bulbs, reflected in the top of the glass: a dotted row that
    // shows only while the ring is lit, and lights up on the kick.
    if (!muted) {
      const reflAt = kick > 0.3 ? NORMAL : DIM
      const reflCh = kick > 0.3 ? '•' : '·'
      for (const b of L.bulbs) if (b.top && b.x > fx0 && b.x < fx1) put(term, b.x, FRAME_TOP + 1, reflCh, reflAt)
    }

    // The setlist, taped to the glass.
    for (let r = 0; r < SETLIST.length; r++) {
      const row = SETLIST[r]
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]
        put(term, cx + SETLIST_DX + i, SETLIST_Y + r, ch === ' ' ? ' ' : ch, r === 1 && ch !== '│' ? NORMAL : MUTED)
      }
    }

    // --- the counter -----------------------------------------------------------
    for (let x = cx - COUNTER_HW; x <= cx + COUNTER_HW; x++) {
      put(term, x, COUNTER_Y, '▁', MUTED)
      put(term, x, COUNTER_Y + 1, '─', DIM)
    }
    // Two drawers and the space between them, down to the bottom of the canvas.
    for (let y = COUNTER_Y + 2; y < VIZ_BOT; y++) {
      for (const dx of DRAWER_POSTS) put(term, cx + dx, y, '│', DIM)
    }
    for (const dx of DRAWERS) {
      for (let i = 1; i < 16; i++) put(term, cx + dx + i, COUNTER_Y + 4, '─', DIM)
      put(term, cx + dx + 8, COUNTER_Y + 3, '·', MUTED)
    }

    // The bottle.
    for (let r = 0; r < BOTTLE.length; r++) {
      const row = BOTTLE[r]
      for (let i = 0; i < row.length; i++) if (row[i] !== ' ') put(term, cx + BOTTLE_DX + i, PROP_Y - BOTTLE.length + 1 + r, row[i], MUTED)
    }

    // The ashtray, and the joint resting on its rim with the ember at its tip.
    const ax = cx + ASH_DX
    const ash = '\\▁▁▁▁/'
    for (let i = 0; i < ash.length; i++) put(term, ax - 2 + i, PROP_Y, ash[i], MUTED)
    put(term, ax + 2, EMBER_DY, '─', MUTED)
    put(term, ax + 3, EMBER_DY, '─', MUTED)
    const glow = 0.5 + 0.5 * Math.sin(t * 0.8)
    put(term, ex, EMBER_DY, glow > 0.5 ? '*' : '·', muted ? MUTED : NORMAL)

    // --- the smoke ---------------------------------------------------------------
    // One thin line from the ember up across the glass, wavering wider as it
    // climbs, breaking up as it reaches the top row of bulbs.
    // Breaks open near the top, where it thins to nothing.
    const H = EMBER_DY - SMOKE_TOP
    let prev = ex
    for (let h = 1; h <= H; h++) {
      const y = EMBER_DY - h
      const xf = smokeX(ex, h, t)
      const x = Math.round(xf)
      const dx = xf - prev
      // Thinning: the top third breaks into gaps that drift with time.
      if (h > H - 4 && hash2(h * 7 + x, Math.floor(t * 1.3)) < (h - (H - 4)) * 0.18) { prev = xf; continue }
      const at = h <= 4 ? NORMAL : (h <= 9 ? MUTED : DIM)
      let ch
      if (h >= H - 1) ch = '~'
      else if (dx > 0.55) ch = '/'
      else if (dx < -0.55) ch = '\\'
      else ch = Math.cos(h * 0.62 - t * 1.05) > 0 ? ')' : '('
      // A sideways step of more than a cell is joined with a lazy '~' so the
      // line never breaks into dots.
      const px = Math.round(prev)
      if (Math.abs(x - px) > 1) {
        const step = x > px ? 1 : -1
        for (let xx = px + step; xx !== x; xx += step) put(term, xx, y, '~', at)
      }
      put(term, x, y, ch, at)
      prev = xf
    }
    // --- the bulbs (last: nothing in the room draws over a lit bulb) ---------
    let ch, at
    if (muted) { ch = 'o'; at = MUTED }
    else if (kick > 0.3) { ch = '☼'; at = BRIGHT }
    else if (loud < 0.4) { ch = 'o'; at = NORMAL }
    else { ch = 'O'; at = NORMAL }
    const halo = kick > 0.55
    for (let i = 0; i < L.bulbs.length; i++) {
      const b = L.bulbs[i]
      if (i === DEAD_BULB) { put(term, b.x, b.y, '○', MUTED); continue }
      put(term, b.x, b.y, ch, at)
      if (halo) {
        put(term, b.x - 1, b.y, '·', NORMAL)
        put(term, b.x + 1, b.y, '·', NORMAL)
        if (b.top) put(term, b.x, b.y - 1, '\'', NORMAL)
      }
    }
  },
}
