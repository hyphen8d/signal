// SIGNAL -- visualizer effect "ATOMIC AGE" (ATOMIC). Key `isotope`, kept
// from the effect this replaces so stations.js and every saved session that
// names it still land here. Rebuilt 2026-10-16.
//
// The 1950s atom emblem: a nucleus of packed protons and neutrons at the
// centre, three elliptical orbits crossing at sixty degrees around it, an
// electron riding each one, and the mid-century starburst ornaments of the
// era scattered through the dark around it -- the atom on a diner sign, a
// Formica tabletop, a record sleeve, a Googie motel. Retro-optimist, the
// "Our Friend the Atom" picture, not a warning sign: nothing here is
// trefoil-shaped and nothing glows a sickly green on purpose.
//
// Why it fits: ATOMIC is "atomic swing, radioactive nostalgia" -- '50s rock
// and roll, doo-wop and atomic-age pop, the music of exactly the years that
// put this emblem on everything. The picture is the period's own logo for
// itself, so it reads as ATOMIC in the second it takes to recognise an atom.
//
// What it replaced. The old ISOTOPE MAP (52nd pass, promoted to ATOMIC in
// the 65th) was five abstract heat blobs drifting on lissajous paths over a
// per-cell flicker field, with half-life rings on hard onsets. It moved
// plenty -- 48% of the canvas changed with the music when measured
// 2026-10-16, beat legibility 4.9x -- but what it was a picture OF never
// read: "a field of sources" is a concept, and on screen it was blobs. The
// 2026-10-16 review put it in the weak tier with that exact complaint, and
// set the rule this rebuild follows: a picture with a clear subject, and one
// element that moves with the music.
//
// How it is drawn. The orbits and the kick's shockwave are smooth curves,
// which a character grid cannot draw -- at 2:1 cells an ellipse of '-' '/'
// '|' reads as a polygon. So they go through src/vector.js's DotCanvas, the
// Braille 2x4 dot framebuffer VECTOR SCAN draws with: a thin dotted line,
// which is also how the emblem was printed. The electrons are dots too, as
// small filled discs. Everything else -- the nucleus (shade blocks), the
// starbursts, the sparse sky -- is characters, so the centre stays heavy
// against the fine linework. The dot layers are
// merged per cell rather than blitted one over another (see composeDots):
// blit() replaces a cell outright, so a cell where an orbit and the ring
// cross would show only whichever layer went last. The ring is the one
// dotted line among them, at the orbits' FAINT (2026-10-20; the note at
// composeDots' call has why).
//
// Audio, on amplitude and on the beat (never a `t *` frequency term -- a
// rate that jumps with the music makes things jump, not speed up):
//   - the KICK (a rising edge on A.pulse, the DANCEFLOOR rule) flares the
//     nucleus BRIGHT, throws a shockwave ring a short way out across the
//     orbits, and jolts the electrons forward -- an impulse that decays, so
//     a swing beat reads as a bounce in their travel rather than a strobe;
//   - LEVEL sets how fast the electrons ride their orbits, integrated into
//     a phase so a change in level changes the speed and never the position;
//   - ONSETS and TREBLE pop the starbursts: an onset picks one and throws its
//     arms out long and bright for a moment; treble lifts the idle twinkle.
// No tap: syntheticAudio's ~0.9s pulse keeps the kick coming and its random
// onsets keep the stars going. Muted: SILENT_AUDIO -- the electrons slow to
// their floor speed, the nucleus sits at rest and the stars only breathe.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
import { DotCanvas } from '../src/vector.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, auMul, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- the beat ---------------------------------------------------------------
// The DANCEFLOOR rule, same numbers for the same reasons: a kick is a rise in
// `pulse` of at least BEAT_RISE since the last frame (0.2 survives a frame
// the fallback ticker hands over 250ms late), and no two kicks closer than
// KICK_GAP_S apart, so a hi-hat onset on a real tap cannot double it.
export const BEAT_RISE = 0.2
export const KICK_GAP_S = 0.22
// The hit, in seconds. The nucleus stays flared for FLARE_S and the
// shockwave ring shows for SHOCK_S -- the same, so they go out together --
// reaching its full radius within SHOCK_SNAP_S of the kick. Short and
// front-loaded on purpose (2026-10-16, tuned with the reactivity probe from
// that day's visualizer review): a swing beat comes round every half second
// or so, each flare should be over well before the next, and the change has
// to land ON the kick to read as one. The first cut eased the ring out over
// 0.5s, smearing its motion across the gap between beats -- it scored 0.74x
// (more change between kicks than on them) where this scores ~5x.
export const FLARE_S = 0.2
export const SHOCK_S = FLARE_S
export const SHOCK_SNAP_S = 0.03

