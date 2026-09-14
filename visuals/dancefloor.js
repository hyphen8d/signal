// SIGNAL -- visualizer effect "DANCEFLOOR" (MIRRORBALL, 2026-09-13).
//
// A disco at its peak: a mirror ball hanging on a short cord at the top of
// the frame, faceted like a mosaic and slowly turning, one spotlight burning
// a bright point on its upper left; the flecks of light it throws sweeping
// around the room together; and below, a lit dance floor in perspective --
// the Saturday Night Fever floor -- whose pattern of lit tiles steps with the
// kick, with four dancers at its back edge changing pose on the same beat.
//
// Why it fits: MIRRORBALL is disco, boogie and funk, 1974-83 -- four on the
// floor. Every other station's effect keeps its audio hooks to amplitude and
// a soft accent; here the beat IS the subject, so the one discrete event this
// effect has is a step on every kick, and it has to land in time.
//
// The rules that shaped the look:
// - THE GLARE TRAP. The 2026-09-13 tube check found '█' fills blooming into
//   glowing slabs on the real CRT even at FAINT, and a lit tile floor is that
//   exact failure waiting to happen. So the floor is GRID LINES around dark
//   tiles; a lit tile fills with '░' (a '▒' only for the instant of the kick)
//   and keeps a dark margin inside its lines where the tile is wide enough;
//   only a minority of tiles are lit at once; and nothing on the floor ever
//   reaches BRIGHT. The ball is facets and an outline, not a disc -- the only
//   '█' in the frame is the spotlight's point on it and a few facet glints.
// - The spots are ONE rotation, not sparkle. Each fleck is a fixed reflection
//   direction on the ball, turned by the same angle as the facets: on the
//   curved back wall they all travel the same way, fastest in the middle and
//   slowing into the corners; on the floor they circle the spot under the
//   ball. Each carries a short dim tail at where it was a moment ago, so the
//   direction of travel reads in a single frame.
//
// Audio, on AMPLITUDE and on the beat only (never a `t *` frequency -- the
// rotation is a constant): a rising edge on `pulse` steps the floor pattern
// (pulse jumps to 1 on a real onset, and on syntheticAudio's own ~0.9s
// pulse, so the step lands in time with or without a tap; the synthetic
// random `onset` flag is deliberately NOT read, or the floor would step off
// the beat); level, latched at each step, gates how many tiles light, and
// sets how many spots are lit; treble adds facet glints; bass swells the lit
// tiles and the lines around them; a kick with bass behind it flares the
// spots for as long as the pulse lasts. Muted, SILENT_AUDIO leaves the ball
// turning and a few dim spots still moving, and the floor dark.
//
// Stored state: the step counter, the level latched at the last step, the
// previous frame's pulse and the effect-clock time of the last step (the
// rate limit). Everything else is a pure function of (x, y, t, audio); the
// floor geometry is compiled to lookup tables once per grid width.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, auMul, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- the turn -----------------------------------------------------------------
// Radians a second, shared by the facets and every spot -- that sharing is
// what makes it one ball turning. 2026-09-13 -- 0.12 is about a turn a
// minute: the spots cross the middle of the wall at ~5 columns a second,
// slow enough to follow one, fast enough that the room never looks paused.
export const OMEGA = 0.12

// --- the beat ---------------------------------------------------------------
// A step is a rise in `pulse` of at least BEAT_RISE since the last frame.
// 2026-09-13 -- 0.2, not 0.5: the fallback ticker can hand the effect a
// frame 250ms late, by which point syntheticAudio's pulse has already
// decayed to ~0.25, and a stricter edge would drop that beat.
export const BEAT_RISE = 0.2
// The least time between two steps. A real tap can fire onsets on a hi-hat
// or a double kick; the floor steps on the beat, not on every transient.
// 0.22s still admits eighth notes up to ~136bpm, which disco never exceeds.
export const STEP_GAP_S = 0.22
// Steps per pattern: two bars of four, then the floor changes routine.
const STEPS_PER_PATTERN = 8

