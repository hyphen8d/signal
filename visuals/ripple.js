// SIGNAL -- visualizer effect "RIPPLE" (CITY LIGHTS). Rebuilt 2026-10-16.
//
// A night city over the bay: two ranks of tower blocks with grids of lit
// windows, a lattice broadcast tower standing over them with a beacon at its
// tip, a few rooftop signs, a moon in the upper left -- and in the lower
// third the bay itself, holding a broken, shimmering reflection of all of
// it, with rain rings opening on the water.
//
// Why it fits: CITY LIGHTS is city pop -- glossy, warm, late-night Tokyo
// records, the bay at night from a car or a hotel window. That is a PLACE,
// so this is a composed picture like KEEP and LAGOON rather than a field,
// and the tempo is calm: nothing on it strobes.
//
// What it replaced. The old RIPPLE (45th pass) was the rain rings alone:
// ring bands expanding from random points over a faint full-screen neon
// shimmer of '.' and ':'. On the 2026-10-16 review it read as a dotted
// texture with no subject, and the rings were hard to find in it; the
// reactivity probe measured it changing 50% of the screen with the music
// but showing the kick at only 3.4x. The rings were the right idea in the
// wrong place -- rain belongs on water -- so they are kept, on the bay.
//
// The music, and the one thing it does on the beat:
// - THE KICK (a rising edge on `pulse`, as DANCEFLOOR reads it -- a real
//   onset with a tap, syntheticAudio's own ~0.9s pulse without one) flares
//   the tower's beacon and sends a wave out from it across the skyline:
//   where the wave passes, the city's lights change -- a share of windows
//   switch on and others go dark (CHURN), and the lit count and brightness
//   take the level and the nine bands latched at that kick (low bands at the
//   left). The tower broadcasting and the city answering is the subject's own
//   logic, and the reflection follows because it is read from the skyline;
//   the glitter on the water re-breaks on the kick too.
// - Everything the kick changes HOLDS until the next one. 2026-10-16 -- the
//   first cut flashed windows up a tier for 160ms and let them drop back,
//   and the probe measured the kick at 1.5x: the drop was a second change
//   as large as the flash, landing between beats. A light that switches on
//   and stays on is also what a city at night actually does. Live bands
//   would be worse again: every window re-tiered on every frame.
// - A real ONSET drops a raindrop on the bay (the old RIPPLE's conscripted
//   ring, kept), sized by the bass under it; ambient rain keeps falling on a
//   stagger either way, so the bay is never still.
// Muted (SILENT_AUDIO): no kicks and no onsets, so the city holds whatever
// it last latched, at a calm floor -- lights stay on, rain keeps falling.
//
// Tube rules (the KEEP/DANCEFLOOR lesson): '█' blooms into a slab on the
// real shader at any tier, so it appears nowhere (the moon's few interior
// cells were the last of it, until 2026-10-16); building bodies are '▒'/'░' at FAINT; nothing reaches BRIGHT but
// the beacon. CITY LIGHTS carries the heaviest bloomAmt on the roster.
//
// 2026-10-16 (design pass). The viz-critic, judging the real tube, found two
// faults. The reflection was noise -- scattered `- = ~ . ¦` that did not read
// as the city upside down -- and the moon outshone the beacon: its '█'/'▀'
// crescent, a solid glyph mass, bloomed brighter than the one-cell beacon the
// kick is about, even at DIM. What changed:
//   - The reflection is built from the skyline's actual lit windows: under
//     every column that holds a lit window, a vertical streak running down
//     from the quay, `│` near and `¦` further out, one tier below the
//     brightest window in that column, and a tier dimmer again in the deeper
//     half. Its length follows how many windows in the column are lit, so a
//     kick that switches lights on or off visibly lengthens or cuts the
//     streaks under them. The random dashes and '~' are gone; the swell is a
//     one-column sway per row and a few gaps that re-break on the kick.
//   - The moon is a crescent drawn in strokes now, not glyph mass, held at
//     DIM. The critique asked for it "down to NORMAL"; it was nominally DIM
//     already, and what outshone the beacon was the solid '█' raster, so the
//     fix is the glyphs. The beacon gets a flare on the kick -- '─•─' with
//     NORMAL arms -- so the tip of the tower is the brightest, widest thing
//     on screen for that beat.
//
// Everything about the city's layout is a pure function of the grid width,
// built once per width in cityTables(), so a term of any width draws the
// same picture a fresh init at that width would. The rain slots store their
// x as a FRACTION of the width for the same reason.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)
const { hash2 } = await import(`./shared.js?v=${V}`)