// --- the atom ---------------------------------------------------------------
// Sizes in device pixels (dots are 4.5 x 4 px in the 8x16 face -- the
// DotCanvas measures it), so the orbits are true ellipses on screen rather
// than in cells. ORBIT_A x ORBIT_B is the classic emblem's long, narrow
// orbit; three of them at 0, 60 and 120 degrees. 170px tilted 60 degrees
// reaches ~150px above and below the nucleus -- inside the 21-row canvas
// with a row to spare at each end.
export const ORBIT_A = 170
export const ORBIT_B = 54
export const ORBIT_TILTS = [0, Math.PI / 3, -Math.PI / 3]
// The atom is drawn a little wider than round: the canvas is a landscape
// and the emblem was always set wide on a sign. Capped so the long orbit
// keeps clear of the screen edge on a narrow grid (see atomGeometry).
const STRETCH = 1.25
// The shockwave runs from just outside the nucleus to SHOCK_REACH px -- out
// past the nucleus and across the inner orbits, "a short way", not to the
// edge of the screen.
// Born already halfway out (2026-10-16): a ring starting at the nucleus spent
// its first frames hidden under the cluster, so the hit landed a beat-sliver
// late. From 60px it is visible on the kick's own frame.
const SHOCK_FROM = 60
const SHOCK_REACH = 120
// The ring's dot spacing along its arc, in dots -- see the shockwave draw.
export const SHOCK_DOT_GAP = 3
// Its tier: the orbits' own FAINT -- see the composeDots note.
export const SHOCK_ATTR = FAINT

// Electron speed in radians a second along its orbit: a floor so the atom is
// never stopped, plus a span that LEVEL fills. Each orbit runs at its own
// multiple and phase so the three never line up.
// 2026-10-16 -- the split between the two is tuned: with a wide level span
// the electrons' steady travel was most of the motion on screen, between
// beats as much as on them, and the kick stopped reading (probe: 3.9x).
// A modest span and a strong, fast-decaying jolt make the same atom bounce
// on the kick -- the swing -- while still running faster when it is loud.
const SPEED_FLOOR = 0.45
const SPEED_SPAN = 0.7
const ORBIT_RATE = [1.0, 0.83, 1.17]
const ORBIT_PHASE = [0.3, 2.4, 4.4]
// The kick's jolt: extra radians/second added on the beat, decaying away.
const JOLT = 4.5
const JOLT_DECAY = 10
// The tail an electron draws behind it along its orbit, in radians.
const TRAIL_RAD = 0.75

// The nucleus: protons ('▓', role p) and neutrons ('▒', role n) packed in a
// checkerboard, its corners rounded off with quarter and half blocks (role
// e), 7 x 3 cells -- about 63 x 48 px, round on the tube. Offsets from the
// centre cell, which sits on NUCLEUS_Y in column floor(cols / 2).
// 2026-10-16 -- shade blocks, not the '●' '○' of the first cut: Terminus
// draws those at about a third of the cell, and in a real Chrome render the
// nucleus -- the focal point of the whole picture -- read as a few specks
// in the middle of the orbits. The blocks make it the heaviest thing there.
export const NUCLEUS_Y = 11
export const NUCLEUS = [
  [-2, -1, '▗', 'e'], [-1, -1, '▓', 'p'], [0, -1, '▒', 'n'], [1, -1, '▓', 'p'], [2, -1, '▖', 'e'],
  [-3, 0, '▐', 'e'], [-2, 0, '▓', 'p'], [-1, 0, '▒', 'n'], [0, 0, '▓', 'p'], [1, 0, '▒', 'n'], [2, 0, '▓', 'p'], [3, 0, '▌', 'e'],
  [-2, 1, '▝', 'e'], [-1, 1, '▓', 'p'], [0, 1, '▒', 'n'], [1, 1, '▓', 'p'], [2, 1, '▘', 'e'],
]
// Each electron is a small filled disc of Braille dots, ELECTRON_R px across
// the radius -- a '●' character was a speck for the same reason as above.
const ELECTRON_R = 9