// --- the ball -----------------------------------------------------------------
// Hand-drawn rather than computed: at this size a computed ellipse rounds
// into a barrel. 15 columns by 7 rows on ~2:1 cells is round. The cord
// comes down from row 1 to the top of the ball.
export const BALL_X0 = 33
export const BALL_Y0 = 2
export const BALL_W = 15
export const BALL_H = 7
export const BALL_CX = BALL_X0 + 7   // 40
export const BALL_CY = BALL_Y0 + 3   // 5
const BALL_ART = [
  '   .-‾‾‾‾‾-.   ',
  ' .´         `. ',
  '/             \\',
  '│             │',
  '\\             /',
  ' `.         .´ ',
  '   `-._____.-´ ',
]
// Interior cells (the facets) are the spaces strictly between each row's
// first and last outline glyph, on the rows that have a gap.
const BALL_CELLS = []
for (let r = 0; r < BALL_H; r++) {
  const row = BALL_ART[r]
  const first = row.search(/\S/), last = row.length - 1 - [...row].reverse().join('').search(/\S/)
  for (let c = 0; c < BALL_W; c++) {
    const ch = row[c]
    if (ch !== ' ') BALL_CELLS.push({ c, r, ch, facet: false })
    else if (c > first && c < last && r > 0 && r < BALL_H - 1) BALL_CELLS.push({ c, r, ch, facet: true })
  }
}
// The spotlight's point on the ball: upper left, where a spot aimed down
// from the ceiling at the viewer's side would strike it.
export const SPOT_ON_BALL = { x: BALL_X0 + 4, y: BALL_Y0 + 2 }
// Facets per radian of longitude. 2026-09-13 -- 10 facets across the half
// sphere we see (pi/10 each) makes a facet ~2 cells at the equator and a
// sliver at the limb, which is the compression that says sphere; the
// equator moves at ~0.9 columns a second under OMEGA.
const FACETS_PER_RAD = 10 / Math.PI
// The most facet glints in one frame (see the glint pass in draw).
export const MAX_GLINTS = 3

// --- the floor --------------------------------------------------------------
// One-point perspective. The vanishing point is at (40, VANISH_Y); a
// floor line at offset o (in tiles from the centre) sits at x = 40 +
// o * spacingAt(y). TILES_X tiles across at every depth, so the floor is a
// trapezoid: ~28 columns wide at its back edge, the full width at the front.
export const VANISH_Y = 4
export const FRONT_Y = VIZ_BOT - 1   // 21
export const TILE_W = 10              // columns per tile on the front row
export const TILES_X = 8
// The rows the across-the-floor lines sit on, back to front. 2026-09-13 --
// gaps of 1, 2, 3 rows and a cropped fourth: equal gaps read as a wall
// of shelves, not a floor, and this is as much perspective as nine rows hold.
export const LINE_ROWS = [10, 12, 15, 19]
export const TILES_Z = LINE_ROWS.length   // the fourth runs off the bottom
export const FLOOR_TOP = LINE_ROWS[0]
// Depth in tile rows -> screen row, for the spots on the floor: the line
// rows, plus a virtual line past the bottom for the cropped front row.
const DEPTH_ROWS = [...LINE_ROWS, 24]
export const spacingAt = (y) => TILE_W * (y - VANISH_Y) / (FRONT_Y - VANISH_Y)
const lineX = (o, y) => BALL_CX + o * spacingAt(y)

