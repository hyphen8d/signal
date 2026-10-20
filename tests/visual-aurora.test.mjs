// AURORA (DRIFT MODE, 2026-09-13; redrawn in pixels 2026-10-20) -- what the
// effect promises, read back off the grid. It draws through putGlyph()
// bitmaps, so a character-reading test sees every lit cell as a space
// (CLAUDE.md, FLAME's note): everything here reads term.gfx, cell by cell,
// back into a picture of tiers -- the same 640x336 the effect drew -- and
// asks that picture questions. Never the effect's own idea of what it drew
// (the lesson tests/visuals.test.mjs's header records from BREACH).
//
// Covered: the canvas contract at three widths and nothing but bitmaps and
// blanks on it; that the subject reads (long continuous hems with rays
// standing on them, a dark ridge with a lit crest, stars, a snowfield,
// pines cut out of it); the brightness order at every level, muted
// included; that the fabricated pulse is ignored while level is not; that
// the snow catches the curtains' light; that an onset sends a wave which
// travels and clears, and a muted one does nothing; calm at rest and
// bounded under a strobing tap; muted faint but present; re-entry on a sane
// clock (the M5 class).
//
// 2026-10-20 -- rewritten with the pixel redraw. The character-era tests
// counted `─━▁` hem glyphs and `│¦:` rays, a `░` ridge and `─~` lake
// streaks; each claim is kept in its pixel form (a hem is a 3px solid run,
// a ray is lit pixels above it, the ridge is dark inside a lit crest) and
// the lake's became the snow's. The calm budget moved from changed cells to
// changed PIXELS: a cell is now 128 of them, and one pixel of a slow hem
// crossing a dither threshold changes the cell without changing the
// picture.
//
// Run: node --test tests/visual-aurora.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot } from './harness.mjs'
import { parseBDF } from '../src/bdf.js'
import { Term, BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const VIZ_BOT = 22
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000

async function bootAurora(opts = {}) {
  const h = await boot({ station: 'drift-mode', ...opts })
  h.powerOn()
  h.key('v')
  if (h.program.tapConsentOpen) h.key('n')
  assert.equal(h.program.activeVisualKey(), 'aurora', 'drift-mode should land on aurora')
  // The same module instance the registry dispatches to: every app module is
  // instanced per full URL, and the registry imports it with this boot's tag.
  const mod = await import(`../visuals/aurora.js?v=${h.tag}`)
  return { h, aurora: mod.default, mod }
}

// Attribute -> rank, brightest highest. NORMAL is attribute 0.
const RANK = new Map([[FAINT, 0], [DIM, 1], [MUTED, 2], [NORMAL, 3], [BRIGHT, 4]])

/** The canvas as a picture: per pixel, the rank of its cell's attribute if
 *  the pixel is lit, else -1. W x H with H = 21 cell rows. */
function picture(term) {
  const cw = term.font.cellW, ch = term.font.cellH
  const W = term.cols * cw, H = (VIZ_BOT - 1) * ch
  const px = new Int8Array(W * H).fill(-1)
  for (let cy = 1; cy < VIZ_BOT; cy++) {
    for (let cx = 0; cx < term.cols; cx++) {
      const i = cy * term.cols + cx
      const g = term.gfx[i]
      if (!g) continue
      const r = RANK.get(term.attrs[i])
      for (let py = 0; py < ch; py++) {
        const bits = g[py]
        if (!bits) continue
        for (let k = 0; k < cw; k++) if (bits & (1 << (cw - 1 - k))) px[((cy - 1) * ch + py) * W + cx * cw + k] = r
      }
    }
  }
  return { px, W, H }
}

const litCount = (P, pick = () => true) => {
  let n = 0
  for (let y = 0; y < P.H; y++) for (let x = 0; x < P.W; x++) if (P.px[y * P.W + x] >= 0 && pick(x, y)) n++
  return n
}
const pixelDiff = (a, b) => { let n = 0; for (let i = 0; i < a.px.length; i++) if ((a.px[i] >= 0) !== (b.px[i] >= 0) || a.px[i] !== b.px[i]) n++; return n }

/** Columns where two pictures differ by at least `min` pixels above row
 *  `yMax` -- the sky, where the wave rides; a stray dither pixel in a
 *  Gaussian's far tail, or the snow's eased glow, is not the wave. */
const diffCols = (a, b, yMax, min = 6) => {
  const n = new Uint16Array(a.W)
  for (let i = 0; i < yMax * a.W; i++) if (a.px[i] !== b.px[i]) n[i % a.W]++
  const xs = []
  for (let x = 0; x < a.W; x++) if (n[x] >= min) xs.push(x)
  return xs
}

/** The longest run of adjacent columns each holding a HEM -- `minTier` or
 *  brighter, solid for 2px straight down (a full hem is 3, a faint one 2)
 *  with dark under it -- within 2px of the previous
 *  column's. A curtain's lower edge, read as a line. */
function longestHem(P, S, minTier = 2) {
  const hemAt = (x) => {
    const ys = []
    for (let y = 2; y < S.crestY[x] - 1; y++) {
      const i = y * P.W + x
      if (P.px[i] >= minTier && P.px[i - P.W] >= minTier && P.px[i + P.W] < minTier) ys.push(y)
    }
    return ys
  }
  let best = 0, run = 0, prev = []
  for (let x = 0; x < P.W; x++) {
    const ys = hemAt(x)
    const joined = ys.some((y) => prev.some((q) => Math.abs(q - y) <= 2))
    run = ys.length ? (joined ? run + 1 : 1) : 0
    if (run > best) best = run
    prev = ys
  }
  return best
}

const audio = (over) => ({
  level: 0.6, bass: 0.9, mid: 0.5, treble: 0.4,
  bands9: [0.2, 0.7, 0.4, 0.9, 0.3, 0.6, 0.5, 0.8, 0.1],
  onset: false, pulse: 0, ...over,
})
const LOUD = () => audio({ level: 1, bands9: new Array(9).fill(1) })
const QUIET = () => audio({ level: 0.05, bands9: new Array(9).fill(0.05) })

/** Draw once on a fresh visit at t, snapped to the given audio. */
function drawAt(h, aurora, t, A, muted = false) {
  const p = h.program
  p.muted = muted
  aurora.reset(p)
  p._au = A
  aurora.draw(p, h.screen, t)
  return picture(h.term)
}

test('AURORA: paints every canvas cell and nothing outside it, at 60, 80 and 100 columns -- bitmaps or blanks only', async () => {
  const { h, aurora } = await bootAurora()
  try {
    const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))
    for (const cols of [60, 80, 100]) {
      const term = new Term(font, cols, 25, 6, 5)
      aurora.reset(h.program)
      const { put, putGlyph } = term
      const outside = []
      let missed = 0
      for (let f = 0; f < 12; f++) {
        const hit = new Uint8Array(cols * VIZ_BOT)
        const mark = (x, y) => {
          if (y < 1 || y >= VIZ_BOT || x < 0 || x >= cols) outside.push([x, y])
          else hit[y * cols + x] = 1
        }
        term.put = function (x, y, ...rest) { mark(x, y); return put.call(this, x, y, ...rest) }
        term.putGlyph = function (x, y, ...rest) { mark(x, y); return putGlyph.call(this, x, y, ...rest) }
        try {
          h.program.muted = false
          h.program._au = audio({ onset: f === 3 })
          aurora.draw(h.program, { term }, 5 + f / 10)
        } finally { term.put = put; term.putGlyph = putGlyph }
        for (let i = cols; i < cols * VIZ_BOT; i++) if (!hit[i]) missed++
      }
      assert.deepEqual(outside.slice(0, 3), [], `${cols} cols: wrote outside the canvas`)
      assert.equal(missed, 0, `${cols} cols: ${missed} cell-frames left unpainted`)
      // No characters: a cell is a bitmap or a blank. (No shade block, no
      // `~` rastering as `N` -- the 2026-10-20 critique's finding.)
      for (let i = cols; i < cols * VIZ_BOT; i++) {
        if (term.gfx[i]) continue
        assert.equal(String.fromCodePoint(term.chars[i]), ' ', `${cols} cols: a character on the canvas at cell ${i % cols},${Math.floor(i / cols)}`)
      }
    }
  } finally { h.shutdown() }
})