// --- the starbursts -----------------------------------------------------------
// Terminus has none of the sparkle glyphs (no ✦ ✧ ✶ ★), so each burst is
// built from a few cells: a centre '*' with arms of '─' '│' '/' '\'. Three
// sizes, the way they were scattered on a '50s print -- a few big, more
// small. `fx` is a fraction of the width (so the arrangement holds at any
// grid width), `y` a canvas row, both chosen to sit in the dark around the
// atom rather than on an orbit.
//   size 2: the eight-point burst, arms 2 across and 1 down (+ diagonals)
//   size 1: the four-point sparkle, arms 1 across and 1 down
//   size 0: a lone glint
// 2026-10-16 -- placed against an 80-column render: the atom's orbits fill
// columns ~15..65, so the big bursts hold the four corners, the sparkles the
// two flanks and the gaps above and below the long orbit, and the glints
// the slivers of dark that are left. Nothing sits on an orbit line.
export const STARBURSTS = [
  { fx: 0.08, y: 4, size: 2 },
  { fx: 0.9, y: 3, size: 2 },
  { fx: 0.1, y: 17, size: 2 },
  { fx: 0.89, y: 18, size: 2 },
  { fx: 0.25, y: 2, size: 1 },
  { fx: 0.04, y: 11, size: 1 },
  { fx: 0.96, y: 11, size: 1 },
  { fx: 0.85, y: 14, size: 1 },
  { fx: 0.2, y: 13, size: 0 },
  { fx: 0.27, y: 20, size: 0 },
  { fx: 0.6, y: 1, size: 0 },
  { fx: 0.42, y: 21, size: 0 },
  { fx: 0.18, y: 7, size: 0 },
  { fx: 0.84, y: 6, size: 0 },
]
// How long a popped burst holds its long arms, in seconds.
export const POP_S = 0.35

// One DotCanvas per layer per grid width, built on first use. Cached by
// width rather than made in init(): the effect can be asked to draw on a
// term of a different width from the one it booted with (the width test in
// tests/visuals.test.mjs does exactly that), and a canvas sized at boot
// would then draw the atom off-centre.
const canvases = new Map()
function layersFor(term) {
  const key = `${term.cols}x${VIZ_BOT - 1}`
  let L = canvases.get(key)
  if (!L) {
    const mk = () => new DotCanvas(term, term.cols, VIZ_BOT - 1)
    L = { orbit: mk(), trail: mk(), shock: mk(), electron: mk() }
    canvases.set(key, L)
  }
  return L
}

/** Centre in dots and the px-to-dot scale for this width. */
function atomGeometry(term) {
  const dotW = term.advance / 2
  const dotH = term.font.cellH / 4
  // Canvas row 0 is grid row 1; the atom sits on grid row NUCLEUS_Y, the
  // middle of rows 1..21. In dots: 2 per cell across (so the middle of the
  // nucleus cell is 2 * floor(cols / 2) + 1), 4 per cell down.
  const cx = 2 * Math.floor(term.cols / 2) + 1
  const cy = (NUCLEUS_Y - 1) * 4 + 2
  // Keep the long orbit a few cells inside the edge on a narrow grid.
  const halfPx = (term.cols / 2 - 3) * term.advance
  const stretch = Math.min(STRETCH, halfPx / ORBIT_A)
  return { cx, cy, dotW, dotH, stretch }
}