// Compiled once per grid width: for every floor cell, which grid line (if
// any) it carries and which tile interior (if any) it is. LINE_AT stores
// o + TILES_X/2 + 1 (0 = no line); TILE_AT stores i + j * TILES_X + 1 (0 =
// not a tile interior); MARGIN marks interior cells touching a line on a row
// whose tiles are wide enough to afford a dark border inside a lit tile.
// 2026-09-13 (audit L5) -- these were compiled at import for a fixed
// COLS = 80 and read as `y * 80 + x`, so a term of any other width read the
// next row's lines and tiles (stray fragments at columns 88-99 on a 100-column
// term). Keyed on the width now and cached; the grid is fixed for a page's
// life, so in practice this is built once. The picture stays centred on
// BALL_CX: a wider term gets dark room either side, not a wider floor.
const EDGE_L = new Float32Array(VIZ_BOT), EDGE_R = new Float32Array(VIZ_BOT)
for (let y = FLOOR_TOP; y < VIZ_BOT; y++) { EDGE_L[y] = lineX(-TILES_X / 2, y); EDGE_R[y] = lineX(TILES_X / 2, y) }
const FLOOR_TABLES = new Map()
function floorTables(COLS) {
  let tables = FLOOR_TABLES.get(COLS)
  if (tables) return tables
  const LINE_AT = new Int8Array(COLS * VIZ_BOT)
  const LINE_RUN = new Int8Array(COLS * VIZ_BOT)   // 1 = the run's '/'/'\' end
  const TILE_AT = new Int16Array(COLS * VIZ_BOT)
  const MARGIN = new Uint8Array(COLS * VIZ_BOT)
  const half = TILES_X / 2
  for (let y = FLOOR_TOP; y < VIZ_BOT; y++) {
    const onLineRow = LINE_ROWS.includes(y)
    for (let o = -half; o <= half; o++) {
      // A line crosses this row from its top edge to its bottom edge; draw
      // it across however many columns that is. Past a column a row, the
      // run is '_' with the slash at its upper end ("__/" rising to the
      // centre), which reads as one shallow line instead of stair-steps.
      const top = lineX(o, Math.max(FLOOR_TOP, y - 0.5)), bot = lineX(o, y + 0.5)
      const n = Math.max(1, Math.round(Math.abs(bot - top)))
      const start = Math.round((top + bot) / 2 - (n - 1) / 2)
      for (let k = 0; k < n; k++) {
        const x = start + k
        if (x < 0 || x >= COLS) continue
        LINE_AT[y * COLS + x] = o + half + 1
        const upperEnd = o < 0 ? k === n - 1 : k === 0
        LINE_RUN[y * COLS + x] = upperEnd ? 1 : 0
      }
    }
    if (onLineRow) continue
    let j = 0
    while (j + 1 < LINE_ROWS.length && LINE_ROWS[j + 1] < y) j++
    const sp = spacingAt(y)
    for (let x = 0; x < COLS; x++) {
      const at = y * COLS + x
      if (LINE_AT[at]) continue
      const u = (x - BALL_CX) / sp + half
      if (u < 0 || u >= TILES_X) continue
      TILE_AT[at] = Math.floor(u) + j * TILES_X + 1
    }
    for (let x = 0; x < COLS; x++) {
      const at = y * COLS + x
      if (TILE_AT[at] && sp >= 6 && ((x > 0 && LINE_AT[at - 1]) || (x < COLS - 1 && LINE_AT[at + 1]))) MARGIN[at] = 1
    }
  }
  tables = { LINE_AT, LINE_RUN, TILE_AT, MARGIN }
  FLOOR_TABLES.set(COLS, tables)
  return tables
}

/** Tile index (i + j * TILES_X) whose interior cell (x, y) is, or -1, on a
 *  grid `cols` wide (the 80-column desktop grid by default). */
export function floorTileAt(x, y, cols = 80) {
  if (x < 0 || x >= cols || y < 0 || y >= VIZ_BOT) return -1
  return floorTables(cols).TILE_AT[y * cols + x] - 1
}

/** Whether tile (i, j) is lit on step n with level lvl (0..1). The floor
 *  runs four routines, eight steps each; every one lights at most a third of
 *  the floor before the level gate, and the gate thins it further when the
 *  music is quiet. Pure, so a step is the only thing that changes it. */
export function tileLit(i, j, n, lvl) {
  const routine = Math.floor(n / STEPS_PER_PATTERN) % 4
  const s = n % STEPS_PER_PATTERN
  let on
  if (routine === 0) {
    // Diagonals marching back-left to front-right.
    on = ((i + j - n) % 4 + 4) % 4 === 0
  } else if (routine === 1) {
    // A pair of columns opening from the centre out, alternate rows.
    on = (i === 4 + (s % 4) || i === 3 - (s % 4)) && (j + n) % 2 === 0
  } else if (routine === 2) {
    // A thinned checkerboard that flips every beat.
    on = (i + j) % 2 === n % 2 && hash2(i * 3 + j * 11, n) < 0.45
  } else {
    // Rings from the middle of the floor, stepping outward.
    const d = Math.floor(Math.abs(i - 3.5)) + Math.abs(j - 1)
    on = d % 3 === n % 3
  }
  return on && hash2(i * 5 + j * 13 + 1, n * 3 + 7) < 0.5 + 0.5 * lvl
}