test('AURORA: moves -- pictures two seconds apart differ', async () => {
  const { h } = await bootAurora()
  try {
    h.advance(2000)
    const a = picture(h.term)
    h.advance(2000)
    const b = picture(h.term)
    assert.ok(pixelDiff(a, b) >= 50, `only ${pixelDiff(a, b)} pixels changed in 2s`)
  } finally { h.shutdown() }
})

test('AURORA: the subject reads -- long hems with rays on them, a dark ridge with a lit crest, stars, snow, pines', async () => {
  const { h, aurora, mod } = await bootAurora()
  try {
    h.advance(500)
    const S = mod.sceneTables(h.term.cols, h.term.font.cellW, h.term.font.cellH)
    for (const t of [21.7, 140.2]) {
      const P = drawAt(h, aurora, t, audio({ level: 0.75 }))
      const { W, H } = P
      // Hems: a continuous solid edge at NORMAL or brighter, a third of the
      // canvas wide at least.
      const run = longestHem(P, S, 3)
      assert.ok(run >= W / 5, `t=${t}: longest NORMAL hem is ${run}px of ${W}`)
      const faint = longestHem(P, S, 2)
      assert.ok(faint >= W / 4, `t=${t}: longest MUTED-or-brighter hem is ${faint}px of ${W}`)
      // Rays: lit sky pixels well above any hem -- 12px or more above the
      // nearest lit hem pixel below them in the column -- and dark gaps
      // between them: on a row through the rays, lit and dark alternate.
      let rays = 0, alternations = 0
      for (let x = 0; x < W; x++) {
        let lastHem = -1
        for (let y = S.crestY[x] - 2; y >= 0; y--) {
          const v = P.px[y * W + x]
          if (v >= 2 && P.px[(y - 1) * W + x] >= 2 && P.px[(y - 2) * W + x] >= 2) lastHem = y
          else if (v >= 1 && lastHem >= 0 && lastHem - y >= 12 && S.own[y * W + x] === mod.OWN.SKY) rays++
        }
      }
      for (let y = 20; y < S.SHORE - 100; y += 7) {
        for (let x = 1; x < W; x++) if ((P.px[y * W + x] >= 0) !== (P.px[y * W + x - 1] >= 0)) alternations++
      }
      assert.ok(rays >= 1500, `t=${t}: only ${rays} ray pixels above the hems`)
      assert.ok(alternations >= 300, `t=${t}: the rays have no gaps (${alternations} lit/dark edges across the sky)`)
      // The ridge: every column with a peak lights its crest, and is dark
      // inside -- a silhouette, not a fill. (Its snowy gullies are a sliver.)
      let crest = 0, peakCols = 0, inside = 0, insideLit = 0
      for (let x = 0; x < W; x++) {
        if (S.SHORE - S.crestY[x] < 4) continue
        peakCols++
        if (P.px[S.crestY[x] * W + x] >= 0) crest++
        for (let y = S.crestY[x] + 3; y < S.SHORE; y++) { inside++; if (P.px[y * W + x] >= 0) insideLit++ }
      }
      assert.ok(peakCols >= W * 0.7, `t=${t}: only ${peakCols} columns carry a peak`)
      assert.ok(crest >= peakCols * 0.9, `t=${t}: the crest is lit in only ${crest} of ${peakCols} columns`)
      assert.ok(insideLit / inside < 0.12, `t=${t}: the ridge is ${(100 * insideLit / inside).toFixed(0)}% lit inside -- a fill, not a silhouette`)
      // Stars: lit pixels in the dark sky high up, away from any curtain.
      const stars = litCount(P, (x, y) => y < 30 && x > W * 0.85)
      assert.ok(stars >= 2, `t=${t}: no stars in the top right (${stars})`)
      // The snowfield: sparse DIM dither, never blank and never a fill.
      const snowPx = []
      // (From the first cell row wholly below the shore: a cell straddling it
      // takes the crest's MUTED where a valley floor sits on the shore.)
      const snowY0 = Math.ceil(S.SHORE / S.ch) * S.ch
      for (let y = snowY0; y < H; y++) for (let x = 0; x < W; x++) if (S.own[y * W + x] === mod.OWN.SNOW) snowPx.push(y * W + x)
      const snowLit = snowPx.filter((i) => P.px[i] >= 0)
      const share = snowLit.length / snowPx.length
      assert.ok(share > 0.05 && share < 0.4, `t=${t}: snow is ${(share * 100).toFixed(0)}% lit`)
      assert.ok(snowLit.every((i) => P.px[i] <= 1), `t=${t}: snow lit above DIM`)
      // Pines: dark shapes -- the trees' pixels lit far less than the snow
      // around them -- with snow on their branches (some lit, not none).
      let pine = 0, pineLit = 0
      for (let i = 0; i < S.own.length; i++) if (S.own[i] === mod.OWN.PINE) { pine++; if (P.px[i] >= 0) pineLit++ }
      assert.ok(pine >= 3000, `t=${t}: only ${pine} pine pixels`)
      assert.ok(pineLit > 0 && pineLit / pine < 0.3, `t=${t}: pines ${(100 * pineLit / pine).toFixed(0)}% lit -- not dark trees with snow on them`)
    }
  } finally { h.shutdown() }
})