// --- geometry ---------------------------------------------------------------
// The last row of the skyline (building bases), the quay under it, and the
// bay below that: rows 15..21, a third of the canvas.
export const SKY_BOT = 13
export const QUAY_Y = 14
export const WATER_TOP = 15
// Reflection mirrors about the quay: water row w shows skyline row 2*QUAY_Y - w.
export const mirrorRow = (w) => 2 * QUAY_Y - w

// The tower: its column as a fraction of the width, its tip row, and its
// half-width at the base. Right of centre, clear of the moon.
export const TOWER_FX = 0.64
export const TOWER_TOP = 2
const TOWER_BASE_HW = 5

// The moon, upper left: a crescent, as KEEP draws its own -- a disc minus a
// second disc offset to the right, sampled per half-row (a cell is ~2:1).
// 2026-10-16 -- a full disc at this size rendered as a box of '█'; the
// crescent reads as a moon at a glance and keeps the full blocks to a few.
export const MOON = { fx: 0.16, cy: 3.5, r: 3.4, bx: 1.7, br: 3.0 }
// The crescent as drawn since 2026-10-16 (see cityTables); MOON.fx still
// places it, the disc parameters are kept for the record of what it was.
export const MOON_TOP = 2
export const MOON_ART = [
  "  .-'",
  ' //  ',
  '||   ',
  ' \\\\  ',
  '  `-.',
]

// --- the beat ----------------------------------------------------------------
// Same edge and rate limit DANCEFLOOR uses, for the same reasons (a late
// fallback-ticker frame, a hi-hat onset).
export const BEAT_RISE = 0.2
export const STEP_GAP_S = 0.22
// The wave crosses ~50 columns in under 60ms -- three or four frames, so it
// reads as a burst spreading out from the tower, and the whole skyline has
// answered well inside the beat.
export const WAVE_SPEED = 900
// The share of windows that change state on a kick.
export const CHURN = 0.25

// --- rain on the bay ------------------------------------------------------------
// 2026-10-16 -- four slots at 3.4 columns a second: enough rain to keep the
// bay alive, few and slow enough that the rings' own motion between beats
// does not bury the kick (the probe measured the rings as most of what
// changed between beats at seven slots).
export const RIPPLE_SLOTS = 4
export const RIPPLE_MAXAGE = 2.4
export const RIPPLE_SPEED = 3.4
const RING_BAND = 1.2

// Intensity tiers, dark to light. BRIGHT is the beacon's alone.
const TIERS = [FAINT, DIM, MUTED, NORMAL]

// Signs, chosen per building by hash. Short enough for a narrow roof.
const SIGNS = ['HOTEL', 'BAR', 'CAFE', 'CLUB', 'RAMEN', 'KISSA']

// Cell kinds in the skyline buffer.
const K_SKY = 0, K_BODY = 1, K_WIN = 2, K_TOWER = 3, K_SIGN = 4, K_MOON = 5, K_STAR = 6, K_ROOF = 7
// Exported for tests/visual-ripple.test.mjs, which reads windows back by kind.
export const KIND = { SKY: K_SKY, BODY: K_BODY, WIN: K_WIN, TOWER: K_TOWER, SIGN: K_SIGN, MOON: K_MOON, STAR: K_STAR, ROOF: K_ROOF }

/** The city at one width: buildings, windows, tower, signs, moon, stars.
 *  Built once per width and cached. */