// --- the spots ----------------------------------------------------------------
// SPOT_N reflection directions, fixed on the ball: a starting azimuth, an
// elevation (above -0.25 lands on the wall, below on the floor) and a rank
// that decides which light first as the level rises.
export const SPOT_N = 44
const SPOTS = Array.from({ length: SPOT_N }, (_, i) => ({
  az: hash2(i, 1.5) * Math.PI * 2,
  el: hash2(i + 7, 2.5) * 2 - 1,
  rank: hash2(i + 3, 3.5),
}))
// The back wall spans rows 1..WALL_BOT; wall spots project from azimuth as
// x = 40 + WALL_R * sin(az), visible on the far half only.
export const WALL_BOT = 9
const WALL_R = 44
// The point on the floor under the ball, in tile rows of depth, and how far
// out the floor spots circle it.
const FOOT_D = 1.7
// How far back in time a spot's tail is drawn.
const TAIL_S = 0.35
export const SPOT_HEAD = '•'
export const SPOT_TAIL = '·'

/** A spot's cell at time t, or null when it is behind the viewer or off the
 *  floor. Exported so the tests can ask where the rotation should put one. */
export function spotCell(spot, t) {
  const az = spot.az + OMEGA * t
  const c = Math.cos(az), sn = Math.sin(az)
  if (spot.el > -0.25) {
    if (c < 0.12) return null
    const y = Math.round(1 + (1 - (spot.el + 0.25) / 1.25) * (WALL_BOT - 1))
    return { x: Math.round(BALL_CX + WALL_R * sn), y, wall: true, edge: c }
  }
  // Floor: a circle about the foot of the ball, far side (cos > 0) at the back.
  const r = 0.7 + (spot.el + 1) / 0.75 * 2.6
  const d = FOOT_D - r * c * 0.6
  if (d < 0.15 || d >= 3.9) return null
  const k = Math.min(3, Math.floor(d))
  const y = Math.round(DEPTH_ROWS[k] + (d - k) * (DEPTH_ROWS[k + 1] - DEPTH_ROWS[k]))
  if (y <= FLOOR_TOP || y >= VIZ_BOT) return null
  const X = r * sn * 1.2
  if (Math.abs(X) > TILES_X / 2 - 0.2) return null
  return { x: Math.round(BALL_CX + X * spacingAt(y)), y, wall: false, edge: 1 }
}

// --- the dancers --------------------------------------------------------------
// Four figures at the back edge of the floor, feet on its back line, in
// poses that change on the beat. Thin line glyphs, never filled.
// 2026-09-13 -- first stood ON the back tile row, where their limbs tangled
// with the grid lines and the one-row tiles and read as floor noise; on the
// back line they stand clear against the dark wall, two either side of the
// ball, just outside its bottom rows.
const POSES = [
  [' o/', '/| ', '/ \\'],   // the point
  ['\\o ', ' |\\', '/ \\'],
  ['\\o/', ' | ', '/ \\'],   // hands up
  [' o ', '/|\\', '< \\'],
]
export const DANCER_Y = FLOOR_TOP - 3   // heads; feet on the row above the back line
export const DANCER_X = [27, 31, 49, 53]   // clear of the ball's columns 33..47

const tier = (v) => v > 0.8 ? NORMAL : v > 0.55 ? MUTED : v > 0.28 ? DIM : FAINT