test('AURORA: nothing in the landscape outshines the curtains -- at any level, muted included', async () => {
  // The aurora is the subject. A cell with no sky in it at all (ridge,
  // snow, pines) never ranks above MUTED, the snowfield's cells never above
  // DIM, and the brightest cell on the canvas is a sky cell.
  const { h, aurora, mod } = await bootAurora()
  try {
    h.advance(500)
    const term = h.term
    const cw = term.font.cellW, ch = term.font.cellH
    const S = mod.sceneTables(term.cols, cw, ch)
    // Each cell's make-up, from the scene's owners.
    const hasSky = new Uint8Array(term.cols * VIZ_BOT), allSnow = new Uint8Array(term.cols * VIZ_BOT)
    for (let cy = 1; cy < VIZ_BOT; cy++) for (let cx = 0; cx < term.cols; cx++) {
      let sky = 0, snow = 0
      for (let py = 0; py < ch; py++) for (let k = 0; k < cw; k++) {
        const o = S.own[((cy - 1) * ch + py) * S.W + cx * cw + k]
        if (o === mod.OWN.SKY) sky++
        if (o === mod.OWN.SNOW) snow++
      }
      hasSky[cy * term.cols + cx] = sky > 0
      allSnow[cy * term.cols + cx] = snow === cw * ch
    }
    const cases = [['loud', false, LOUD()], ['mid', false, audio({ level: 0.5 })], ['quiet', false, QUIET()], ['muted', true, audio({ level: 0 })]]
    for (const [name, muted, A] of cases) {
      for (const t of [11.1, 47.3, 133.9]) {
        drawAt(h, aurora, t, A, muted)
        let skyMax = -1, landMax = -1, where = ''
        for (let i = term.cols; i < term.cols * VIZ_BOT; i++) {
          if (!term.gfx[i]) continue
          const r = RANK.get(term.attrs[i])
          if (hasSky[i]) skyMax = Math.max(skyMax, r)
          else if (r > landMax) { landMax = r; where = `${i % term.cols},${Math.floor(i / term.cols)}` }
          if (allSnow[i]) assert.ok(r <= 1, `${name} t=${t}: snow cell ${i % term.cols},${Math.floor(i / term.cols)} lit at rank ${r}`)
        }
        assert.ok(skyMax >= 2, `${name} t=${t}: the sky never reaches MUTED (${skyMax})`)
        assert.ok(landMax <= 2, `${name} t=${t}: landscape cell ${where} lit at rank ${landMax}`)
        assert.ok(landMax <= skyMax, `${name} t=${t}: landscape ${where} (rank ${landMax}) outshines the sky (rank ${skyMax})`)
      }
    }
  } finally { h.shutdown() }
})

