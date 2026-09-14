// UPRISING (RISE UP's visualizer, 2026-09-13) -- asserted the way
// tests/visuals.test.mjs asserts BREACH: by rendering through the real
// program and reading the grid back, not by asking the effect what it drew.
//
// Run: node --test tests/visual-uprising.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './harness.mjs'

const effectT = (h) => (Date.now() - h.program._vizEnterAt) / 1000
const CANVAS = Array.from({ length: 21 }, (_, i) => i + 1)   // rows 1..VIZ_BOT-1

async function bootUprising() {
  const h = await boot({ station: 'rise-up' })
  h.powerOn()
  h.key('v')
  assert.equal(h.program.activeVisualKey(), 'uprising', 'RISE UP should land on UPRISING')
  // The same module instance the program dispatches to: the harness stamps
  // SIGNAL_BUILD per boot and every app import carries it as ?v=.
  const { VISUALS } = await import(`../visuals/index.js?v=${globalThis.SIGNAL_BUILD}`)
  return { h, fx: VISUALS.uprising }
}

const canvasText = (h) => CANVAS.map((y) => h.row(y)).join('\n')
const inked = (h) => CANVAS.reduce((n, y) => n + h.row(y).replace(/ /g, '').length, 0)

test('UPRISING: repaints every canvas cell and nothing outside rows 1..21', async () => {
  // 2026-09-13 (audit M7) -- this used to check ink, the rows outside, and
  // the floor row only, and deleting the effect's blank-cell put left it
  // green: a hole anywhere above the crowd was invisible to it. Now a per-cell
  // hit map over direct draws, the LAGOON/BACKROOM/DANCEFLOOR/ORBIT shape.
  const { h, fx } = await bootUprising()
  try {
    h.advance(3000)
    assert.ok(inked(h) > 300, `canvas should hold a crowd, signs and beams (saw ${inked(h)} inked cells)`)
    const put = h.term.put
    const cols = h.term.cols
    const outside = []
    let short = 0
    for (const t of [0.5, 3.1, 7.7, 12.2, 40]) {
      const hit = new Uint8Array(cols * 22)
      h.term.put = function (x, y, ...rest) {
        if (y < 1 || y >= 22) outside.push(`${x},${y}`)
        else if (x >= 0 && x < cols) hit[y * cols + x] = 1
        return put.call(this, x, y, ...rest)
      }
      try { fx.draw(h.program, { term: h.term }, t) } finally { h.term.put = put }
      let missed = 0
      for (let y = 1; y < 22; y++) for (let x = 0; x < cols; x++) if (!hit[y * cols + x]) missed++
      if (missed) short++
    }
    assert.deepEqual(outside.slice(0, 5), [], `${outside.length} puts landed outside the canvas`)
    assert.equal(short, 0, `${short} of 5 frames left canvas cells unpainted`)
    // The bottom rows are the crowd's mass, edge to edge.
    assert.ok(!h.row(21).includes(' '), `floor row has holes: ${JSON.stringify(h.row(21))}`)
  } finally { h.shutdown() }
})

test('UPRISING: moves -- frames a second apart differ', async () => {
  const { h } = await bootUprising()
  try {
    h.advance(2000)
    const a = canvasText(h)
    h.advance(1200)
    assert.notEqual(canvasText(h), a)
  } finally { h.shutdown() }
})

test('UPRISING: every visible placard word is intact on the grid, every frame', async () => {
  // Signs are drawn last precisely so a raised arm, a beam edge, a flyer or
  // another sign can never cut a word. Read each one back out of the row it
  // claims, with its box around it, for 400 frames (20s -- nearly two sign
  // cycles, so raising, lowering and swapping are all inside the window).
  const { h } = await bootUprising()
  try {
    let intact = 0
    const broken = []
    const seen = new Set()
    for (let i = 0; i < 400; i++) {
      h.advance(50)
      const shown = []
      for (const sg of h.program._upriseSigns) {
        if (!sg.visible) continue
        const w = sg.word.length
        const mid = h.row(sg.y).slice(sg.x - 2, sg.x + w + 2)
        const top = h.row(sg.y - 1).slice(sg.x - 2, sg.x + w + 2)
        const bot = h.row(sg.y + 1).slice(sg.x - 2, sg.x + w + 2)
        const want = `│ ${sg.word} │`
        const box = '┌' + '─'.repeat(w + 2) + '┐'
        const base = '└' + '─'.repeat(w + 2) + '┘'
        if (mid === want && top === box && bot === base) intact++
        else broken.push(`${sg.word} at ${sg.x},${sg.y} -> ${JSON.stringify([top, mid, bot])}`)
        seen.add(sg.word)
        shown.push(sg.word)
      }
      assert.equal(new Set(shown).size, shown.length, `two signs carry the same word: ${shown}`)
    }
    assert.ok(intact > 800, `signs should be up most of the time (saw ${intact} intact sign-frames)`)
    assert.deepEqual(broken.slice(0, 5), [], `${broken.length} sign-frames were overdrawn`)
    assert.ok(seen.size >= 6, `signs should rotate (saw only ${[...seen]})`)
  } finally { h.shutdown() }
})

