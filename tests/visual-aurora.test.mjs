// AURORA (DRIFT MODE, 2026-09-13) -- what the effect promises, read back off
// the grid: curtains of rays in the sky, a ridge silhouette and a lake at the
// bottom, a frame that never reacts to a beat, and a picture that moves no
// faster than a slow breath. Each claim is checked by rendering and reading
// cells, not by asking the effect what it thinks it drew -- the lesson
// tests/visuals.test.mjs's header records from BREACH.
//
// Run: node --test tests/visual-aurora.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'
import { BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'

const VIZ_BOT = 22
const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000

async function bootAurora() {
  const h = await boot({ station: 'drift-mode' })
  h.powerOn()
  h.key('v')
  assert.equal(h.program.activeVisualKey(), 'aurora', 'drift-mode should land on aurora')
  // The same module instance the registry dispatches to: every app module is
  // instanced per full URL, and the registry imports it with this boot's tag.
  const { default: aurora, AURORA_HORIZON } = await import(`../visuals/aurora.js?v=${h.tag}`)
  return { h, aurora, HORIZON: AURORA_HORIZON }
}

/** Chars and attrs of the canvas rows 1..VIZ_BOT-1, as copies. */
function canvas(h) {
  const c = h.term.cols
  return { chars: h.term.chars.slice(c, c * VIZ_BOT), attrs: h.term.attrs.slice(c, c * VIZ_BOT) }
}

function changedCells(a, b) {
  let n = 0
  for (let i = 0; i < a.chars.length; i++) if (a.chars[i] !== b.chars[i] || a.attrs[i] !== b.attrs[i]) n++
  return n
}

const cell = (h, x, y) => String.fromCodePoint(h.term.chars[y * h.term.cols + x])
const attr = (h, x, y) => h.term.attrs[y * h.term.cols + x]

test('AURORA: draws a full canvas and never touches row 0 or the footer rows', async () => {
  const { h, aurora } = await bootAurora()
  try {
    h.advance(3000)
    const lit = h.rows().slice(1, VIZ_BOT).join('').replace(/ /g, '').length
    assert.ok(lit > 250, `only ${lit} non-space cells on the canvas`)
    // Sentinel the rows the effect must not own, draw once directly, and
    // check every sentinel survived.
    const cols = h.term.cols
    const outside = [0, ...Array.from({ length: h.term.rows - VIZ_BOT }, (_, i) => VIZ_BOT + i)]
    for (const y of outside) for (let x = 0; x < cols; x++) h.term.put(x, y, '#')
    // 2026-09-13 (audit M7) -- and every canvas cell must be written by that
    // draw. The sentinel half alone stayed green with the sky's blank-cell
    // put deleted; a per-cell hit map is what can see a hole.
    const put = h.term.put
    const hit = new Uint8Array(cols * VIZ_BOT)
    h.term.put = function (x, y, ...rest) {
      if (y >= 1 && y < VIZ_BOT && x >= 0 && x < cols) hit[y * cols + x] = 1
      return put.call(this, x, y, ...rest)
    }
    try { aurora.draw(h.program, h.screen, 12.3) } finally { h.term.put = put }
    for (const y of outside) assert.equal(h.row(y), '#'.repeat(cols), `row ${y} was drawn on`)
    let missed = 0
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) if (!hit[y * cols + x]) missed++
    assert.equal(missed, 0, `${missed} canvas cells were not repainted this frame`)
  } finally { h.shutdown() }
})

test('AURORA: moves -- frames two seconds apart differ', async () => {
  const { h } = await bootAurora()
  try {
    h.advance(2000)
    const a = canvas(h)
    h.advance(2000)
    const b = canvas(h)
    assert.ok(changedCells(a, b) >= 5, `only ${changedCells(a, b)} cells changed in 2s`)
  } finally { h.shutdown() }
})