test('AURORA: the fabricated pulse is ignored -- pulse maxed vs zeroed draws the identical picture; level is not', async () => {
  // syntheticAudio() fabricates a pulse every 0.9s; an ambient station must
  // not breathe on it.
  const { h, aurora } = await bootAurora()
  try {
    h.advance(500)
    const calm = drawAt(h, aurora, 37.5, audio({ pulse: 0 }))
    const beat = drawAt(h, aurora, 37.5, audio({ pulse: 1 }))
    assert.equal(pixelDiff(calm, beat), 0, 'the pulse changed the picture')
    // Positive control: the same call DOES see the audio it is given --
    // a loud sky is plainly bigger and brighter than a quiet one.
    const quiet = drawAt(h, aurora, 37.5, QUIET())
    const loud = drawAt(h, aurora, 37.5, LOUD())
    const sky = (P) => litCount(P, (x, y) => y < 200)
    assert.ok(sky(loud) > sky(quiet) * 1.5, `loud sky ${sky(loud)} px vs quiet ${sky(quiet)} -- the swell does not show`)
    const strong = (P) => { let n = 0; for (const v of P.px) if (v >= 3) n++; return n }
    assert.ok(strong(loud) > strong(quiet) + 400, `NORMAL+ pixels: loud ${strong(loud)}, quiet ${strong(quiet)}`)
  } finally { h.shutdown() }
})