const tableCache = new Map()
export function cityTables(cols) {
  let T = tableCache.get(cols)
  if (T) return T
  const tx = Math.round(cols * TOWER_FX)
  const nearTower = (x0, x1) => x1 >= tx - TOWER_BASE_HW - 1 && x0 <= tx + TOWER_BASE_HW + 1
  const buildings = []
  // Back rank: taller, dimmer. Front rank: shorter, brighter, overlapping.
  const rank = (layer, startX, wMin, wSpan, hMin, hSpan, seed) => {
    let x = startX, i = 0
    while (x < cols) {
      const w = wMin + Math.floor(hash2(i, seed) * wSpan)
      let h = hMin + Math.floor(hash2(i, seed + 1) * hSpan)
      // Now and then a tower block well over its neighbours, so the
      // skyline is a skyline and not a band.
      if (layer === 0 && hash2(i, seed + 3) < 0.22) h += 3
      const x0 = x, x1 = Math.min(cols - 1, x + w - 1)
      // Low around the broadcast tower, so its whole lattice shows.
      if (nearTower(x0, x1)) h = Math.min(h, layer === 1 ? 2 : 4)
      buildings.push({ layer, x0, x1, top: SKY_BOT - h + 1, i })
      x += w + (hash2(i, seed + 2) < 0.35 ? 1 : 0)
      i++
    }
  }
  rank(0, -2, 5, 6, 5, 4, 11)
  rank(1, -4, 5, 6, 2, 5, 23)

  const n = cols * (SKY_BOT + 1)
  const kind = new Uint8Array(n)
  const layer = new Uint8Array(n)
  const ch = new Array(n).fill(' ')
  const winId = new Float32Array(n)
  const band = new Uint8Array(n)
  const at = (x, y) => y * cols + x
  for (let x = 0; x < cols; x++) for (let y = 1; y <= SKY_BOT; y++) band[at(x, y)] = Math.min(8, Math.floor(x / cols * 9))

  // Stars, then the moon, then the back rank, the tower, the front rank, signs.
  for (let y = 1; y <= 6; y++) for (let x = 0; x < cols; x++) {
    if (hash2(x, y * 3 + 1) < 0.014) { kind[at(x, y)] = K_STAR; ch[at(x, y)] = '·' }
  }
  const mx = Math.round(cols * MOON.fx)
  // 2026-10-16 (design pass): a crescent drawn in strokes, not a sampled
  // disc of '█'/'▀'/'▄' -- that slab bloomed past the beacon at any tier,
  // and a stroke-sampled disc at this size came out as a jumble of corners.
  // Hand-drawn, opening to the right, doubled through the middle for weight.
  MOON_ART.forEach((row, r) => {
    for (let k = 0; k < row.length; k++) {
      const x = mx - 2 + k, y = MOON_TOP + r
      if (row[k] === ' ' || x < 0 || x >= cols) continue
      kind[at(x, y)] = K_MOON
      ch[at(x, y)] = row[k]
    }
  })
  const drawBuilding = (b) => {
    for (let x = Math.max(0, b.x0); x <= b.x1; x++) {
      for (let y = b.top; y <= SKY_BOT; y++) {
        const i = at(x, y)
        layer[i] = b.layer
        if (y === b.top) { kind[i] = K_ROOF; ch[i] = '▄'; continue }
        const interior = x > b.x0 && x < b.x1
        // A window on every other column of the face and every row under the
        // roof; the edges of the face are solid, so each block reads as one.
        if (interior && (x - b.x0) % 2 === 1) {
          kind[i] = K_WIN
          winId[i] = hash2(x * 7 + b.layer, y * 13 + b.i)
          ch[i] = '■'
        } else {
          kind[i] = K_BODY
          ch[i] = bodyGlyph(b.layer, x, y)
        }
      }
    }
  }
  for (const b of buildings) if (b.layer === 0) drawBuilding(b)
  // The tower: two legs tapering to the tip, a mast, cross-bracing every
  // other row, and two decks. In front of the back rank, behind the front.
  for (let y = TOWER_TOP; y <= SKY_BOT; y++) {
    const f = (y - TOWER_TOP) / (SKY_BOT - TOWER_TOP)
    const hw = Math.round(f * f * TOWER_BASE_HW + f * 0.6)
    const put = (x, c) => { if (x >= 0 && x < cols) { kind[at(x, y)] = K_TOWER; ch[at(x, y)] = c; layer[at(x, y)] = 0 } }
    if (y <= TOWER_TOP + 1) { put(tx, '│'); continue }
    const deck = y === TOWER_TOP + 4 || y === TOWER_TOP + 7
    if (hw === 0) { put(tx, deck ? '■' : '┼'); continue }
    put(tx - hw, '/'); put(tx + hw, '\\')
    for (let x = tx - hw + 1; x < tx + hw; x++) {
      if (deck) put(x, '▀')
      else if (x === tx) put(x, '┼')
      else if ((y - TOWER_TOP) % 2 === 0) put(x, '─')
    }
  }
  for (const b of buildings) if (b.layer === 1) drawBuilding(b)
  // One sign per few blocks, each word once, never two within 12 columns.
  const signs = []
  for (const b of buildings) {
    if (b.layer !== 1 || b.top < 4 || b.x0 < 1 || b.x1 > cols - 2 || nearTower(b.x0, b.x1)) continue
    if (hash2(b.i, 41) > 0.5) continue
    if (signs.some((g) => Math.abs(g.x - b.x0) < 12)) continue
    const word = SIGNS.find((w) => w.length <= b.x1 - b.x0 + 1 && !signs.some((g) => g.word === w))
    if (!word) continue
    const sx = Math.round((b.x0 + b.x1 - word.length + 1) / 2), sy = b.top - 1
    for (let k = 0; k < word.length; k++) {
      const i = at(sx + k, sy)
      if (kind[i] === K_TOWER || kind[i] === K_MOON) continue
      kind[i] = K_SIGN; ch[i] = word[k]
    }
    signs.push({ x: sx, y: sy, len: word.length, i: b.i, word })
  }
  T = { cols, tx, mx, kind, layer, ch, winId, band, signs, buildings }
  tableCache.set(cols, T)
  return T
}