test('AURORA: curtain rays hang in the upper region, the ridge and lake sit at the bottom', async () => {
  const { h, HORIZON } = await bootAurora()
  try {
    h.advance(6000)
    const cols = h.term.cols
    // Rays: vertical runs -- a `|` or `¦` with more ray directly under it,
    // in the upper two-thirds of the canvas.
    let rayCells = 0, runs = 0
    for (let y = 1; y <= 12; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = cell(h, x, y)
        if (ch !== '|' && ch !== '¦') continue
        rayCells++
        if ('|¦:.'.includes(cell(h, x, y + 1))) runs++
      }
    }
    assert.ok(rayCells >= 40, `only ${rayCells} ray cells in rows 1-12`)
    assert.ok(runs >= 20, `only ${runs} rays continue downward -- a wash, not curtains`)
    // Nothing of the sky's light reaches the lake at more than DIM.
    for (let y = HORIZON + 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        const a = attr(h, x, y)
        assert.ok(a === FAINT || a === DIM || cell(h, x, y) === ' ', `lake cell ${x},${y} lit at attr ${a}`)
      }
    }
    // The ridge: peaks as `/\` pairs above the shore, pines on the shore
    // row, and every peak mirrored in the lake with its slopes flipped.
    const ridgeRows = h.rows().slice(HORIZON - 4, HORIZON).join('\n')
    const peaks = (ridgeRows.match(/\/\\/g) || []).length
    assert.ok(peaks >= 6, `only ${peaks} peaks drawn above the shore`)
    assert.ok(/[Λ^]/.test(h.row(HORIZON)), 'no pines on the shore row')
    assert.ok(!/[|¦]/.test(h.row(HORIZON)), 'aurora light drawn over the shore row')
    let mirrored = 0, crests = 0
    for (let x = 0; x < cols; x++) {
      for (let e = 1; e <= 4; e++) {
        const ch = cell(h, x, HORIZON - e)
        if (ch !== '/' && ch !== '\\') continue
        // Silhouette: nothing lit between the crest and the shore.
        if (attr(h, x, HORIZON - e) !== MUTED) continue
        crests++
        for (let y = HORIZON - e + 1; y < HORIZON; y++) assert.ok(' .'.includes(cell(h, x, y)), `ridge interior at ${x},${y} is '${cell(h, x, y)}'`)
        if (cell(h, x, HORIZON + e) === (ch === '/' ? '\\' : '/')) mirrored++
      }
    }
    assert.ok(crests >= 40, `only ${crests} crest cells`)
    assert.equal(mirrored, crests, 'every crest should be mirrored, flipped, in the lake')
  } finally { h.shutdown() }
})

test('AURORA: ignores beats -- onset and pulse maxed vs zeroed draw the identical frame', async () => {
  // 2026-09-13 -- DRIFT MODE has no beat, so nothing may flare on one. The
  // draw is called directly with a controlled _au, gains snapped (lastT
  // null) so the frame is a pure function of the audio object and t.
  const { h, aurora } = await bootAurora()
  try {
    h.advance(1000)
    const p = h.program
    p.muted = false
    const audio = (over) => ({
      level: 0.6, bass: 0.9, mid: 0.5, treble: 0.4,
      bands9: [0.2, 0.7, 0.4, 0.9, 0.3, 0.6, 0.5, 0.8, 0.1],
      onset: false, pulse: 0, ...over,
    })
    const drawWith = (A) => {
      p._au = A
      p._auroraLastT = null
      aurora.draw(p, h.screen, 37.5)
      return canvas(h)
    }
    const calm = drawWith(audio({ onset: false, pulse: 0 }))
    const beat = drawWith(audio({ onset: true, pulse: 1 }))
    assert.equal(changedCells(calm, beat), 0, 'a beat changed the frame')
    // Positive control: the same call DOES see the audio it is given, so the
    // identity above is not just an effect that ignores _au altogether.
    const quiet = drawWith(audio({ level: 0.05 }))
    const loud = drawWith(audio({ level: 1 }))
    assert.ok(changedCells(quiet, loud) > 20, 'level made no visible difference -- the control is broken')
  } finally { h.shutdown() }
})