test('AURORA: the snow catches the light -- a loud sky lights the snowfield more than a quiet one, eased', async () => {
  const { h, aurora, mod } = await bootAurora()
  try {
    h.advance(500)
    const p = h.program
    const S = mod.sceneTables(h.term.cols, h.term.font.cellW, h.term.font.cellH)
    const snow = (P) => litCount(P, (x, y) => S.own[y * P.W + x] === mod.OWN.SNOW)
    const quiet = snow(drawAt(h, aurora, 60, QUIET()))
    // From quiet, go loud: the snow does not jump on the first frame...
    p._au = LOUD()
    aurora.draw(p, h.screen, 60.06)
    const step = snow(picture(h.term))
    // ...and has come up a few seconds later.
    for (let f = 1; f <= 180; f++) aurora.draw(p, h.screen, 60.06 + f / 60)
    const loud = snow(picture(h.term))
    assert.ok(loud > quiet * 1.15, `snow lit ${quiet} px quiet, ${loud} px loud`)
    assert.ok(step - quiet < (loud - quiet) * 0.5, `the snow jumped ${step - quiet} of ${loud - quiet} px in one frame`)
  } finally { h.shutdown() }
})

test('AURORA: an onset sends a wave of light along one curtain, which travels and then clears', async () => {
  // The one discrete event. Two runs of the same frames from the same state,
  // one with an onset on its first frame: the difference between them IS
  // the wave. It must show up, spread outward, brighten, and be gone once
  // its life is over. (Mutation-checked 2026-10-20: never pushing a wave,
  // or WAVE_AMP 0, turns this red.)
  const { h, aurora } = await bootAurora()
  try {
    h.advance(500)
    const p = h.program
    p.muted = false
    const run = (withOnset) => {
      aurora.reset(p)
      const shots = {}
      for (let f = 0; f <= 360; f++) {
        p._au = audio({ onset: withOnset && f === 0 })
        aurora.draw(p, h.screen, 30 + f / 60)
        if (f === 18 || f === 72 || f === 360) shots[f] = picture(h.term)
      }
      return shots
    }
    const plain = run(false)
    const waved = run(true)
    const sky = plain[18].H * 0.7
    const early = diffCols(plain[18], waved[18], sky)
    const later = diffCols(plain[72], waved[72], sky)
    assert.ok(early.length >= 30, `only ${early.length} columns lit by the wave 0.3s in`)
    const span = (xs) => Math.max(...xs) - Math.min(...xs)
    assert.ok(later.length >= 30 && span(later) > span(early) + 40,
      `the wave did not travel: span ${span(early)}px at 0.3s, ${later.length ? span(later) : 0}px at 1.2s`)
    // It brightens: more NORMAL-or-brighter pixels with the wave than without.
    const strong = (P) => { let n = 0; for (const v of P.px) if (v >= 3) n++; return n }
    assert.ok(strong(waved[18]) > strong(plain[18]) + 150, `the wave added only ${strong(waved[18]) - strong(plain[18])} bright pixels`)
    // The sky is back exactly; the snow's eased glow approaches its target
    // exponentially, so it may sit a few dither pixels off for a while.
    assert.deepEqual(diffCols(plain[360], waved[360], Math.floor(plain[360].H * 0.7), 1), [], 'the wave never cleared from the sky')
    assert.ok(pixelDiff(plain[360], waved[360]) <= 30, `the wave left ${pixelDiff(plain[360], waved[360])} pixels changed`)
    // Muted, an onset does nothing at all.
    p.muted = true
    aurora.reset(p)
    p._au = audio({ onset: true })
    aurora.draw(p, h.screen, 50)
    assert.equal(p._auroraWaves.length, 0, 'a muted onset started a wave')
  } finally { h.shutdown() }
})