/** A point on orbit `i` at parameter `a`, in dots. */
function orbitPoint(g, i, a, scale = 1) {
  const tilt = ORBIT_TILTS[i]
  const ex = ORBIT_A * scale * Math.cos(a), ey = ORBIT_B * scale * Math.sin(a)
  const px = (ex * Math.cos(tilt) - ey * Math.sin(tilt)) * g.stretch
  const py = ex * Math.sin(tilt) + ey * Math.cos(tilt)
  return [g.cx + px / g.dotW, g.cy + py / g.dotH]
}

/** Writes the dot layers to the grid, one cell at a time: the bits of every
 *  layer that has any in the cell are OR'd together, and the cell takes the
 *  attribute of the highest-priority layer present (layers in priority
 *  order, highest first). */
function composeDots(term, layers) {
  const { cols, rows } = layers[0].dc
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      let bits = 0, attr = -1
      for (const { dc, attr: a } of layers) {
        const b = dc.cells[i]
        if (!b) continue
        bits |= b
        if (attr < 0) attr = a
      }
      if (bits) term.put(cx, cy + 1, String.fromCodePoint(0x2800 + bits), attr)
    }
  }
}

function drawStarburst(term, x, y, size, pop, idle) {
  const cols = term.cols
  const put = (dx, dy, ch, attr) => {
    const X = x + dx, Y = y + dy
    if (X < 0 || X >= cols || Y < 1 || Y >= VIZ_BOT) return
    term.put(X, Y, ch, attr)
  }
  // A popped burst throws its arms out one cell further and lights BRIGHT at
  // the heart; at rest the arms are dimmer than the heart, which is what
  // makes it read as light rather than as a plus sign.
  const heart = pop > 0.5 ? BRIGHT : idle > 0.6 ? NORMAL : MUTED
  const arm = pop > 0 ? NORMAL : idle > 0.6 ? MUTED : DIM
  const tip = pop > 0 ? MUTED : FAINT
  if (size === 0) {
    put(0, 0, pop > 0 ? '*' : idle > 0.55 ? '+' : '·', pop > 0 ? NORMAL : idle > 0.55 ? MUTED : DIM)
    return
  }
  const reachX = size === 2 ? 2 : 1
  const ext = pop > 0 ? 1 : 0
  for (let k = 1; k <= reachX + ext; k++) {
    const a = k > reachX ? tip : arm
    put(-k, 0, '─', a)
    put(k, 0, '─', a)
  }
  put(0, -1, '│', arm)
  put(0, 1, '│', arm)
  if (ext) { put(0, -2, '·', tip); put(0, 2, '·', tip) }
  if (size === 2) {
    put(-1, -1, '\\', tip)
    put(1, -1, '/', tip)
    put(-1, 1, '/', tip)
    put(1, 1, '\\', tip)
  }
  put(0, 0, '*', heart)
}