test('AURORA: slower than a breath -- consecutive frames change under 1% of cells', async () => {
  const { h } = await bootAurora()
  const { AUDIO_BUS } = await import(`../audio/tap.js?v=${h.tag}`)
  try {
    const budget = Math.floor(h.term.cols * (VIZ_BOT - 1) * 0.01)
    const worst = (frames, before) => {
      let prev = canvas(h), max = 0
      for (let i = 0; i < frames; i++) {
        before?.(i)
        h.advance(16)
        const cur = canvas(h)
        max = Math.max(max, changedCells(prev, cur))
        prev = cur
      }
      return max
    }
    h.advance(2000)
    const synth = worst(400)
    assert.ok(synth <= budget, `synthetic audio: ${synth} cells changed in one frame (budget ${budget})`)
    // A live tap at its most hostile: level, every band and a beat all
    // slamming 0 <-> 1 on alternate frames. The eased gains are what keep
    // this inside the same budget.
    AUDIO_BUS.active = true
    AUDIO_BUS.gated = false
    const live = worst(400, (i) => {
      const v = i % 2
      AUDIO_BUS.level = v
      AUDIO_BUS.bands9.fill(v)
      AUDIO_BUS.onset = !!v
      AUDIO_BUS.pulse = v
    })
    assert.ok(live <= budget, `strobing tap: ${live} cells changed in one frame (budget ${budget})`)
  } finally {
    AUDIO_BUS.active = false
    h.shutdown()
  }
})

test('AURORA: muted settles to faint light, never a blank frame', async () => {
  const { h, HORIZON } = await bootAurora()
  try {
    h.program.muted = true
    h.advance(10000)
    let lit = 0
    for (let y = 1; y < HORIZON - 4; y++) {
      for (let x = 0; x < h.term.cols; x++) {
        const ch = cell(h, x, y)
        if (ch === ' ') continue
        const a = attr(h, x, y)
        assert.ok(a !== NORMAL && a !== BRIGHT, `muted sky cell ${x},${y} lit at ${a}`)
        if ('|¦:~'.includes(ch)) lit++
      }
    }
    assert.ok(lit >= 25, `muted aurora is nearly gone (${lit} cells)`)
  } finally { h.shutdown() }
})

test('AURORA: re-entry after a long visit starts on a sane clock at the current level (M5 class)', async () => {
  // The effect clock restarts at 0 on entry. reset() clears _auroraLastT so
  // the first frame snaps the eased gains to what is playing NOW; without
  // it, a loud visit followed by mute and re-entry opens bright and fades.
  // 2026-09-13 (audit L12) -- the two minutes are compressed: the entry stamp
  // is moved back 120s instead of rendering 7500 frames of it. What this bug
  // class needs is an effect clock ~120s ahead at exit, and the draw's t is
  // computed from _vizEnterAt (visualizer.js), so that is exactly the state a
  // real long visit leaves. Five real seconds after the jump settle the eased gains (a
  // two-second time constant) at the synthetic level.
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
    h.advance(20000)
    const settled = Array.from(h.program._auroraGain)
    for (let c = 0; c < settled.length; c++) {
      assert.ok(loudGain[c] - settled[c] > 0.1, `curtain ${c}: the visit was not louder than muted -- the test proves nothing`)
      assert.ok(Math.abs(firstFrame[c] - settled[c]) < 0.01,
        `curtain ${c} opened at gain ${firstFrame[c].toFixed(3)}, muted level is ${settled[c].toFixed(3)}`)
    }
    // The brief's general sanity: no clock value ahead of the restarted
    // clock, finite gains, and a frame with content in it.
    h.key('e')
    h.advance(500)
    h.program.muted = false
    h.key('v')
    h.advance(2000)
    const t = effectT(h)
    assert.ok(h.program._auroraLastT <= t + 0.05, `_auroraLastT ${h.program._auroraLastT} on a clock at ${t}`)
    assert.ok(h.program._auroraGain.every((g) => Number.isFinite(g) && g > 0 && g < 1.5), 'gains out of range')
    const lit = h.rows().slice(1, VIZ_BOT).join('').replace(/ /g, '').length
    assert.ok(lit > 250, `re-entered frame nearly empty (${lit})`)
  } finally { h.shutdown() }
})