test('UPRISING: an onset starts a surge that ripples across the crowd from one side', async () => {
  // The frame loop rewrites p._au every frame (visualizer.js), so this draws
  // the effect directly with a crafted signal and compares against a control
  // run over the same clock with no onset. Everything but the surge is a
  // pure function of (t, A), so any difference between the two is the surge.
  const { h, fx } = await bootUprising()
  try {
    const s = { term: h.term }
    const quiet = { level: 0.3, bass: 0.2, mid: 0.3, treble: 0.3, bands9: new Array(9).fill(0.3), onset: false, pulse: 0 }
    const hit = { ...quiet, bass: 0.95, onset: true, pulse: 1 }
    // Raised arms, jumping heads' arms and fists live on rows 13..19; the
    // beams stop at 14 but their edges use \ / | too, so count only 15..19.
    const arms = (x0, x1) => {
      let n = 0
      for (let y = 15; y <= 19; y++) {
        const r = h.row(y)
        for (let x = x0; x < x1; x++) if ('\\/|•Yv'.includes(r[x])) n++
      }
      return n
    }
    const run = (withHit) => {
      fx.reset(h.program)
      h.program.muted = false
      const frames = []
      for (let f = 0; f <= 110; f++) {
        const t = 20 + f / 60
        h.program._au = withHit && f === 1 ? hit : quiet
        fx.draw(h.program, s, t)
        frames.push({ left: arms(0, 27), right: arms(53, 80), all: arms(0, 80) })
      }
      return frames
    }
    const control = run(false)
    const surged = run(true)
    // ~0.33s in (frame 21), the wave front is ~18 columns from the left edge:
    // the left third has answered, the right third has not been reached.
    const early = 21
    assert.ok(surged[early].left - control[early].left >= 6,
      `left side should be surging (${surged[early].left} vs control ${control[early].left})`)
    assert.equal(surged[early].right, control[early].right, 'the far side moved before the wave reached it')
    // Later the right side answers too, and at its peak it is a room, not a few people.
    const lateRight = Math.max(...surged.slice(60).map((f, i) => f.right - control[60 + i].right))
    assert.ok(lateRight >= 6, `the wave never reached the right side (peak diff ${lateRight})`)
    const peak = Math.max(...surged.map((f, i) => f.all - control[i].all))
    assert.ok(peak >= 20, `a bass-heavy onset should raise a lot of arms (peak diff ${peak})`)
  } finally { h.shutdown() }
})

test('UPRISING: re-entry after a long visit leaves no surge clock in the future', async () => {
  // 2026-09-13 (audit L12) -- the two minutes are compressed: the entry stamp
  // is moved back 120s instead of rendering 7500 frames of it. What this bug
  // class needs is an effect clock ~120s ahead at exit, and the draw's t is
  // computed from _vizEnterAt (visualizer.js), so that is exactly the state a
  // real long visit leaves.
  const { h } = await bootUprising()
  try {
    h.advance(1000)
    h.program._vizEnterAt -= 120000
    h.advance(2000)
    h.key('e')
    h.advance(500)
    h.key('v')
    h.advance(2000)
    const t = effectT(h)
    assert.ok(h.program._upriseLastSurge <= t + 0.05,
      `refractory gate still holds a time from the last visit (${h.program._upriseLastSurge} vs t=${t})`)
    const future = h.program._upriseSurges.filter((sg) => sg.t0 > t + 0.05)
    assert.equal(future.length, 0, `${future.length} surges carry a start time from the previous visit`)
    assert.ok(inked(h) > 300, 'the frame should still hold the scene after re-entry')
    assert.ok(h.program._upriseSigns.some((sg) => sg.visible), 'placards should be up after re-entry')
  } finally { h.shutdown() }
})

test('UPRISING: muted, the crowd settles and stands still', async () => {
  const { h } = await bootUprising()
  try {
    h.advance(1000)
    h.key('m')
    assert.equal(h.program.muted, true)
    h.advance(4000)   // any wave already under way has run out
    const crowd = () => [16, 17, 18, 19, 20, 21].map((y) => h.row(y)).join('\n')
    const still = crowd()
    for (let i = 0; i < 20; i++) {
      h.advance(100)
      assert.equal(crowd(), still, `the crowd moved while muted (frame ${i})`)
    }
  } finally { h.shutdown() }
})