test('AURORA: calm at rest -- steady audio changes a sliver of the picture a frame, a strobing tap stays bounded', async () => {
  const { h } = await bootAurora()
  const { AUDIO_BUS } = await import(`../audio/tap.js?v=${h.tag}`)
  try {
    const worst = (frames, before) => {
      let prev = picture(h.term), max = 0
      for (let i = 0; i < frames; i++) {
        before?.(i)
        h.advance(16)
        const cur = picture(h.term)
        const dd = pixelDiff(prev, cur)
        max = Math.max(max, dd)
        prev = cur
      }
      return max
    }
    AUDIO_BUS.active = true
    AUDIO_BUS.gated = false
    const steady = () => {
      AUDIO_BUS.level = 0.45
      AUDIO_BUS.bands9.fill(0.45)
      AUDIO_BUS.onset = false
      AUDIO_BUS.pulse = 0
    }
    steady()
    h.advance(3000)
    const lit = litCount(picture(h.term))
    // Measured 2026-10-20: ~1% of the lit pixels on the worst frame (the
    // picture is rebuilt at 20Hz, so that is one render's slow drift).
    const rest = worst(300, steady)
    assert.ok(rest <= lit * 0.03, `steady audio: ${rest} of ${lit} lit pixels changed in one frame`)
    // A live tap at its most hostile: level, every band and a beat all
    // slamming 0 <-> 1 on alternate frames. The eased gains, the eased ray
    // length and WAVE_GAP are what keep this from strobing. Measured: ~18%
    // on the worst frame -- the first swell's attack and a wave's bloom,
    // each one render at most once a second; reading level raw for the
    // ray length (the first cut) put every render of every frame there.
    const live = worst(300, (i) => {
      const v = i % 2
      AUDIO_BUS.level = v
      AUDIO_BUS.bands9.fill(v)
      AUDIO_BUS.onset = !!v
      AUDIO_BUS.pulse = v
    })
    assert.ok(live <= lit * 0.25, `strobing tap: ${live} pixels changed in one frame (of ${lit} lit)`)
  } finally {
    AUDIO_BUS.active = false
    h.shutdown()
  }
})

test('AURORA: muted settles to faint light, never a blank frame', async () => {
  const { h, mod } = await bootAurora()
  try {
    h.program.muted = true
    h.advance(10000)
    const term = h.term
    const S = mod.sceneTables(term.cols, term.font.cellW, term.font.cellH)
    const P = picture(term)
    // No NORMAL or BRIGHT anywhere, and still a curtain: a solid hem at
    // MUTED a good stretch long, and plenty of light in the sky.
    for (const v of P.px) assert.ok(v <= 2, `muted picture lit at rank ${v}`)
    const run = longestHem(P, S, 2)
    assert.ok(run >= 60, `muted: longest hem is ${run}px`)
    const sky = litCount(P, (x, y) => y < 200)
    assert.ok(sky >= 1500, `muted aurora is nearly gone (${sky} px)`)
  } finally { h.shutdown() }
})

test('AURORA: re-entry after a long visit starts on a sane clock at the current level (M5 class)', async () => {
  // The effect clock restarts at 0 on entry. reset() clears _auroraLastT so
  // the first frame snaps the eased gains to what is playing NOW, and clears
  // the waves, whose start times are on that clock; without it, a loud visit
  // followed by mute and re-entry opens bright and fades. (2026-09-13 audit
  // L12: the long visit is compressed by moving the entry stamp back.)
  const { h } = await bootAurora()
  try {
    h.advance(1000)
    h.program._vizEnterAt -= 120000
    h.advance(5000)
    const loudGain = Array.from(h.program._auroraGain)
    h.key('e')
    h.advance(500)
    h.program.muted = true
    h.key('v')
    h.advance(16)
    const firstFrame = Array.from(h.program._auroraGain)
    assert.ok(h.program._auroraWaves.every((w) => w.t0 <= effectT(h) + 0.05), 'a wave from the last visit sits in the future')
    assert.ok(h.program._auroraRenderT <= effectT(h) + 0.05, `render clock ${h.program._auroraRenderT} on a clock at ${effectT(h)}`)
    h.advance(20000)
    const settled = Array.from(h.program._auroraGain)
    for (let c = 0; c < settled.length; c++) {
      assert.ok(loudGain[c] - settled[c] > 0.1, `curtain ${c}: the visit was not louder than muted -- the test proves nothing`)
      assert.ok(Math.abs(firstFrame[c] - settled[c]) < 0.01,
        `curtain ${c} opened at gain ${firstFrame[c].toFixed(3)}, muted level is ${settled[c].toFixed(3)}`)
    }
    h.key('e')
    h.advance(500)
    h.program.muted = false
    h.key('v')
    h.advance(2000)
    const t = effectT(h)
    assert.ok(h.program._auroraLastT <= t + 0.05, `_auroraLastT ${h.program._auroraLastT} on a clock at ${t}`)
    assert.ok(h.program._auroraGain.every((g) => Number.isFinite(g) && g > 0 && g < 1.5), 'gains out of range')
    const lit = litCount(picture(h.term))
    assert.ok(lit > 8000, `re-entered picture nearly empty (${lit} px)`)
  } finally { h.shutdown() }
})