// A building's face where there is no lit window. 2026-10-16 (tube check):
// '▒' faces glowed as solid slabs under CITY LIGHTS' bloom and the windows
// drowned in them, so the front rank is '░' and the back rank a thinned
// '░' -- far blocks read as a roofline and their lights, which is how a
// skyline at night actually looks.
const bodyGlyph = (layer, x, y) => layer === 1 ? '░' : (hash2(x, y * 7) < 0.4 ? '░' : ' ')


function respawnRing(r, t, delay) {
  r.fx = Math.random()
  r.y = WATER_TOP + 0.5 + Math.random() * (VIZ_BOT - WATER_TOP - 1)
  r.startT = t + delay
  r.amp = 1
}

export default {
  key: 'ripple',
  label: 'BAYSIDE',
  /** Seeds this effect's state on the program object (once, at boot). */
  init(p) {
    p._ripples = Array.from({ length: RIPPLE_SLOTS }, () => {
      const r = {}
      respawnRing(r, 0, 0)
      r.startT = -Math.random() * RIPPLE_MAXAGE
      return r
    })
    p._rippleStep = 0
    p._rippleLvl = p._rippleLvlPrev = 0.5
    p._rippleBands = new Array(9).fill(0.45)
    p._rippleBandsPrev = new Array(9).fill(0.45)
    p._ripplePrevPulse = 0
    p._rippleKickAt = -Infinity
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    // 2026-09-12 (audit, M5) -- every ring's startT is an absolute
    // effect-clock value, so after a long visit a re-entry left them in the
    // future of the restarted clock: skipped by the draw, never respawned.
    // Re-seeded on the same stagger init() uses. The kick time is the same
    // kind of value (2026-10-16): left over, it would hold the wave for as
    // long as the last visit lasted. The latched level and bands are not
    // clocks and carry over -- the city comes back lit the way it was left.
    for (const r of p._ripples) {
      respawnRing(r, 0, 0)
      r.startT = -Math.random() * RIPPLE_MAXAGE
    }
    p._rippleKickAt = -Infinity
    p._ripplePrevPulse = 0
  },
  draw(p, s, t) {
    const { term } = s
    const cols = term.cols
    const T = cityTables(cols)
    const muted = !!p.muted
    const A = muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    const at = (x, y) => y * cols + x

    // --- the beat ---------------------------------------------------------------
    const pulse = A.pulse || 0
    if (!muted && pulse - p._ripplePrevPulse >= BEAT_RISE && t - p._rippleKickAt >= STEP_GAP_S) {
      // The previous kick's latch is kept: cells the wave has not reached
      // yet still show it, so the change spreads rather than lands at once.
      p._rippleStep++
      p._rippleKickAt = t
      p._rippleLvlPrev = p._rippleLvl
      p._rippleLvl = Math.min(1, Math.max(0, A.level || 0))
      const b9 = A.bands9 || []
      for (let i = 0; i < 9; i++) {
        p._rippleBandsPrev[i] = p._rippleBands[i]
        p._rippleBands[i] = Math.min(1, Math.max(0, b9[i] ?? A.level ?? 0))
      }
    }
    p._ripplePrevPulse = pulse
    const step = p._rippleStep
    const litNow = 0.3 + 0.4 * p._rippleLvl, litPrev = 0.3 + 0.4 * p._rippleLvlPrev
    const sinceKick = t - p._rippleKickAt

    // --- rain -------------------------------------------------------------------
    // An ambient drop lands as soon as its last ring has faded: the slots'
    // random starting ages keep them out of step, and onsets break the
    // rhythm up. 2026-10-16 -- the old RIPPLE waited up to 0.6s before a
    // respawn; with four slots instead of eleven, two waiting at once left
    // the bay with one ring, and tests/visuals.test.mjs's re-entry check
    // caught it two runs in twenty.
    for (const r of p._ripples) if (t - r.startT > RIPPLE_MAXAGE) respawnRing(r, t, 0)
    if (!muted && A.onset) {
      let oldest = null
      for (const r of p._ripples) {
        if (t - r.startT > RIPPLE_MAXAGE * 0.45 && (!oldest || r.startT < oldest.startT)) oldest = r
      }
      if (oldest) { respawnRing(oldest, t, 0); oldest.amp = 1 + 0.4 * Math.min(1, A.bass || 0) }
    }

    // --- the skyline: a tier per cell, then paint it ----------------------------
    // Reused per width: the tier of each skyline cell this frame (-1 = dark),
    // which the reflection reads back.
    if (!T.tier) T.tier = new Int8Array(T.kind.length)
    const tier = T.tier
    const beacon = muted ? 0 : Math.max(0, 1 - sinceKick / 0.3)
    for (let y = 1; y <= SKY_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        const i = at(x, y)
        const k = T.kind[i]
        let c = T.ch[i], tr = -1
        if (k === K_SKY) { c = ' ' }
        else if (k === K_STAR) tr = 0
        else if (k === K_MOON) tr = 1
        else if (k === K_ROOF || k === K_BODY) tr = 0
        else if (k === K_TOWER) {
          tr = 1
          if (y === TOWER_TOP) { c = '•'; tr = beacon > 0.4 ? 4 : (Math.floor(t * 1.2) % 2 ? 2 : 1) }
        } else if (k === K_SIGN) {
          // A sign drops out now and then for a quarter second -- a tube
          // on its way out. Slow enough to be a detail, never a strobe.
          const sg = T.signs.find((g) => g.y === y && x >= g.x && x < g.x + g.len)
          tr = hash2(sg ? sg.i : 0, Math.floor(t * 4)) < 0.03 ? 0 : 2
        } else if (k === K_WIN) {
          const id = T.winId[i]
          // Has the last kick's wave reached this column yet?
          const arrived = sinceKick >= Math.abs(x - T.tx) / WAVE_SPEED
          const st = arrived ? step : step - 1
          let lit = id < (arrived ? litNow : litPrev)
          if (hash2(id * 977, st) < CHURN) lit = !lit
          const b = (arrived ? p._rippleBands : p._rippleBandsPrev)[T.band[i]]
          // Lit windows sit well above the FAINT bodies: MUTED in the front
          // rank (NORMAL where the band is hot), DIM in the back. A window at
          // the body's own tier is a window nobody can see.
          const kt = (T.layer[i] === 0 ? 1 : 2) + (b > 0.6 ? 1 : 0)
          if (lit) tr = Math.min(3, kt)
          else { c = bodyGlyph(T.layer[i], x, y); tr = 0 }
        }
        // The beacon's flare (2026-10-16 design pass): arms either side of
        // the tip while it is lit, so the kick's subject is the widest light
        // in the sky as well as the brightest.
        if (y === TOWER_TOP && beacon > 0.4 && x !== T.tx && Math.abs(x - T.tx) <= 2) {
          c = Math.abs(x - T.tx) === 1 ? '─' : '·'; tr = Math.abs(x - T.tx) === 1 ? 3 : 2
        }
        tier[i] = tr
        if (tr < 0) term.put(x, y, ' ')
        else term.put(x, y, c, tr === 4 ? BRIGHT : TIERS[tr])
      }
    }

    // --- the quay -----------------------------------------------------------------
    for (let x = 0; x < cols; x++) term.put(x, QUAY_Y, '▀', FAINT)

    // --- the bay: reflection, moon path, rain ---------------------------------------
    // 2026-10-16 (design pass): the reflection is read off the lit windows,
    // column by column -- see the header. colTier/colLit are reused per width.
    if (!T.colTier) { T.colTier = new Int8Array(cols); T.colLit = new Uint8Array(cols) }
    const colTier = T.colTier, colLit = T.colLit
    for (let x = 0; x < cols; x++) {
      let best = -1, n = 0
      for (let y = 1; y <= SKY_BOT; y++) {
        const i = at(x, y)
        if (T.kind[i] === K_WIN && tier[i] >= 1) { n++; if (tier[i] > best) best = tier[i] }
      }
      colTier[x] = best; colLit[x] = n
    }
    const bayRows = VIZ_BOT - WATER_TOP
    // The swell re-breaks the streaks on each kick, and drifts slowly between
    // them so a long quiet passage is not frozen water.
    const glit = step * 3 + Math.floor(t * 0.25)
    for (let w = WATER_TOP; w < VIZ_BOT; w++) {
      const depth = w - WATER_TOP
      const deep = depth >= bayRows / 2
      // The swell's sideways sway: one column at most, advancing a notch on
      // each kick with a slow drift under that.
      const dx = Math.round(Math.sin(w * 1.9 + step * 0.35 + t * 0.06) * Math.min(1, 0.3 + depth * 0.15))
      const pathHW = 1 + depth * 0.45
      for (let x = 0; x < cols; x++) {
        let c = ' ', a = FAINT
        // Rain first: a ring cell wins over whatever it falls on.
        let v = 0
        for (const r of p._ripples) {
          const age = t - r.startT
          if (age < 0 || age > RIPPLE_MAXAGE) continue
          const ex = x - r.fx * cols, ey = (w - r.y) * 3
          const ringDist = Math.abs(Math.sqrt(ex * ex + ey * ey) - age * RIPPLE_SPEED)
          if (ringDist < RING_BAND) v = Math.max(v, (1 - ringDist / RING_BAND) * (1 - age / RIPPLE_MAXAGE) * (r.amp || 1))
        }
        if (v > 0.15) {
          // Dots, two tiers: a ring reads as a ring and not as a cluster of
          // bubbles ('o' did), and each cell changes as few times as it can
          // while the ring fades.
          c = v > 0.45 ? '∙' : '·'
          a = v > 0.45 ? DIM : FAINT
          term.put(x, w, c, a)
          continue
        }
        const sx = x + dx
        const ct = sx >= 0 && sx < cols ? colTier[sx] : -1
        // A lit column's streak: two rows plus one per lit window, so the
        // busier the column, the further its light reaches across the bay.
        if (ct >= 1 && depth < 2 + colLit[sx] && hash2(sx * 3 + w, glit) >= 0.12) {
          c = deep ? '¦' : '│'
          a = TIERS[Math.max(0, ct - 1 - (deep ? 1 : 0))]
        } else if (sx === T.tx && hash2(w * 5, glit) >= 0.3) {
          // The tower's mast, faint on the water.
          c = '¦'; a = FAINT
        } else if (Math.abs(x - T.mx) <= pathHW && (x + w) % 2 === 0) {
          // The moon's path: a column of glints widening toward the viewer,
          // fixed rather than random, so it reads as the moon's and not noise.
          c = '-'; a = FAINT
        }
        term.put(x, w, c, a)
      }
    }
  },
}