export default {
  key: 'isotope',
  label: 'ATOMIC AGE',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    // Electron phase per orbit: an accumulator, not a clock -- carried
    // across visits like DANCEFLOOR's step count.
    p._isoPhase = ORBIT_PHASE.slice()
    p._isoJolt = 0
    p._isoPops = new Array(STARBURSTS.length).fill(-Infinity)
    p._isoLastT = null
    p._isoPrevPulse = 0
    p._isoKickAt = -Infinity
    p._isoElectronAt = []
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // Everything here that holds an effect-clock time is cleared: the clock
    // restarts at 0 on entry, so a kick or a pop stamped minutes into the
    // last visit would sit in the future of this one -- the kick gate would
    // refuse every beat and the flare would hold lit -- for as long as that
    // visit lasted. _isoLastT going null is what stops the first frame
    // integrating the gap between visits into the electrons' phase.
    p._isoLastT = null
    p._isoPrevPulse = 0
    p._isoKickAt = -Infinity
    p._isoJolt = 0
    p._isoPops = new Array(STARBURSTS.length).fill(-Infinity)
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))

    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) term.put(x, y, ' ', NORMAL)

    // --- the beat -------------------------------------------------------------
    const pulse = A.pulse || 0
    if (!muted && pulse - p._isoPrevPulse >= BEAT_RISE && t - p._isoKickAt >= KICK_GAP_S) {
      p._isoKickAt = t
      p._isoJolt = JOLT
    }
    p._isoPrevPulse = pulse
    const sinceKick = t - p._isoKickAt
    const flare = sinceKick >= 0 && sinceKick < FLARE_S ? 1 - sinceKick / FLARE_S : 0

    // --- the electrons' travel -----------------------------------------------
    const dt = p._isoLastT == null ? 0 : Math.max(0, Math.min(0.25, t - p._isoLastT))
    p._isoLastT = t
    const level = auMul(A, A.level, 0, 1)
    const speed = SPEED_FLOOR + SPEED_SPAN * level
    for (let i = 0; i < 3; i++) p._isoPhase[i] = (p._isoPhase[i] + (speed + p._isoJolt) * ORBIT_RATE[i] * dt) % (Math.PI * 2)
    p._isoJolt *= Math.exp(-JOLT_DECAY * dt)

    // --- the sky ----------------------------------------------------------------
    // A sparse, still field of points, FAINT: enough that the dark reads as a
    // night sky around the sign rather than as an empty screen.
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        if (hash2(x, y * 7) < 0.018) term.put(x, y, '·', FAINT)
      }
    }

    // --- orbits, trails, shockwave (dots) --------------------------------------
    const L = layersFor(term)
    const g = atomGeometry(term)
    L.orbit.clear(); L.trail.clear(); L.shock.clear(); L.electron.clear()
    const STEPS = 720
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < STEPS; k++) {
        const [x, y] = orbitPoint(g, i, (k / STEPS) * Math.PI * 2)
        L.orbit.plot(x, y)
      }
      // The tail behind each electron: the same orbit, drawn again in a
      // brighter layer over the last TRAIL_RAD of its travel.
      const head = p._isoPhase[i]
      for (let k = 0; k < 90; k++) {
        const [x, y] = orbitPoint(g, i, head - (k / 90) * TRAIL_RAD)
        L.trail.plot(x, y)
      }
    }
    if (sinceKick >= 0 && sinceKick < SHOCK_S) {
      // A snap, then a hold: the ring is out at full reach within
      // SHOCK_SNAP_S of the kick and holds there until it goes out with the
      // flare. A slow ring reads as a ripple, not a hit -- see FLARE_S.
      const k = Math.min(1, sinceKick / SHOCK_SNAP_S)
      const r = SHOCK_FROM + (SHOCK_REACH - SHOCK_FROM) * (1 - (1 - k) * (1 - k) * (1 - k))
      // Dotted (2026-10-20 polish): one dot every SHOCK_DOT_GAP dots of
      // arc, so the ring is a different line from the orbits, not a fourth
      // one. The arc is measured in dots (a dot is wider than it is tall).
      const rx = (r * g.stretch) / g.dotW, ry = r / g.dotH
      const n = Math.round((Math.PI * (rx + ry)) / SHOCK_DOT_GAP)
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2
        L.shock.plot(g.cx + Math.cos(a) * rx, g.cy + Math.sin(a) * ry)
      }
    }
    // The electrons: a filled disc of dots at each one's place on its orbit.
    // Their cells are kept on p._isoElectronAt for the tests to read back.
    p._isoElectronAt = []
    const erx = ELECTRON_R / g.dotW, ery = ELECTRON_R / g.dotH
    for (let i = 0; i < 3; i++) {
      const [ex, ey] = orbitPoint(g, i, p._isoPhase[i])
      for (let dy = -Math.ceil(ery); dy <= Math.ceil(ery); dy++) {
        for (let dx = -Math.ceil(erx); dx <= Math.ceil(erx); dx++) {
          if ((dx / erx) ** 2 + (dy / ery) ** 2 <= 1) L.electron.plot(ex + dx, ey + dy)
        }
      }
      p._isoElectronAt.push([Math.floor(ex / 2), Math.floor(ey / 4) + 1])
    }
    // Brightness is the hierarchy (2026-10-16, after a real Chrome render):
    // the orbits are the quietest line on screen -- Braille glows brighter on
    // the tube than its attribute suggests, and at DIM the three ellipses out-
    // shone everything inside them -- so they sit at FAINT; each electron's
    // tail is a tier up; the electrons and the ring are NORMAL. No attribute
    // ladder on the ring: every step repaints the whole of it, and a
    // NORMAL->MUTED->DIM fade spent three of those on the quiet half of the
    // beat (profiled the same day). The ring holds and goes out with the
    // flare, in the same frame; the tube's persistence does the fading.
    // 2026-10-16 (design pass): the ring is MUTED, one tier under the
    // electrons. The viz-critic rated ATOMIC AGE KEEP, with one note: in the
    // NO TAP capture the ring, at full NORMAL and with the previous kick's
    // ring still in the tube's persistence, briefly crowded the emblem. One
    // tier down it still lands on the beat and no longer outranks the atom.
    // 2026-10-20 (polish): the viz-critic rated ATOMIC AGE KEEP again, with
    // one note: the ring, solid at MUTED, was as heavy as the orbits, so on
    // the beat the emblem read as an atom with FOUR orbits. The critic asked
    // for a tier under the orbits and a dotted line; the orbits are already
    // FAINT, the bottom tier, so the ring takes their FAINT and is dotted
    // (SHOCK_DOT_GAP): a different TEXTURE from every orbit rather than a
    // dimmer copy of one. It goes last in priority, so where it crosses an
    // orbit or a tail that line keeps its own tier. The kick still lands --
    // the nucleus flare and the electrons' jolt are unchanged, and a dotted
    // circle across three solid ellipses is plain in a still.
    composeDots(term, [
      { dc: L.electron, attr: NORMAL },
      { dc: L.trail, attr: MUTED },
      { dc: L.orbit, attr: FAINT },
      { dc: L.shock, attr: SHOCK_ATTR },
    ])

    // --- the starbursts ----------------------------------------------------------
    // An onset pops one burst, picked at random so they take turns; the rest
    // breathe on their own slow cycles, a little livelier with treble.
    if (!muted && A.onset) p._isoPops[Math.floor(Math.random() * STARBURSTS.length)] = t
    const treble = auMul(A, A.treble, 0, 1)
    STARBURSTS.forEach((b, i) => {
      const x = Math.round(b.fx * (cols - 1))
      const since = t - p._isoPops[i]
      const pop = since >= 0 && since < POP_S ? 1 - since / POP_S : 0
      const idle = 0.5 + 0.5 * Math.sin(t * (0.7 + 0.25 * (i % 4)) + i * 1.9) * (muted ? 0.6 : 0.75 + 0.25 * treble)
      drawStarburst(term, x, b.y, b.size, pop, idle)
    })

    // --- the nucleus -----------------------------------------------------------------
    // At rest the protons are NORMAL and the neutrons and rounded edges
    // MUTED, so the cluster has texture; a kick lifts every cell a tier --
    // protons BRIGHT, the rest NORMAL -- and rings it with a short-lived halo
    // of '·', which is the "flare" a viewer sees on the beat. Only the seven
    // protons go BRIGHT, on purpose: seventeen BRIGHT cells in a 7x3 block
    // blooms into a white blot on the tube (the UPRISING/KEEP lesson), and
    // seven reads as the same flash. Hot for the whole of FLARE_S, which is
    // SHOCK_S: nucleus and ring go out together, one event on the quiet side
    // of the beat rather than two.
    const ncx = Math.floor(cols / 2), ncy = NUCLEUS_Y
    const hot = flare > 0
    if (hot) {
      for (const [dx, dy] of [[-4, 0], [4, 0], [-3, -1], [3, -1], [-3, 1], [3, 1], [0, -2], [0, 2]]) {
        term.put(ncx + dx, ncy + dy, '·', NORMAL)
      }
    }
    for (const [dx, dy, ch, role] of NUCLEUS) {
      const attr = role === 'p' ? (hot ? BRIGHT : NORMAL) : (hot ? NORMAL : MUTED)
      term.put(ncx + dx, ncy + dy, ch, attr)
    }
  },
}
