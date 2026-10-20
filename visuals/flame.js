// SIGNAL -- visualizer effect "FLAME". Split out of program.js in the
// 2026-08-25 audit; `this` became `p` (the program object).
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { DIM, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { SILENT_AUDIO, auMul, syntheticAudio } = await import(`../audio/tap.js?v=${V}`)
const { VIZ_BOT } = await import(`../layout.js?v=${V}`)

// ---- character-cell history (46th-62nd passes) ----
// Kept because it is the record of what the audio coupling and the pacing
// below are FOR; the character renderer it describes is gone (2026-09-21,
// see the next block).
//
// FLAME effect (46th pass) -- for DISTORTION FIELD, replacing HOWL
// outright (which had itself replaced FEEDBACK -- see the field notes
// above VISUAL_METHODS). Live QA: "fire 'flame' living thing." Classic
// bottom-up fire propagation: the floor row is reseeded hot (with
// occasional dark gaps for flicker) every frame, and every row above
// pulls its heat from a randomly-offset cell one row below, cooling by a
// random amount as it rises -- the sideways randomness is what makes it
// drift and lick rather than rise in straight columns, and the random
// cooling is what gives it a natural tapering silhouette (dense near the
// floor, sparse embers near the top) with zero fixed cycle -- no two
// frames are ever the same, unlike anything else on the roster.
// 47th pass: live QA said "too fast, make more organic." At 60fps the
// whole buffer recomputed fresh every render frame read as a flicker
// rather than a living flame. Two fixes: step the physics on its own
// slower clock independent of render rate, and ease the floor's reseed
// toward its new target instead of snapping to it -- together that
// turns the jitter into a slow, licking billow.
// 48th pass: with cooling too low, heat barely decayed over the ~21-row
// climb from floor to top, so the whole column stayed lit almost every
// frame instead of tapering -- "hung" on dev: not frozen, just
// permanently full-screen and never resolving into a flame shape. Cooling
// restored; only the step clock (0.13s) carried the further slowdown.
// 50th pass: the effect clock rewinds to 0 on every visualizer entry, so a
// step time left over from a previous visit sits in the future and gates
// the simulation off entirely. Re-armed in reset() AND by the draw itself
// on a clock that went backwards.
// 57th pass -- no activity if there is no audio, flames should react
// more. Fuel's range widened and the pulse kick raised so quiet stretches
// genuinely bank the fire down and loud ones blow it out taller; a real
// onset slams the floor toward full heat for one step.
// 62nd pass -- the no-tap ember bed read as broken rather than
// atmospheric, so the effect falls back to syntheticAudio(t) and never
// goes fully cold.

// ---- beam-resolution fire (2026-09-21) ----
// Adapted from Cyberspace TERMINAL's fire screensaver
// (packages/crt/src/savers/fire.ts, same author and licence as src/, MIT).
//
// Why: drawn in characters the flame had 21 rows to cool over, which is
// the 46th-48th pass saga in one sentence -- cool it fast enough to taper
// and it is a smear of embers, slow enough to fill and "the whole column
// stayed lit". Upstream's header names the same failure: "over 25 rows a
// flame starting hot never cools enough to taper, and half the beam lit
// reads as a lamp". putGlyph() gives every cell its own 8x16 bitmap, so
// the fire gets ~336 pixel rows to die over and tone comes from how many
// pixels are lit (a 4x4 ordered dither) rather than which glyph was
// picked. Same beam bytes as text, so bloom/scanlines/persistence apply.
//
// What carried over, deliberately:
//  - the fuel coupling (47th/57th): bass sets how tall it burns, pulse and
//    onsets flare the bed. The range is 0.4..1.5 where the old one was
//    0.4..2.3: heat here is an integer budget spent one sim row at a time,
//    not a 0..1 value clamped every row, and the old top end was
//    compensating for that clamp. See FIRE_CAP for why the bed may run
//    over the dither's range.
//  - the synthetic fallback (62nd): never a cold ember bed.
//  - its own step clock (47th), now a fixed 30Hz with a catch-up clamp.
//    The old 0.13s step moved flame one whole CELL row per step; a sim row
//    here is 2 pixels, so matching the old rise speed would take ~60Hz.
//    30Hz is slower than the old pace on purpose -- the billow the 47th
//    pass asked for.
//  - the eased bed (47th) and the clock-went-backwards re-arm (50th).
// New from upstream: SPARKS -- a few elements faster than the smooth heat
// field, which is most of what reads as burning. An onset throws a
// handful, so a hit shows as sparks as well as a flare.
//
// One deliberate difference: upstream allocates one bitmap per cell and
// rewrites it in place. cellgrid.js skips a same-reference putGlyph()
// (per-row dirty tracking -- see its doc comment), so an in-place rewrite
// would never be re-rastered here. Two bitmaps per cell, alternated per
// step: a fresh reference every step, zero allocation.

// ---- 2026-10-20 polish pass (critique of the 10-20 contact sheets) ----
// Matt approved FLAME live on 2026-09-22, so this pass changed as little
// as it could. The critic raised three things:
//  - "A full-width dark seam splits the fire into two decks" (LOUD and
//    every KICK tile). NOT A BUG, and not phosphor persistence either --
//    viz-preview (no persistence) shows it too. It is the MUTED tile's
//    banked-down bed still rising: the field climbs one sim row per 30Hz
//    step, so a mute->loud change travels up the canvas as a dark band for
//    ~5s, and the sheet takes LOUD 1.5s after MUTED. On the capture tube
//    (~2fps) the 3-steps-a-frame catch-up clamp slows the sim ~5x, which
//    is why the band sat in place across all four tiles. Held at LOUD for
//    8s there is no seam. Left alone: a fire flaring up after a quiet
//    stretch is supposed to look like that.
//  - "NO TAP is a 4-row hedge." Real, in the synthetic signal's troughs:
//    measured 4..14 rows over a minute. NO TAP gets its own fuel range
//    (FUEL_SYNTH), 9..12 rows; a real tap keeps the 57th pass's range.
//  - "LOUD and KICK look alike." Part of that was a real bug: `onset` is
//    up for one render frame and only every other frame steps the fire,
//    so half of all kicks never flared it or threw sparks. The onset is
//    latched now. On top, a kick drives three narrow spots on the grate to
//    full heat for a quarter second (the surge), so licks grow out of the
//    bed. Painting tall tongues straight into the field was tried first
//    and rejected the same day: the field is carried up rigidly, so they
//    read as tree trunks. The surge is subtle in a still -- the fire cannot
//    rise faster than ~4 cell rows a second -- and that was preferred to a
//    still-friendly shape that looks wrong moving.
const FIRE_MAX = 52 // heat levels the dither resolves; mean cooling is 1/3 level per sim row
// The bed may run hotter than the dither can show: heat above FIRE_MAX
// renders as the capped core, but it buys HEIGHT, since height is the bed's
// heat over the cooling rate. Capped at FIRE_MAX the loudest track stood two
// rows over silence (measured 10 vs 12, tests/visual-flame.test.mjs) -- the
// 57th pass's "loud ones blow it out taller" was gone. Uint8 heat, so < 256.
// 2026-10-12 -- that measurement was taken 4s in, while the fire was still
// climbing (~5.6s to the top at 30Hz), and the test built on it passed with
// this cap undone. Settled, mid bass stands 9 rows and the loudest 19 with
// the cap, 14-15 without; the test now reads it that way.
const FIRE_CAP = FIRE_MAX * 2
const FIRE_HZ = 30
// Bass -> fuel. FUEL_TAP is the 57th pass's range, untouched: a real tap
// banks the fire right down in a quiet stretch and that is the point.
// FUEL_SYNTH (2026-10-20) is for NO TAP only. syntheticAudio()'s bass
// wanders 0..0.66 on a ~27s cycle, so on the tap's range a visitor with no
// tap -- most of them -- spent the troughs looking at a 4-5 row hedge
// (measured over a minute: 4..14 rows of the 21's canvas, 1-second means).
// There is no music being misrepresented by holding it up, so the floor
// rises and the swing narrows: 9..12 rows, about half the canvas.
const FUEL_TAP = [0.4, 1.5]
const FUEL_SYNTH = [0.8, 1.05]
// Hot tongues an onset grows out of the bed (see stepFire): how many, for
// how many 30Hz steps, how wide (sim px, ~1/e half-width) and how much fuel
// over the bed's own.
const TONGUES = 3
const SURGE_STEPS = 8
const SURGE_W = 5
const SURGE_HEAT = 1.2
const FIRE_SPARKS = 32
// 4x4 ordered dither -- ordered, not error-diffused: a regular screen
// reads as a deliberate treatment, a scattered one as noise.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
// Heat -> share of the cell lit. Capped below 1 so even the bed keeps
// dark pixels; a fully lit cell reads as a solid bar.
const TONE = new Float32Array(FIRE_CAP + 1)
for (let v = 0; v <= FIRE_CAP; v++) TONE[v] = Math.min(0.8, Math.pow(v / FIRE_MAX, 1.7))

export default {
  key: 'flame',
  label: 'FLAME',
  /** Seeds this effect's state on the program object (once, at boot).
   *  Lazily: the buffers (two bitmaps per cell, ~3,400 typed arrays) are
   *  built on FLAME's first draw, not at boot -- most sessions never open
   *  it, and tools/dead-feedback.mjs keeps every boot's state alive, where
   *  allocating them per boot ran the sweep out of heap. */
  init(p) {
    p._fire = null
    p._fireLastStep = 0
  },
  alloc(p, term) {
    const { cellW, cellH } = term.font
    // Canvas is rows 1..VIZ_BOT-1; heat at half resolution on both axes
    // (bounds the Math.random() calls per step), dithered at full.
    const rows = VIZ_BOT - 1
    const W = (term.cols * cellW) >> 1
    const H = (rows * cellH) >> 1
    p._fire = {
      cols: term.cols, W, H, cellW, cellH, rows,
      heat: new Uint8Array(W * H),
      bed: new Float32Array(W),
      sparks: [],
      kickPending: false,
      surge: null,
      tick: 0,
      front: 0,
      bufs: [0, 1].map(() => Array.from({ length: term.cols * rows }, () => new Uint16Array(cellH))),
      // Separate from `attr` because NORMAL is attribute 0: using 0 as
      // "blank" here once blanked every cell hot enough to be NORMAL -- the
      // hottest part of the fire came out as dark holes in the bed.
      lit: new Uint8Array(term.cols * rows),
      attr: new Uint8Array(term.cols * rows),
    }
    p._fireLastStep = 0
  },
  /** Re-arms clocks/accumulators on every visualizer entry. */
  reset(p) {
    p._fireLastStep = 0
  },
  draw(p, s, t) {
    const { term } = s
    // Sized on first draw for this grid. The grid is fixed for a page's life,
    // but indices built for one width silently wrap rows on another (the
    // 2026-09-13 audit's L5 shape), so re-size rather than trust it.
    if (!p._fire || p._fire.cols !== term.cols) this.alloc(p, term)
    const F = p._fire
    const A = p.muted ? SILENT_AUDIO : (p._au || syntheticAudio(t))
    // NO TAP burns on a raised floor (2026-10-20): see FUEL_SYNTH.
    const fuelRange = !p.muted && !p._au ? FUEL_SYNTH : FUEL_TAP
    // Latch the onset until a step consumes it (2026-10-20). The tap raises
    // `onset` for one render frame, and at 60fps only every other frame runs
    // a 30Hz step -- so half of all kicks never reached the fire: no flare,
    // no spark burst. Measured while building the tongues, which were
    // missing from the KICK still for exactly that reason.
    if (A.onset) F.kickPending = true
    if (t < p._fireLastStep) p._fireLastStep = 0
    // Fixed step, at most 3 per frame; past that the clock is snapped
    // forward, so a stalled tab resumes rather than burning a backlog.
    let steps = 0
    while (t - p._fireLastStep >= 1 / FIRE_HZ && steps < 3) {
      p._fireLastStep += 1 / FIRE_HZ
      stepFire(F, A, fuelRange, F.kickPending)
      F.kickPending = false
      steps++
    }
    if (t - p._fireLastStep > 0.25) p._fireLastStep = t
    if (steps) renderFire(F, term.cols)
    const cols = term.cols
    const bufs = F.bufs[F.front]
    for (let cy = 0; cy < F.rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx
        // Re-put every frame: the same reference as last frame is a no-op
        // in cellgrid.js, and a cell something else wrote over in between
        // gets the flame back on this tick.
        if (F.lit[i]) term.putGlyph(cx, cy + 1, bufs[i], F.attr[i])
        else term.put(cx, cy + 1, ' ')
      }
    }
  },
}