export default {
  key: 'dancefloor',
  label: 'DANCEFLOOR',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._dancefloorStep = 0
    p._dancefloorLvl = 0.5
    p._dancefloorPrevPulse = 0
    p._dancefloorBeatAt = -Infinity
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // 2026-09-13 -- _dancefloorBeatAt is an absolute effect-clock value that
    // the rate limit reads: left over from a long visit it sits minutes in
    // the future of the restarted clock and refuses every step until the
    // clock catches up -- a floor frozen for as long as the last visit was.
    // The draw deliberately does not self-heal it; this is what keeps it
    // honest, and tests/visual-dancefloor.test.mjs can see it. The previous
    // pulse is cleared too, so the first kick after entry is a rising edge.
    // The step count is not a clock and carries over: the floor picks up its
    // routine where it left off.
    p._dancefloorBeatAt = -Infinity
    p._dancefloorPrevPulse = 0
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const { LINE_AT, LINE_RUN, TILE_AT, MARGIN } = floorTables(cols)
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    // --- the beat -------------------------------------------------------------
    const pulse = A.pulse || 0
    if (!muted && pulse - p._dancefloorPrevPulse >= BEAT_RISE && t - p._dancefloorBeatAt >= STEP_GAP_S) {
      p._dancefloorStep++
      p._dancefloorBeatAt = t
      p._dancefloorLvl = Math.min(1, Math.max(0, A.level))
    }
    p._dancefloorPrevPulse = pulse
    const n = p._dancefloorStep
    const bass = auMul(A, A.bass, 0, 1)
    const treble = auMul(A, A.treble, 0, 1)
    const level = auMul(A, A.level, 0, 1)
    // A kick with bass behind it: how hard the spots flare, for as long as
    // the pulse lasts. Stateless -- the pulse is the envelope.
    const flare = muted ? 0 : pulse * pulse * Math.min(1, Math.max(0, (bass - 0.45) / 0.3))

    // --- base: a dark room, the floor's lines and lit tiles -------------------
    const half = TILES_X / 2
    for (let y = 1; y < VIZ_BOT; y++) {
      if (y < FLOOR_TOP) { for (let x = 0; x < cols; x++) term.put(x, y, ' '); continue }
      const lineRow = LINE_ROWS.includes(y)
      const l = Math.round(EDGE_L[y]), r = Math.round(EDGE_R[y])
      for (let x = 0; x < cols; x++) {
        const at = y * cols + x
        const ln = LINE_AT[at]
        const tile = TILE_AT[at] - 1
        if (tile >= 0) {
          const i = tile % TILES_X, j = (tile - i) / TILES_X
          if (!muted && !MARGIN[at] && tileLit(i, j, n, p._dancefloorLvl)) {
            // A lit tile: '░' at rest, '▒' only on the kick. Bass lifts the
            // resting tier; nothing here goes past NORMAL.
            const hot = pulse > 0.55
            term.put(x, y, hot ? '▒' : '░', hot ? NORMAL : bass > 0.5 ? MUTED : DIM)
          } else term.put(x, y, ' ')
          continue
        }
        if (!lineRow && !ln) { term.put(x, y, ' '); continue }
        if (lineRow && (x < l || x > r) && !ln) { term.put(x, y, ' '); continue }
        // A grid line. It picks up the glow of a lit tile beside it -- the
        // light spilling out of the floor -- and swells with the bass.
        let glow = 0
        if (!muted) {
          for (const [dx, dy] of NEIGH) {
            const nt = floorTileAt(x + dx, y + dy)
            if (nt >= 0 && tileLit(nt % TILES_X, (nt - nt % TILES_X) / TILES_X, n, p._dancefloorLvl)) { glow = 1; break }
          }
        }
        const a = glow ? (bass > 0.55 || pulse > 0.55 ? MUTED : DIM) : FAINT
        let ch
        if (lineRow) ch = ln === half + 1 ? '┼' : '─'
        else {
          const o = ln - half - 1
          ch = o === 0 ? '│' : LINE_RUN[at] ? (o < 0 ? '/' : '\\') : '_'
        }
        term.put(x, y, ch, a)
      }
    }

    // --- the dancers ------------------------------------------------------------
    // Each changes pose on the beat, offset from its neighbours so the four
    // never move as one. Silhouettes against the floor: their cells blank
    // what is behind them.
    for (let d = 0; d < DANCER_X.length; d++) {
      const pose = POSES[(n + d * 3) % POSES.length]
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const ch = pose[r][c]
          const x = DANCER_X[d] - 1 + c, y = DANCER_Y + r
          if (ch !== ' ') term.put(x, y, ch, muted ? FAINT : DIM)
        }
      }
    }

    // --- the spots ------------------------------------------------------------
    // Level decides how many of the ball's reflections are lit; muted, a
    // few still turn, faint. Tails first, so a head always wins its cell.
    const lit = muted ? 0.22 : 0.3 + 0.6 * level
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < SPOT_N; i++) {
        const sp = SPOTS[i]
        if (sp.rank >= lit) continue
        const now = spotCell(sp, t)
        if (!now) continue
        if (pass === 0) {
          // The tail sits in the cell next to the head on the side it came
          // from, however far the spot moved in TAIL_S -- a gap between the
          // two reads as two spots.
          const was = spotCell(sp, t - TAIL_S)
          if (!was || Math.abs(was.x - now.x) > 6 || Math.abs(was.y - now.y) > 2) continue
          const tx = now.x + Math.sign(was.x - now.x), ty = now.y + Math.sign(was.y - now.y)
          if ((tx !== now.x || ty !== now.y) && tx >= 0 && tx < cols && ty >= 1 && ty < VIZ_BOT) {
            term.put(tx, ty, SPOT_TAIL, muted ? FAINT : DIM)
          }
          continue
        }
        if (now.x < 0 || now.x >= cols) continue
        // Spots fade into the wall's corners, where they would be glancing.
        const v = muted ? 0.3 : Math.min(1, now.edge * 1.6) * (0.62 + 0.25 * level)
        const a = flare > 0.5 && sp.rank < 0.35 ? BRIGHT : tier(v + flare * 0.3)
        term.put(now.x, now.y, SPOT_HEAD, a)
      }
    }

    // --- the ball and its cord ------------------------------------------------
    term.put(BALL_CX, 1, '│', DIM)
    let blockGlint = false, glints = 0
    for (const cell of BALL_CELLS) {
      const x = BALL_X0 + cell.c, y = BALL_Y0 + cell.r
      if (!cell.facet) {
        // The outline, lit from the upper left.
        const lightSide = cell.c < 8 && cell.r < 4
        term.put(x, y, cell.ch, lightSide ? MUTED : DIM)
        continue
      }
      // Spherical facets: longitude from the column within this row's half
      // width, so a facet is widest at the centre and a sliver at the limb;
      // the turn slides them right to left (the near face of a ball whose
      // reflections cross the far wall left to right).
      const ny = (cell.r - 3) / 3.6
      const hw = 7 * Math.sqrt(Math.max(0.05, 1 - ny * ny))
      const nx = Math.max(-1, Math.min(1, (cell.c - 7) / hw))
      const lon = Math.asin(nx)
      const fid = Math.floor((lon + OMEGA * t) * FACETS_PER_RAD)
      const fkey = ((fid % 60) + 60) % 60
      const h = hash2(fkey, cell.r * 5 + 1)
      // The spotlight falls from the upper left; facets on the far side of
      // the ball are in its shadow.
      const light = 0.5 + 0.5 * (-0.6 * nx - 0.5 * ny)
      const b = h * light
      // A mosaic: facets alternate in a checker (by facet column and row),
      // the "on" squares carrying the reflection ramp and the "off" squares
      // the dark grout between them. 2026-09-13 -- one ramp over every cell
      // read as texture on a grey disc; the checker is what says tiles.
      // '■' is the brightest facet glyph and only the most lit squares get
      // it; it covers far less of its cell than a block does.
      const on = ((fid + cell.r) & 1) === 0
      let ch, a
      if (on) {
        ch = b > 0.5 ? '■' : b > 0.28 ? ':' : '·'
        a = b > 0.5 ? MUTED : b > 0.28 ? DIM : FAINT
      } else {
        ch = b > 0.45 ? '.' : ' '
        a = FAINT
      }
      // Glints: a facet with a high second hash catches the light as it
      // turns through the lit quarter, twinkling a few times a second.
      // Treble opens the gate wider; muted, none. At most one glint in a
      // frame is a block, so they can never run together into a bar.
      // 2026-09-13 -- capped at MAX_GLINTS a frame: at full treble the
      // first cut lit nine, five of them in one row, which is a bar of
      // BRIGHT on the tube rather than a glint.
      if (!muted && glints < MAX_GLINTS && lon + 0.1 < 0 && ny < 0.3) {
        const g = hash2(fkey * 3 + 11, cell.r)
        if (g > 0.93 - 0.08 * treble && hash2(fkey + cell.r * 7, Math.floor(t * 5)) > 0.4) {
          glints++
          // ...and never beside the spotlight's own block, which would
          // merge into a two-cell bar.
          const nearSpot = Math.abs(x - SPOT_ON_BALL.x) <= 1 && Math.abs(y - SPOT_ON_BALL.y) <= 1
          ch = g > 0.975 && !blockGlint && !nearSpot ? '█' : '*'
          if (ch === '█') blockGlint = true
          a = BRIGHT
        }
      }
      term.put(x, y, ch, a)
    }
    // The spotlight's point: one cell, the brightest thing on the ball.
    term.put(SPOT_ON_BALL.x, SPOT_ON_BALL.y, '█', muted ? NORMAL : BRIGHT)
  },
}

// A line cell's neighbours, for picking up a lit tile's glow.
const NEIGH = [[-1, 0], [1, 0], [0, -1], [0, 1]]