function stepFire(F, A, [fLo, fHi] = FUEL_TAP, kick = A.onset) {
  const { W, H, heat, bed, sparks } = F
  const tk = ++F.tick
  const fuel = auMul(A, A.bass, fLo, fHi)
  const flare = A.pulse * 0.35 + (kick ? 0.3 : 0)
  const base = (H - 1) * W
  // Tongues (2026-10-20): an onset picks a few narrow spots on the grate and
  // drives them to full heat for a quarter second, so tall licks grow up out
  // of the bed instead of the whole bed lifting a little. Fed in at the BED
  // and left to the propagation, deliberately: a lick painted straight into
  // the field (tried first, the same day) is carried up rigidly one sim row
  // a step and read as a row of tree trunks.
  if (kick) F.surge = { left: SURGE_STEPS, xs: Array.from({ length: TONGUES }, (_, k) => (W * (k + 0.15 + Math.random() * 0.7)) / TONGUES) }
  const surge = F.surge && F.surge.left-- > 0 ? F.surge.xs : null
  for (let x = 0; x < W; x++) {
    // Two slow sines at unrelated frequencies wander bright columns along
    // the grate: a flat source is a flat fire.
    const a = Math.sin(x * 0.055 + tk * 0.05)
    const b = Math.sin(x * 0.017 - tk * 0.031)
    let target = (0.7 + 0.19 * a + 0.15 * b) * fuel + flare
    if (surge) for (const sx of surge) { const d = (x - sx) / SURGE_W; target += SURGE_HEAT * Math.exp(-d * d) }
    bed[x] = bed[x] * 0.5 + target * 0.5 // eased, not snapped (47th pass)
    heat[base + x] = Math.min(FIRE_CAP, Math.max(0, Math.round(FIRE_MAX * bed[x])))
  }
  // DOOM fire. One random call serves twice: its low bit decides whether
  // the cell cools, its value which way the flame leans.
  for (let y = 1; y < H; y++) {
    const up = (y - 1) * W
    const row = y * W
    for (let x = 0; x < W; x++) {
      const v = heat[row + x]
      if (!v) { heat[up + x] = 0; continue }
      const r = (Math.random() * 3) | 0
      const dx = x - r + 1
      if (dx < 0 || dx >= W) continue
      heat[up + dx] = v - (r & 1)
    }
  }
  // Sparks are written into the heat field, so the same dither lights them
  // and they cool as they rise. Emitted only from hot bed, so they come in
  // bursts.
  const emit = kick ? 6 : (Math.random() < 0.5 ? 1 : 0)
  for (let k = 0; k < emit && sparks.length < FIRE_SPARKS; k++) {
    const x = (Math.random() * W) | 0
    if (heat[base + x] > FIRE_MAX * 0.75) sparks.push({ x, y: H - 2, vy: 0.9 + Math.random() * 1.6, life: 1 })
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const sp = sparks[i]
    sp.y -= sp.vy
    sp.x += (Math.random() - 0.5) * 1.4
    sp.life -= 0.012
    if (sp.y < 0 || sp.x < 0 || sp.x >= W || sp.life <= 0) { sparks.splice(i, 1); continue }
    heat[(sp.y | 0) * W + (sp.x | 0)] = Math.min(FIRE_MAX, FIRE_MAX * sp.life * 1.2)
  }
}

function renderFire(F, cols) {
  const { W, heat, cellW, cellH, rows } = F
  F.front ^= 1
  const bufs = F.bufs[F.front]
  const area = cellW * cellH
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const bits = bufs[i]
      let any = 0
      let sum = 0
      for (let py = 0; py < cellH; py++) {
        const sy = ((cy * cellH + py) >> 1) * W
        let row = 0
        for (let px = 0; px < cellW; px++) {
          const tone = TONE[heat[sy + ((cx * cellW + px) >> 1)]]
          sum += tone
          if (tone > (BAYER[(py & 3) * 4 + (px & 3)] + 0.5) / 16) row |= 1 << (cellW - 1 - px)
        }
        bits[py] = row
        any |= row
      }
      // The beam level only says which part of the fire a cell is in; tone
      // is how many pixels are lit. NORMAL is the ceiling: BRIGHT over this
      // much lit area is a lamp, not a flame.
      const mean = sum / area
      F.lit[i] = any ? 1 : 0
      F.attr[i] = mean > 0.62 ? NORMAL : mean > 0.3 ? MUTED : DIM
    }
  }
}
